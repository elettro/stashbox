import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRenderTimeline, seededShuffle } from '../src/timeline.mjs';

test('seeded shuffle is deterministic and varies by seed', () => {
  const source = ['a', 'b', 'c', 'd'];
  assert.deepEqual(seededShuffle(source, 'seed-one'), seededShuffle(source, 'seed-one'));
  assert.notDeepEqual(seededShuffle(source, 'seed-one'), seededShuffle(source, 'seed-two'));
  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
});

test('timeline covers the requested duration and exhausts the pool before repeating', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 22,
    segment_duration_seconds: 5,
    seed: 'space-jam-render-1',
    order_mode: 'random',
    assets: [
      { id: 'a', type: 'clip', url: 'https://example.com/a.mp4' },
      { id: 'b', type: 'clip', url: 'https://example.com/b.mp4' },
      { id: 'c', type: 'image', url: 'https://example.com/c.jpg' }
    ]
  });

  assert.equal(timeline.length, 5);
  assert.equal(timeline[0].start_seconds, 0);
  assert.equal(timeline.at(-1).end_seconds, 22);
  assert.equal(new Set(timeline.slice(0, 3).map(item => item.asset_id)).size, 3);
  for (let index = 1; index < timeline.length; index += 1) {
    assert.notEqual(timeline[index].asset_id, timeline[index - 1].asset_id);
  }
});

test('artwork becomes the fallback when no VEC assets are available', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 12,
    segment_duration_seconds: 8,
    artwork_url: 'https://example.com/artwork.jpg',
    assets: []
  });
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].asset_id, 'song-artwork');
  assert.equal(timeline[0].type, 'image');
  assert.equal(timeline.at(-1).end_seconds, 12);
});

test('black branded fallback is available when artwork is also missing', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 4,
    assets: []
  });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].type, 'color');
  assert.equal(timeline[0].source, 'fallback');
});
