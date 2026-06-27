import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

function getClient() {
  return new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

let activeClient = null;
const client = {
  query(...args) {
    if (!activeClient) throw new Error('PostgreSQL client is not connected.');
    return activeClient.query(...args);
  }
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

const DEFAULT_AD_SETTINGS = {
  id: 'dev',
  ads_enabled: true,
  break_method: 'count',
  ads_per_break: 1,
  target_ad_seconds: 30,
  break_interval: 1
};

const VALID_BREAK_METHODS = new Set(['count', 'seconds']);
const VALID_ADS_PER_BREAK = new Set([1, 2, 3, 4, 5]);
const VALID_TARGET_AD_SECONDS = new Set([15, 30, 45, 60, 90]);
const VALID_BREAK_INTERVALS = new Set([1, 2, 3]);

const EDITABLE_FIELDS = [
  'internal_title',
  'description',
  'ad_type',
  'video_url',
  'click_url',
  'ad_ratio_label',
  'video_width',
  'video_height',
  'duration_seconds',
  'frequency',
  'skip_after_seconds',
  'no_skipping',
  'active',
  'hidden',
  'genre_targeting',
  'mood_targeting',
  'artist_targeting',
  'song_targeting',
  'start_date',
  'end_date',
  'notes'
];

const SUPPORTED_AD_EVENTS = new Set([
  'ad_start',
  'ad_click',
  'ad_skip',
  'ad_complete',
  'ad_error'
]);

const SONG_EVENT_TYPES = new Set([
  'play_start',
  'play_full',
  'play_partial',
  'skip',
  'like',
  'share',
  'share_link_visit',
  'video_click',
  'product_click'
]);

function getSongAllowedFields() {
  return [
  'song_key',
  'song_name',
  'display_title',
  'artist',
  'album_name',
  'genre',
  'internal_version_name',
  'languages',
  'secondary_genre',
  'release_format',
  'song_origin',
  'audio_url',
  'song_artwork_url',
  'video_link',
  'enhanced_visuals_enabled',
  'shuffle_visuals',
  'visual_assets',
  'visual_still_duration_seconds',
  'public_track_note',
  'show_public_note',
  'public_video_note',
  'video_setlist',
  'public_visibility',
  'exclusive',
  'explicit',
  'live_recording',
  'featured',
  'specific_product_urls',
  'spotify_url',
  'apple_music_url',
  'youtube_music_url',
  'official_song_page_url',
  'shop_url',
  'mood_tags',
  'internal_notes'
  ];
}

const BOOLEAN_SONG_FIELDS = new Set([
  'show_public_note',
  'exclusive',
  'explicit',
  'live_recording',
  'featured',
  'enhanced_visuals_enabled',
  'shuffle_visuals'
]);


const ADMIN_SONG_UPLOAD_METADATA_FIELDS = new Set([
  'uploadUrl',
  'upload_url',
  'publicUrl',
  'public_url',
  'key',
  'method',
  'purpose',
  'headers',
  'contentType'
]);

const JSON_SONG_FIELDS = new Set(['specific_product_urls', 'visual_assets']);
const ARRAY_SONG_FIELDS = new Set(['mood_tags', 'languages']);
const CREATE_OMIT_SONG_FIELDS = new Set(['visual_assets']);
const RESPONSE_ONLY_SONG_FIELDS = new Set([
  'resolved_artwork_url',
  'like_count',
  'total_likes',
  'share_count',
  'total_shares',
  'total_plays',
  'full_play_count',
  'partial_play_count',
  'skip_count',
  'total_seconds_played',
  'share_link_visits',
  'video_clicks',
  'product_clicks'
]);
const TEXTUAL_DB_TYPES = new Set(['character varying', 'character', 'text', 'citext']);
const OPTIONAL_SONG_LOOKUP_FIELDS = new Set(['album_name', 'secondary_genre', 'internal_version_name', 'shop_url']);
// FK-backed song create fields are discovered from information_schema at runtime.


function isDevRequest(event) {
  const path = getPath(event);
  const stage = String(event.requestContext?.stage || process.env.STAGE || process.env.NODE_ENV || process.env.APP_ENV || '').toLowerCase();
  return path.includes('/dev/') || stage === 'dev' || stage === 'development';
}

function safeDatabaseError(error) {
  return {
    code: error?.code,
    message: error?.message,
    detail: error?.detail,
    hint: error?.hint,
    stack: error?.stack
  };
}

function isTextColumn(column) {
  return TEXTUAL_DB_TYPES.has(column?.data_type) || String(column?.udt_name || '').startsWith('varchar');
}

function isJsonColumn(column) {
  return column?.data_type === 'json' || column?.data_type === 'jsonb' || column?.udt_name === 'json' || column?.udt_name === 'jsonb';
}

function isArrayColumn(column) {
  return column?.data_type === 'ARRAY' || String(column?.udt_name || '').startsWith('_');
}

function normalizeJsonArrayFieldValue(field, value) {
  if (field === 'visual_assets') return normalizeVisualAssets(value);
  if (field === 'specific_product_urls' || field === 'mood_tags' || field === 'languages') return normalizeStringArray(value);
  return Array.isArray(value) ? value : [];
}

function normalizeDbValue(field, value, column) {
  if (value === undefined) return undefined;

  if (value === '' && !isTextColumn(column)) {
    if (isJsonColumn(column)) return '[]';
    if (isArrayColumn(column)) return [];
    return null;
  }

  if (value === null) return null;

  if (isJsonColumn(column)) {
    if (field === 'specific_product_urls' || field === 'visual_assets' || field === 'mood_tags' || field === 'languages') {
      return JSON.stringify(normalizeJsonArrayFieldValue(field, value));
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  if (isArrayColumn(column)) {
    return normalizeStringArray(value);
  }

  if (JSON_SONG_FIELDS.has(field) || ARRAY_SONG_FIELDS.has(field)) {
    return normalizeStringArray(value);
  }

  return value;
}

function valuePlaceholder(field, column, index) {
  const placeholder = `$${index + 1}`;
  if (isJsonColumn(column)) {
    return String(column?.data_type || '').toLowerCase() === 'json' || String(column?.udt_name || '').toLowerCase() === 'json'
      ? `${placeholder}::json`
      : `${placeholder}::jsonb`;
  }
  if (isArrayColumn(column)) return placeholder;
  return placeholder;
}

function isEditableSongInsertField(field, columnMeta) {
  if (ADMIN_SONG_UPLOAD_METADATA_FIELDS.has(field) || RESPONSE_ONLY_SONG_FIELDS.has(field)) return false;
  if (!columnMeta.has(field)) return false;

  if (CREATE_OMIT_SONG_FIELDS.has(field)) return false;

  return true;
}

async function buildSafeSongInsert(input, columnMeta) {
  const foreignKeys = await getSongForeignKeyMetadata();
  const insertEntries = Object.entries(buildSongPayload(input))
    .filter(([field, value]) => value !== undefined && isEditableSongInsertField(field, columnMeta))
    .map(([field, value]) => [field, normalizeSongLookupInsertValue(field, value, foreignKeys)])
    .map(([field, value]) => [field, normalizeDbValue(field, value, columnMeta.get(field))])
    .filter(([, value]) => value !== undefined);

  const payload = Object.fromEntries(insertEntries);
  await validateSongForeignKeyValues(payload, foreignKeys);

  const fields = insertEntries.map(([field]) => field);
  const values = insertEntries.map(([, value]) => value);

  return { payload, fields, values };
}

async function buildSafeSongUpdate(input, columnMeta) {
  const foreignKeys = await getSongForeignKeyMetadata();
  const updateEntries = Object.entries(buildSongPayload(input, { partial: true }))
    .filter(([field, value]) => value !== undefined && columnMeta.has(field) && field !== 'song_key')
    .map(([field, value]) => [field, normalizeSongLookupInsertValue(field, value, foreignKeys)])
    .map(([field, value]) => [field, normalizeDbValue(field, value, columnMeta.get(field))])
    .filter(([, value]) => value !== undefined);

  const payload = Object.fromEntries(updateEntries);
  await validateSongForeignKeyValues(payload, foreignKeys);

  return {
    payload,
    fields: updateEntries.map(([field]) => field),
    values: updateEntries.map(([, value]) => value)
  };
}


async function getSongForeignKeyMetadata() {
  const result = await client.query(
    `SELECT
       kcu.column_name,
       ccu.table_schema AS foreign_table_schema,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'radio'
       AND tc.table_name = 'songs'`
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

function normalizeSongLookupInsertValue(field, value, foreignKeys) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;

  const trimmedValue = value.trim();
  if (foreignKeys.has(field) || OPTIONAL_SONG_LOOKUP_FIELDS.has(field)) {
    return trimmedValue || null;
  }

  return value;
}

function isAlbumNameForeignKey(field, foreignKey) {
  return field === 'album_name'
    && foreignKey?.foreign_table_schema === 'radio'
    && foreignKey?.foreign_table_name === 'albums'
    && foreignKey?.foreign_column_name === 'album_name';
}

async function canAutoCreateAlbum() {
  const columns = await getTableColumnMeta('radio', 'albums');
  for (const [columnName, column] of columns.entries()) {
    if (columnName === 'album_name') continue;
    const isNullable = String(column?.is_nullable || '').toUpperCase() === 'YES';
    const hasDefault = column?.column_default !== null && column?.column_default !== undefined;
    if (!isNullable && !hasDefault) return false;
  }
  return columns.has('album_name');
}

async function ensureAlbumExists(albumName) {
  if (!albumName) return;
  if (!(await canAutoCreateAlbum())) {
    const error = new Error('Album does not exist. Create the album first or leave Album Name blank.');
    error.statusCode = 400;
    error.code = 'ALBUM_LOOKUP_REQUIRED';
    error.field = 'album_name';
    error.detail = error.message;
    throw error;
  }

  await client.query(
    `INSERT INTO radio.albums (album_name)
     VALUES ($1)
     ON CONFLICT (album_name) DO NOTHING`,
    [albumName]
  );
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function validateSongForeignKeyValues(payload, foreignKeys) {
  for (const [field, foreignKey] of foreignKeys.entries()) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = payload[field];
    if (value === null || value === undefined || value === '') continue;

    const result = await client.query(
      `SELECT 1
       FROM ${quoteIdentifier(foreignKey.foreign_table_schema)}.${quoteIdentifier(foreignKey.foreign_table_name)}
       WHERE ${quoteIdentifier(foreignKey.foreign_column_name)} = $1
       LIMIT 1`,
      [value]
    );

    if (!result.rowCount) {
      if (isAlbumNameForeignKey(field, foreignKey)) {
        await ensureAlbumExists(value);
        continue;
      }

      const error = new Error(`${field} value "${value}" does not exist in ${foreignKey.foreign_table_schema}.${foreignKey.foreign_table_name}.${foreignKey.foreign_column_name}.`);
      error.statusCode = 400;
      error.code = 'INVALID_LOOKUP_VALUE';
      error.field = field;
      error.detail = `Choose an existing ${field} value before saving the song.`;
      throw error;
    }
  }
}

function logAdminSongCreateFailure({ event, input, payload, fields, columns, error }) {
  console.error('[Stashbox Radio Admin] song create failed', {
    routePath: getPath(event),
    requestMethod: getMethod(event),
    payloadKeys: Object.keys(input || {}).filter((key) => !ADMIN_SONG_UPLOAD_METADATA_FIELDS.has(key)),
    song_key: payload?.song_key || input?.song_key,
    insertFields: fields,
    sqlColumnList: fields.join(', '),
    knownSongColumns: Array.from(columns.keys()),
    databaseErrorCode: error?.code,
    databaseErrorMessage: error?.message,
    databaseErrorDetail: error?.detail,
    databaseErrorHint: error?.hint,
    stackTrace: error?.stack
  });
}

const DEFAULT_SONG_COLUMNS = `
  song_key,
  song_name,
  display_title,
  artist,
  album_name,
  genre,
  internal_version_name,
  languages,
  secondary_genre,
  release_format,
  song_origin,
  audio_url,
  song_artwork_url,
  video_link,
  enhanced_visuals_enabled,
  shuffle_visuals,
  visual_assets,
  visual_still_duration_seconds,
  public_track_note,
  show_public_note,
  public_video_note,
  video_setlist,
  public_visibility,
  exclusive,
  explicit,
  live_recording,
  featured,
  specific_product_urls,
  spotify_url,
  apple_music_url,
  youtube_music_url,
  official_song_page_url,
  shop_url,
  mood_tags,
  internal_notes,
  created_at,
  updated_at
`;

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(bodyText);
}

function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || '';
}

function getPath(event) {
  return event.rawPath || event.path || '';
}

function getPublicAdsRouteMatch(event) {
  const path = getPath(event).split('?')[0].replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  const radioAdsIndex = segments.findIndex((segment, index) => segment === 'radio' && segments[index + 1] === 'ads');
  const adsIndex = radioAdsIndex >= 0
    ? radioAdsIndex + 1
    : segments.findIndex((segment, index) => segment === 'ads' && segments[index - 1] !== 'admin');

  if (adsIndex < 0) return { adId: '', isEventRoute: false };

  const routeTail = segments.slice(adsIndex + 1);
  const isEventRoute = routeTail.length === 2 && routeTail[1] === 'events';
  const isListRoute = routeTail.length === 0;
  const isAdRoute = routeTail.length === 1 || isEventRoute;

  if (!isListRoute && !isAdRoute) return { adId: '', isEventRoute: false };

  return {
    adId: routeTail[0] || '',
    isEventRoute
  };
}

function getAdId(event) {
  return event.pathParameters?.ad_id ||
    event.pathParameters?.adId ||
    getPublicAdsRouteMatch(event).adId ||
    getPath(event).match(/\/(?:admin|radio)\/ads\/([^/?#]+)/)?.[1] ||
    '';
}

function normalizePayload(input, { partial = false } = {}) {
  const payload = {};

  EDITABLE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      payload[field] = input[field];
    }
  });

  if (!partial) {
    payload.ad_type = payload.ad_type || 'Stashbox Radio Branding';
    payload.frequency = payload.frequency || 'Medium';
    payload.skip_after_seconds = payload.skip_after_seconds ?? 5;
    payload.no_skipping = Boolean(payload.no_skipping);
    payload.active = payload.active ?? true;
    payload.hidden = payload.hidden ?? false;
    payload.start_date = payload.start_date || new Date().toISOString().slice(0, 10);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'hidden')) {
    payload.hidden = Boolean(payload.hidden);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'active')) {
    payload.active = Boolean(payload.active);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'duration_seconds')) {
    const duration = Number(payload.duration_seconds);
    payload.duration_seconds = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null;
  }

  if (payload.hidden) {
    payload.active = false;
  }

  return payload;
}

