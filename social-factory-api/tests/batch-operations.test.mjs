import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchOperationsService } from '../batch-operations.mjs';

function event(body, queryStringParameters = null) {
  return {
    headers: { 'x-admin-token': 'social-admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters
  };
}

function jobs() {
  return [
    {
      id: 'draft-job-12345678',
      batch_name: 'Tomorrow Test - Song One - v01',
      campaign_name: 'Tomorrow Test',
      song_key: 'song-one',
      song_title: 'Song One',
      artist: 'Stashbox',
      status: 'draft',
      aspect_ratio: '9:16',
      duration_seconds: 30
    },
    {
      id: 'active-job-12345678',
      batch_name: 'Tomorrow Test - Song Two - v01',
      campaign_name: 'Tomorrow Test',
      song_key: 'song-two',
      song_title: 'Song Two',
      artist: 'Stashbox',
      status: 'rendering',
      active: true,
      aspect_ratio: '9:16',
      duration_seconds: 30
    },
    {
      id: 'completed-job-12345678',
      batch_name: 'Tomorrow Test - Song Three - v01',
      campaign_name: 'Tomorrow Test',
      song_key: 'song-three',
      song_title: 'Song Three',
      artist: 'Stashbox',
      status: 'completed',
      ready_for_staging: true,
      output_url: 's3://video-factory/video-factory/song-three/output.mp4',
      aspect_ratio: '9:16',
      duration_seconds: 30
    }
  ];
}

function createService({ launch, stageRender, jobList = jobs() } = {}) {
  return createBatchOperationsService({
    orchestrator: {
      async listJobs() {
        return { jobs: jobList };
      },
      async launch(input, id) {
        if (launch) return launch(input, id);
        return {
          launched: true,
          job: { ...jobList[0], id, status: 'pending', active: true },
          downstream: { success: true }
        };
      }
    },
    reviewWorkflow: {
      async stageRender(input, id) {
        if (stageRender) return stageRender(input, id);
        return {
          staged: true,
          review_item: {
            id: `render-${id}`,
            status: 'in_review',
            publishing_status: 'not_published'
          }
        };
      }
    }
  });
}

test('lists campaign jobs with status counts', async () => {
  const service = createService();
  const result = await service.list(event(undefined, { campaign_name: 'Tomorrow Test' }));

  assert.equal(result.job_count, 3);
  assert.deepEqual(result.counts, {
    total: 3,
    draft: 1,
    active: 1,
    completed: 1,
    failed: 0,
    other: 0
  });
  assert.equal(result.youtube_published, false);
});

test('batch launch is validation-only without explicit confirmation', async () => {
  let launches = 0;
  const service = createService({
    launch: async () => {
      launches += 1;
      return {};
    }
  });

  const result = await service.launch(event({ campaign_name: 'Tomorrow Test' }));
  assert.equal(result.launched, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(result.would_launch_count, 1);
  assert.equal(result.would_skip_count, 2);
  assert.equal(launches, 0);
});

test('confirmed batch launch launches only draft jobs and skips active or completed jobs', async () => {
  const launchedIds = [];
  const service = createService({
    launch: async (input, id) => {
      launchedIds.push(id);
      assert.deepEqual(JSON.parse(input.body), { confirm_render: true });
      return {
        launched: true,
        job: { ...jobs()[0], id, status: 'pending', active: true },
        downstream: { success: true }
      };
    }
  });

  const result = await service.launch(event({
    campaign_name: 'Tomorrow Test',
    confirm_render_batch: true
  }));

  assert.deepEqual(launchedIds, ['draft-job-12345678']);
  assert.equal(result.launched_job_count, 1);
  assert.equal(result.skipped_job_count, 2);
  assert.equal(result.failed_job_count, 0);
  assert.equal(result.publishing_triggered, false);
  assert.equal(result.youtube_published, false);
});

test('4:5 draft jobs are skipped and never launched for YouTube', async () => {
  const unsupported = {
    ...jobs()[0],
    id: 'portrait-feed-job-12345678',
    aspect_ratio: '4:5'
  };
  let launches = 0;
  const service = createService({
    jobList: [unsupported],
    launch: async () => {
      launches += 1;
      return {};
    }
  });

  const result = await service.launch(event({
    campaign_name: 'Tomorrow Test',
    confirm_render_batch: true
  }));

  assert.equal(result.launched_job_count, 0);
  assert.equal(result.skipped_job_count, 1);
  assert.equal(result.skipped_jobs[0].reason, 'youtube_aspect_ratio_not_supported');
  assert.equal(result.skipped_jobs[0].details.aspect_ratio, '4:5');
  assert.equal(launches, 0);
});

test('batch stage is validation-only without explicit confirmation', async () => {
  let stages = 0;
  const service = createService({
    stageRender: async () => {
      stages += 1;
      return {};
    }
  });

  const result = await service.stage(event({ campaign_name: 'Tomorrow Test' }));
  assert.equal(result.staged, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(result.would_stage_count, 1);
  assert.equal(result.would_skip_count, 2);
  assert.equal(stages, 0);
});

test('confirmed batch stage moves only completed jobs into Content Review', async () => {
  const stagedIds = [];
  const service = createService({
    stageRender: async (input, id) => {
      stagedIds.push(id);
      assert.deepEqual(JSON.parse(input.body), { confirm_stage: true });
      return {
        staged: true,
        review_item: {
          id: `render-${id}`,
          status: 'in_review',
          publishing_status: 'not_published'
        }
      };
    }
  });

  const result = await service.stage(event({
    campaign_name: 'Tomorrow Test',
    confirm_stage_batch: true
  }));

  assert.deepEqual(stagedIds, ['completed-job-12345678']);
  assert.equal(result.staged_job_count, 1);
  assert.equal(result.skipped_job_count, 2);
  assert.equal(result.failed_job_count, 0);
  assert.equal(result.publishing_triggered, false);
  assert.equal(result.youtube_published, false);
});

test('completed 4:5 jobs are skipped and never moved into YouTube Content Review', async () => {
  const unsupported = {
    ...jobs()[2],
    id: 'portrait-feed-completed-12345678',
    aspect_ratio: '4:5'
  };
  let stages = 0;
  const service = createService({
    jobList: [unsupported],
    stageRender: async () => {
      stages += 1;
      return {};
    }
  });

  const result = await service.stage(event({
    campaign_name: 'Tomorrow Test',
    confirm_stage_batch: true
  }));

  assert.equal(result.staged_job_count, 0);
  assert.equal(result.skipped_job_count, 1);
  assert.equal(result.skipped_jobs[0].reason, 'youtube_aspect_ratio_not_supported');
  assert.equal(stages, 0);
});

test('batch operations require a campaign name or explicit job IDs', async () => {
  const service = createService();
  await assert.rejects(
    () => service.launch(event({ confirm_render_batch: true })),
    (error) => error.message === 'campaign_name_or_job_ids_required' && error.statusCode === 422
  );
});