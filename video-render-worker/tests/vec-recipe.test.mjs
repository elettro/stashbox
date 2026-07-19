import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVecRecipeVisuals } from '../src/vec-recipe.mjs';

function asset(id, type, url) {
  return { id, asset_type: type, public_url: url };
}

test('real VEC recipe resolves selected folder, direct, and borrowed assets', async () => {
  const calls = [];
  const responses = new Map([
    ['/admin/vec/recipe?song_key=dub-reggae-01', {
      found: true,
      recipe: {
        visual_mode: 'custom',
        artwork: {
          start_with_artwork: true,
          start_duration_seconds: 3,
          end_with_artwork: true,
          end_duration_seconds: 4,
          re_present_artwork: true,
          repeat_every_seconds: 60
        },
        render_settings: { still_image_duration_seconds: 3, ken_burns_enabled: true },
        shuffle: { order_mode: 'randomize', avoid_repeating_same_asset: true },
        song_assets: { active_image_ids: ['direct-1'] },
        folders: [{
          enabled: true,
          folder_id: 'folder-1',
          active_clip_ids: ['clip-1', 'clip-2'],
          excluded_clip_ids: []
        }],
        borrowed_song_assets: [{
          enabled: true,
          source_song_key: 'help-jamaica-now',
          active_image_ids: ['borrowed-1']
        }]
      }
    }],
    ['/admin/vec/song-assets?song_key=dub-reggae-01', {
      assets: [asset('direct-1', 'image', 'https://example.com/direct.jpg')]
    }],
    ['/radio/visuals/folders/folder-1/assets', {
      folder_name: 'Dean Surfing',
      assets: [
        asset('clip-1', 'clip', 'https://example.com/clip-1.mp4'),
        asset('clip-2', 'clip', 'https://example.com/clip-2.mp4'),
        asset('not-selected', 'clip', 'https://example.com/not-selected.mp4')
      ]
    }],
    ['/admin/vec/song-assets?song_key=help-jamaica-now', {
      assets: [asset('borrowed-1', 'image', 'https://example.com/borrowed.jpg')]
    }]
  ]);

  const result = await resolveVecRecipeVisuals({
    songKey: 'dub-reggae-01',
    request: async pathname => {
      calls.push(pathname);
      if (!responses.has(pathname)) throw new Error(`Unexpected request: ${pathname}`);
      return responses.get(pathname);
    }
  });

  assert.equal(result.found, true);
  assert.equal(result.source, 'vec-recipe');
  assert.equal(result.orderMode, 'random');
  assert.deepEqual(result.assets.map(item => item.id), ['direct-1', 'clip-1', 'clip-2', 'borrowed-1']);
  assert.equal(result.assets.filter(item => item.type === 'clip').length, 2);
  assert.deepEqual(result.missingAssetIds, []);
  assert.equal(result.artworkRules.repeat_every_seconds, 60);
  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });
  assert.deepEqual(calls, [...responses.keys()]);
});

test('artwork-only VEC recipe remains authoritative and resolves no clips', async () => {
  let calls = 0;
  const result = await resolveVecRecipeVisuals({
    songKey: 'artwork-song',
    request: async pathname => {
      calls += 1;
      assert.equal(pathname, '/admin/vec/recipe?song_key=artwork-song');
      return {
        found: true,
        recipe: {
          visual_mode: 'artwork_only',
          artwork: { start_with_artwork: true, start_duration_seconds: 4 }
        }
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.found, true);
  assert.equal(result.visualMode, 'artwork_only');
  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });
});

test('missing recipe allows the renderer to use the secondary Song CMS source', async () => {
  const result = await resolveVecRecipeVisuals({
    songKey: 'no-recipe',
    request: async () => ({ found: false, recipe: null })
  });

  assert.equal(result.found, false);
  assert.equal(result.source, 'vec-recipe-not-found');
  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });
});

test('manual VEC recipe exposes its exact saved sequence for Video Factory', async () => {
  const responses = new Map([
    ['/admin/vec/recipe?song_key=manual-song', {
      found: true,
      recipe: {
        visual_mode: 'custom',
        shuffle: { order_mode: 'manual' },
        song_assets: { active_image_ids: ['image-a'] },
        folders: [{ enabled: true, folder_id: 'folder-a', active_clip_ids: ['clip-a'] }],
        manual_sequence: [
          { entry_id: 'entry-1', asset_id: 'clip-a', source_kind: 'folder', asset_type: 'clip', duration_seconds: 6 },
          { entry_id: 'entry-2', asset_id: 'image-a', source_kind: 'song', asset_type: 'image', duration_seconds: 8 },
          { entry_id: 'entry-3', asset_id: 'clip-a', source_kind: 'folder', asset_type: 'clip', duration_seconds: 6 },
          { entry_id: 'entry-4', asset_id: 'official-artwork', source_kind: 'artwork', asset_type: 'artwork', duration_seconds: 4 }
        ]
      }
    }],
    ['/admin/vec/song-assets?song_key=manual-song', { assets: [asset('image-a', 'image', 'https://example.com/a.jpg')] }],
    ['/radio/visuals/folders/folder-a/assets', { assets: [asset('clip-a', 'clip', 'https://example.com/a.mp4')] }]
  ]);
  const result = await resolveVecRecipeVisuals({
    songKey: 'manual-song',
    request: async pathname => responses.get(pathname)
  });
  assert.equal(result.orderMode, 'manual');
  assert.deepEqual(result.assets.map(item => item.id), ['image-a', 'clip-a']);
  assert.deepEqual(result.manualSequence.map(item => item.entry_id), ['entry-1', 'entry-2', 'entry-3', 'entry-4']);
});
