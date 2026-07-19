import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRenderTimeline, seededShuffle } from '../src/timeline.mjs';

test('seeded shuffle is deterministic and preserves the source pool', () => {
  const source = ['a', 'b', 'c', 'd', 'e', 'f'];
  const first = seededShuffle(source, 'seed-one');
  const repeated = seededShuffle(source, 'seed-one');
  const secondSeed = seededShuffle(source, 'seed-two');

  assert.deepEqual(first, repeated);
  assert.deepEqual(first, ['d', 'f', 'e', 'a', 'b', 'c']);
  assert.notDeepEqual(first, secondSeed);
  assert.deepEqual(source, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual([...first].sort(), [...source].sort());
});

test('timeline covers the requested duration and exhausts the pool before repeating', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 22,
    segment_duration_seconds: 5,
    image_duration_seconds: 5,
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

test('still images default to three seconds with subtle deterministic Ken Burns motion', () => {
  const options = {
    total_duration_seconds: 7,
    segment_duration_seconds: 8,
    seed: 'still-motion-seed',
    assets: [{ id: 'image-a', type: 'image', url: 'https://example.com/a.jpg' }]
  };
  const first = buildRenderTimeline(options);
  const repeated = buildRenderTimeline(options);
  assert.deepEqual(first, repeated);
  assert.deepEqual(first.map(item => item.duration_seconds), [3, 3, 1]);
  assert.ok(first.every(item => item.motion?.enabled));
  assert.ok(first.every(item => item.motion.max_zoom >= 1.06 && item.motion.max_zoom <= 1.09));
  assert.ok(first.every(item => ['in', 'out'].includes(item.motion.zoom_mode)));
});

test('Ken Burns can be disabled without changing the three-second still duration', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 6,
    ken_burns_enabled: false,
    assets: [{ id: 'image-a', type: 'image', url: 'https://example.com/a.jpg' }]
  });
  assert.deepEqual(timeline.map(item => item.duration_seconds), [3, 3]);
  assert.ok(timeline.every(item => item.motion === null));
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

test('VEC artwork rules anchor the start, recurring interval, and end', () => {
  const artworkRules = {
    start_with_artwork: true,
    start_duration_seconds: 3,
    end_with_artwork: true,
    end_duration_seconds: 4,
    re_present_artwork: true,
    repeat_every_seconds: 60
  };
  const timeline = buildRenderTimeline({
    total_duration_seconds: 130,
    segment_duration_seconds: 8,
    artwork_url: 'https://example.com/artwork.jpg',
    assets: [
      { id: 'clip-a', type: 'clip', url: 'https://example.com/a.mp4', renderer_artwork_rules: artworkRules },
      { id: 'clip-b', type: 'clip', url: 'https://example.com/b.mp4' }
    ]
  });

  const artwork = timeline.filter(item => item.asset_id === 'song-artwork');
  assert.deepEqual(artwork.map(item => [item.start_seconds, item.duration_seconds]), [
    [0, 3],
    [60, 3],
    [120, 3],
    [126, 4]
  ]);
  assert.equal(timeline.at(-1).end_seconds, 130);
  assert.ok(timeline.some(item => item.type === 'clip'));
});

test('artwork control records without URLs do not become render assets', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 10,
    artwork_url: 'https://example.com/artwork.jpg',
    assets: [{
      renderer_control: 'artwork-rules',
      renderer_artwork_rules: { start_with_artwork: true, start_duration_seconds: 3 }
    }]
  });

  assert.equal(timeline[0].asset_id, 'song-artwork');
  assert.equal(timeline.at(-1).end_seconds, 10);
});

test('manual timeline preserves duplicates, artwork placement, and per-image duration', () => {
  const timeline = buildRenderTimeline({
    total_duration_seconds: 24,
    segment_duration_seconds: 6,
    order_mode: 'manual',
    artwork_url: 'https://example.com/artwork.jpg',
    assets: [
      { id: 'clip-a', type: 'clip', url: 'https://example.com/a.mp4' },
      { id: 'image-a', type: 'image', url: 'https://example.com/a.jpg' }
    ],
    manual_sequence: [
      { entry_id: 'one', asset_id: 'clip-a', source_kind: 'folder', duration_seconds: 6 },
      { entry_id: 'two', asset_id: 'image-a', source_kind: 'song', duration_seconds: 5 },
      { entry_id: 'three', asset_id: 'clip-a', source_kind: 'folder', duration_seconds: 6 },
      { entry_id: 'four', asset_id: 'official-artwork', source_kind: 'artwork', duration_seconds: 4 }
    ],
    artwork_rules: { start_with_artwork: true, end_with_artwork: true, re_present_artwork: true, repeat_every_seconds: 5 }
  });
  assert.deepEqual(timeline.slice(0, 4).map(item => item.source_asset_id), ['clip-a', 'image-a', 'clip-a', 'official-artwork']);
  assert.equal(timeline[1].duration_seconds, 5);
  assert.equal(timeline[3].duration_seconds, 4);
  assert.equal(timeline.at(-1).end_seconds, 24);
});
