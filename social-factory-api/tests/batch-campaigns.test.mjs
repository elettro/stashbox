import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchCampaignService } from '../batch-campaigns.mjs';

function event(body = {}) {
  return {
    headers: { 'x-admin-token': 'social-admin' },
    body: JSON.stringify(body),
    isBase64Encoded: false
  };
}

function candidates() {
  return [
    {
      song_key: 'strong-reggae-song',
      title: 'Strong Reggae Song',
      artist: 'Stashbox',
      genre: 'Reggae',
      public_visibility: 'visible',
      visual_readiness: 'indicated',
      eligible: true,
      candidate_score: 100
    },
    {
      song_key: 'second-reggae-song',
      title: 'Second Reggae Song',
      artist: 'Stashbox',
      genre: 'Reggae',
      public_visibility: 'visible',
      visual_readiness: 'indicated',
      eligible: true,
      candidate_score: 95
    },
    {
      song_key: 'no-visuals-song',
      title: 'No Visuals Song',
      artist: 'Stashbox',
      genre: 'Reggae',
      public_visibility: 'visible',
      visual_readiness: 'needs_vec_check',
      eligible: true,
      candidate_score: 90
    }
  ];
}

function serviceWithCandidates() {
  return createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      }
    }
  });
}

test('batch plan is proposal-only and does not create or launch renders', async () => {
  const calls = [];
  const orchestrator = {
    async candidates(input) {
      calls.push({ type: 'candidates', input });
      return { candidates: candidates() };
    },
    async listJobs() {
      calls.push({ type: 'listJobs' });
      return { jobs: [] };
    },
    async createDraft() {
      calls.push({ type: 'createDraft' });
      return { job: {} };
    }
  };

  const service = createBatchCampaignService({ orchestrator });
  const result = await service.plan(event({
    campaign_name: 'Tomorrow Test',
    song_count: 2,
    variations_per_song: 2,
    genre: 'Reggae'
  }));

  assert.equal(result.mode, 'proposal_only');
  assert.equal(result.approval_required_before_draft_creation, true);
  assert.equal(result.approval_required_before_render_launch, false);
  assert.equal(result.render_launch_included_with_draft_creation_approval, true);
  assert.equal(result.selected_song_count, 2);
  assert.equal(result.proposed_job_count, 4);
  assert.equal(result.jobs[0].recipe.aspect_ratio, '9:16');
  assert.equal(result.jobs[0].recipe.duration_seconds, 30);
  assert.equal(result.jobs[0].recipe.intro_enabled, false);
  assert.equal(result.jobs[0].recipe.include_artist, false);
  assert.equal(result.jobs[0].recipe.include_song, false);
  assert.equal(result.jobs[0].recipe.include_album, false);
  assert.deepEqual(calls.map((call) => call.type), ['candidates']);
});

test('one song may produce ten distinct versions', async () => {
  const service = serviceWithCandidates();
  const result = await service.plan(event({
    campaign_name: 'Ten Versions',
    selected_song_keys: ['strong-reggae-song'],
    variations_per_song: 10
  }));

  assert.equal(result.selected_song_count, 1);
  assert.equal(result.proposed_job_count, 10);
  assert.deepEqual(result.jobs.map((entry) => entry.variation), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(result.jobs.map((entry) => entry.recipe.seed)).size, 10);
});

test('batch plan creates a true full-song recipe without a duration cutoff', async () => {
  const service = serviceWithCandidates();
  const result = await service.plan(event({
    campaign_name: 'Full Song Test',
    selected_song_keys: ['strong-reggae-song'],
    duration_mode: 'full'
  }));

  assert.equal(result.settings.duration_mode, 'full');
  assert.equal(result.settings.duration_seconds, null);
  assert.equal(result.jobs[0].recipe.duration_mode, 'full');
  assert.equal(Object.hasOwn(result.jobs[0].recipe, 'duration_seconds'), false);
});

test('automatic proposal reroll advances to another eligible song and plan id', async () => {
  const service = serviceWithCandidates();
  const first = await service.plan(event({ song_count: 1, proposal_attempt: 0 }));
  const second = await service.plan(event({ song_count: 1, proposal_attempt: 1 }));

  assert.equal(first.selected_songs[0].song_key, 'strong-reggae-song');
  assert.equal(second.selected_songs[0].song_key, 'second-reggae-song');
  assert.notEqual(second.plan_id, first.plan_id);
  assert.notEqual(second.jobs[0].recipe.seed, first.jobs[0].recipe.seed);
  assert.match(second.jobs[0].recipe.batch_name, /alt01$/);
});

test('specific-song reroll keeps the chosen song but produces an alternate seed', async () => {
  const service = serviceWithCandidates();
  const first = await service.plan(event({
    selected_song_keys: ['strong-reggae-song'],
    proposal_attempt: 0
  }));
  const second = await service.plan(event({
    selected_song_keys: ['strong-reggae-song'],
    proposal_attempt: 2
  }));

  assert.equal(second.selected_songs[0].song_key, first.selected_songs[0].song_key);
  assert.notEqual(second.jobs[0].recipe.seed, first.jobs[0].recipe.seed);
  assert.match(second.jobs[0].recipe.batch_name, /alt02$/);
});