function validatePayload(payload, { partial = false } = {}) {
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'internal_title')) {
    if (!String(payload.internal_title || '').trim()) return 'internal_title is required.';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'video_url')) {
    if (!String(payload.video_url || '').trim()) return 'video_url is required.';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'ad_type')) {
    if (!String(payload.ad_type || '').trim()) return 'ad_type is required.';
  }

  if (payload.active && payload.hidden) return 'active and hidden cannot both be true.';
  return '';
}


function normalizeInteger(value, fallback, allowedValues) {
  const number = Number(value);
  const integer = Number.isFinite(number) ? Math.floor(number) : fallback;
  return allowedValues.has(integer) ? integer : fallback;
}

function normalizeAdSettings(input = {}) {
  const defaults = DEFAULT_AD_SETTINGS;
  const breakMethod = VALID_BREAK_METHODS.has(String(input.break_method || '').trim())
    ? String(input.break_method).trim()
    : defaults.break_method;

  return {
    id: 'dev',
    ads_enabled: Object.prototype.hasOwnProperty.call(input, 'ads_enabled') ? Boolean(input.ads_enabled) : defaults.ads_enabled,
    break_method: breakMethod,
    ads_per_break: normalizeInteger(input.ads_per_break, defaults.ads_per_break, VALID_ADS_PER_BREAK),
    target_ad_seconds: normalizeInteger(input.target_ad_seconds, defaults.target_ad_seconds, VALID_TARGET_AD_SECONDS),
    break_interval: normalizeInteger(input.break_interval, defaults.break_interval, VALID_BREAK_INTERVALS)
  };
}

function publicAdSettings(settings) {
  return {
    ads_enabled: Boolean(settings.ads_enabled),
    break_method: settings.break_method,
    ads_per_break: settings.ads_per_break,
    target_ad_seconds: settings.target_ad_seconds,
    break_interval: settings.break_interval
  };
}

async function ensureAdSettingsTable() {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS radio;
    CREATE TABLE IF NOT EXISTS radio.ad_settings (
      id text PRIMARY KEY DEFAULT 'dev',
      ads_enabled boolean DEFAULT true,
      break_method text DEFAULT 'count',
      ads_per_break integer DEFAULT 1,
      target_ad_seconds integer DEFAULT 30,
      break_interval integer DEFAULT 1,
      updated_at timestamp DEFAULT now()
    )
  `);
}

async function ensureAdsDurationColumn() {
  try {
    await client.query('ALTER TABLE radio.ads ADD COLUMN IF NOT EXISTS duration_seconds integer');
  } catch (error) {
    console.warn('Could not ensure radio.ads.duration_seconds. Continuing safely.', error.message || error);
  }
}

async function ensureSongsLikesColumn(dbClient = client) {
  try {
    await dbClient.query(`
      ALTER TABLE radio.songs
      ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0
    `);
    await dbClient.query(`
      UPDATE radio.songs
      SET likes = 0
      WHERE likes IS NULL
    `);
  } catch (error) {
    console.warn('Could not ensure radio.songs.likes. Continuing safely.', error.message || error);
  }
}

async function ensureSongsShareColumn(dbClient = client) {
  try {
    await dbClient.query(`
      ALTER TABLE radio.songs
      ADD COLUMN IF NOT EXISTS shares integer DEFAULT 0
    `);
    await dbClient.query(`
      UPDATE radio.songs
      SET shares = 0
      WHERE shares IS NULL
    `);
  } catch (error) {
    console.warn('Could not ensure radio.songs.shares. Continuing safely.', error.message || error);
  }
}

async function adsDurationColumnSelect() {
  try {
    const result = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'radio' AND table_name = 'ads' AND column_name = 'duration_seconds'
       LIMIT 1`
    );
    return result.rowCount ? 'duration_seconds,' : 'NULL::integer AS duration_seconds,';
  } catch (error) {
    console.warn('Could not inspect radio.ads.duration_seconds. Returning NULL duration.', error.message || error);
    return 'NULL::integer AS duration_seconds,';
  }
}

async function ensureAdStorage() {
  await ensureAdSettingsTable();
  await ensureAdsDurationColumn();
  await ensureSongsLikesColumn();
  await ensureSongsShareColumn();
}

async function getAdSettings({ publicOnly = false } = {}) {
  try {
    await ensureAdSettingsTable();
    const result = await client.query(`
      INSERT INTO radio.ad_settings (
        id,
        ads_enabled,
        break_method,
        ads_per_break,
        target_ad_seconds,
        break_interval,
        updated_at
      )
      VALUES ('dev', $1, $2, $3, $4, $5, now())
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `, [
      DEFAULT_AD_SETTINGS.ads_enabled,
      DEFAULT_AD_SETTINGS.break_method,
      DEFAULT_AD_SETTINGS.ads_per_break,
      DEFAULT_AD_SETTINGS.target_ad_seconds,
      DEFAULT_AD_SETTINGS.break_interval
    ]);

    const settingsResult = result.rowCount
      ? result
      : await client.query('SELECT * FROM radio.ad_settings WHERE id = $1', ['dev']);
    const settings = normalizeAdSettings(settingsResult.rows[0] || DEFAULT_AD_SETTINGS);
    const bodySettings = publicOnly ? publicAdSettings(settings) : settings;
    return response(200, { success: true, settings: bodySettings });
  } catch (error) {
    console.warn('Ad settings unavailable. Returning safe defaults.', error.message || error);
    const settings = normalizeAdSettings(DEFAULT_AD_SETTINGS);
    const bodySettings = publicOnly ? publicAdSettings(settings) : settings;
    return response(200, { success: true, settings: bodySettings, fallback: true });
  }
}

function validateAdSettingsInput(input = {}) {
  if (typeof input.ads_enabled !== 'boolean') return 'ads_enabled must be a boolean.';
  if (!VALID_BREAK_METHODS.has(input.break_method)) return 'break_method must be one of: count, seconds.';
  if (!VALID_ADS_PER_BREAK.has(Number(input.ads_per_break))) return 'ads_per_break must be one of: 1, 2, 3, 4, 5.';
  if (!VALID_TARGET_AD_SECONDS.has(Number(input.target_ad_seconds))) return 'target_ad_seconds must be one of: 15, 30, 45, 60, 90.';
  if (!VALID_BREAK_INTERVALS.has(Number(input.break_interval))) return 'break_interval must be one of: 1, 2, 3.';
  return '';
}

async function updateAdSettings(event) {
  const input = parseBody(event);
  const validationError = validateAdSettingsInput(input);
  if (validationError) return response(400, { success: false, error: validationError });
  const payload = normalizeAdSettings(input);
  try {
    await ensureAdSettingsTable();
    const result = await client.query(`
      INSERT INTO radio.ad_settings (id, ads_enabled, break_method, ads_per_break, target_ad_seconds, break_interval, updated_at)
      VALUES ('dev', $1, $2, $3, $4, $5, now())
      ON CONFLICT (id) DO UPDATE SET
        ads_enabled = EXCLUDED.ads_enabled,
        break_method = EXCLUDED.break_method,
        ads_per_break = EXCLUDED.ads_per_break,
        target_ad_seconds = EXCLUDED.target_ad_seconds,
        break_interval = EXCLUDED.break_interval,
        updated_at = now()
      RETURNING *
    `, [payload.ads_enabled, payload.break_method, payload.ads_per_break, payload.target_ad_seconds, payload.break_interval]);
    return response(200, { success: true, message: 'Ad settings saved', settings: normalizeAdSettings(result.rows[0]) });
  } catch (error) {
    console.error('Could not save ad settings:', error);
    return response(500, { success: false, error: 'Could not save ad settings.' });
  }
}

async function handleAdminAdSettingsRoute(event, { requireAdmin }) {
  if (getMethod(event) === 'OPTIONS') return response(204, {});
  await requireAdmin(event);
  const method = getMethod(event);
  if (method === 'GET') return getAdSettings();
  if (method === 'PUT') return updateAdSettings(event);
  return response(404, { success: false, error: 'Not found.' });
}

async function handlePublicAdSettingsRoute(event) {
  if (getMethod(event) === 'OPTIONS') return response(204, {});
  if (getMethod(event) === 'GET') return getAdSettings({ publicOnly: true });
  return response(404, { success: false, error: 'Not found.' });
}

function buildInsert(payload) {
  const fields = EDITABLE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  const columns = fields.join(', ');
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
  const values = fields.map((field) => payload[field]);

  return {
    text: `INSERT INTO radio.ads (${columns}) VALUES (${placeholders}) RETURNING *`,
    values
  };
}

