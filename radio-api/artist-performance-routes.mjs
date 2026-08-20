import crypto from 'node:crypto';

// DEV-first lightweight Artist CMS performance aggregation.
// Replaces the CMS habit of loading up to 500 per-song analytics rows and
// aggregating them in the browser. This route returns only the three values the
// Artist CMS actually renders: likes, shares, and listening seconds per artist.

function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function errorWith(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function unauthorized(message = 'Authentication is required.') {
  return errorWith(401, 'UNAUTHORIZED', message);
}

function forbidden(message = 'You do not have permission to view these artist analytics.') {
  return errorWith(403, 'FORBIDDEN', message);
}

export function isArtistPerformanceRequest(segments) {
  return segments[0] === 'radio'
    && segments[1] === 'admin'
    && segments[2] === 'artists'
    && segments[3] === 'performance'
    && !segments[4];
}

async function syncPerformanceAccount(event, deps) {
  const identity = await deps.verifyIdentity(event, { required: true });
  if (!identity?.sub) throw unauthorized();

  const id = crypto.randomUUID();
  const email = cleanEmail(identity.email);
  const displayName = cleanText(
    identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'),
    120
  );

  const userResult = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub) DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      last_seen_at = now(),
      updated_at = now()
    RETURNING id, status
  `, [id, identity.sub, email, Boolean(identity.emailVerified), displayName]);

  const user = userResult.rows[0];
  if (user.status !== 'active') throw forbidden('This Stashbox Radio account is disabled or unavailable.');

  await deps.client.query(`
    INSERT INTO ${deps.qname('user_roles')} (user_id, role, status, granted_by, approved_at)
    VALUES ($1, 'listener', 'approved', 'system', now())
    ON CONFLICT (user_id, role) DO NOTHING
  `, [user.id]);

  return user;
}

async function resolvePerformanceScope(event, deps) {
  const suppliedAdminToken = cleanText(deps.getHeader(event, 'x-admin-token'), 1000);
  if (suppliedAdminToken) {
    await deps.requireAdmin(event);
    return { mode: 'platform_admin', allowedArtistIds: null };
  }

  const user = await syncPerformanceAccount(event, deps);
  const roles = await deps.client.query(`
    SELECT role
    FROM ${deps.qname('user_roles')}
    WHERE user_id = $1 AND status = 'approved'
  `, [user.id]);

  if (roles.rows.some(row => row.role === 'administrator')) {
    return { mode: 'platform_admin', allowedArtistIds: null };
  }

  const grants = await deps.client.query(`
    SELECT DISTINCT a.id
    FROM ${deps.qname('artists')} a
    LEFT JOIN ${deps.qname('user_artist_access')} uaa
      ON uaa.user_id = $1
      AND uaa.status = 'approved'
      AND (uaa.artist_id = a.id OR lower(uaa.artist_key) = lower(a.artist_key))
    LEFT JOIN ${deps.qname('label_artists')} la ON la.artist_id = a.id
    LEFT JOIN ${deps.qname('user_label_access')} ula
      ON ula.user_id = $1
      AND ula.label_id = la.label_id
      AND ula.status = 'approved'
    WHERE uaa.user_id IS NOT NULL OR ula.user_id IS NOT NULL
  `, [user.id]);

  return {
    mode: 'assigned_user',
    allowedArtistIds: grants.rows.map(row => String(row.id || '')).filter(Boolean)
  };
}

async function tableColumns(deps, tableName) {
  const result = await deps.client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
  `, [deps.schema, tableName]);
  return new Set(result.rows.map(row => row.column_name));
}

async function emptyPerformance(deps, allowedArtistIds) {
  const params = [];
  let filter = '';
  if (Array.isArray(allowedArtistIds)) {
    if (!allowedArtistIds.length) return [];
    params.push(allowedArtistIds);
    filter = `WHERE id = ANY($1::text[])`;
  }
  const result = await deps.client.query(`
    SELECT artist_key, name,
      0::bigint AS total_likes,
      0::bigint AS total_shares,
      0::numeric AS total_listening_seconds
    FROM ${deps.qname('artists')}
    ${filter}
    ORDER BY lower(name)
  `, params);
  return result.rows;
}

