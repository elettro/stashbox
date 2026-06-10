import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

const EDITABLE_FIELDS = [
  'internal_title',
  'description',
  'ad_type',
  'video_url',
  'click_url',
  'ad_ratio_label',
  'video_width',
  'video_height',
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
  'ad_complete',
  'ad_skip',
  'ad_click',
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

const SONG_EDITABLE_FIELDS = [
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

const BOOLEAN_SONG_FIELDS = new Set([
  'show_public_note',
  'exclusive',
  'explicit',
  'live_recording',
  'featured'
]);

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
  const result = await pool.query('SELECT * FROM radio.ads ORDER BY created_at DESC');
  return response(200, { success: true, count: result.rowCount, ads: result.rows });
}

async function listPublicAds() {
  const result = await pool.query(`
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
      views,
      clicks,
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
  const payload = normalizePayload(parseBody(event));
  const validationError = validatePayload(payload);
  if (validationError) return response(400, { success: false, error: validationError });

  const result = await pool.query(buildInsert(payload));
  return response(201, { success: true, message: 'Ad created', ad: result.rows[0] });
}

async function updateAd(event) {
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const payload = normalizePayload(parseBody(event), { partial: true });
  const fields = Object.keys(payload);
  if (!fields.length) return response(400, { success: false, error: 'No editable fields provided.' });

  const validationError = validatePayload(payload, { partial: true });
  if (validationError) return response(400, { success: false, error: validationError });

  const result = await pool.query(buildUpdate(adId, payload));
  if (!result.rowCount) return response(404, { success: false, error: 'Ad not found.' });
  return response(200, { success: true, message: 'Ad updated', ad: result.rows[0] });
}

async function deleteAd(event) {
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const result = await pool.query('DELETE FROM radio.ads WHERE id = $1', [adId]);
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

function getTrackEventType(event) {
  try {
    const body = parseBody(event);
    return String(body.event_type || body.eventType || '').trim();
  } catch (_) {
    return '';
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
  const eventType = String(body.event_type || body.eventType || '').trim();

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
       RETURNING id, internal_title, views, clicks`,
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
       RETURNING id, internal_title, views, clicks`,
      [adId]
    );

    if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
    console.log('Updated ad clicks for:', adId);
    return response(200, { success: true, message: 'Ad event recorded.', ad: result.rows[0], event_type: eventType });
  }

  const result = await client.query(
    'SELECT id, internal_title, views, clicks FROM radio.ads WHERE id = $1',
    [adId]
  );

  if (!result.rowCount) return response(404, { success: false, error: 'Ad not found', ad_id: adId });
  return response(200, { success: true, message: 'Ad event recorded.', ad: result.rows[0], event_type: eventType });
}

async function recordPublicAdEvent(event) {
  const adId = getAdId(event);
  if (!adId) return response(400, { success: false, error: 'ad_id is required.' });

  const eventType = getAdEventType(event);
  return trackAdEvent(pool, event, { ad_id: adId, event_type: eventType });
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
  return segments;
}

function routeStartsWith(segments, prefix) {
  return prefix.every((segment, index) => segments[index] === segment);
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

function normalizeSongPayload(input, { partial = false } = {}) {
  const payload = {};
  SONG_EDITABLE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      payload[field] = BOOLEAN_SONG_FIELDS.has(field) ? Boolean(input[field]) : input[field];
    }
  });

  if (!partial) {
    payload.public_visibility = payload.public_visibility || 'hidden';
  }

  return payload;
}

async function getTableColumns(schemaName, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schemaName, tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function findFirstTable(candidates) {
  const result = await pool.query(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE (table_schema, table_name) IN (${candidates.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')})`,
    candidates.flat()
  );

  return candidates.find(([schemaName, tableName]) =>
    result.rows.some((row) => row.table_schema === schemaName && row.table_name === tableName)
  ) || candidates[0];
}

async function listSongs({ includeArchived = false } = {}) {
  const columns = await getTableColumns('radio', 'songs');
  const hasVisibility = columns.has('public_visibility');
  const hasSortOrder = columns.has('sort_order');
  const where = includeArchived || !hasVisibility ? '' : "WHERE COALESCE(public_visibility, 'visible') = 'visible'";
  const orderBy = hasSortOrder
    ? 'ORDER BY sort_order ASC, song_name ASC NULLS LAST, display_title ASC NULLS LAST'
    : 'ORDER BY created_at DESC NULLS LAST, song_name ASC NULLS LAST, display_title ASC NULLS LAST';
  const result = await pool.query(`SELECT * FROM radio.songs ${where} ${orderBy}`);
  return response(200, { success: true, count: result.rowCount, songs: result.rows });
}

async function createSong(event) {
  const payload = normalizeSongPayload(parseBody(event));
  const columns = await getTableColumns('radio', 'songs');
  const fields = Object.keys(payload).filter((field) => columns.has(field));
  if (!fields.includes('song_key')) return response(400, { success: false, error: 'song_key is required.' });
  if (!fields.length) return response(400, { success: false, error: 'No editable fields provided.' });

  const values = fields.map((field) => payload[field]);
  const result = await pool.query(
    `INSERT INTO radio.songs (${fields.join(', ')})
     VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
     RETURNING *`,
    values
  );
  return response(201, { success: true, message: 'Song created', song: result.rows[0] });
}

async function updateSong(event) {
  const songKey = event.pathParameters?.song_key || event.pathParameters?.songKey || getRouteSegments(event)[2] || '';
  if (!songKey) return response(400, { success: false, error: 'song_key is required.' });

  const payload = normalizeSongPayload(parseBody(event), { partial: true });
  const columns = await getTableColumns('radio', 'songs');
  const fields = Object.keys(payload).filter((field) => columns.has(field) && field !== 'song_key');
  if (!fields.length) return response(400, { success: false, error: 'No editable fields provided.' });

  const values = fields.map((field) => payload[field]);
  values.push(songKey);
  const updatedAt = columns.has('updated_at') ? ', updated_at = now()' : '';
  const result = await pool.query(
    `UPDATE radio.songs
     SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}${updatedAt}
     WHERE song_key = $${values.length}
     RETURNING *`,
    values
  );
  if (!result.rowCount) return response(404, { success: false, error: 'Song not found.', song_key: songKey });
  return response(200, { success: true, message: 'Song updated', song: result.rows[0] });
}

async function trackSongEvent(client, event) {
  const body = parseBody(event);
  const eventType = String(body.event_type || body.eventType || '').trim();
  const songKey = String(body.song_key || body.songKey || body.song_id || body.songId || '').trim();

  if (!songKey || !SONG_EVENT_TYPES.has(eventType)) {
    return response(400, { success: false, error: 'Invalid or missing song event' });
  }

  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const columns = await getTableColumns(schemaName, tableName);
  const payload = {
    song_key: songKey,
    song_id: songKey,
    event_type: eventType,
    session_id: body.session_id || body.sessionId || '',
    device_type: body.device_type || body.deviceType || '',
    referrer: body.referrer || '',
    seconds_played: body.seconds_played ?? body.secondsPlayed ?? null,
    completion_percent: body.completion_percent ?? body.completionPercent ?? null,
    product_url: body.product_url || body.productUrl || '',
    share_url: body.share_url || body.shareUrl || '',
    source_page: body.source_page || body.sourcePage || '/stashbox/radio/dev/'
  };
  const fields = Object.keys(payload).filter((field) => columns.has(field) && payload[field] !== null && payload[field] !== '');

  if (fields.length) {
    await client.query(
      `INSERT INTO ${schemaName}.${tableName} (${fields.join(', ')})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})`,
      fields.map((field) => payload[field])
    );
  }

  return response(200, { success: true, message: 'Song event recorded.', event_type: eventType, song_key: songKey });
}

async function listEvents(event) {
  const limit = getQueryLimit(event, 100, 500);
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const result = await pool.query(`SELECT * FROM ${schemaName}.${tableName} ORDER BY created_at DESC NULLS LAST LIMIT $1`, [limit]);
  return response(200, { success: true, count: result.rowCount, limit, events: result.rows });
}

async function statsSummary() {
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const [summary, today, devices, eventTypes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS events_last_24h,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS events_last_7d,
        COUNT(*) FILTER (WHERE event_type = 'play_start')::int AS play_starts,
        COUNT(*) FILTER (WHERE event_type = 'play_full')::int AS full_plays,
        COUNT(*) FILTER (WHERE event_type = 'play_partial')::int AS partial_plays,
        COUNT(*) FILTER (WHERE event_type = 'skip')::int AS skips,
        COUNT(*) FILTER (WHERE event_type = 'like')::int AS likes,
        COUNT(*) FILTER (WHERE event_type = 'share')::int AS shares,
        COUNT(*) FILTER (WHERE event_type = 'video_click')::int AS video_clicks,
        COUNT(*) FILTER (WHERE event_type = 'product_click')::int AS product_clicks,
        COALESCE(SUM(seconds_played), 0)::int AS total_seconds_played,
        COALESCE(AVG(seconds_played), 0)::float AS average_seconds_played,
        COALESCE(AVG(completion_percent), 0)::float AS average_completion_percent
      FROM ${schemaName}.${tableName}`),
    pool.query(`
      SELECT
        COUNT(*)::int AS events_today,
        COUNT(*) FILTER (WHERE event_type = 'play_start')::int AS plays_today,
        COUNT(*) FILTER (WHERE event_type = 'like')::int AS likes_today,
        COUNT(*) FILTER (WHERE event_type = 'share')::int AS shares_today,
        COUNT(*) FILTER (WHERE event_type = 'product_click')::int AS product_clicks_today,
        COUNT(*) FILTER (WHERE event_type = 'video_click')::int AS video_clicks_today
      FROM ${schemaName}.${tableName}
      WHERE created_at >= CURRENT_DATE`),
    pool.query(`SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::int AS event_count FROM ${schemaName}.${tableName} GROUP BY 1 ORDER BY event_count DESC LIMIT 10`),
    pool.query(`SELECT event_type, COUNT(*)::int AS event_count FROM ${schemaName}.${tableName} GROUP BY event_type ORDER BY event_count DESC`)
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
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const result = await pool.query(`
    SELECT
      e.song_key,
      COALESCE(s.display_title, s.song_name, e.song_key) AS song_title,
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE e.event_type = 'play_start')::int AS play_starts,
      COUNT(*) FILTER (WHERE e.event_type = 'play_full')::int AS full_plays,
      COUNT(*) FILTER (WHERE e.event_type = 'play_partial')::int AS partial_plays,
      COUNT(*) FILTER (WHERE e.event_type = 'skip')::int AS skips,
      COUNT(*) FILTER (WHERE e.event_type = 'like')::int AS likes,
      COUNT(*) FILTER (WHERE e.event_type = 'share')::int AS shares,
      COUNT(*) FILTER (WHERE e.event_type = 'video_click')::int AS video_clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'product_click')::int AS product_clicks,
      COALESCE(SUM(e.seconds_played), 0)::int AS total_seconds_played,
      COALESCE(AVG(e.seconds_played), 0)::float AS average_seconds_played,
      COALESCE(AVG(e.completion_percent), 0)::float AS average_completion_percent
    FROM ${schemaName}.${tableName} e
    LEFT JOIN radio.songs s ON s.song_key = e.song_key
    GROUP BY e.song_key, song_title
    ORDER BY total_events DESC
    LIMIT $1`, [limit]);
  return response(200, { success: true, limit, songs: result.rows, generated_at: new Date().toISOString() });
}

async function productStats(event) {
  const limit = getQueryLimit(event, 25, 200);
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'product_click_events']
  ]);
  const result = await pool.query(`
    SELECT product_url, COUNT(*)::int AS product_clicks, MAX(created_at) AS last_clicked_at
    FROM ${schemaName}.${tableName}
    WHERE event_type = 'product_click' OR product_url IS NOT NULL
    GROUP BY product_url
    ORDER BY product_clicks DESC, last_clicked_at DESC
    LIMIT $1`, [limit]);
  return response(200, {
    success: true,
    summary: {
      total_product_clicks: result.rows.reduce((sum, row) => sum + Number(row.product_clicks || 0), 0),
      unique_products_clicked: result.rowCount
    },
    products: result.rows,
    recent_clicks: result.rows,
    generated_at: new Date().toISOString()
  });
}

async function referrerStats(event) {
  const limit = getQueryLimit(event, 50, 200);
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const result = await pool.query(`
    SELECT COALESCE(NULLIF(referrer, ''), 'direct / unknown') AS referrer, COUNT(*)::int AS event_count
    FROM ${schemaName}.${tableName}
    GROUP BY 1
    ORDER BY event_count DESC
    LIMIT $1`, [limit]);
  return response(200, { success: true, summary: { unique_referrers: result.rowCount }, referrers: result.rows, recent_events: [], generated_at: new Date().toISOString() });
}

async function deviceStats(event) {
  const limit = getQueryLimit(event, 50, 200);
  const [schemaName, tableName] = await findFirstTable([
    ['radio', 'song_events'],
    ['radio', 'events'],
    ['public', 'song_events'],
    ['public', 'song_play_events']
  ]);
  const result = await pool.query(`
    SELECT COALESCE(NULLIF(device_type, ''), 'unknown') AS device_type, COUNT(*)::int AS event_count
    FROM ${schemaName}.${tableName}
    GROUP BY 1
    ORDER BY event_count DESC
    LIMIT $1`, [limit]);
  return response(200, { success: true, summary: { unique_device_types: result.rowCount }, devices: result.rows, recent_events: [], generated_at: new Date().toISOString() });
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

async function createUploadPresign(event) {
  const body = parseBody(event);
  const bucket = process.env.UPLOAD_BUCKET || process.env.S3_BUCKET || process.env.RADIO_UPLOAD_BUCKET || '';
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const sessionToken = process.env.AWS_SESSION_TOKEN || '';

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return response(501, { success: false, error: 'Upload presign is not configured.' });
  }

  const filename = String(body.filename || 'upload.bin').replace(/[^A-Za-z0-9._-]/g, '-');
  const purpose = String(body.purpose || 'upload').replace(/[^A-Za-z0-9/_-]/g, '-');
  const songKey = String(body.song_key || body.songKey || 'unsorted').replace(/[^A-Za-z0-9._-]/g, '-');
  const contentType = String(body.content_type || body.contentType || 'application/octet-stream');
  const key = `radio/dev/${purpose}/${songKey}/${Date.now()}-${filename}`;
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
    .map(([keyName, value]) => `${encodeURIComponent(keyName)}=${encodeURIComponent(value).replace(/%2F/g, '%252F')}`)
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
    method: 'PUT',
    headers: { 'Content-Type': contentType }
  });
}

async function dispatch(event) {
  const method = getMethod(event).toUpperCase();
  const segments = getRouteSegments(event);

  if (method === 'OPTIONS') return response(204, {});

  if ((method === 'GET') && (routeStartsWith(segments, ['radio', 'songs']) || routeStartsWith(segments, ['songs']))) {
    return listSongs({ includeArchived: false });
  }

  if ((method === 'POST') && (routeStartsWith(segments, ['radio', 'track']) || routeStartsWith(segments, ['track']))) {
    return handleTrackRoute(pool, event, trackSongEvent);
  }

  if (routeStartsWith(segments, ['radio', 'ads']) || routeStartsWith(segments, ['ads'])) {
    return handlePublicAdsRoute(event);
  }

  if (routeStartsWith(segments, ['admin', 'ads'])) {
    return handleAdminAdsRoute(event, { requireAdmin });
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'summary']) && method === 'GET') {
    await requireAdmin(event);
    return statsSummary();
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'songs']) && method === 'GET') {
    await requireAdmin(event);
    return songStats(event);
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'devices']) && method === 'GET') {
    await requireAdmin(event);
    return deviceStats(event);
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'referrers']) && method === 'GET') {
    await requireAdmin(event);
    return referrerStats(event);
  }

  if (routeStartsWith(segments, ['admin', 'stats', 'products']) && method === 'GET') {
    await requireAdmin(event);
    return productStats(event);
  }

  if (routeStartsWith(segments, ['admin', 'events']) && method === 'GET') {
    await requireAdmin(event);
    return listEvents(event);
  }

  if (routeStartsWith(segments, ['admin', 'songs'])) {
    await requireAdmin(event);
    if (method === 'GET') return listSongs({ includeArchived: true });
    if (method === 'POST') return createSong(event);
    if (method === 'PUT') return updateSong(event);
  }

  if (routeStartsWith(segments, ['admin', 'uploads', 'presign']) && method === 'POST') {
    await requireAdmin(event);
    return createUploadPresign(event);
  }

  return response(404, { success: false, error: 'Not found.', path: getPath(event), route: segments.join('/') });
}

// Safety route check: `handler({ httpMethod: 'OPTIONS', path: '/radio/songs' })` returns a CORS response locally.
export const handler = async (event) => {
  try {
    return await dispatch(event || {});
  } catch (error) {
    console.error('Lambda handler error:', error);
    return response(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : 'Internal Server Error'
    });
  }
};

export {
  handleAdminAdsRoute,
  handlePublicAdsRoute,
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
