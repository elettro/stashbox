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

function candidate(song_key, title, selection_date, source = 'created_at') {
  return {
    song_key,
    title,
    artist: 'Stashbox',
    genre: 'Rock',
    public_visibility: 'visible',
    visual_readiness: 'indicated',
    eligible: true,
    candidate_score: 100,
    selection_date,
    selection_date_source: source
  };
}

test('newest mode sorts by normalized date instead of candidate order', async () => {
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return {
          candidates: [
            candidate('old-song', 'Old Song', '2024-01-01T00:00:00.000Z'),
            candidate('new-song', 'New Song', '2026-07-30T00:00:00.000Z', 'release_date'),
            candidate('middle-song', 'Middle Song', '2025-04-10T00:00:00.000Z')
          ]
        };
      }
    }
  });

  const result = await service.plan(event({
    campaign_name: 'Newest Test',
    song_count: 2,
    selection_mode: 'newest'
  }));

  assert.equal(result.settings.selection_mode, 'newest');
  assert.deepEqual(result.selected_songs.map((song) => song.song_key), ['new-song', 'middle-song']);
  assert.equal(result.jobs[0].song.selection_date_source, 'release_date');
  assert.equal(result.jobs[0].song.selection_date, '2026-07-30T00:00:00.000Z');
});

test('newest mode changes the plan fingerprint', async () => {
  const orchestrator = {
    async candidates() {
      return {
        candidates: [
          candidate('song-a', 'Song A', '2026-07-01T00:00:00.000Z'),
          candidate('song-b', 'Song B', '2026-06-01T00:00:00.000Z')
        ]
      };
    }
  };
  const service = createBatchCampaignService({ orchestrator });
  const ranked = await service.plan(event({ campaign_name: 'Mode Test', song_count: 1 }));
  const newest = await service.plan(event({ campaign_name: 'Mode Test', song_count: 1, selection_mode: 'newest' }));
  assert.notEqual(newest.plan_id, ranked.plan_id);
});

test('newest mode fails safely when no candidate has a reliable date', async () => {
  const service = createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return {
          candidates: [
            candidate('song-a', 'Song A', ''),
            candidate('song-b', 'Song B', '')
          ]
        };
      }
    }
  });

  await assert.rejects(
    service.plan(event({ selection_mode: 'newest', song_count: 2 })),
    error => error.statusCode === 409
      && error.message === 'newest_selection_dates_unavailable'
      && error.details?.required_fields?.includes('created_at')
  );
});
