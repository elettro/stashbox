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
  assert.equal(result.approval_required_before_render_launch, true);
  assert.equal(result.selected_song_count, 2);
  assert.equal(result.proposed_job_count, 4);
  assert.equal(result.jobs[0].recipe.aspect_ratio, '9:16');
  assert.equal(result.jobs[0].recipe.duration_seconds, 30);
  assert.equal(result.jobs[0].recipe.include_artist, false);
  assert.equal(result.jobs[0].recipe.include_song, false);
  assert.equal(result.jobs[0].recipe.include_album, false);
  assert.deepEqual(calls.map((call) => call.type), ['candidates']);
});

test('batch plan accepts 4:5 feed portrait output', async () => {
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      }
    }
  });

  const result = await service.plan(event({
    campaign_name: 'Feed Portrait Test',
    selected_song_keys: ['strong-reggae-song'],
    aspect_ratio: '4:5',
    duration_mode: 'custom',
    duration_seconds: 15
  }));

  assert.equal(result.settings.aspect_ratio, '4:5');
  assert.equal(result.jobs[0].recipe.aspect_ratio, '4:5');
  assert.equal(result.jobs[0].recipe.duration_seconds, 15);
  assert.equal(result.proposed_job_count, 1);
});

test('batch plan preserves an explicit manual title-overlay opt-in', async () => {
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      }
    }
  });

  const result = await service.plan(event({
    selected_song_keys: ['strong-reggae-song'],
    include_artist: true,
    include_song: true,
    include_album: true
  }));

  assert.equal(result.jobs[0].recipe.include_artist, true);
  assert.equal(result.jobs[0].recipe.include_song, true);
  assert.equal(result.jobs[0].recipe.include_album, true);
});

test('batch plan excludes visible songs that still need a VEC check by default', async () => {
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates: candidates() };
      }
    }
  });

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

test('confirmed batch creation creates drafts but never launches renders', async () => {
  const createdBodies = [];
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
  assert.equal(result.created_job_count, 2);
  assert.equal(result.skipped_job_count, 0);
  assert.equal(result.renders_launched, false);
  assert.equal(result.approval_required_before_render_launch, true);
  assert.equal(createdBodies.length, 2);
  assert.ok(createdBodies.every((body) => body.campaign_name === 'Tomorrow Test'));
});

test('confirmed batch creation reuses an existing draft instead of duplicating it', async () => {
  let createCalls = 0;
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
  assert.equal(createCalls, 0);
});
