import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVisualSettingsResponse } from '../src/visual-settings.mjs';

test('renderer uses VE-10B eligible_assets from the song visual-settings response', () => {
  const result = normalizeVisualSettingsResponse({
    order_mode: 'random',
    eligible_assets: [
      { id: 'clip-1', type: 'clip', url: 'https://example.com/clip-1.mp4' },
      { id: 'clip-2', type: 'clip', url: 'https://example.com/clip-2.mp4' }
    ],
    assets: [],
    fallback: { uses_artwork: false, eligible_visual_count: 2 }
  });

  assert.equal(result.orderMode, 'random');
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].id, 'clip-1');
  assert.equal(result.assetField, 'eligible_assets');
  assert.equal(result.eligibleAssetCount, 2);
});

test('renderer keeps compatibility with the legacy assets field', () => {
  const result = normalizeVisualSettingsResponse({
    order_mode: 'manual',
    assets: [{ id: 'legacy-1', type: 'image', url: 'https://example.com/legacy.jpg' }]
  });

  assert.equal(result.orderMode, 'manual');
  assert.equal(result.assets.length, 1);
  assert.equal(result.assetField, 'assets');
});

test('eligible_assets takes priority when both fields are populated', () => {
  const result = normalizeVisualSettingsResponse({
    eligible_assets: [{ id: 'eligible', type: 'clip', url: 'https://example.com/eligible.mp4' }],
    assets: [{ id: 'legacy', type: 'clip', url: 'https://example.com/legacy.mp4' }]
  });

  assert.deepEqual(result.assets.map(asset => asset.id), ['eligible']);
  assert.equal(result.assetField, 'eligible_assets');
});

test('empty responses preserve artwork fallback behavior', () => {
  const result = normalizeVisualSettingsResponse({
    fallback: { uses_artwork: true, eligible_visual_count: 0 }
  });

  assert.deepEqual(result.assets, []);
  assert.equal(result.orderMode, 'random');
  assert.equal(result.assetField, 'none');
  assert.equal(result.fallback.uses_artwork, true);
});
