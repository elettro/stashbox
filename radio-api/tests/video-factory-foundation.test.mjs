import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildInitialRenderRecipe,
  buildOutputFilename,
  getDimensionsForAspectRatio,
  normalizeDuration,
  sanitizeFilenameToken
} from '../video-factory/recipe.mjs';
import { getVideoFactoryRouteMatch } from '../video-factory/routes.mjs';

test('Video Factory route matcher accepts only private admin routes', () => {
  assert.deepEqual(getVideoFactoryRouteMatch(['admin', 'video-factory', 'jobs']), {
    isRoute: true,
    resource: 'jobs',
    jobId: '',
    action: ''
  });
  assert.equal(getVideoFactoryRouteMatch(['radio', 'video-factory', 'jobs']).isRoute, false);
  assert.equal(getVideoFactoryRouteMatch(['video-factory', 'jobs']).isRoute, false);
});

test('Video Factory route matcher extracts job and action segments', () => {
  assert.deepEqual(getVideoFactoryRouteMatch(['admin', 'video-factory', 'jobs', 'job-123', 'retry']), {
    isRoute: true,
    resource: 'jobs',
    jobId: 'job-123',
    action: 'retry'
  });
});

test('aspect ratio presets return expected dimensions', () => {
  assert.deepEqual(getDimensionsForAspectRatio('16:9'), { width: 1920, height: 1080 });
  assert.deepEqual(getDimensionsForAspectRatio('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(getDimensionsForAspectRatio('3:4'), { width: 1080, height: 1440 });
  assert.deepEqual(getDimensionsForAspectRatio('1:1'), { width: 1080, height: 1080 });
  assert.throws(() => getDimensionsForAspectRatio('2:1'), /Unsupported aspect ratio/);
});

test('duration normalization supports full and timed renders', () => {
  assert.deepEqual(normalizeDuration({ duration_mode: 'full' }), {
    duration_mode: 'full',
    duration_seconds: null
  });
  assert.deepEqual(normalizeDuration({ duration_mode: 'promo', duration_seconds: 30 }), {
    duration_mode: 'promo',
    duration_seconds: 30
  });
  assert.throws(
    () => normalizeDuration({ duration_mode: 'custom', duration_seconds: 0 }),
    /positive duration_seconds/
  );
});

test('filename tokens create safe predictable mp4 names', () => {
  assert.equal(sanitizeFilenameToken('Stashbox & Friends'), 'stashbox-and-friends');
  assert.equal(buildOutputFilename(
    '{artist}_{song}_{duration}_{aspect}_v{variation}',
    {
      artist: 'Stashbox',
      song_title: 'Space Jam',
      duration_mode: 'promo',
      duration_seconds: 30,
      aspect_ratio: '9:16',
      width: 1080,
      height: 1920,
      variation: 1
    }
  ), 'stashbox_space-jam_30s_9x16_v01.mp4');
});

test('initial recipe includes output, overlays, metadata, and an empty timeline', () => {
  const recipe = buildInitialRenderRecipe({
    song_key: 'space-jam',
    song_title: 'Space Jam',
    artist: 'Stashbox',
    album_name: 'Cosmic Vibes',
    audio_url: 'https://example.com/space-jam.mp3',
    duration_mode: 'full',
    aspect_ratio: '16:9',
    seed: 'space-jam-seed'
  });

  assert.equal(recipe.song_key, 'space-jam');
  assert.equal(recipe.width, 1920);
  assert.equal(recipe.height, 1080);
  assert.equal(recipe.seed, 'space-jam-seed');
  assert.equal(recipe.overlays.corner_bug_enabled, true);
  assert.equal(recipe.metadata.publisher, 'Elettro Incorporated');
  assert.deepEqual(recipe.timeline, []);
});
