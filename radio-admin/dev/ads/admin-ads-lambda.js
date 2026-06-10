const { Pool } = require('pg');

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

module.exports = {
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
