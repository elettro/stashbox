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

const candidates = [
  {
    song_key: 'featured-one',
    title: 'Featured One',
    artist: 'Stashbox',
    genre: 'Rock',
    featured: true,
    public_visibility: 'visible',
    visual_readiness: 'indicated',
    eligible: true,
    candidate_score: 80
  },
  {
    song_key: 'non-featured-high-score',
    title: 'Non Featured High Score',
    artist: 'Stashbox',
    genre: 'Reggae',
    featured: false,
    public_visibility: 'visible',
    visual_readiness: 'indicated',
    eligible: true,
    candidate_score: 100
  },
  {
    song_key: 'featured-two',
    title: 'Featured Two',
    artist: 'Stashbox',
    genre: 'Soul',
    featured: true,
    public_visibility: 'visible',
    visual_readiness: 'indicated',
    eligible: true,
    candidate_score: 75
  }
];

function service() {
  return createBatchCampaignService({
    orchestrator: {
      async candidates() {
        return { candidates };
      }
    }
  });
}

test('featured-only excludes higher-scoring non-featured songs', async () => {
  const result = await service().plan(event({
    campaign_name: 'Featured Only',
    song_count: 2,
    featured_only: true
  }));

  assert.equal(result.settings.featured_only, true);
  assert.deepEqual(
    result.selected_songs.map((song) => song.song_key),
    ['featured-one', 'featured-two']
  );
  assert.ok(result.jobs.every((entry) => entry.song.featured === true));
});

test('featured-only changes the plan identity', async () => {
  const unfiltered = await service().plan(event({
    campaign_name: 'Identity Test',
    song_count: 1
  }));
  const featured = await service().plan(event({
    campaign_name: 'Identity Test',
    song_count: 1,
    featured_only: true
  }));

  assert.notEqual(featured.plan_id, unfiltered.plan_id);
});

test('featured-only rejects explicitly selected non-featured songs', async () => {
  await assert.rejects(
    service().plan(event({
      campaign_name: 'Invalid Featured Selection',
      selected_song_keys: ['non-featured-high-score'],
      featured_only: true
    })),
    error => error.statusCode === 422
      && error.message === 'selected_songs_not_eligible'
      && error.details?.song_keys?.includes('non-featured-high-score')
  );
});