function buildUpdate(adId, payload) {
  const fields = EDITABLE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const values = fields.map((field) => payload[field]);
  values.push(adId);

  return {
    text: `UPDATE radio.ads SET ${assignments}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  };
}

async function listAds() {
  await ensureAdStorage();
  const result = await client.query(`
    SELECT
      *,
      COALESCE(skips, 0)::int AS skips,
      CASE
        WHEN COALESCE(views, 0) > 0
        THEN ROUND((COALESCE(skips, 0)::numeric / COALESCE(views, 0)::numeric) * 100, 2)
        ELSE 0
      END AS skip_rate
    FROM radio.ads
    ORDER BY created_at DESC
  `);
  return response(200, { success: true, count: result.rowCount, ads: result.rows });
}

async function listPublicAds() {
  await ensureAdStorage();
  const durationColumn = await adsDurationColumnSelect();
  const result = await client.query(`
    SELECT
      id,
      internal_title,
      description,
      ad_type,
      video_url,
      click_url,
      ad_ratio_label,
      video_width,
      video_height,
      ${durationColumn}
      frequency,
      skip_after_seconds,
      no_skipping,
      active,
      hidden,
      genre_targeting,
      mood_targeting,
      artist_targeting,
      song_targeting,
      start_date,
      end_date,
      COALESCE(views, 0)::int AS views,
      COALESCE(clicks, 0)::int AS clicks,
      COALESCE(skips, 0)::int AS skips,
      CASE
        WHEN COALESCE(views, 0) > 0
        THEN ROUND((COALESCE(skips, 0)::numeric / COALESCE(views, 0)::numeric) * 100, 2)
        ELSE 0
      END AS skip_rate,
      created_at,
      updated_at
    FROM radio.ads
    WHERE active = true
      AND hidden = false
      AND (start_date IS NULL OR start_date <= CURRENT_DATE)
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY created_at DESC
  `);

  return response(200, { success: true, count: result.rowCount, ads: result.rows });
}

async function createAd(event) {
  await ensureAdStorage();
  const payload = normalizePayload(parseBody(event));
  const validationError = validatePayload(payload);
  if (validationError) return response(400, { success: false, error: validationError });

  const result = await client.query(buildInsert(payload));
  return response(201, { success: true, message: 'Ad created', ad: result.rows[0] });
}

async function updateAd(event) {
  await ensureAdStorage();
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const payload = normalizePayload(parseBody(event), { partial: true });
  const fields = Object.keys(payload);
  if (!fields.length) return response(400, { success: false, error: 'No editable fields provided.' });

  const validationError = validatePayload(payload, { partial: true });
  if (validationError) return response(400, { success: false, error: validationError });

  const result = await client.query(buildUpdate(adId, payload));
  if (!result.rowCount) return response(404, { success: false, error: 'Ad not found.' });
  return response(200, { success: true, message: 'Ad updated', ad: result.rows[0] });
}

async function deleteAd(event) {
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const result = await client.query('DELETE FROM radio.ads WHERE id = $1', [adId]);
  if (!result.rowCount) return response(404, { success: false, error: 'Ad not found.' });
  return response(200, { success: true, message: 'Ad deleted', ad_id: adId });
}

function getAdEventType(event) {
  if (!getPublicAdsRouteMatch(event).isEventRoute) return '';

  try {
    const body = parseBody(event);
    return String(
      body.event_type ||
      body.eventType ||
      event.queryStringParameters?.event_type ||
      event.queryStringParameters?.eventType ||
      ''
    ).trim();
  } catch (_) {
    return String(event.queryStringParameters?.event_type || event.queryStringParameters?.eventType || '').trim();
  }
}

function getPayloadEventType(body = {}, fallback = '') {
  return String(body.event_type || body.eventType || body.type || body.action || fallback || '').trim();
}

function getTrackEventType(event) {
  try {
    const body = parseBody(event);
    return getPayloadEventType(
      body,
      event.queryStringParameters?.event_type ||
        event.queryStringParameters?.eventType ||
        event.queryStringParameters?.type ||
        event.queryStringParameters?.action ||
        ''
    );
  } catch (_) {
    return String(
      event.queryStringParameters?.event_type ||
      event.queryStringParameters?.eventType ||
      event.queryStringParameters?.type ||
      event.queryStringParameters?.action ||
      ''
    ).trim();
  }
}

async function handleTrackRoute(client, event, trackEvent) {
  const eventType = getTrackEventType(event);
  if (eventType.startsWith('ad_')) return trackAdEvent(client, event);
  return trackEvent(client, event);
}

async function trackAdEvent(client, event, overrides = {}) {
  const body = { ...parseBody(event), ...overrides };
  const adId = String(body.ad_id || body.adId || '').trim();
  const eventType = getPayloadEventType(body);

  if (!adId || !SUPPORTED_AD_EVENTS.has(eventType)) {
    return response(400, { success: false, error: 'Invalid or missing ad event' });
  }

  console.log('Tracking ad event:', eventType, adId);

  if (eventType === 'ad_start') {
    const result = await client.query(
      `UPDATE radio.ads
       SET views = COALESCE(views, 0) + 1,
           updated_at = now()
       WHERE id = $1
       RETURNING id, internal_title, views, clicks, skips`,
      [adId]
    );

    if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
    console.log('Updated ad views for:', adId);
    return response(200, { success: true, message: 'Ad event recorded.', ad: result.rows[0], event_type: eventType });
  }

  if (eventType === 'ad_click') {
    const result = await client.query(
      `UPDATE radio.ads
       SET clicks = COALESCE(clicks, 0) + 1,
           updated_at = now()
       WHERE id = $1
       RETURNING id, internal_title, views, clicks, skips`,
      [adId]
    );

    if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
    console.log('Updated ad clicks for:', adId);
    return response(200, { success: true, message: 'Ad event recorded.', ad: result.rows[0], event_type: eventType });
  }

  if (eventType === 'ad_skip') {
    const result = await client.query(
      `UPDATE radio.ads
       SET skips = COALESCE(skips, 0) + 1,
           updated_at = now()
       WHERE id = $1
       RETURNING id, internal_title, views, clicks, skips`,
      [adId]
    );

    if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
    console.log('Updated ad skips for:', adId);
    return response(200, {
      success: true,
      message: 'Ad event tracked',
      ad_id: adId,
      event_type: eventType,
      ad: result.rows[0]
    });
  }

  const result = await client.query(
    'SELECT id, internal_title, views, clicks, skips FROM radio.ads WHERE id = $1',
    [adId]
  );

  if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
  return response(200, { success: true, message: 'Ad event recorded.', ad: result.rows[0], event_type: eventType });
}

async function recordPublicAdEvent(event) {
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const eventType = getAdEventType(event);
  return trackAdEvent(client, event, { ad_id: adId, event_type: eventType });
}

async function handlePublicAdsRoute(event) {
  if (getMethod(event) === 'OPTIONS') return response(204, {});

  const method = getMethod(event);
  const publicRoute = getPublicAdsRouteMatch(event);
  const adId = getAdId(event);
  const isEventRoute = publicRoute.isEventRoute;

  if (method === 'GET' && !adId) return listPublicAds();
  if (method === 'POST' && adId && isEventRoute) return recordPublicAdEvent(event);

  return response(404, { success: false, error: 'Not found.' });
}

async function handleAdminAdsRoute(event, { requireAdmin }) {
  if (getMethod(event) === 'OPTIONS') return response(204, {});

  await requireAdmin(event);

  const method = getMethod(event);
  const adId = getAdId(event);

  if (method === 'GET' && !adId) return listAds();
  if (method === 'POST' && !adId) return createAd(event);
  if (method === 'PUT' && adId) return updateAd(event);
  if (method === 'DELETE' && adId) return deleteAd(event);

  return response(404, { success: false, error: 'Not found.' });
}


function getRouteSegments(event) {
  const path = getPath(event).split('?')[0].replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  const lambdaName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'stashbox-radio-api-dev';
  const serviceIndex = segments.lastIndexOf(lambdaName);
  if (serviceIndex >= 0) return segments.slice(serviceIndex + 1);
  const defaultIndex = segments.lastIndexOf('default');
  if (defaultIndex >= 0) return segments.slice(defaultIndex + 1);

  const routeRootIndex = segments.findIndex((segment) =>
    ['admin', 'radio', 'ad-settings', 'ads', 'songs', 'track', 'visuals', 'vec'].includes(segment)
  );
  if (routeRootIndex > 0) return segments.slice(routeRootIndex);

  return segments;
}

function routeStartsWith(segments, prefix) {
  return prefix.every((segment, index) => segments[index] === segment);
}

function normalizeRoute(route) {
  return String(route || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function matchesRoute(route, candidates) {
  const clean = normalizeRoute(route);
  return candidates.some((candidate) => clean === normalizeRoute(candidate));
}
function routeEndsWith(path, suffix) {
  const cleanPath = normalizeRoute(String(path || '').split('?')[0]);
  const cleanSuffix = normalizeRoute(suffix);
  return cleanPath === cleanSuffix || cleanPath.endsWith(`/${cleanSuffix}`);
}

function matchesPublicVecRecipeRoute(event, route) {
  return matchesRoute(route, ['radio/vec/recipe', '/radio/vec/recipe']) ||
    routeEndsWith(route, '/radio/vec/recipe') ||
    routeEndsWith(event.rawPath, '/radio/vec/recipe') ||
    routeEndsWith(event.path, '/radio/vec/recipe') ||
    routeEndsWith(event.routeKey, '/radio/vec/recipe') ||
    routeEndsWith(event.resource, '/radio/vec/recipe');
}

function matchesAdminVecRecipeRoute(event, route) {
  return matchesRoute(route, ['admin/vec/recipe', '/admin/vec/recipe']) ||
    routeEndsWith(route, '/admin/vec/recipe') ||
    routeEndsWith(event.rawPath, '/admin/vec/recipe') ||
    routeEndsWith(event.path, '/admin/vec/recipe') ||
    routeEndsWith(event.routeKey, '/admin/vec/recipe') ||
    routeEndsWith(event.resource, '/admin/vec/recipe');
}

function matchesPublicVecSongAssetsRoute(event, route) {
  return matchesRoute(route, ['radio/vec/song-assets', '/radio/vec/song-assets']) ||
    routeEndsWith(route, '/radio/vec/song-assets') ||
    routeEndsWith(event.rawPath, '/radio/vec/song-assets') ||
    routeEndsWith(event.path, '/radio/vec/song-assets') ||
    routeEndsWith(event.routeKey, '/radio/vec/song-assets') ||
    routeEndsWith(event.resource, '/radio/vec/song-assets') ||
    getRouteSegments(event).slice(0, 3).join('/') === 'radio/vec/song-assets';
}

function matchesAdminVecSongAssetsRoute(event, route) {
  return matchesRoute(route, ['admin/vec/song-assets', '/admin/vec/song-assets']) ||
    routeEndsWith(route, '/admin/vec/song-assets') ||
    routeEndsWith(event.rawPath, '/admin/vec/song-assets') ||
    routeEndsWith(event.path, '/admin/vec/song-assets') ||
    routeEndsWith(event.routeKey, '/admin/vec/song-assets') ||
    routeEndsWith(event.resource, '/admin/vec/song-assets') ||
    getRouteSegments(event).slice(0, 3).join('/') === 'admin/vec/song-assets';
}


function getQueryLimit(event, fallback = 100, max = 500) {
  const rawLimit = Number(event.queryStringParameters?.limit || fallback);
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return fallback;
  return Math.min(Math.floor(rawLimit), max);
}

function getAdminToken(event) {
  return event.headers?.['x-admin-token'] ||
    event.headers?.['X-Admin-Token'] ||
    event.headers?.['X-ADMIN-TOKEN'] ||
    '';
}

async function requireAdmin(event) {
  const expectedToken = process.env.ADMIN_TOKEN || process.env.RADIO_ADMIN_TOKEN || '';
  if (expectedToken && getAdminToken(event) !== expectedToken) {
    const error = new Error('Unauthorized. Check admin token.');
    error.statusCode = 401;
    throw error;
  }
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeVisualDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration)) : 8;
}

function getS3KeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch (error) {
    return '';
  }
}

function normalizeVisualAssets(value) {
  return (Array.isArray(value) ? value : [])
    .map((asset) => ({
      type: asset?.type === 'clip' || asset?.type === 'video' ? 'clip' : 'image',
      url: String(asset?.url || asset?.src || '').trim(),
      source: String(asset?.source || 'song').trim() || 'song',
      key: String(asset?.key || asset?.object_key || getS3KeyFromUrl(asset?.url || asset?.src || '')).trim()
    }))
    .filter((asset) => asset.url);
}

function normalizeStoredVisualAssets(value) {
  if (Array.isArray(value)) return normalizeVisualAssets(value);
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    try { return normalizeVisualAssets(JSON.parse(value)); } catch (error) { return []; }
  }
  if (typeof value === 'object') return normalizeVisualAssets(value);
  return [];
}

function normalizeStoredStringArray(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? normalizeStringArray(parsedValue) : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

function normalizeSongRow(song) {
  if (!song) {
    return song;
  }

  const shares = Math.max(numberValue(song.shares), numberValue(song.share_count), numberValue(song.total_shares));

  return {
    ...song,
    shares,
    share_count: shares,
    total_shares: shares,
    specific_product_urls: normalizeStoredStringArray(song.specific_product_urls),
    visual_assets: normalizeStoredVisualAssets(song.visual_assets),
    enhanced_visuals_enabled: song.enhanced_visuals_enabled === null || song.enhanced_visuals_enabled === undefined ? true : Boolean(song.enhanced_visuals_enabled),
    shuffle_visuals: song.shuffle_visuals === null || song.shuffle_visuals === undefined ? true : Boolean(song.shuffle_visuals),
    visual_still_duration_seconds: normalizeVisualDuration(song.visual_still_duration_seconds)
  };
}

function buildSongPayload(input, { partial = false } = {}) {
  const normalizedInput = { ...input };

  if (Object.prototype.hasOwnProperty.call(normalizedInput, 'visual_shuffle') && !Object.prototype.hasOwnProperty.call(normalizedInput, 'shuffle_visuals')) {
    normalizedInput.shuffle_visuals = normalizedInput.visual_shuffle;
  }

  if (Object.prototype.hasOwnProperty.call(normalizedInput, 'still_image_duration_seconds') && !Object.prototype.hasOwnProperty.call(normalizedInput, 'visual_still_duration_seconds')) {
    normalizedInput.visual_still_duration_seconds = normalizedInput.still_image_duration_seconds;
  }

  const payload = {};
  getSongAllowedFields().forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalizedInput, field)) {
      if (field === 'specific_product_urls') {
        const cleanSpecificProductUrls = normalizeStringArray(normalizedInput.specific_product_urls);
        payload.specific_product_urls = JSON.stringify(cleanSpecificProductUrls);
        return;
      }

      if (field === 'visual_assets') {
        payload.visual_assets = JSON.stringify(normalizeVisualAssets(normalizedInput.visual_assets));
        return;
      }

      if (field === 'visual_still_duration_seconds') {
        payload.visual_still_duration_seconds = normalizeVisualDuration(normalizedInput.visual_still_duration_seconds);
        return;
      }

      payload[field] = BOOLEAN_SONG_FIELDS.has(field) ? Boolean(normalizedInput[field]) : normalizedInput[field];
    }
  });

  if (!partial) {
    payload.public_visibility = payload.public_visibility || 'hidden';
  }

  return payload;
}

async function getTableColumnMeta(schemaName, tableName) {
  const result = await client.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schemaName, tableName]
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

async function getTableColumns(schemaName, tableName) {
  return new Set((await getTableColumnMeta(schemaName, tableName)).keys());
}

async function findFirstTable(candidates) {
  const result = await client.query(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE (table_schema, table_name) IN (${candidates.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')})`,
    candidates.flat()
  );

  return candidates.find(([schemaName, tableName]) =>
    result.rows.some((row) => row.table_schema === schemaName && row.table_name === tableName)
  ) || candidates[0];
}


const STATS_EVENT_TABLE_CANDIDATES = [
  ['radio', 'song_events'],
  ['radio', 'events'],
  ['radio', 'radio_events'],
  ['public', 'song_events'],
  ['public', 'song_play_events']
];

function hasAnyColumn(columns, names) {
  return names.some((name) => columns.has(name));
}

function firstExistingColumn(columns, names) {
  return names.find((name) => columns.has(name)) || '';
}

function numberLiteral(value = 0, type = 'int') {
  return `${Number(value) || 0}::${type}`;
}

function textLiteral(value = '') {
  return `'${String(value).replace(/'/g, "''")}'::text`;
}

function sqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
}

function normalizeEventTypes(eventTypes) {
  return Array.isArray(eventTypes) ? eventTypes : [eventTypes];
}

function countEventTypeExpression(columns, eventTypes, alias) {
  const values = normalizeEventTypes(eventTypes);
  return columns.has('event_type')
    ? `COUNT(*) FILTER (WHERE event_type IN (${sqlStringList(values)}))::int AS ${alias}`
    : `${numberLiteral()} AS ${alias}`;
}

function countEventTypeExpressionForAlias(columns, tableAlias, eventTypes, alias) {
  const values = normalizeEventTypes(eventTypes);
  return columns.has('event_type')
    ? `COUNT(*) FILTER (WHERE ${tableAlias}.event_type IN (${sqlStringList(values)}))::int AS ${alias}`
    : `${numberLiteral()} AS ${alias}`;
}

function numericAggregateExpression(columns, columnName, aggregate, alias, type = 'float') {
  return columns.has(columnName)
    ? `COALESCE(${aggregate}(${columnName}), 0)::${type} AS ${alias}`
    : `${numberLiteral(0, type)} AS ${alias}`;
}

function createdAtCountExpression(columns, intervalSql, alias) {
  return columns.has('created_at')
    ? `COUNT(*) FILTER (WHERE created_at >= ${intervalSql})::int AS ${alias}`
    : `${numberLiteral()} AS ${alias}`;
}

function lastSeenExpression(columns, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return columns.has('created_at') ? `MAX(${prefix}created_at) AS last_seen_at` : 'NULL::timestamptz AS last_seen_at';
}

function optionalColumnExpression(columns, columnName, alias = columnName, tableAlias = '', fallback = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return columns.has(columnName) ? `${prefix}${columnName} AS ${alias}` : `${textLiteral(fallback)} AS ${alias}`;
}