async function loadArtistPerformance(deps, allowedArtistIds) {
  const [eventColumns, songColumns] = await Promise.all([
    tableColumns(deps, 'radio_events'),
    tableColumns(deps, 'songs')
  ]);

  if (!eventColumns.size || !songColumns.has('artist')) {
    return emptyPerformance(deps, allowedArtistIds);
  }

  const eventSongIdentity = eventColumns.has('song_key') && songColumns.has('song_key')
    ? 'e.song_key::text = ts.song_key::text'
    : eventColumns.has('song_id') && songColumns.has('id')
      ? 'e.song_id::text = ts.song_id::text'
      : '';

  if (!eventSongIdentity) return emptyPerformance(deps, allowedArtistIds);

  const eventTypeColumn = eventColumns.has('event_type');
  const secondsColumn = eventColumns.has('seconds_played')
    ? 'seconds_played'
    : eventColumns.has('duration_seconds')
      ? 'duration_seconds'
      : '';

  const likesExpression = eventTypeColumn
    ? `COUNT(*) FILTER (WHERE e.event_type = 'like')::bigint`
    : '0::bigint';
  const sharesExpression = eventTypeColumn
    ? `COUNT(*) FILTER (WHERE e.event_type = 'share')::bigint`
    : '0::bigint';
  const secondsExpression = secondsColumn
    ? `COALESCE(SUM(e.${secondsColumn}), 0)::numeric`
    : '0::numeric';

  const params = [];
  let artistScope = '';
  if (Array.isArray(allowedArtistIds)) {
    if (!allowedArtistIds.length) return [];
    params.push(allowedArtistIds);
    artistScope = `WHERE a.id = ANY($1::text[])`;
  }

  const songIdSelect = songColumns.has('id') ? 's.id::text AS song_id' : `''::text AS song_id`;
  const songKeySelect = songColumns.has('song_key') ? 's.song_key::text AS song_key' : `''::text AS song_key`;

  const result = await deps.client.query(`
    WITH target_artists AS (
      SELECT
        a.id,
        a.artist_key,
        a.name,
        lower(regexp_replace(btrim(a.name), '\\s+', ' ', 'g')) AS normalized_name
      FROM ${deps.qname('artists')} a
      ${artistScope}
    ),
    target_songs AS (
      SELECT DISTINCT
        ta.id AS artist_id,
        ${songKeySelect},
        ${songIdSelect}
      FROM target_artists ta
      JOIN ${deps.qname('songs')} s
        ON lower(regexp_replace(btrim(s.artist), '\\s+', ' ', 'g')) = ta.normalized_name
    ),
    event_totals AS (
      SELECT
        ts.artist_id,
        ${likesExpression} AS total_likes,
        ${sharesExpression} AS total_shares,
        ${secondsExpression} AS total_listening_seconds
      FROM target_songs ts
      JOIN ${deps.qname('radio_events')} e ON ${eventSongIdentity}
      GROUP BY ts.artist_id
    )
    SELECT
      ta.artist_key,
      ta.name,
      COALESCE(et.total_likes, 0)::bigint AS total_likes,
      COALESCE(et.total_shares, 0)::bigint AS total_shares,
      COALESCE(et.total_listening_seconds, 0)::numeric AS total_listening_seconds
    FROM target_artists ta
    LEFT JOIN event_totals et ON et.artist_id = ta.id
    ORDER BY lower(ta.name)
  `, params);

  return result.rows;
}

export async function handleArtistPerformanceRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  const context = await resolvePerformanceScope(event, deps);
  let performance = [];
  try {
    performance = await loadArtistPerformance(deps, context.allowedArtistIds);
  } catch (error) {
    if (error?.code !== '42P01') throw error;
    performance = await emptyPerformance(deps, context.allowedArtistIds);
  }

  return deps.response(200, {
    success: true,
    mode: context.mode,
    count: performance.length,
    performance,
    generated_at: new Date().toISOString()
  });
}
