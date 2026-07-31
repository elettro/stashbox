from pathlib import Path

ROUTE_PATH = Path('radio-api/song-artwork-routes.mjs')
BRIDGE_PATH = Path('radio-admin/songs/dev/song-images-compat-bridge.js')
APP_PATH = Path('radio-admin/dev/app.js')
TEST_PATH = Path('radio-api/tests/song-artwork-canonical.test.mjs')


def patch_route() -> None:
    text = ROUTE_PATH.read_text()

    optional_anchor = """const OPTIONAL_FIELDS = Object.freeze([
  'song_artwork_16x9_url',
  'song_artwork_9x16_url',
  'song_artwork_3x4_url',
  'song_artwork_4x5_url',
  'song_artwork_21x9_url'
]);
"""
    if 'LEGACY_PREPARED_FIELD' not in text:
        if optional_anchor not in text:
            raise SystemExit('Optional artwork field anchor was not found.')
        text = text.replace(
            optional_anchor,
            optional_anchor + "\nconst LEGACY_PREPARED_FIELD = 'prepared_artwork_images';\nconst PROFILE_SOURCE_PREFIX = 'song_profile_image:';\n",
        )

    old_select = 'SELECT song_key, song_name, display_title, artist, song_artwork_url, public_visibility'
    new_select = 'SELECT song_key, song_name, display_title, artist, song_artwork_url, visual_assets, public_visibility'
    if old_select in text:
        text = text.replace(old_select, new_select)
    elif new_select not in text:
        raise SystemExit('Song artwork SELECT anchor was not found.')

    read_anchor = """async function readOptionalArtwork(songKey, deps) {
  await ensureArtworkTable(deps);
  const result = await deps.client.query(`
    SELECT ${OPTIONAL_FIELDS.join(', ')}, updated_at
    FROM ${deps.qname('song_artwork_images')}
    WHERE lower(song_key) = lower($1)
    LIMIT 1
  `, [songKey]);
  return result.rows[0] || {};
}
"""

    helper_block = read_anchor + r'''
function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function legacyPreparedArtwork(song = {}, recipeValue = {}) {
  const recipe = objectValue(recipeValue);
  const prepared = objectValue(recipe[LEGACY_PREPARED_FIELD]);
  const images = {};

  for (const asset of arrayValue(song.visual_assets)) {
    const source = cleanText(asset?.source).toLowerCase();
    if (!source.startsWith(PROFILE_SOURCE_PREFIX)) continue;
    const ratio = source.slice(PROFILE_SOURCE_PREFIX.length);
    const field = ARTWORK_FIELDS[ratio];
    const url = cleanText(asset?.url || asset?.src);
    if (field && OPTIONAL_FIELDS.includes(field) && url && !images[field]) images[field] = url;
  }

  for (const [ratio, field] of Object.entries(ARTWORK_FIELDS)) {
    if (!OPTIONAL_FIELDS.includes(field)) continue;
    const url = cleanText(prepared[ratio]);
    if (url) images[field] = url;
  }

  return images;
}

export function mergeArtworkSources(stored = {}, legacy = {}) {
  return Object.fromEntries(OPTIONAL_FIELDS.map(field => [
    field,
    cleanText(stored[field] || legacy[field])
  ]));
}

async function readLegacyVisualRecipe(songKey, deps) {
  try {
    const result = await deps.client.query(`
      SELECT recipe
      FROM ${deps.qname('song_visual_recipes')}
      WHERE lower(song_key) = lower($1)
      LIMIT 1
    `, [songKey]);
    return objectValue(result.rows[0]?.recipe);
  } catch (error) {
    if (error?.code === '42P01') return {};
    throw error;
  }
}

async function ensureLegacyVisualRecipeTable(deps) {
  await deps.client.query(`
    CREATE TABLE IF NOT EXISTS ${deps.qname('song_visual_recipes')} (
      song_key TEXT PRIMARY KEY,
      recipe JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function syncLegacyPreparedArtwork(songKey, patch, deps) {
  const optionalPatch = Object.fromEntries(
    Object.entries(patch || {}).filter(([field]) => OPTIONAL_FIELDS.includes(field))
  );
  if (!Object.keys(optionalPatch).length) return;

  await ensureLegacyVisualRecipeTable(deps);
  const recipe = await readLegacyVisualRecipe(songKey, deps);
  const prepared = { ...objectValue(recipe[LEGACY_PREPARED_FIELD]) };

  for (const [field, value] of Object.entries(optionalPatch)) {
    const ratio = Object.entries(ARTWORK_FIELDS).find(([, artworkField]) => artworkField === field)?.[0];
    if (!ratio) continue;
    const url = cleanText(value);
    if (url) prepared[ratio] = url;
    else delete prepared[ratio];
  }

  const nextRecipe = {
    ...recipe,
    [LEGACY_PREPARED_FIELD]: prepared,
    prepared_artwork_updated_at: new Date().toISOString()
  };

  await deps.client.query(`
    INSERT INTO ${deps.qname('song_visual_recipes')} (song_key, recipe)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (song_key) DO UPDATE SET recipe = EXCLUDED.recipe, updated_at = now()
  `, [songKey, JSON.stringify(nextRecipe)]);
}

async function readCanonicalArtwork(song, deps) {
  let stored = await readOptionalArtwork(song.song_key, deps);
  const recipe = await readLegacyVisualRecipe(song.song_key, deps);
  const legacy = legacyPreparedArtwork(song, recipe);
  const migrationPatch = Object.fromEntries(
    OPTIONAL_FIELDS
      .filter(field => !cleanText(stored[field]) && cleanText(legacy[field]))
      .map(field => [field, cleanText(legacy[field])])
  );

  if (Object.keys(migrationPatch).length) {
    await persistPatch(song, migrationPatch, deps);
    stored = await readOptionalArtwork(song.song_key, deps);
  }

  return {
    ...stored,
    ...mergeArtworkSources(stored, legacy)
  };
}
'''

    if 'async function readCanonicalArtwork' not in text:
        if read_anchor not in text:
            raise SystemExit('readOptionalArtwork anchor was not found.')
        text = text.replace(read_anchor, helper_block)

    old_get = """  if (method === 'GET') {
    const stored = await readOptionalArtwork(song.song_key, deps);
    return deps.response(200, { success: true, media: mediaPayload(song, stored) });
  }
"""
    new_get = """  if (method === 'GET') {
    const stored = await readCanonicalArtwork(song, deps);
    return deps.response(200, { success: true, media: mediaPayload(song, stored) });
  }
"""
    if old_get in text:
        text = text.replace(old_get, new_get)
    elif new_get not in text:
        raise SystemExit('Artwork GET handler anchor was not found.')

    old_patch = """    await persistPatch(song, patch, deps);
    const freshSong = await resolveSong(song.song_key, deps, { includeHidden: true });
    const stored = await readOptionalArtwork(song.song_key, deps);
"""
    new_patch = """    await persistPatch(song, patch, deps);
    await syncLegacyPreparedArtwork(song.song_key, patch, deps);
    const freshSong = await resolveSong(song.song_key, deps, { includeHidden: true });
    const stored = await readCanonicalArtwork(freshSong, deps);
"""
    if old_patch in text:
        text = text.replace(old_patch, new_patch)
    elif new_patch not in text:
        raise SystemExit('Artwork PATCH handler anchor was not found.')

    ROUTE_PATH.write_text(text)