function getRowIdentityValues(row) {
  return [row?.song_key, row?.song_id, row?.id, row?.key, row?.slug, row?.track_id]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function loadSongEventCounts() {
  const statsTable = await getStatsEventTable();
  if (!statsTable || !hasAnyColumn(statsTable.columns, ['song_key', 'song_id'])) return new Map();

  const { columns, qualifiedName } = statsTable;
  const songKeyExpr = columns.has('song_key') ? 'song_key::text' : textLiteral('');
  const songIdExpr = columns.has('song_id') ? 'song_id::text' : songKeyExpr;
  const result = await client.query(`
    SELECT
      ${songKeyExpr} AS song_key,
      ${songIdExpr} AS song_id,
      ${countEventTypeExpression(columns, ['play_start', 'play'], 'total_plays')},
      ${countEventTypeExpression(columns, 'like', 'likes')},
      ${countEventTypeExpression(columns, 'share', 'shares')},
      ${countEventTypeExpression(columns, 'share_link_visit', 'share_link_visits')},
      ${countEventTypeExpression(columns, ['video_click', 'video_open'], 'video_clicks')},
      ${countEventTypeExpression(columns, 'product_click', 'product_clicks')}
    FROM ${qualifiedName}
    GROUP BY 1, 2
  `);

  const countsByIdentity = new Map();
  result.rows.forEach((row) => {
    getRowIdentityValues(row).forEach((identity) => {
      countsByIdentity.set(identity, row);
    });
  });
  return countsByIdentity;
}

function mergeSongEventCounts(song, countsByIdentity) {
  const stats = getRowIdentityValues(song).map((identity) => countsByIdentity.get(identity)).find(Boolean);
  if (!stats) return song;

  return {
    ...song,
    total_plays: Math.max(numberValue(song.total_plays ?? song.plays ?? song.play_count), numberValue(stats.total_plays)),
    likes: numberValue(song.likes),
    like_count: numberValue(song.likes),
    total_likes: numberValue(song.likes),
    shares: Math.max(numberValue(song.shares ?? song.share_count ?? song.total_shares), numberValue(stats.shares)),
    share_link_visits: Math.max(numberValue(song.share_link_visits ?? song.share_visits), numberValue(stats.share_link_visits)),
    video_clicks: Math.max(numberValue(song.video_clicks ?? song.video_click_count ?? song.total_video_clicks), numberValue(stats.video_clicks)),
    product_clicks: Math.max(numberValue(song.product_clicks ?? song.product_click_count ?? song.total_product_clicks), numberValue(stats.product_clicks))
  };
}

function emptyStatsSummaryResponse() {
  return response(200, {
    success: true,
    summary: {
      total_events: 0,
      events_last_24h: 0,
      events_last_7d: 0,
      play_starts: 0,
      full_plays: 0,
      partial_plays: 0,
      skips: 0,
      likes: 0,
      shares: 0,
      video_clicks: 0,
      product_clicks: 0,
      total_listening_seconds: 0,
      total_seconds_played: 0,
      average_seconds_played: 0,
      average_completion_percent: 0
    },
    today: {
      events_today: 0,
      plays_today: 0,
      likes_today: 0,
      shares_today: 0,
      product_clicks_today: 0,
      video_clicks_today: 0
    },
    devices: [],
    event_types: [],
    generated_at: new Date().toISOString()
  });
}

async function findExistingTable(candidates) {
  const result = await client.query(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE (table_schema, table_name) IN (${candidates.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')})`,
    candidates.flat()
  );

  return candidates.find(([schemaName, tableName]) =>
    result.rows.some((row) => row.table_schema === schemaName && row.table_name === tableName)
  ) || null;
}

async function getStatsEventTable() {
  const table = await findExistingTable(STATS_EVENT_TABLE_CANDIDATES);
  if (!table) return null;
  const [schemaName, tableName] = table;
  const columns = await getTableColumns(schemaName, tableName);
  return { schemaName, tableName, columns, qualifiedName: `${schemaName}.${tableName}` };
}

async function withStatsRouteLogging(route, method, handler) {
  try {
    return await handler();
  } catch (error) {
    console.error('[Stashbox Radio Admin] stats route failed', {
      route,
      method,
      errorMessage: error.message,
      errorStack: error.stack
    });
    throw error;
  }
}

async function getSongs({ includeArchived = false } = {}) {
  await ensureSongsLikesColumn();
  await ensureSongsShareColumn();
  const columns = await getTableColumns('radio', 'songs');
  const hasVisibility = columns.has('public_visibility');
  const hasSortOrder = columns.has('sort_order');
  const where = includeArchived || !hasVisibility ? '' : "WHERE COALESCE(public_visibility, 'visible') = 'visible'";
  const orderBy = hasSortOrder
    ? 'ORDER BY sort_order ASC, song_name ASC NULLS LAST, display_title ASC NULLS LAST'
    : 'ORDER BY created_at DESC NULLS LAST, song_name ASC NULLS LAST, display_title ASC NULLS LAST';
  const artworkSelect = columns.has('resolved_artwork_url')
    ? '*, COALESCE(s.likes, 0)::int AS likes, COALESCE(s.shares, 0)::int AS shares, COALESCE(resolved_artwork_url, song_artwork_url) AS resolved_artwork_url'
    : '*, COALESCE(s.likes, 0)::int AS likes, COALESCE(s.shares, 0)::int AS shares, song_artwork_url AS resolved_artwork_url';
  const [result, countsByIdentity] = await Promise.all([
    client.query(`SELECT ${artworkSelect} FROM radio.songs s ${where} ${orderBy}`),
    loadSongEventCounts()
  ]);
  const songs = result.rows
    .map((row) => mergeSongEventCounts(row, countsByIdentity))
    .map(normalizeSongRow);
  return response(200, { success: true, count: result.rowCount, songs });
}

async function getAdminSongs() {
  return getSongs({ includeArchived: true });
}

async function getAdminSong(event) {
  const columns = await getTableColumns('radio', 'songs');
  const params = event.queryStringParameters || {};
  const pathIdentifier = getRouteSegments(event)[2] || '';
  const requestedId = String(params.id || params.song_id || params.songId || '').trim();
  const requestedSongKey = String(params.song_key || params.songKey || '').trim();
  const requestedSlug = String(params.slug || '').trim();
  const fallbackIdentifier = String(pathIdentifier || '').trim();
  const id = requestedId || fallbackIdentifier;
  const songKey = requestedSongKey || fallbackIdentifier;
  const slug = requestedSlug || fallbackIdentifier;
  const conditions = [];
  const values = [];
  const orderClauses = [];

  if (id && columns.has('id')) {
    values.push(id);
    conditions.push(`id::text = $${values.length}`);
    orderClauses.push(`WHEN id::text = $${values.length} THEN 1`);
  }

  if (songKey && columns.has('song_key')) {
    values.push(songKey);
    conditions.push(`song_key = $${values.length}`);
    orderClauses.push(`WHEN song_key = $${values.length} THEN 2`);
  }

  if (slug && columns.has('slug')) {
    values.push(slug);
    conditions.push(`slug = $${values.length}`);
    orderClauses.push(`WHEN slug = $${values.length} THEN 3`);
  }

  if (!conditions.length) {
    return response(400, { success: false, error: 'id or song_key is required.' });
  }

  const artworkSelect = columns.has('resolved_artwork_url')
    ? '*, COALESCE(resolved_artwork_url, song_artwork_url) AS resolved_artwork_url'
    : '*, song_artwork_url AS resolved_artwork_url';
  const orderBy = orderClauses.length ? `ORDER BY CASE ${orderClauses.join(' ')} ELSE 4 END` : '';
  const result = await client.query(
    `SELECT ${artworkSelect}
     FROM radio.songs
     WHERE ${conditions.map((condition) => `(${condition})`).join(' OR ')}
     ${orderBy}
     LIMIT 1`,
    values
  );

  if (!result.rowCount) {
    return response(404, {
      success: false,
      error: 'Song not found.',
      id: requestedId || undefined,
      song_key: requestedSongKey || fallbackIdentifier || undefined,
      slug: requestedSlug || undefined
    });
  }

  return response(200, { success: true, song: normalizeSongRow(result.rows[0]) });
}

async function createAdminSong(event) {
  const input = parseBody(event);
  let payload = {};
  let fields = [];
  let values = [];
  let columnMeta = new Map();

  try {
    columnMeta = await getTableColumnMeta('radio', 'songs');
    ({ payload, fields, values } = await buildSafeSongInsert(input, columnMeta));

    if (!fields.includes('song_key') || !String(payload.song_key || '').trim()) {
      return response(400, { success: false, error: 'song_key is required.' });
    }

    if (!fields.length) {
      return response(400, { success: false, error: 'No editable fields provided.' });
    }

    const placeholders = fields.map((field, index) => valuePlaceholder(field, columnMeta.get(field), index));
    const result = await client.query(
      `INSERT INTO radio.songs (${fields.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values
    );
    return response(200, { success: true, message: 'Song created', song: normalizeSongRow(result.rows[0]) });
  } catch (error) {
    logAdminSongCreateFailure({ event, input, payload, fields, columns: columnMeta, error });

    if (error?.statusCode === 400) {
      return response(400, {
        success: false,
        error: 'Invalid song lookup value.',
        detail: error.detail || error.message,
        code: error.code,
        field: error.field
      });
    }

    if (isDevRequest(event)) {
      const safeError = safeDatabaseError(error);
      return response(500, {
        success: false,
        error: 'Song record save failed.',
        detail: safeError.detail || safeError.message,
        code: safeError.code
      });
    }

    return response(500, { success: false, error: 'Internal Server Error' });
  }
}

function validateVecSongKey(value) {
  const songKey = String(value || '').trim();
  if (!songKey) return { error: 'song_key is required.' };
  if (songKey.length > 200) return { error: 'song_key is too long.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(songKey)) return { error: 'song_key contains unsupported characters.' };
  return { songKey };
}

function validateVecRecipe(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'recipe must be a JSON object.' };
  return { recipe: value };
}

async function ensureSongVisualRecipesTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS radio.song_visual_recipes (
      song_key TEXT PRIMARY KEY,
      recipe JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function loadSongVisualRecipe(event) {
  const validation = validateVecSongKey(event.queryStringParameters?.song_key || event.queryStringParameters?.songKey);
  if (validation.error) return response(400, { success: false, error: validation.error });
  try {
    const result = await client.query(
      'SELECT song_key, recipe, created_at, updated_at FROM radio.song_visual_recipes WHERE song_key = $1 LIMIT 1',
      [validation.songKey]
    );
    if (!result.rowCount) return response(200, { success: true, found: false, song_key: validation.songKey, recipe: null });
    return response(200, { success: true, found: true, ...result.rows[0] });
  } catch (error) {
    if (error?.code === '42P01') return response(200, { success: true, found: false, song_key: validation.songKey, recipe: null });
    throw error;
  }
}

async function saveSongVisualRecipe(event) {
  const body = parseBody(event);
  const keyValidation = validateVecSongKey(body.song_key || body.songKey);
  if (keyValidation.error) return response(400, { success: false, error: keyValidation.error });
  const recipeValidation = validateVecRecipe(body.recipe);
  if (recipeValidation.error) return response(400, { success: false, error: recipeValidation.error });
  await ensureSongVisualRecipesTable();
  const recipe = { ...recipeValidation.recipe, song_key: keyValidation.songKey, updated_at: new Date().toISOString() };
  if (!recipe.version) recipe.version = 1;
  const result = await client.query(
    `INSERT INTO radio.song_visual_recipes (song_key, recipe)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (song_key) DO UPDATE SET recipe = EXCLUDED.recipe, updated_at = now()
     RETURNING song_key, recipe, created_at, updated_at`,
    [keyValidation.songKey, JSON.stringify(recipe)]
  );
  return response(200, { success: true, ...result.rows[0] });
}

async function handleAdminVecRecipeRoute(event) {
  await requireAdmin(event);
  const method = getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return response(204, {});
  if (method === 'GET') return loadSongVisualRecipe(event);
  if (method === 'PUT') return saveSongVisualRecipe(event);
  return response(404, { success: false, error: 'Not found.' });
}

async function handlePublicVecRecipeRoute(event) {
  const method = getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return response(204, {});
  if (method === 'GET') return loadSongVisualRecipe(event);
  return response(404, { success: false, error: 'Not found.' });
}

async function ensureSongVisualAssetsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS radio.song_visual_assets (
      id TEXT PRIMARY KEY,
      song_key TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'image',
      file_name TEXT,
      s3_key TEXT,
      public_url TEXT NOT NULL,
      thumbnail_url TEXT,
      content_type TEXT,
      size_bytes BIGINT,
      width INTEGER,
      height INTEGER,
      ratio_label TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      caption TEXT,
      alt_text TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT song_visual_assets_type_check CHECK (asset_type IN ('image', 'clip')),
      CONSTRAINT song_visual_assets_status_check CHECK (status IN ('active', 'hidden'))
    )
  `);
  await client.query('CREATE INDEX IF NOT EXISTS song_visual_assets_song_key_idx ON radio.song_visual_assets(song_key)');
  await client.query('CREATE INDEX IF NOT EXISTS song_visual_assets_type_idx ON radio.song_visual_assets(asset_type)');
}

function normalizeSongVisualAsset(row) {
  const mediaType = row.asset_type === 'clip' ? 'clip' : 'image';
  return {
    id: row.id,
    song_key: row.song_key,
    type: mediaType,
    media_type: mediaType,
    asset_type: mediaType,
    file_name: row.file_name || '',
    filename: row.file_name || '',
    public_url: row.public_url || '',
    url: row.public_url || '',
    thumbnail_url: row.thumbnail_url || row.public_url || '',
    content_type: row.content_type || '',
    size_bytes: row.size_bytes,
    width: row.width,
    height: row.height,
    ratio_label: row.ratio_label || '',
    status: row.status || 'active',
    caption: row.caption || '',
    alt_text: row.alt_text || '',
    notes: row.notes || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

function getSongAssetId(event) {
  const segments = getRouteSegments(event);
  const assetsIndex = segments.lastIndexOf('song-assets');
  return event.pathParameters?.asset_id || event.pathParameters?.assetId || (assetsIndex >= 0 ? segments[assetsIndex + 1] || '' : '');
}

async function getSongVisualAssets(event, { ensureTable = false } = {}) {
  const validation = validateVecSongKey(event.queryStringParameters?.song_key || event.queryStringParameters?.songKey);
  if (validation.error) return response(400, { success: false, error: validation.error });
  if (ensureTable) await ensureSongVisualAssetsTable();
  let assets = [];
  try {
    const result = await client.query(
      `SELECT *
       FROM radio.song_visual_assets
       WHERE song_key = $1 AND status <> 'hidden'
       ORDER BY created_at ASC, file_name ASC NULLS LAST`,
      [validation.songKey]
    );
    assets = result.rows.map(normalizeSongVisualAsset);
  } catch (error) {
    if (error?.code !== '42P01') throw error;
  }
  return response(200, {
    success: true,
    song_key: validation.songKey,
    images: assets.filter((asset) => asset.asset_type === 'image'),
    clips: assets.filter((asset) => asset.asset_type === 'clip'),
    assets
  });
}

async function createSongVisualAsset(event) {
  const body = parseBody(event);
  const validation = validateVecSongKey(body.song_key || body.songKey);
  if (validation.error) return response(400, { success: false, error: validation.error });
  const assetType = String(body.asset_type || body.assetType || body.type || '').toLowerCase() === 'clip' ? 'clip' : 'image';
  const publicUrl = String(body.public_url || body.publicUrl || body.url || '').trim();
  if (!publicUrl) return response(400, { success: false, error: 'public_url is required.' });
  const result = await client.query(
    `INSERT INTO radio.song_visual_assets (id, song_key, asset_type, file_name, s3_key, public_url, thumbnail_url, content_type, size_bytes, width, height, ratio_label, status, caption, alt_text, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [crypto.randomUUID(), validation.songKey, assetType, String(body.file_name || body.fileName || '').trim(), String(body.s3_key || body.s3Key || '').trim(), publicUrl, String(body.thumbnail_url || body.thumbnailUrl || publicUrl).trim(), String(body.content_type || body.contentType || '').trim(), Number(body.size_bytes || body.sizeBytes) || null, Number(body.width) || null, Number(body.height) || null, String(body.ratio_label || body.ratioLabel || '').trim(), 'active', String(body.caption || '').trim(), String(body.alt_text || body.altText || '').trim(), String(body.notes || '').trim()]
  );
  return response(201, { success: true, asset: normalizeSongVisualAsset(result.rows[0]) });
}

// VEC Song-Only Assets boundary: this DELETE soft-hides exactly one row in
// radio.song_visual_assets by asset id. It must not touch Visual Library folder
// tables, recipes, player data, or S3 objects.
async function deleteSongVisualAsset(event) {
  const assetId = getSongAssetId(event);
  if (!assetId) return response(400, { success: false, error: 'asset_id is required.' });
  await ensureSongVisualAssetsTable();
  const result = await client.query(`UPDATE radio.song_visual_assets SET status = 'hidden', updated_at = now() WHERE id = $1 RETURNING id`, [assetId]);
  if (!result.rowCount) return response(404, { success: false, error: 'Song visual asset not found.' });
  return response(200, { success: true, asset_id: assetId });
}

async function handleAdminVecSongAssetsRoute(event) {
  if (getMethod(event).toUpperCase() === 'OPTIONS') return response(204, {});
  await requireAdmin(event);
  const method = getMethod(event).toUpperCase();
  if (method === 'GET') return getSongVisualAssets(event, { ensureTable: true });
  if (method === 'POST') {
    await ensureSongVisualAssetsTable();
    return createSongVisualAsset(event);
  }
  if (method === 'DELETE') return deleteSongVisualAsset(event);
  return response(404, { success: false, error: 'Not found.' });
}

async function handlePublicVecSongAssetsRoute(event) {
  const method = getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return response(204, {});
  if (method === 'GET') return getSongVisualAssets(event);
  return response(404, { success: false, error: 'Not found.' });
}


function getVisualsFolderAssetsRouteMatch(event) {
  const segments = getRouteSegments(event);
  const foldersIndex = segments.lastIndexOf('folders');
  const folderId = event.pathParameters?.folder_id ||
    event.pathParameters?.folderId ||
    event.pathParameters?.id ||
    (foldersIndex >= 0 ? segments[foldersIndex + 1] || '' : '');
  const isAssetsRoute = foldersIndex >= 0 &&
    segments[foldersIndex - 1] === 'visuals' &&
    Boolean(folderId) &&
    segments[foldersIndex + 2] === 'assets' &&
    !segments[foldersIndex + 3];
  return { isAssetsRoute, folderId };
}

function matchesPublicVisualsFolderAssetsRoute(event, route) {
  const folderAssetPattern = /(?:^|\/)radio\/visuals\/folders\/[^/]+\/assets$/;
  const candidates = [
    route,
    event.rawPath,
    event.path,
    event.routeKey,
    event.resource
  ];
  return candidates.some((candidate) => folderAssetPattern.test(normalizeRoute(String(candidate || '').split('?')[0]))) ||
    getVisualsFolderAssetsRouteMatch(event).isAssetsRoute;
}

function normalizeVisualsFolderAsset(row) {
  const mediaType = row.asset_type === 'clip' ? 'clip' : 'image';
  return {
    id: row.id,
    folder_id: row.folder_id,
    folder_slug: row.folder_slug || '',
    type: mediaType,
    media_type: mediaType,
    asset_type: mediaType,
    url: row.public_url || '',
    public_url: row.public_url || '',
    thumbnail_url: row.thumbnail_url || row.public_url || '',
    filename: row.file_name || row.caption || '',
    file_name: row.file_name || '',
    title: row.caption || row.file_name || '',
    width: row.width,
    height: row.height,
    ratio_label: row.ratio_label || '',
    content_type: row.content_type || '',
    size_bytes: row.size_bytes,
    status: row.status || 'active',
    caption: row.caption || '',
    alt_text: row.alt_text || '',
    notes: row.notes || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

async function getVisualsFolderAssets(folderId) {
  let assets = [];
  try {
    const result = await client.query(
      `SELECT *
       FROM radio.visuals_folder_assets
       WHERE folder_id = $1 AND status <> 'hidden' AND public_url IS NOT NULL AND public_url <> ''
       ORDER BY created_at ASC, file_name ASC NULLS LAST`,
      [folderId]
    );
    assets = result.rows.map(normalizeVisualsFolderAsset);
  } catch (error) {
    if (error?.code !== '42P01') throw error;
  }
  return {
    success: true,
    folder_id: folderId,
    images: assets.filter((asset) => asset.asset_type === 'image'),
    clips: assets.filter((asset) => asset.asset_type === 'clip'),
    assets
  };
}

async function handlePublicVisualsFolderAssetsRoute(event) {
  const method = getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return response(204, {});
  const { isAssetsRoute, folderId } = getVisualsFolderAssetsRouteMatch(event);
  if (method === 'GET' && isAssetsRoute) return response(200, await getVisualsFolderAssets(folderId));
  return response(404, { success: false, error: 'Not found.' });
}

async function updateAdminSong(event) {
  const songKey = event.pathParameters?.song_key || event.pathParameters?.songKey || getRouteSegments(event)[2] || '';
  if (!songKey) return response(400, { success: false, error: 'song_key is required.' });

  const body = parseBody(event);
  const id = String(body.id || body.song_id || body.songId || event.pathParameters?.id || '').trim();
  const cleanSpecificProductUrls = Object.prototype.hasOwnProperty.call(body, 'specific_product_urls')
    ? normalizeStringArray(body.specific_product_urls)
    : undefined;
  let payload = {};
  let fields = [];
  let values = [];
  let columnMeta = new Map();

  try {
    columnMeta = await getTableColumnMeta('radio', 'songs');
    ({ payload, fields, values } = await buildSafeSongUpdate(body, columnMeta));
    if (!fields.length) return response(400, { success: false, error: 'No editable fields provided.' });

    values.push(songKey);
    const updatedAt = columnMeta.has('updated_at') ? ', updated_at = now()' : '';
    const result = await client.query(
      `UPDATE radio.songs
       SET ${fields.map((field, index) => field === 'specific_product_urls' || field === 'visual_assets' ? `${field} = $${index + 1}::jsonb` : `${field} = $${index + 1}`).join(', ')}${updatedAt}
       WHERE song_key = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rowCount) return response(404, { success: false, error: 'Song not found.', song_key: songKey });
    return response(200, { success: true, message: 'Song updated', song: normalizeSongRow(result.rows[0]) });
  } catch (error) {
    console.error('[Stashbox Radio Admin] song update failed', {
      id,
      song_key: songKey,
      specific_product_urls: cleanSpecificProductUrls,
      errorMessage: error.message,
      errorStack: error.stack
    });

    if (error?.statusCode === 400) {
      return response(400, {
        success: false,
        error: error.message || 'Invalid song lookup value.',
        detail: error.detail || error.message,
        code: error.code || undefined,
        field: error.field
      });
    }

    throw error;
  }
}

async function trackSongEvent(client, event) {
  const body = parseBody(event);
  const eventType = getPayloadEventType(body);
  const normalizedSongKey = String(body.song_key || body.songKey || body.track_key || '').trim();
  const normalizedSongId = String(body.song_id || body.songId || body.id || '').trim();
  const songKey = normalizedSongKey || null;
  const songId = normalizedSongId || null;
  const songIdentity = songKey || songId;

  if (!songIdentity || !SONG_EVENT_TYPES.has(eventType)) {
    return response(400, { success: false, error: 'Invalid or missing song event' });
  }

  const eventTable = await findExistingTable([
    ['radio', 'radio_events'],
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);

  if (!eventTable) {
    console.error('[Stashbox Radio API] No song event table found for track request', {
      songKey,
      songId,
      eventType
    });
    return response(500, {
      success: false,
      error: 'No song event table found.'
    });
  }

  const [schemaName, tableName] = eventTable;
  const columns = await getTableColumns(schemaName, tableName);
  const payload = {
    song_key: songKey || songIdentity,
    song_id: songId || songIdentity,
    event_type: eventType,
    session_id: body.session_id || body.sessionId || '',
    device_type: body.device_type || body.deviceType || '',
    referrer: body.referrer || '',
    seconds_played: body.seconds_played ?? body.secondsPlayed ?? null,
    completion_percent: body.completion_percent ?? body.completionPercent ?? null,
    product_url: body.product_url || body.productUrl || '',
    share_url: body.share_url || body.shareUrl || '',
    display_title: body.display_title || body.displayTitle || '',
    song_name: body.song_name || body.songName || '',
    artist: body.artist || '',
    page: body.page || 'production',
    source: body.source || 'public_player',
    source_page: body.source_page || body.sourcePage || '/stashbox/radio/'
  };
  const fields = Object.keys(payload).filter((field) => columns.has(field) && payload[field] !== null && payload[field] !== '');

  if (!fields.length) {
    console.error('[Stashbox Radio API] Track event had no insertable fields', {
      schemaName,
      tableName,
      knownColumns: Array.from(columns),
      payload
    });
    return response(500, {
      success: false,
      error: 'Track event table has no matching insert columns.'
    });
  }

  if (fields.length) {
    await client.query(
      `INSERT INTO ${schemaName}.${tableName} (${fields.join(', ')})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})`,
      fields.map((field) => payload[field])
    );
  }

  if (eventType === 'like') {
    console.log('[Stashbox Radio API] like event received', {
      songKey,
      songId,
      bodySongKey: body.song_key,
      bodySongId: body.song_id,
      event_type: body.event_type
    });

    await ensureSongsLikesColumn(client);
    const result = await client.query(
      `UPDATE radio.songs
       SET likes = COALESCE(likes, 0) + 1,
           updated_at = now()
       WHERE song_key = $1
          OR id::text = $2
       RETURNING id, song_key, display_title, likes`,
      [songKey, songId]
    );

    console.log('[Stashbox Radio API] like update result', {
      rowCount: result.rowCount,
      rows: result.rows
    });

    if (!result.rowCount) {
      console.warn('[Stashbox Radio API] like did not match song', {
        songKey,
        songId
      });
      return response(404, {
        success: false,
        error: 'Like did not match a song',
        song_key: songKey,
        song_id: songId
      });
    }

    const updated = result.rows[0];
    return response(200, {
      success: true,
      event_type: 'like',
      id: updated.id,
      song_key: updated.song_key,
      display_title: updated.display_title,
      likes: Number(updated.likes || 0)
    });
  }


  if (eventType === 'share') {
    console.log('[Stashbox Radio API] share event received', {
      songKey,
      songId,
      bodySongKey: body.song_key,
      bodySongId: body.song_id,
      event_type: body.event_type
    });

    await ensureSongsShareColumn(client);
    const result = await client.query(
      `UPDATE radio.songs
       SET shares = COALESCE(shares, 0) + 1,
           updated_at = now()
       WHERE song_key = $1
          OR id::text = $2
       RETURNING id, song_key, display_title, shares`,
      [songKey, songId]
    );

    console.log('[Stashbox Radio API] share update result', {
      rowCount: result.rowCount,
      rows: result.rows
    });

    if (!result.rowCount) {
      console.warn('[Stashbox Radio API] share did not match song', {
        songKey,
        songId
      });
      return response(404, {
        success: false,
        error: 'Share did not match a song',
        song_key: songKey,
        song_id: songId
      });
    }

    const updated = result.rows[0];
    const shares = Number(updated.shares || 0);
    return response(200, {
      success: true,
      event_type: 'share',
      id: updated.id,
      song_key: updated.song_key,
      display_title: updated.display_title,
      shares,
      share_count: shares,
      total_shares: shares
    });
  }

  return response(200, { success: true, message: 'Song event recorded.', event_type: eventType, song_key: songKey || songIdentity, song_id: songId || songIdentity });
}

async function listEvents(event) {
  const limit = getQueryLimit(event, 100, 500);
  const statsTable = await getStatsEventTable();

  if (!statsTable) {
    return response(200, { success: true, count: 0, limit, events: [] });
  }

  const { columns, qualifiedName } = statsTable;
  const orderBy = columns.has('created_at') ? 'ORDER BY created_at DESC NULLS LAST' : '';
  const result = await client.query(`SELECT * FROM ${qualifiedName} ${orderBy} LIMIT $1`, [limit]);
  return response(200, { success: true, count: result.rowCount, limit, events: result.rows });
}

async function statsSummary() {
  const statsTable = await getStatsEventTable();

  if (!statsTable) {
    return emptyStatsSummaryResponse();
  }

  const { columns, qualifiedName } = statsTable;
  const secondsColumn = firstExistingColumn(columns, ['seconds_played', 'duration_seconds']);
  const completionColumn = firstExistingColumn(columns, ['completion_percent']);
  const deviceColumn = firstExistingColumn(columns, ['device_type', 'device', 'browser', 'platform']);

  const [summary, today, devices, eventTypes] = await Promise.all([
    client.query(`
      SELECT
        COUNT(*)::int AS total_events,
        ${createdAtCountExpression(columns, "now() - interval '24 hours'", 'events_last_24h')},
        ${createdAtCountExpression(columns, "now() - interval '7 days'", 'events_last_7d')},
        ${countEventTypeExpression(columns, ['play_start', 'play'], 'play_starts')},
        ${countEventTypeExpression(columns, ['play_full', 'complete'], 'full_plays')},
        ${countEventTypeExpression(columns, 'play_partial', 'partial_plays')},
        ${countEventTypeExpression(columns, ['skip', 'next_click', 'random_click'], 'skips')},
        ${countEventTypeExpression(columns, 'like', 'likes')},
        ${countEventTypeExpression(columns, 'share', 'shares')},
        ${countEventTypeExpression(columns, ['video_click', 'video_open'], 'video_clicks')},
        ${countEventTypeExpression(columns, 'product_click', 'product_clicks')},
        ${secondsColumn ? `COALESCE(SUM(${secondsColumn}), 0)::int` : numberLiteral()} AS total_listening_seconds,
        ${secondsColumn ? `COALESCE(SUM(${secondsColumn}), 0)::int` : numberLiteral()} AS total_seconds_played,
        ${secondsColumn ? `COALESCE(AVG(${secondsColumn}), 0)::float` : numberLiteral(0, 'float')} AS average_seconds_played,
        ${completionColumn ? `COALESCE(AVG(${completionColumn}), 0)::float` : numberLiteral(0, 'float')} AS average_completion_percent
      FROM ${qualifiedName}`),
    client.query(`
      SELECT
        ${createdAtCountExpression(columns, 'CURRENT_DATE', 'events_today')},
        ${columns.has('event_type') && columns.has('created_at') ? "COUNT(*) FILTER (WHERE event_type IN ('play_start', 'play') AND created_at >= CURRENT_DATE)::int" : numberLiteral()} AS plays_today,
        ${columns.has('event_type') && columns.has('created_at') ? "COUNT(*) FILTER (WHERE event_type = 'like' AND created_at >= CURRENT_DATE)::int" : numberLiteral()} AS likes_today,
        ${columns.has('event_type') && columns.has('created_at') ? "COUNT(*) FILTER (WHERE event_type = 'share' AND created_at >= CURRENT_DATE)::int" : numberLiteral()} AS shares_today,
        ${columns.has('event_type') && columns.has('created_at') ? "COUNT(*) FILTER (WHERE event_type IN ('product_click') AND created_at >= CURRENT_DATE)::int" : numberLiteral()} AS product_clicks_today,
        ${columns.has('event_type') && columns.has('created_at') ? "COUNT(*) FILTER (WHERE event_type IN ('video_click', 'video_open') AND created_at >= CURRENT_DATE)::int" : numberLiteral()} AS video_clicks_today
      FROM ${qualifiedName}`),
    deviceColumn
      ? client.query(`SELECT COALESCE(NULLIF(${deviceColumn}::text, ''), 'unknown') AS device_type, COUNT(*)::int AS event_count FROM ${qualifiedName} GROUP BY 1 ORDER BY event_count DESC LIMIT 10`)
      : Promise.resolve({ rows: [] }),
    columns.has('event_type')
      ? client.query(`SELECT event_type, COUNT(*)::int AS event_count FROM ${qualifiedName} GROUP BY event_type ORDER BY event_count DESC`)
      : Promise.resolve({ rows: [] })
  ]);

  return response(200, {
    success: true,
    summary: summary.rows[0] || {},
    today: today.rows[0] || {},
    devices: devices.rows,
    event_types: eventTypes.rows,
    generated_at: new Date().toISOString()
  });
}

async function songStats(event) {
  const limit = getQueryLimit(event, 100, 500);
  const statsTable = await getStatsEventTable();

  if (!statsTable || !hasAnyColumn(statsTable.columns, ['song_key', 'song_id'])) {
    return response(200, { success: true, count: 0, limit, songs: [], generated_at: new Date().toISOString() });
  }

  const { columns, qualifiedName } = statsTable;
  const songsTable = await findExistingTable([['radio', 'songs']]);
  const songColumns = songsTable ? await getTableColumns('radio', 'songs') : new Set();
  const eventSongKeyExpr = columns.has('song_key') ? 'e.song_key::text' : columns.has('song_id') ? 'e.song_id::text' : textLiteral('');
  const eventSongIdExpr = columns.has('song_id') ? 'e.song_id::text' : eventSongKeyExpr;
  const canJoinSongs = songsTable && ((columns.has('song_key') && songColumns.has('song_key')) || (columns.has('song_id') && songColumns.has('id')));
  const joinCondition = columns.has('song_key') && songColumns.has('song_key')
    ? 's.song_key::text = e.song_key::text'
    : 's.id::text = e.song_id::text';
  const fromClause = canJoinSongs ? `${qualifiedName} e LEFT JOIN radio.songs s ON ${joinCondition}` : `${qualifiedName} e`;
  const displayTitleExpr = canJoinSongs && songColumns.has('display_title') ? 's.display_title' : 'NULL::text';
  const songNameExpr = canJoinSongs && songColumns.has('song_name') ? 's.song_name' : 'NULL::text';
  const artistExpr = canJoinSongs && songColumns.has('artist') ? 's.artist' : 'NULL::text';
  const secondsColumn = firstExistingColumn(columns, ['seconds_played', 'duration_seconds']);
  const completionColumn = firstExistingColumn(columns, ['completion_percent']);

  const result = await client.query(`
    SELECT
      ${eventSongIdExpr} AS song_id,
      ${eventSongKeyExpr} AS song_key,
      COALESCE(${displayTitleExpr}, ${songNameExpr}, NULLIF(${eventSongKeyExpr}, ''), 'Unknown song') AS display_title,
      COALESCE(${songNameExpr}, NULLIF(${eventSongKeyExpr}, ''), 'Unknown song') AS song_name,
      COALESCE(${artistExpr}, '') AS artist,
      COUNT(*) FILTER (WHERE ${columns.has('event_type') ? "e.event_type IN ('play_start', 'play')" : 'true'})::int AS plays,
      ${countEventTypeExpressionForAlias(columns, 'e', ['play_start', 'play'], 'play_starts')},
      ${countEventTypeExpressionForAlias(columns, 'e', ['play_full', 'complete'], 'full_plays')},
      ${countEventTypeExpressionForAlias(columns, 'e', 'play_partial', 'partial_plays')},
      ${countEventTypeExpressionForAlias(columns, 'e', ['skip', 'next_click', 'random_click'], 'skips')},
      ${countEventTypeExpressionForAlias(columns, 'e', 'like', 'likes')},
      ${countEventTypeExpressionForAlias(columns, 'e', 'share', 'shares')},
      ${countEventTypeExpressionForAlias(columns, 'e', ['video_click', 'video_open'], 'video_clicks')},
      ${countEventTypeExpressionForAlias(columns, 'e', 'product_click', 'product_clicks')},
      ${secondsColumn ? `COALESCE(SUM(e.${secondsColumn}), 0)::int` : numberLiteral()} AS total_seconds,
      ${secondsColumn ? `COALESCE(SUM(e.${secondsColumn}), 0)::int` : numberLiteral()} AS total_seconds_played,
      ${secondsColumn ? `COALESCE(AVG(e.${secondsColumn}), 0)::float` : numberLiteral(0, 'float')} AS average_seconds,
      ${secondsColumn ? `COALESCE(AVG(e.${secondsColumn}), 0)::float` : numberLiteral(0, 'float')} AS average_seconds_played,
      ${completionColumn ? `COALESCE(AVG(e.${completionColumn}), 0)::float` : numberLiteral(0, 'float')} AS completion_percent,
      ${completionColumn ? `COALESCE(AVG(e.${completionColumn}), 0)::float` : numberLiteral(0, 'float')} AS average_completion_percent,
      ${lastSeenExpression(columns, 'e')}
    FROM ${fromClause}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY plays DESC, last_seen_at DESC NULLS LAST
    LIMIT $1`, [limit]);

  return response(200, { success: true, count: result.rowCount, limit, songs: result.rows, generated_at: new Date().toISOString() });
}

async function productStats(event) {
  const limit = getQueryLimit(event, 25, 200);
  const statsTable = await getStatsEventTable();

  if (!statsTable) {
    return response(200, { success: true, summary: { total_product_clicks: 0, unique_products_clicked: 0, product_clicks_last_24h: 0, product_clicks_last_7d: 0 }, products: [], recent_clicks: [], generated_at: new Date().toISOString() });
  }

  const { columns, qualifiedName } = statsTable;
  const productColumn = firstExistingColumn(columns, ['product_url', 'product_id']);

  if (!productColumn && !columns.has('event_type')) {
    return response(200, { success: true, summary: { total_product_clicks: 0, unique_products_clicked: 0, product_clicks_last_24h: 0, product_clicks_last_7d: 0 }, products: [], recent_clicks: [], generated_at: new Date().toISOString() });
  }

  const productExpr = productColumn ? productColumn : textLiteral('unknown product');
  const productFilter = columns.has('event_type')
    ? `(event_type IN ('product_click')${productColumn ? ` OR NULLIF(${productColumn}::text, '') IS NOT NULL` : ''})`
    : `NULLIF(${productColumn}::text, '') IS NOT NULL`;
  const createdAtSelect = columns.has('created_at') ? 'created_at' : 'NULL::timestamptz AS created_at';

  const [summaryResult, productsResult, recentResult] = await Promise.all([
    client.query(`
      SELECT
        COUNT(*)::int AS total_product_clicks,
        COUNT(DISTINCT NULLIF(${productExpr}::text, ''))::int AS unique_products_clicked,
        ${createdAtCountExpression(columns, "now() - interval '24 hours'", 'product_clicks_last_24h')},
        ${createdAtCountExpression(columns, "now() - interval '7 days'", 'product_clicks_last_7d')}
      FROM ${qualifiedName}
      WHERE ${productFilter}`),
    client.query(`
      SELECT
        ${productExpr} AS product_url,
        COUNT(*)::int AS click_count,
        COUNT(*)::int AS product_clicks,
        ${columns.has('session_id') ? 'COUNT(DISTINCT session_id)::int' : numberLiteral()} AS unique_sessions,
        ${columns.has('created_at') ? 'MAX(created_at)' : 'NULL::timestamptz'} AS last_clicked_at,
        ARRAY[]::text[] AS song_titles
      FROM ${qualifiedName}
      WHERE ${productFilter}
      GROUP BY 1
      ORDER BY click_count DESC, last_clicked_at DESC NULLS LAST
      LIMIT $1`, [limit]),
    client.query(`
      SELECT
        ${createdAtSelect},
        ${optionalColumnExpression(columns, 'song_key')},
        ${optionalColumnExpression(columns, 'song_id')},
        ${productExpr} AS product_url,
        ${optionalColumnExpression(columns, 'device_type')},
        ${optionalColumnExpression(columns, 'event_type')},
        ''::text AS song_title,
        ''::text AS artist
      FROM ${qualifiedName}
      WHERE ${productFilter}
      ${columns.has('created_at') ? 'ORDER BY created_at DESC NULLS LAST' : ''}
      LIMIT $1`, [limit])
  ]);

  return response(200, {
    success: true,
    summary: summaryResult.rows[0] || { total_product_clicks: 0, unique_products_clicked: 0, product_clicks_last_24h: 0, product_clicks_last_7d: 0 },
    products: productsResult.rows,
    recent_clicks: recentResult.rows,
    generated_at: new Date().toISOString()
  });
}

async function referrerStats(event) {
  const limit = getQueryLimit(event, 50, 200);
  const statsTable = await getStatsEventTable();

  if (!statsTable) {
    return response(200, { success: true, summary: { total_events: 0, events_with_referrer: 0, direct_or_unknown_events: 0, unique_referrers: 0, events_last_24h: 0, events_last_7d: 0 }, referrers: [], recent_events: [], generated_at: new Date().toISOString() });
  }

  const { columns, qualifiedName } = statsTable;
  const referrerColumn = firstExistingColumn(columns, ['referrer', 'source', 'source_page']);

  if (!referrerColumn) {
    return response(200, { success: true, summary: { total_events: 0, events_with_referrer: 0, direct_or_unknown_events: 0, unique_referrers: 0, events_last_24h: 0, events_last_7d: 0 }, referrers: [], recent_events: [], generated_at: new Date().toISOString() });
  }

  const [summaryResult, referrersResult, recentResult] = await Promise.all([
    client.query(`
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE NULLIF(${referrerColumn}::text, '') IS NOT NULL)::int AS events_with_referrer,
        COUNT(*) FILTER (WHERE NULLIF(${referrerColumn}::text, '') IS NULL)::int AS direct_or_unknown_events,
        COUNT(DISTINCT NULLIF(${referrerColumn}::text, ''))::int AS unique_referrers,
        ${createdAtCountExpression(columns, "now() - interval '24 hours'", 'events_last_24h')},
        ${createdAtCountExpression(columns, "now() - interval '7 days'", 'events_last_7d')}
      FROM ${qualifiedName}`),
    client.query(`
      SELECT
        COALESCE(NULLIF(${referrerColumn}::text, ''), 'direct / unknown') AS referrer,
        COUNT(*)::int AS event_count,
        ${countEventTypeExpression(columns, ['play_start', 'play'], 'play_starts')},
        ${countEventTypeExpression(columns, ['play_full', 'complete'], 'full_plays')},
        ${countEventTypeExpression(columns, 'play_partial', 'partial_plays')},
        ${countEventTypeExpression(columns, ['skip', 'next_click', 'random_click'], 'skips')},
        ${countEventTypeExpression(columns, 'like', 'likes')},
        ${countEventTypeExpression(columns, 'share', 'shares')},
        ${countEventTypeExpression(columns, ['video_click', 'video_open'], 'video_clicks')},
        ${countEventTypeExpression(columns, 'product_click', 'product_clicks')},
        ${columns.has('session_id') ? 'COUNT(DISTINCT session_id)::int' : numberLiteral()} AS unique_sessions,
        ${lastSeenExpression(columns)}
      FROM ${qualifiedName}
      GROUP BY 1
      ORDER BY event_count DESC
      LIMIT $1`, [limit]),
    client.query(`
      SELECT
        ${columns.has('created_at') ? 'created_at' : 'NULL::timestamptz AS created_at'},
        COALESCE(NULLIF(${referrerColumn}::text, ''), 'direct / unknown') AS referrer,
        ${optionalColumnExpression(columns, 'event_type')},
        ${optionalColumnExpression(columns, 'song_key')},
        ${optionalColumnExpression(columns, 'song_id')},
        ${optionalColumnExpression(columns, 'device_type')},
        ${optionalColumnExpression(columns, 'product_url')},
        ''::text AS song_title,
        ''::text AS artist
      FROM ${qualifiedName}
      ${columns.has('created_at') ? 'ORDER BY created_at DESC NULLS LAST' : ''}
      LIMIT $1`, [limit])
  ]);

  return response(200, { success: true, summary: summaryResult.rows[0] || {}, referrers: referrersResult.rows, recent_events: recentResult.rows, generated_at: new Date().toISOString() });
}

async function deviceStats(event) {
  const limit = getQueryLimit(event, 50, 200);
  const statsTable = await getStatsEventTable();

  if (!statsTable) {
    return response(200, { success: true, summary: { total_events: 0, desktop_events: 0, mobile_events: 0, other_or_unknown_events: 0, unique_device_types: 0, events_last_24h: 0, events_last_7d: 0 }, devices: [], recent_events: [], generated_at: new Date().toISOString() });
  }

  const { columns, qualifiedName } = statsTable;
  const deviceColumn = firstExistingColumn(columns, ['device_type', 'device', 'browser', 'platform']);

  if (!deviceColumn) {
    return response(200, { success: true, summary: { total_events: 0, desktop_events: 0, mobile_events: 0, other_or_unknown_events: 0, unique_device_types: 0, events_last_24h: 0, events_last_7d: 0 }, devices: [], recent_events: [], generated_at: new Date().toISOString() });
  }

  const [summaryResult, devicesResult, recentResult] = await Promise.all([
    client.query(`
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE lower(${deviceColumn}::text) LIKE '%desktop%')::int AS desktop_events,
        COUNT(*) FILTER (WHERE lower(${deviceColumn}::text) LIKE '%mobile%' OR lower(${deviceColumn}::text) LIKE '%phone%' OR lower(${deviceColumn}::text) LIKE '%android%' OR lower(${deviceColumn}::text) LIKE '%ios%')::int AS mobile_events,
        COUNT(*) FILTER (WHERE NULLIF(${deviceColumn}::text, '') IS NULL OR (lower(${deviceColumn}::text) NOT LIKE '%desktop%' AND lower(${deviceColumn}::text) NOT LIKE '%mobile%' AND lower(${deviceColumn}::text) NOT LIKE '%phone%' AND lower(${deviceColumn}::text) NOT LIKE '%android%' AND lower(${deviceColumn}::text) NOT LIKE '%ios%'))::int AS other_or_unknown_events,
        COUNT(DISTINCT NULLIF(${deviceColumn}::text, ''))::int AS unique_device_types,
        ${createdAtCountExpression(columns, "now() - interval '24 hours'", 'events_last_24h')},
        ${createdAtCountExpression(columns, "now() - interval '7 days'", 'events_last_7d')}
      FROM ${qualifiedName}`),
    client.query(`
      SELECT
        COALESCE(NULLIF(${deviceColumn}::text, ''), 'unknown') AS device_type,
        COUNT(*)::int AS event_count,
        ${countEventTypeExpression(columns, ['play_start', 'play'], 'play_starts')},
        ${countEventTypeExpression(columns, ['play_full', 'complete'], 'full_plays')},
        ${countEventTypeExpression(columns, 'play_partial', 'partial_plays')},
        ${countEventTypeExpression(columns, ['skip', 'next_click', 'random_click'], 'skips')},
        ${countEventTypeExpression(columns, 'like', 'likes')},
        ${countEventTypeExpression(columns, 'share', 'shares')},
        ${countEventTypeExpression(columns, ['video_click', 'video_open'], 'video_clicks')},
        ${countEventTypeExpression(columns, 'product_click', 'product_clicks')},
        ${columns.has('session_id') ? 'COUNT(DISTINCT session_id)::int' : numberLiteral()} AS unique_sessions,
        ${numericAggregateExpression(columns, firstExistingColumn(columns, ['seconds_played', 'duration_seconds']), 'AVG', 'average_seconds_played')},
        ${numericAggregateExpression(columns, 'completion_percent', 'AVG', 'average_completion_percent')},
        ${lastSeenExpression(columns)}
      FROM ${qualifiedName}
      GROUP BY 1
      ORDER BY event_count DESC
      LIMIT $1`, [limit]),
    client.query(`
      SELECT
        ${columns.has('created_at') ? 'created_at' : 'NULL::timestamptz AS created_at'},
        COALESCE(NULLIF(${deviceColumn}::text, ''), 'unknown') AS device_type,
        ${optionalColumnExpression(columns, 'event_type')},
        ${optionalColumnExpression(columns, 'song_key')},
        ${optionalColumnExpression(columns, 'song_id')},
        ${optionalColumnExpression(columns, 'referrer')},
        ${optionalColumnExpression(columns, 'product_url')},
        ''::text AS song_title,
        ''::text AS artist
      FROM ${qualifiedName}
      ${columns.has('created_at') ? 'ORDER BY created_at DESC NULLS LAST' : ''}
      LIMIT $1`, [limit])
  ]);

  return response(200, { success: true, summary: summaryResult.rows[0] || {}, devices: devicesResult.rows, recent_events: recentResult.rows, generated_at: new Date().toISOString() });
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function slugifyPathSegment(value, fallback = 'stashbox') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function getUploadPurposeFolder(purpose) {
  const folderByPurpose = {
    audio: 'audio',
    artwork: 'artwork',
    visual_image: 'visuals/images',
    visual_images: 'visuals/images',
    song_visual_image: 'visuals/images',
    visual_clip: 'visuals/clips',
    visual_clips: 'visuals/clips',
    song_visual_clip: 'visuals/clips'
  };
  return folderByPurpose[purpose] || purpose || 'upload';
}

function uploadFolderForPurpose(purpose, artist, songKey) {
  const artistSlug = slugifyPathSegment(artist || 'stashbox');
  const cleanSongKey = slugifyPathSegment(songKey || 'unsorted', 'unsorted');
  return `songs/${artistSlug}/tracks/${cleanSongKey}/${getUploadPurposeFolder(purpose)}`;
}

const VISUALS_FOLDER_TYPES = new Set(['general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand']);
const VISUALS_FOLDER_STATUSES = new Set(['active', 'hidden']);
const VISUALS_FOLDER_PRIORITIES = new Set(['high', 'medium', 'low']);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'visuals-folder';
}

function normalizeVisualsStringArray(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeVisualsSongs(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  return value
    .map((song) => ({
      song_key: String(song?.song_key || song?.songKey || '').trim(),
      song_title: String(song?.song_title || song?.songTitle || '').trim(),
      artist: String(song?.artist || '').trim()
    }))
    .filter((song) => {
      if (!song.song_key || seen.has(song.song_key)) return false;
      seen.add(song.song_key);
      return true;
    });
}

function validateVisualsFolderPayload(body = {}) {
  const folderName = String(body.folder_name || body.folderName || '').trim();
  const folderType = String(body.folder_type || body.folderType || 'general').trim().toLowerCase();
  const status = String(body.status || 'active').trim().toLowerCase();
  const priority = String(body.priority || 'medium').trim().toLowerCase();
  const relevantArtists = normalizeVisualsStringArray(body.relevant_artists ?? body.relevantArtists);
  const relevantGenres = normalizeVisualsStringArray(body.relevant_genres ?? body.relevantGenres);
  const relevantMoods = normalizeVisualsStringArray(body.relevant_moods ?? body.relevantMoods);
  const relevantSongs = normalizeVisualsSongs(body.relevant_songs ?? body.relevantSongs);

  if (!folderName) return { error: 'folder_name is required.' };
  if (!VISUALS_FOLDER_TYPES.has(folderType)) return { error: 'folder_type must be one of: general, artist, song, genre, mood, global, campaign, brand.' };
  if (!VISUALS_FOLDER_STATUSES.has(status)) return { error: 'status must be one of: active, hidden.' };
  if (!VISUALS_FOLDER_PRIORITIES.has(priority)) return { error: 'priority must be one of: high, medium, low.' };
  if (relevantArtists === null) return { error: 'relevant_artists must be an array.' };
  if (relevantGenres === null) return { error: 'relevant_genres must be an array.' };
  if (relevantMoods === null) return { error: 'relevant_moods must be an array.' };
  if (relevantSongs === null) return { error: 'relevant_songs must be an array.' };

  return {
    payload: {
      folder_name: folderName,
      folder_type: folderType,
      description: body.description == null ? null : String(body.description),
      status,
      priority,
      notes: body.notes == null ? null : String(body.notes),
      relevant_artists: relevantArtists,
      relevant_genres: relevantGenres,
      relevant_moods: relevantMoods,
      relevant_songs: relevantSongs
    }
  };
}

function buildVisualsFolderResponse(folder, matches = {}) {
  return {
    id: folder.id,
    folder_name: folder.folder_name,
    folder_slug: folder.folder_slug,
    folder_type: folder.folder_type,
    description: folder.description || '',
    status: folder.status,
    priority: folder.priority,
    notes: folder.notes || '',
    relevant_artists: matches.artists || [],
    relevant_genres: matches.genres || [],
    relevant_moods: matches.moods || [],
    relevant_songs: matches.songs || [],
    created_at: folder.created_at || '',
    updated_at: folder.updated_at || ''
  };
}

async function createUniqueVisualsFolderSlug(baseName, existingId = '') {
  const baseSlug = slugify(baseName);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const values = [candidate];
    let idClause = '';
    if (existingId) {
      values.push(existingId);
      idClause = ` AND id <> $${values.length}`;
    }
    const result = await client.query(`SELECT 1 FROM radio.visuals_folders WHERE folder_slug = $1${idClause} LIMIT 1`, values);
    if (!result.rowCount) return candidate;
  }
  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}

async function saveFolderMatches(folderId, payload) {
  await client.query('DELETE FROM radio.visuals_folder_artist_matches WHERE folder_id = $1', [folderId]);
  await client.query('DELETE FROM radio.visuals_folder_genre_matches WHERE folder_id = $1', [folderId]);
  await client.query('DELETE FROM radio.visuals_folder_mood_matches WHERE folder_id = $1', [folderId]);
  await client.query('DELETE FROM radio.visuals_folder_song_matches WHERE folder_id = $1', [folderId]);

  for (const artist of payload.relevant_artists) {
    await client.query('INSERT INTO radio.visuals_folder_artist_matches (folder_id, artist) VALUES ($1, $2) ON CONFLICT DO NOTHING', [folderId, artist]);
  }
  for (const genre of payload.relevant_genres) {
    await client.query('INSERT INTO radio.visuals_folder_genre_matches (folder_id, genre) VALUES ($1, $2) ON CONFLICT DO NOTHING', [folderId, genre]);
  }
  for (const mood of payload.relevant_moods) {
    await client.query('INSERT INTO radio.visuals_folder_mood_matches (folder_id, mood) VALUES ($1, $2) ON CONFLICT DO NOTHING', [folderId, mood]);
  }
  for (const song of payload.relevant_songs) {
    await client.query(
      'INSERT INTO radio.visuals_folder_song_matches (folder_id, song_key, song_title, artist) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [folderId, song.song_key, song.song_title || null, song.artist || null]
    );
  }
}

async function getVisualsFolderMatches(folderIds) {
  const matches = Object.fromEntries(folderIds.map((id) => [id, { artists: [], genres: [], moods: [], songs: [] }]));
  if (!folderIds.length) return matches;
  const artistRows = await client.query('SELECT folder_id, artist FROM radio.visuals_folder_artist_matches WHERE folder_id = ANY($1::text[]) ORDER BY artist', [folderIds]);
  const genreRows = await client.query('SELECT folder_id, genre FROM radio.visuals_folder_genre_matches WHERE folder_id = ANY($1::text[]) ORDER BY genre', [folderIds]);
  const moodRows = await client.query('SELECT folder_id, mood FROM radio.visuals_folder_mood_matches WHERE folder_id = ANY($1::text[]) ORDER BY mood', [folderIds]);
  const songRows = await client.query('SELECT folder_id, song_key, song_title, artist FROM radio.visuals_folder_song_matches WHERE folder_id = ANY($1::text[]) ORDER BY song_title NULLS LAST, song_key', [folderIds]);
  artistRows.rows.forEach((row) => matches[row.folder_id]?.artists.push(row.artist));
  genreRows.rows.forEach((row) => matches[row.folder_id]?.genres.push(row.genre));
  moodRows.rows.forEach((row) => matches[row.folder_id]?.moods.push(row.mood));
  songRows.rows.forEach((row) => matches[row.folder_id]?.songs.push({ song_key: row.song_key, song_title: row.song_title || '', artist: row.artist || '' }));
  return matches;
}

async function getVisualsFolders() {
  const result = await client.query('SELECT * FROM radio.visuals_folders ORDER BY created_at DESC, folder_name ASC');
  const matches = await getVisualsFolderMatches(result.rows.map((row) => row.id));
  return result.rows.map((row) => buildVisualsFolderResponse(row, matches[row.id]));
}

async function getVisualsFolderById(id) {
  const result = await client.query('SELECT * FROM radio.visuals_folders WHERE id = $1 LIMIT 1', [id]);
  if (!result.rowCount) return null;
  const matches = await getVisualsFolderMatches([id]);
  return buildVisualsFolderResponse(result.rows[0], matches[id]);
}

async function handleAdminVisualsFoldersRoute(event) {
  await requireAdmin(event);
  const method = getMethod(event).toUpperCase();
  const segments = getRouteSegments(event);
  const foldersIndex = segments.lastIndexOf('folders');
  const id = event.pathParameters?.id || (foldersIndex >= 0 ? segments[foldersIndex + 1] || '' : '');

  if (method === 'GET' && !id) return response(200, { success: true, folders: await getVisualsFolders() });

  if (method === 'POST' && !id) {
    const validation = validateVisualsFolderPayload(parseBody(event));
    if (validation.error) return response(400, { success: false, error: validation.error });
    const folderId = crypto.randomUUID();
    const slug = await createUniqueVisualsFolderSlug(validation.payload.folder_name);
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO radio.visuals_folders (id, folder_name, folder_slug, folder_type, description, status, priority, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [folderId, validation.payload.folder_name, slug, validation.payload.folder_type, validation.payload.description, validation.payload.status, validation.payload.priority, validation.payload.notes]
      );
      await saveFolderMatches(folderId, validation.payload);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Visuals folder create failed:', error);
      return response(500, { success: false, error: 'Unable to save visuals folder.' });
    }
    return response(201, { success: true, folder: await getVisualsFolderById(folderId) });
  }

  if (method === 'PUT' && id) {
    const validation = validateVisualsFolderPayload(parseBody(event));
    if (validation.error) return response(400, { success: false, error: validation.error });
    const slug = await createUniqueVisualsFolderSlug(validation.payload.folder_name, id);
    await client.query('BEGIN');
    try {
      const result = await client.query(
        `UPDATE radio.visuals_folders
         SET folder_name = $1, folder_slug = $2, folder_type = $3, description = $4, status = $5, priority = $6, notes = $7, updated_at = now()
         WHERE id = $8`,
        [validation.payload.folder_name, slug, validation.payload.folder_type, validation.payload.description, validation.payload.status, validation.payload.priority, validation.payload.notes, id]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return response(404, { success: false, error: 'Visuals folder not found.' });
      }
      await saveFolderMatches(id, validation.payload);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Visuals folder update failed:', error);
      return response(500, { success: false, error: 'Unable to save visuals folder.' });
    }
    return response(200, { success: true, folder: await getVisualsFolderById(id) });
  }

  if (method === 'DELETE' && id) {
    const result = await client.query('DELETE FROM radio.visuals_folders WHERE id = $1', [id]);
    if (!result.rowCount) return response(404, { success: false, error: 'Visuals folder not found.' });
    return response(200, { success: true });
  }

  return response(404, { success: false, error: 'Not found.' });
}


function uploadFolderForRequest(purpose, body) {
  if (purpose === 'ad_video') {
    const adSlug = slugifyPathSegment(
      body.ad_type || body.adType || body.ad_slug || body.adSlug || body.internal_title || body.internalTitle || 'unsorted',
      'unsorted'
    );
    return `radio-assets/ads/video/${adSlug}`;
  }

  const songKey = String(body.song_key || body.songKey || 'unsorted').trim();
  const artist = String(body.artist || body.artist_slug || body.artistSlug || 'stashbox').trim();
  return uploadFolderForPurpose(purpose, artist, songKey);
}

function getFileExtension(filename) {
  const extension = String(filename || '').split('.').pop() || '';
  return extension.trim().toLowerCase();
}

function isUploadPurpose(purpose, aliases) {
  return aliases.has(String(purpose || '').trim().toLowerCase());
}

function validateUploadRequest(body) {
  const filename = String(body.filename || 'upload.bin');
  const purpose = String(body.purpose || 'upload').replace(/[^A-Za-z0-9/_-]/g, '-').toLowerCase();
  const contentType = String(body.content_type || body.contentType || 'application/octet-stream').toLowerCase();
  const extension = getFileExtension(filename);
  const audioPurposes = new Set(['audio']);
  const artworkPurposes = new Set(['artwork']);
  const visualImagePurposes = new Set(['visual_image', 'visual_images', 'song_visual_image']);
  const visualClipPurposes = new Set(['visual_clip', 'visual_clips', 'song_visual_clip']);
  const adVideoPurposes = new Set(['ad_video']);
  const audioExtensions = new Set(['wav', 'mp3', 'm4a', 'flac', 'aiff', 'aif']);
  const audioMimeTypes = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/aiff', 'audio/x-aiff']);
  const artworkExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const artworkMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  const visualImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const visualClipExtensions = new Set(['mp4', 'webm', 'mov']);
  const visualClipMimeTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/mov']);
  const adVideoMimeTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

  const isOctetStream = contentType === 'application/octet-stream';
  const validAudio = isUploadPurpose(purpose, audioPurposes) && (audioMimeTypes.has(contentType) || (isOctetStream && audioExtensions.has(extension)));
  const validArtwork = isUploadPurpose(purpose, artworkPurposes) && (artworkMimeTypes.has(contentType) || (isOctetStream && artworkExtensions.has(extension)));
  const validVisualImage = isUploadPurpose(purpose, visualImagePurposes) && ((contentType.startsWith('image/') && visualImageExtensions.has(extension)) || (isOctetStream && visualImageExtensions.has(extension)));
  const validVisualClip = isUploadPurpose(purpose, visualClipPurposes) && ((contentType.startsWith('video/') && visualClipExtensions.has(extension)) || (isOctetStream && visualClipExtensions.has(extension)));
  const validAdVideo = isUploadPurpose(purpose, adVideoPurposes) && (adVideoMimeTypes.has(contentType) || (isOctetStream && visualClipExtensions.has(extension)));

  if (validAudio || validArtwork || validVisualImage || validVisualClip || validAdVideo) {
    return { ok: true, filename, purpose, contentType };
  }

  return {
    ok: false,
    statusCode: 400,
    error: 'Unsupported upload purpose or file type. Supported purposes are audio, artwork, visual_image, visual_clip, and ad_video.'
  };
}

const MEDIA_UPLOAD_BUCKET = 'stashbox-media-656260749296-us-east-2-an';
const MEDIA_UPLOAD_BUCKET_REGION = 'us-east-2';

async function createAdminUploadPresign(event) {
  const body = parseBody(event);
  const bucket = process.env.UPLOAD_BUCKET || process.env.S3_BUCKET || process.env.RADIO_UPLOAD_BUCKET || MEDIA_UPLOAD_BUCKET;
  const region = bucket === MEDIA_UPLOAD_BUCKET
    ? MEDIA_UPLOAD_BUCKET_REGION
    : (process.env.UPLOAD_BUCKET_REGION || process.env.S3_BUCKET_REGION || process.env.RADIO_UPLOAD_BUCKET_REGION || MEDIA_UPLOAD_BUCKET_REGION);
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const sessionToken = process.env.AWS_SESSION_TOKEN || '';

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return response(501, { success: false, error: 'Upload presign is not configured.' });
  }

  const validation = validateUploadRequest(body);
  if (!validation.ok) {
    return response(validation.statusCode, { success: false, error: validation.error });
  }

  const filename = validation.filename.replace(/[^A-Za-z0-9._-]/g, '-') || 'upload.bin';
  const purpose = validation.purpose;
  const contentType = validation.contentType;
  const key = `${uploadFolderForRequest(purpose, body)}/${Date.now()}-${filename}`;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = 'host';
  const credential = `${accessKeyId}/${credentialScope}`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '900',
    'X-Amz-SignedHeaders': signedHeaders
  });
  if (sessionToken) query.set('X-Amz-Security-Token', sessionToken);
  const canonicalQuery = Array.from(query.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([keyName, value]) => `${encodeURIComponent(keyName)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalUri = `/${key.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, `host:${host}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicBaseUrl = process.env.UPLOAD_PUBLIC_BASE_URL || `https://${host}`;

  return response(200, {
    success: true,
    upload_url: uploadUrl,
    public_url: `${publicBaseUrl.replace(/\/+$/, '')}/${key}`,
    key,
    method: 'PUT',
    headers: { 'Content-Type': contentType }
  });
}

async function dispatch(event) {
  const method = getMethod(event).toUpperCase();
  const segments = getRouteSegments(event);
  const route = segments.join('/');

  console.log('Normalized route:', route, 'method:', method);

  if (method === 'OPTIONS') return response(204, {});

  if ((method === 'GET') && (routeStartsWith(segments, ['radio', 'songs']) || routeStartsWith(segments, ['songs']))) {
    return getSongs({ includeArchived: false });
  }

  if ((method === 'POST') && (routeStartsWith(segments, ['radio', 'track']) || routeStartsWith(segments, ['track']))) {
    return handleTrackRoute(client, event, trackSongEvent);
  }

  if (matchesRoute(route, ['radio/ad-settings', '/radio/ad-settings', 'ad-settings', '/ad-settings'])) {
    return handlePublicAdSettingsRoute(event);
  }

  if (routeStartsWith(segments, ['radio', 'ads']) || routeStartsWith(segments, ['ads'])) {
    return handlePublicAdsRoute(event);
  }

  if (matchesRoute(route, ['admin/ad-settings', '/admin/ad-settings'])) {
    return handleAdminAdSettingsRoute(event, { requireAdmin });
  }

  if (routeStartsWith(segments, ['admin', 'ads'])) {
    return handleAdminAdsRoute(event, { requireAdmin });
  }

  if (matchesPublicVecRecipeRoute(event, route) || routeStartsWith(segments, ['radio', 'vec', 'recipe'])) {
    return handlePublicVecRecipeRoute(event);
  }

  if (matchesPublicVecSongAssetsRoute(event, route) || routeStartsWith(segments, ['radio', 'vec', 'song-assets'])) {
    return handlePublicVecSongAssetsRoute(event);
  }

  if (matchesPublicVisualsFolderAssetsRoute(event, route)) {
    return handlePublicVisualsFolderAssetsRoute(event);
  }

  if (matchesAdminVecSongAssetsRoute(event, route) || routeStartsWith(segments, ['admin', 'vec', 'song-assets'])) {
    return handleAdminVecSongAssetsRoute(event);
  }

  if (matchesAdminVecRecipeRoute(event, route)) {
    return handleAdminVecRecipeRoute(event);
  }

  if (routeStartsWith(segments, ['radio', 'admin', 'visuals', 'folders'])) {
    return handleAdminVisualsFoldersRoute(event);
  }

  if (routeStartsWith(segments, ['admin', 'visuals', 'folders'])) {
    return handleAdminVisualsFoldersRoute(event);
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'summary']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/stats/summary', method, () => statsSummary());
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'songs']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/stats/songs', method, () => songStats(event));
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'devices']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/stats/devices', method, () => deviceStats(event));
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'referrers']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/stats/referrers', method, () => referrerStats(event));
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'products']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/stats/products', method, () => productStats(event));
  }

  if (routeStartsWith(segments, ['admin', 'events']) && method === 'GET') {
    await requireAdmin(event);
    return withStatsRouteLogging('admin/events', method, () => listEvents(event));
  }

  if (routeStartsWith(segments, ['admin', 'songs'])) {
    await requireAdmin(event);
    if (method === 'GET') {
      const params = event.queryStringParameters || {};
      const hasSongLookup = Boolean(getRouteSegments(event)[2] || params.id || params.song_id || params.songId || params.song_key || params.songKey || params.slug);
      return hasSongLookup ? getAdminSong(event) : getAdminSongs();
    }
    if (method === 'POST') return createAdminSong(event);
    if (method === 'PUT') return updateAdminSong(event);
  }

  if (routeStartsWith(segments, ['admin', 'uploads', 'presign']) && method === 'POST') {
    await requireAdmin(event);
    return createAdminUploadPresign(event);
  }

  return response(404, { success: false, error: 'Not found.', path: getPath(event), route: segments.join('/') });
}

// Safety route check: `handler({ httpMethod: 'OPTIONS', path: '/radio/songs' })` returns a CORS response locally.
export const handler = async (event) => {
  const pgClient = getClient();

  try {
    await pgClient.connect();
    activeClient = pgClient;
    return await dispatch(event || {});
  } catch (error) {
    console.error('Lambda handler error:', error);
    return response(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : 'Internal Server Error'
    });
  } finally {
    activeClient = null;
    await pgClient.end().catch((error) => {
      console.error('PostgreSQL client close error:', error);
    });
  }
};

export {
  handleAdminAdsRoute,
  handleAdminAdSettingsRoute,
  handlePublicAdsRoute,
  handlePublicAdSettingsRoute,
  handleTrackRoute,
  getPublicAdsRouteMatch,
  listAds,
  listPublicAds,
  recordPublicAdEvent,
  trackAdEvent,
  createAd,
  updateAd,
  deleteAd
};