test('batch plan rejects 4:5 because YouTube output is limited to 9:16 or 16:9', async () => {
  const service = serviceWithCandidates();

  await assert.rejects(
    service.plan(event({
      campaign_name: 'Feed Portrait Test',
      selected_song_keys: ['strong-reggae-song'],
      aspect_ratio: '4:5',
      duration_mode: 'custom',
      duration_seconds: 15
    })),
    error => error.statusCode === 422
      && error.message === 'youtube_aspect_ratio_not_supported'
      && error.details?.aspect_ratio === '4:5'
      && error.details?.allowed?.includes('9:16')
      && error.details?.allowed?.includes('16:9')
  );
});

test('batch plan preserves explicit overlay opt-ins', async () => {
  const service = serviceWithCandidates();

  const result = await service.plan(event({
    selected_song_keys: ['strong-reggae-song'],
    intro_enabled: true,
    include_artist: true,
    include_song: true,
    include_album: true
  }));

  assert.equal(result.jobs[0].recipe.intro_enabled, true);
  assert.equal(result.jobs[0].recipe.include_artist, true);
  assert.equal(result.jobs[0].recipe.include_song, true);
  assert.equal(result.jobs[0].recipe.include_album, true);
});

test('batch plan excludes visible songs that still need a VEC check by default', async () => {
  const service = serviceWithCandidates();

  const result = await service.plan(event({ song_count: 3 }));
  assert.deepEqual(
    result.selected_songs.map((song) => song.song_key),
    ['strong-reggae-song', 'second-reggae-song']
  );
});

test('batch draft route remains validation-only until explicitly confirmed', async () => {
  let listCalls = 0;
  let createCalls = 0;
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      },
      async listJobs() {
        listCalls += 1;
        return { jobs: [] };
      },
      async createDraft() {
        createCalls += 1;
        return { job: {} };
      }
    }
  });

  const result = await service.createDrafts(event({ song_count: 1 }));
  assert.equal(result.created, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(listCalls, 0);
  assert.equal(createCalls, 0);
});

test('confirmed campaign creation creates drafts and immediately launches renders', async () => {
  const createdBodies = [];
  const launchedIds = [];
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      },
      async listJobs() {
        return { jobs: [] };
      },
      async createDraft(input) {
        const body = JSON.parse(input.body);
        createdBodies.push(body);
        return {
          job: {
            id: `job-${createdBodies.length}-12345678`,
            status: 'draft',
            batch_name: body.batch_name,
            song_key: body.song_key,
            campaign_name: body.campaign_name
          }
        };
      },
      async launch(input, jobId) {
        assert.equal(JSON.parse(input.body).confirm_render, true);
        launchedIds.push(jobId);
        return { job: { id: jobId, status: 'pending' } };
      }
    }
  });

  const result = await service.createDrafts(event({
    confirm_create_drafts: true,
    campaign_name: 'Tomorrow Test',
    song_count: 2,
    variations_per_song: 1
  }));

  assert.equal(result.created, true);
  assert.equal(result.mode, 'drafts_created_and_renders_launched');
  assert.equal(result.created_job_count, 2);
  assert.equal(result.skipped_job_count, 0);
  assert.equal(result.renders_launched, true);
  assert.equal(result.launched_job_count, 2);
  assert.equal(result.launch_failed_job_count, 0);
  assert.equal(result.approval_required_before_render_launch, false);
  assert.deepEqual(launchedIds, ['job-1-12345678', 'job-2-12345678']);
  assert.equal(createdBodies.length, 2);
  assert.ok(createdBodies.every((body) => body.campaign_name === 'Tomorrow Test'));
  assert.ok(createdBodies.every((body) => body.intro_enabled === false));
  assert.ok(createdBodies.every((body) => typeof body.seed === 'string' && body.seed.length === 32));
  assert.equal(result.publishing_triggered, false);
});

test('confirmed campaign creation reuses and launches an existing draft instead of duplicating it', async () => {
  let createCalls = 0;
  const launchedIds = [];
  const existing = {
    id: 'existing-job-12345678',
    status: 'draft',
    batch_name: 'Tomorrow Test - Strong Reggae Song - v01',
    song_key: 'strong-reggae-song',
    campaign_name: 'Tomorrow Test'
  };

  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      },
      async listJobs() {
        return { jobs: [existing] };
      },
      async createDraft() {
        createCalls += 1;
        return { job: {} };
      },
      async launch(input, jobId) {
        assert.equal(JSON.parse(input.body).confirm_render, true);
        launchedIds.push(jobId);
        return { job: { ...existing, status: 'pending' } };
      }
    }
  });

  const result = await service.createDrafts(event({
    confirm_create_drafts: true,
    campaign_name: 'Tomorrow Test',
    song_count: 1,
    variations_per_song: 1
  }));

  assert.equal(result.created_job_count, 0);
  assert.equal(result.skipped_job_count, 1);
  assert.equal(result.skipped_jobs[0].reason, 'existing_job_reused');
  assert.equal(result.launched_job_count, 1);
  assert.deepEqual(launchedIds, ['existing-job-12345678']);
  assert.equal(createCalls, 0);
});