def patch_frontend() -> None:
    text = BRIDGE_PATH.read_text()
    text = text.replace('__stashboxSongImagesCompatBridgeV3Installed', '__stashboxSongImagesCompatBridgeV4Installed')

    old = r'''      const mediaMatch = url.pathname.match(/^\/dev\/radio\/admin\/songs\/([^/]+)\/artwork-images$/);
      if (mediaMatch && (method === 'GET' || method === 'PATCH')) {
        return handleArtworkMedia(input, init, mediaMatch, bodyText);
      }
'''
    new = r'''      const mediaMatch = url.pathname.match(/^\/dev\/radio\/admin\/songs\/([^/]+)\/artwork-images$/);
      if (mediaMatch && (method === 'GET' || method === 'PATCH')) {
        const canonicalResponse = await fetchWithRetry(input, init, {
          label: 'Canonical song artwork request',
          attempts: 3
        });
        if (canonicalResponse.status !== 404) return canonicalResponse;
        return handleArtworkMedia(input, init, mediaMatch, bodyText);
      }
'''
    if old in text:
        text = text.replace(old, new)
    elif new not in text:
        raise SystemExit('Compatibility bridge media interception anchor was not found.')
    BRIDGE_PATH.write_text(text)

    app = APP_PATH.read_text()
    app = app.replace(
        'song-images-compat-bridge.js?v=20260729-song-images-network1',
        'song-images-compat-bridge.js?v=20260730-canonical-artwork1',
    )
    app = app.replace(
        'song-images.js?v=20260729-song-images-order2',
        'song-images.js?v=20260730-canonical-artwork1',
    )
    APP_PATH.write_text(app)


def write_tests() -> None:
    TEST_PATH.write_text(r'''import test from 'node:test';
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
''')


if __name__ == '__main__':
    patch_route()
    patch_frontend()
    write_tests()
