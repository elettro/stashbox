import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkRatioKey, refreshTimelineArtwork, selectRenderArtwork } from '../src/artwork-selection.mjs';

const dirtyBird = {
  artwork_images: {
    '1x1': 'https://media.example/dirty-bird-1x1.jpg',
    '16x9': 'https://media.example/dirty-bird-16x9.jpg',
    '9x16': 'https://media.example/dirty-bird-9x16.jpg',
    '3x4': 'https://media.example/dirty-bird-3x4.jpg',
    '4x5': 'https://media.example/dirty-bird-4x5.jpg',
    '21x9': 'https://media.example/dirty-bird-21x9.jpg'
  }
};

test('normalizes render aspect ratios to artwork profile keys', () => {
  assert.equal(artworkRatioKey('9:16'), '9x16');
  assert.equal(artworkRatioKey('16:9'), '16x9');
  assert.equal(artworkRatioKey('1:1'), '1x1');
});

test('Dirty Bird 9:16 render selects its direct 9x16 artwork', () => {
  const result = selectRenderArtwork(dirtyBird, '9:16');
  assert.equal(result.url, 'https://media.example/dirty-bird-9x16.jpg');
  assert.equal(result.source_ratio, '9x16');
  assert.equal(result.fallback_used, false);
  assert.equal(result.selection_rule, 'exact_ratio');
});

test('9:16 render uses the closest portrait artwork before square', () => {
  const result = selectRenderArtwork({
    artwork_images: {
      '1x1': 'https://media.example/song-1x1.jpg',
      '3x4': 'https://media.example/song-3x4.jpg',
      '4x5': 'https://media.example/song-4x5.jpg'
    }
  }, '9:16');
  assert.equal(result.url, 'https://media.example/song-3x4.jpg');
  assert.equal(result.source_ratio, '3x4');
  assert.equal(result.selection_rule, 'closest_orientation_fallback');
});

test('9:16 render falls back to 1x1 only when portrait artwork is absent', () => {
  const result = selectRenderArtwork({
    artwork_images: {
      '1x1': 'https://media.example/song-square.jpg',
      '16x9': 'https://media.example/song-wide.jpg'
    }
  }, '9:16');
  assert.equal(result.url, 'https://media.example/song-square.jpg');
  assert.equal(result.source_ratio, '1x1');
  assert.equal(result.selection_rule, 'square_fallback');
});

test('16:9 render uses 21x9 before square when 16x9 is missing', () => {
  const result = selectRenderArtwork({
    artwork_images: {
      '1x1': 'https://media.example/song-square.jpg',
      '21x9': 'https://media.example/song-ultrawide.jpg'
    }
  }, '16:9');
  assert.equal(result.url, 'https://media.example/song-ultrawide.jpg');
  assert.equal(result.source_ratio, '21x9');
});

test('frozen 9:16 timelines replace stale square artwork with selected portrait artwork', () => {
  const timeline = [
    {
      asset_id: 'song-artwork',
      type: 'image',
      source: 'song-artwork-start',
      url: 'https://media.example/song-square.jpg'
    },
    {
      asset_id: 'manual:official-artwork',
      source_asset_id: 'official-artwork',
      type: 'image',
      source: 'song-artwork-manual',
      url: 'https://media.example/song-square.jpg'
    },
    {
      asset_id: 'vec-image-1',
      type: 'image',
      source: 'vec',
      url: 'https://media.example/vec-image.jpg'
    }
  ];
  const refreshed = refreshTimelineArtwork(
    timeline,
    'https://media.example/song-9x16.jpg'
  );
  assert.equal(refreshed[0].url, 'https://media.example/song-9x16.jpg');
  assert.equal(refreshed[1].url, 'https://media.example/song-9x16.jpg');
  assert.equal(refreshed[2].url, 'https://media.example/vec-image.jpg');
});
