import crypto from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ARTWORK_FIELDS = Object.freeze({
  '1x1': 'song_artwork_url',
  '16x9': 'song_artwork_16x9_url',
  '9x16': 'song_artwork_9x16_url',
  '3x4': 'song_artwork_3x4_url',
  '4x5': 'song_artwork_4x5_url',
  '21x9': 'song_artwork_21x9_url'
});

const OPTIONAL_FIELDS = Object.freeze([
  'song_artwork_16x9_url',
  'song_artwork_9x16_url',
  'song_artwork_3x4_url',
  'song_artwork_4x5_url',
  'song_artwork_21x9_url'
]);

const LEGACY_PREPARED_FIELD = 'prepared_artwork_images';
const PROFILE_SOURCE_PREFIX = 'song_profile_image:';

const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const FALLBACK_ORDER = Object.freeze({
  '1x1': ['1x1'],
  '16x9': ['16x9', '21x9', '1x1'],
  '9x16': ['9x16', '4x5', '3x4', '1x1'],
  '3x4': ['3x4', '4x5', '9x16', '1x1'],
  '4x5': ['4x5', '3x4', '9x16', '1x1'],
  '21x9': ['21x9', '16x9', '1x1']
});

let tableEnsured = false;

function cleanText(value, maxLength = 2048) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeSegment(value, fallback = 'media') {
  return cleanText(value, 180)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function encodedKey(key) {
  return String(key).split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function routeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function uploadBucket() {
  return cleanText(
    process.env.UPLOAD_BUCKET ||
    process.env.UPLOAD_BUCKET_NAME ||
    process.env.RADIO_UPLOAD_BUCKET ||
    process.env.S3_BUCKET ||
    process.env.MEDIA_BUCKET,
    300
  );
}

function uploadRegion() {
  return cleanText(
    process.env.UPLOAD_REGION ||
    process.env.UPLOAD_BUCKET_REGION ||
    process.env.S3_BUCKET_REGION ||
    process.env.RADIO_UPLOAD_BUCKET_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'us-east-1',
    100
  );
}

function publicObjectUrl(bucket, region, key) {
  const configuredBase = cleanText(
    process.env.UPLOAD_PUBLIC_BASE_URL ||
    process.env.MEDIA_PUBLIC_BASE_URL ||
    process.env.RADIO_MEDIA_PUBLIC_BASE_URL,
    2000
  ).replace(/\/+$/, '');
  if (configuredBase) return `${configuredBase}/${encodedKey(key)}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey(key)}`;
}

function isSafeImageUrl(value) {
  if (!value) return true;
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function isPublicRoute(segments) {
  return segments[0] === 'radio' &&
    segments[1] === 'songs' &&
    Boolean(segments[2]) &&
    segments[3] === 'artwork-images' &&
    segments.length === 4;
}

function isAdminMediaRoute(segments) {
  return segments[0] === 'radio' &&
    segments[1] === 'admin' &&
    segments[2] === 'songs' &&
    Boolean(segments[3]) &&
    segments[4] === 'artwork-images' &&
    segments.length === 5;
}

function isAdminPresignRoute(segments) {
  return segments[0] === 'radio' &&
    segments[1] === 'admin' &&
    segments[2] === 'songs' &&
    Boolean(segments[3]) &&
    segments[4] === 'artwork-images' &&
    segments[5] === 'presign' &&
    segments.length === 6;
}

async function ensureArtworkTable(deps) {
  if (tableEnsured) return;

  await deps.client.query(`
    CREATE TABLE IF NOT EXISTS ${deps.qname('song_artwork_images')} (
      song_key TEXT PRIMARY KEY,
      song_artwork_16x9_url TEXT,
      song_artwork_9x16_url TEXT,
      song_artwork_3x4_url TEXT,
      song_artwork_4x5_url TEXT,
      song_artwork_21x9_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const field of OPTIONAL_FIELDS) {
    await deps.client.query(`ALTER TABLE ${deps.qname('song_artwork_images')} ADD COLUMN IF NOT EXISTS ${field} TEXT`);
  }

  tableEnsured = true;
}

async function resolveSong(identifier, deps, { includeHidden = false } = {}) {
  const key = cleanText(decodeURIComponent(identifier || ''), 300).toLowerCase();
  if (!key) throw routeError(404, 'SONG_NOT_FOUND', 'Song not found.');

  const result = await deps.client.query(`
    SELECT song_key, song_name, display_title, artist, song_artwork_url, visual_assets, public_visibility
    FROM ${deps.qname('songs')}
    WHERE lower(song_key) = $1
      ${includeHidden ? '' : "AND COALESCE(public_visibility, 'visible') = 'visible'"}
    LIMIT 1
  `, [key]);

  if (!result.rowCount) throw routeError(404, 'SONG_NOT_FOUND', 'Song not found.');
  return result.rows[0];
}

async function readOptionalArtwork(songKey, deps) {
  await ensureArtworkTable(deps);
  const result = await deps.client.query(`
    SELECT ${OPTIONAL_FIELDS.join(', ')}, updated_at
    FROM ${deps.qname('song_artwork_images')}
    WHERE lower(song_key) = lower($1)
    LIMIT 1
  `, [songKey]);
  return result.rows[0] || {};
}

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

function artworkImages(song, stored = {}) {
  return {
    '1x1': cleanText(song?.song_artwork_url),
    '16x9': cleanText(stored.song_artwork_16x9_url),
    '9x16': cleanText(stored.song_artwork_9x16_url),
    '3x4': cleanText(stored.song_artwork_3x4_url),
    '4x5': cleanText(stored.song_artwork_4x5_url),
    '21x9': cleanText(stored.song_artwork_21x9_url)
  };
}

function resolvedArtwork(images) {
  return Object.fromEntries(Object.entries(FALLBACK_ORDER).map(([requestedRatio, order]) => {
    const sourceRatio = order.find(ratio => cleanText(images[ratio])) || '';
    return [requestedRatio, {
      requested_ratio: requestedRatio,
      source_ratio: sourceRatio,
      url: sourceRatio ? images[sourceRatio] : '',
      fallback_used: Boolean(sourceRatio && sourceRatio !== requestedRatio)
    }];
  }));
}

function mediaPayload(song, stored = {}) {
  const images = artworkImages(song, stored);
  const ready = Object.values(images).filter(Boolean).length;
  return {
    song_key: song.song_key,
    song_name: song.song_name || '',
    display_title: song.display_title || song.song_name || '',
    artist: song.artist || '',
    song_artwork_url: images['1x1'],
    song_artwork_1x1_url: images['1x1'],
    song_artwork_16x9_url: images['16x9'],
    song_artwork_9x16_url: images['9x16'],
    song_artwork_3x4_url: images['3x4'],
    song_artwork_4x5_url: images['4x5'],
    song_artwork_21x9_url: images['21x9'],
    artwork_images: images,
    resolved_artwork: resolvedArtwork(images),
    completion: {
      ready,
      total: 6,
      complete: ready === 6,
      label: ready === 6 ? 'Complete Image Set' : `${ready} of 6 Images Ready`
    },
    updated_at: stored.updated_at || null
  };
}

function normalizedPatch(body) {
  const patch = {};
  Object.values(ARTWORK_FIELDS).forEach(field => {
    if (!hasOwn(body, field)) return;
    const value = cleanText(body[field]);
    if (!isSafeImageUrl(value)) {
      throw routeError(400, 'INVALID_ARTWORK_URL', `${field} must be an HTTP(S) or site-relative image URL.`);
    }
    patch[field] = value || null;
  });
  return patch;
}

async function persistPatch(song, patch, deps) {
  if (hasOwn(patch, 'song_artwork_url')) {
    await deps.client.query(`
      UPDATE ${deps.qname('songs')}
      SET song_artwork_url = $1, updated_at = now()
      WHERE lower(song_key) = lower($2)
    `, [patch.song_artwork_url, song.song_key]);
  }

  const optionalPresent = OPTIONAL_FIELDS.some(field => hasOwn(patch, field));
  if (!optionalPresent) return;

  const existing = await readOptionalArtwork(song.song_key, deps);
  const merged = Object.fromEntries(OPTIONAL_FIELDS.map(field => [
    field,
    hasOwn(patch, field) ? patch[field] : (existing[field] || null)
  ]));

  await deps.client.query(`
    INSERT INTO ${deps.qname('song_artwork_images')} (
      song_key,
      ${OPTIONAL_FIELDS.join(', ')},
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (song_key) DO UPDATE SET
      song_artwork_16x9_url = EXCLUDED.song_artwork_16x9_url,
      song_artwork_9x16_url = EXCLUDED.song_artwork_9x16_url,
      song_artwork_3x4_url = EXCLUDED.song_artwork_3x4_url,
      song_artwork_4x5_url = EXCLUDED.song_artwork_4x5_url,
      song_artwork_21x9_url = EXCLUDED.song_artwork_21x9_url,
      updated_at = now()
  `, [
    song.song_key,
    merged.song_artwork_16x9_url,
    merged.song_artwork_9x16_url,
    merged.song_artwork_3x4_url,
    merged.song_artwork_4x5_url,
    merged.song_artwork_21x9_url
  ]);
}

async function createArtworkPresign(song, body) {
  const ratio = cleanText(body.ratio, 20).toLowerCase();
  if (!ARTWORK_FIELDS[ratio]) {
    throw routeError(400, 'INVALID_ARTWORK_RATIO', `Choose one of: ${Object.keys(ARTWORK_FIELDS).join(', ')}.`);
  }

  const contentType = cleanText(body.content_type || body.contentType, 120).toLowerCase();
  const extension = IMAGE_TYPES.get(contentType);
  if (!extension) throw routeError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Use a JPG, PNG, or WEBP image.');

  const sizeBytes = Number(body.size_bytes || body.sizeBytes || 0);
  if (sizeBytes && (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024)) {
    throw routeError(400, 'IMAGE_TOO_LARGE', 'Image must be 10 MB or smaller.');
  }

  const bucket = uploadBucket();
  if (!bucket) throw routeError(500, 'UPLOAD_BUCKET_MISSING', 'The media upload bucket is not configured.');
  const region = uploadRegion();
  const originalName = safeSegment(body.filename, `image.${extension}`);
  const baseName = originalName.replace(/\.[a-z0-9]+$/i, '').slice(0, 90) || 'image';
  const songKey = safeSegment(song.song_key, 'unsorted');
  const key = `songs/${songKey}/artwork/${ratio}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${extension}`;

  const client = new S3Client({ region });
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      song_key: cleanText(song.song_key, 300),
      artwork_ratio: ratio,
      artist: cleanText(song.artist, 300)
    }
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

  return {
    upload_url: uploadUrl,
    public_url: publicObjectUrl(bucket, region, key),
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    key,
    ratio,
    field: ARTWORK_FIELDS[ratio],
    expires_in: 900
  };
}

export function isSongArtworkRequest(segments) {
  return isPublicRoute(segments) || isAdminMediaRoute(segments) || isAdminPresignRoute(segments);
}

export async function handleSongArtworkRequest(event, deps) {
  const segments = deps.getRouteSegments(event);
  const method = deps.getMethod(event).toUpperCase();
  const adminMedia = isAdminMediaRoute(segments);
  const adminPresign = isAdminPresignRoute(segments);
  const admin = adminMedia || adminPresign;
  const identifier = admin ? segments[3] : segments[2];

  if (!admin && method !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  if (admin) await deps.requireAdmin(event);
  const song = await resolveSong(identifier, deps, { includeHidden: admin });

  if (adminPresign) {
    if (method !== 'POST') return deps.response(405, { success: false, error: 'Method not allowed.' });
    const upload = await createArtworkPresign(song, deps.parseBody(event));
    return deps.response(200, { success: true, ...upload });
  }

  if (method === 'GET') {
    const stored = await readCanonicalArtwork(song, deps);
    return deps.response(200, { success: true, media: mediaPayload(song, stored) });
  }

  if (adminMedia && method === 'PATCH') {
    const patch = normalizedPatch(deps.parseBody(event));
    if (!Object.keys(patch).length) {
      throw routeError(400, 'ARTWORK_FIELDS_REQUIRED', `Provide at least one of: ${Object.values(ARTWORK_FIELDS).join(', ')}.`);
    }

    await persistPatch(song, patch, deps);
    await syncLegacyPreparedArtwork(song.song_key, patch, deps);
    const freshSong = await resolveSong(song.song_key, deps, { includeHidden: true });
    const stored = await readCanonicalArtwork(freshSong, deps);
    return deps.response(200, {
      success: true,
      persisted: true,
      media: mediaPayload(freshSong, stored)
    });
  }

  return deps.response(405, { success: false, error: 'Method not allowed.' });
}
