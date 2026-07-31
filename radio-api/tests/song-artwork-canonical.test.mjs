import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyPreparedArtwork, mergeArtworkSources } from '../song-artwork-routes.mjs';

test('legacy VEC prepared artwork is exposed as canonical artwork fields', () => {
  const result = legacyPreparedArtwork({}, {
    prepared_artwork_images: {
      '9x16': 'https://media.example/dirty-bird-9x16.png',
      '16x9': 'https://media.example/dirty-bird-16x9.png',
      '3x4': 'https://media.example/dirty-bird-3x4.png',
      '4x5': 'https://media.example/dirty-bird-4x5.png',
      '21x9': 'https://media.example/dirty-bird-21x9.png'
    }
  });
  assert.equal(result.song_artwork_9x16_url, 'https://media.example/dirty-bird-9x16.png');
  assert.equal(result.song_artwork_16x9_url, 'https://media.example/dirty-bird-16x9.png');
  assert.equal(result.song_artwork_3x4_url, 'https://media.example/dirty-bird-3x4.png');
  assert.equal(result.song_artwork_4x5_url, 'https://media.example/dirty-bird-4x5.png');
  assert.equal(result.song_artwork_21x9_url, 'https://media.example/dirty-bird-21x9.png');
});

test('legacy visual_assets profile entries are also recognized', () => {
  const result = legacyPreparedArtwork({
    visual_assets: JSON.stringify([
      { type: 'image', source: 'song_profile_image:9x16', url: 'https://media.example/vertical.png' }
    ])
  }, {});
  assert.equal(result.song_artwork_9x16_url, 'https://media.example/vertical.png');
});

test('canonical values win while legacy fills missing ratios', () => {
  const result = mergeArtworkSources(
    { song_artwork_9x16_url: 'https://media.example/canonical-vertical.png' },
    {
      song_artwork_9x16_url: 'https://media.example/legacy-vertical.png',
      song_artwork_16x9_url: 'https://media.example/legacy-wide.png'
    }
  );
  assert.equal(result.song_artwork_9x16_url, 'https://media.example/canonical-vertical.png');
  assert.equal(result.song_artwork_16x9_url, 'https://media.example/legacy-wide.png');
});
