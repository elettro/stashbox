import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../index.mjs';

function request(path, method = 'GET', body) {
  return {
    rawPath: path,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'x-admin-token': 'social-admin' },
    requestContext: {
      stage: 'dev',
      http: { method, path }
    }
  };
}

function createApi({ orchestrator = {}, batch = {}, operations = {}, review = {}, actions = {} } = {}) {
  return createHandler({
    youtubeOAuth: {
      start: async () => ({}),
      callback: async () => ({}),
      status: async () => ({}),
      disconnect: async () => ({})
    },
    youtubePublish: {
      presign: async () => ({
        object_key: 'incoming/test.mp4',
        upload_url: 'https://uploads.example/signed',
        required_headers: {
          'Content-Type': 'video/mp4',
          'x-amz-meta-expected_size_bytes': '1024',
          'x-amz-meta-source': 'stashbox-social-factory-dev'
        }
      }),
      publish: async () => ({})
    },
    videoOrchestrator: {
      candidates: async () => ({ candidates: [{ song_key: 'dub-reggae-01' }] }),
      listJobs: async () => ({ jobs: [] }),
      createDraft: async () => ({ created: true, job: { id: 'job-12345678' } }),
      getJob: async (_event, id) => ({ job: { id } }),
      launch: async (_event, id) => ({ launched: true, job: { id, status: 'pending' } }),
      ...orchestrator
    },
    batchCampaigns: {
      plan: async () => ({
        plan_id: 'plan-12345678',
        mode: 'proposal_only',
        selected_song_count: 2,
        proposed_job_count: 2,
        approval_required_before_draft_creation: true
      }),
      createDrafts: async () => ({
        created: true,
        created_job_count: 2,
        skipped_job_count: 0,
        renders_launched: false
      }),
      ...batch
    },
    batchOperations: {
      list: async () => ({
        campaign_name: 'Tomorrow Test',
        job_count: 2,
        counts: { total: 2, draft: 1, active: 1, completed: 0, failed: 0, other: 0 },
        jobs: [{ id: 'draft-job-12345678', status: 'draft' }],
        youtube_published: false
      }),
      launch: async () => ({
        launched: false,
        mode: 'validation_only',
        approval_required: true,
        would_launch_count: 1,
        youtube_published: false
      }),
      stage: async () => ({
        staged: false,
        mode: 'validation_only',
        approval_required: true,
        would_stage_count: 0,
        youtube_published: false
      }),
      ...operations
    },
    reviewWorkflow: {
      stageRender: async (_event, id) => ({
        staged: true,
        review_item: { id: `render-${id}`, status: 'in_review' }
      }),
      listReviewItems: async () => ({ count: 1, items: [{ id: 'render-job-12345678' }] }),
      getReviewItem: async (_event, id) => ({ item: { id, status: 'in_review' } }),
      ...review
    },
    reviewActions: {
      preview: async (_event, id) => ({
        preview_url: `https://preview.example/${id}.mp4`,
        expires_in_seconds: 900
      }),
      save: async (_event, id) => ({ saved: true, item: { id, status: 'in_review' } }),
      decision: async (_event, id) => ({
        decision_applied: true,
        publishing_triggered: false,
        item: { id, status: 'approved' }
      }),
      ...actions
    }
  });
}

test('public presign contract returns only the header the client must send', async () => {
  const response = await createApi()(request('/social/uploads/presign', 'POST', {}));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.required_headers, { 'Content-Type': 'video/mp4' });
  assert.equal(body.upload_url, 'https://uploads.example/signed');
});

test('candidate route delegates to the protected orchestrator', async () => {
  const response = await createApi()(request('/social/orchestration/candidates'));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).candidates[0].song_key, 'dub-reggae-01');
});

test('batch planning and draft creation stay behind separate routes', async () => {
  const api = createApi();
  const planResponse = await api(request('/social/orchestration/batch-plan', 'POST', {
    campaign_name: 'Tomorrow Test'
  }));
  assert.equal(planResponse.statusCode, 200);
  const plan = JSON.parse(planResponse.body);
  assert.equal(plan.mode, 'proposal_only');
  assert.equal(plan.approval_required_before_draft_creation, true);

  const draftsResponse = await api(request('/social/orchestration/batch-drafts', 'POST', {
    confirm_create_drafts: true
  }));
  assert.equal(draftsResponse.statusCode, 201);
  const drafts = JSON.parse(draftsResponse.body);
  assert.equal(drafts.created_job_count, 2);
  assert.equal(drafts.renders_launched, false);
});

test('batch job, launch validation, and stage validation use separate protected routes', async () => {
  const api = createApi();

  const jobsResponse = await api(request('/social/orchestration/batch-jobs?campaign_name=Tomorrow%20Test'));
  assert.equal(jobsResponse.statusCode, 200);
  assert.equal(JSON.parse(jobsResponse.body).job_count, 2);

  const launchResponse = await api(request('/social/orchestration/batch-launch', 'POST', {
    campaign_name: 'Tomorrow Test'
  }));
  assert.equal(launchResponse.statusCode, 200);
  const launch = JSON.parse(launchResponse.body);
  assert.equal(launch.mode, 'validation_only');
  assert.equal(launch.approval_required, true);
  assert.equal(launch.youtube_published, false);

  const stageResponse = await api(request('/social/orchestration/batch-stage', 'POST', {
    campaign_name: 'Tomorrow Test'
  }));
  assert.equal(stageResponse.statusCode, 200);
  const stage = JSON.parse(stageResponse.body);
  assert.equal(stage.mode, 'validation_only');
  assert.equal(stage.approval_required, true);
  assert.equal(stage.youtube_published, false);
});

test('render-job item and launch paths preserve the job ID', async () => {
  const api = createApi();
  const getResponse = await api(request('/social/orchestration/render-jobs/job-12345678'));
  assert.equal(JSON.parse(getResponse.body).job.id, 'job-12345678');

  const launchResponse = await api(request(
    '/social/orchestration/render-jobs/job-12345678/launch',
    'POST',
    { confirm_render: true }
  ));
  assert.equal(JSON.parse(launchResponse.body).job.status, 'pending');
});

test('completed render staging path delegates to the review workflow', async () => {
  const response = await createApi()(request(
    '/social/orchestration/render-jobs/job-12345678/stage',
    'POST',
    { confirm_stage: true }
  ));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.staged, true);
  assert.equal(body.review_item.id, 'render-job-12345678');
});

test('review list and review item routes preserve IDs', async () => {
  const api = createApi();
  const listResponse = await api(request('/social/review-items'));
  assert.equal(JSON.parse(listResponse.body).count, 1);

  const itemResponse = await api(request('/social/review-items/render-job-12345678'));
  assert.equal(JSON.parse(itemResponse.body).item.id, 'render-job-12345678');
});

test('review preview, save, and decision routes preserve review IDs', async () => {
  const api = createApi();

  const preview = await api(request(
    '/social/review-items/render-job-12345678/preview',
    'POST',
    {}
  ));
  assert.match(JSON.parse(preview.body).preview_url, /render-job-12345678/);

  const saved = await api(request(
    '/social/review-items/render-job-12345678/save',
    'POST',
    { selected_title: 'Updated title' }
  ));
  assert.equal(JSON.parse(saved.body).item.id, 'render-job-12345678');

  const decision = await api(request(
    '/social/review-items/render-job-12345678/decision',
    'POST',
    { decision: 'approve' }
  ));
  const decisionBody = JSON.parse(decision.body);
  assert.equal(decisionBody.item.status, 'approved');
  assert.equal(decisionBody.publishing_triggered, false);
});
