import crypto from 'node:crypto';
import { ensureArtistTables } from './artist-routes.mjs';
import { enforceRateLimit } from './rate-limit.mjs';

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function routeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function unauthorized(message = 'Authentication is required.') {
  return routeError(401, 'AUTH_REQUIRED', message);
}

function forbidden(message = 'This Stashbox Radio account is disabled or unavailable.') {
  return routeError(403, 'ACCOUNT_UNAVAILABLE', message);
}

function notFound(message = 'Artist not found.') {
  return routeError(404, 'NOT_FOUND', message);
}

function publicArtist(row, isFollowing) {
  return {
    id: row.id,
    artist_key: row.artist_key,
    slug: row.slug,
    name: row.name,
    sort_name: row.sort_name || row.name,
    profile_image_url: row.profile_image_url || '',
    banner_image_url: row.banner_image_url || '',
    bio: row.bio || '',
    location: row.location || '',
    website_url: row.website_url || '',
    spotify_url: row.spotify_url || '',
    apple_music_url: row.apple_music_url || '',
    youtube_url: row.youtube_url || '',
    instagram_url: row.instagram_url || '',
    x_url: row.x_url || '',
    facebook_url: row.facebook_url || '',
    merch_url: row.merch_url || '',
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    follower_count: Math.max(0, Number(row.follower_count || 0)),
    song_count: Math.max(0, Number(row.song_count || 0)),
    is_following: Boolean(isFollowing),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function syncAccount(event, deps) {
  const identity = await deps.verifyIdentity(event, { required: true });
  if (!identity?.sub) throw unauthorized();
  await ensureArtistTables(deps);

  const email = cleanText(identity.email, 320).toLowerCase();
  const displayName = cleanText(
    identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'),
    120
  );
  const userId = crypto.randomUUID();
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub)
    DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [userId, identity.sub, email, Boolean(identity.emailVerified), displayName]);

  const user = result.rows[0];
  if (!user || user.status !== 'active') throw forbidden();

  await deps.client.query(`
    INSERT INTO ${deps.qname('user_roles')} (user_id, role, status, granted_by, approved_at)
    VALUES ($1, 'listener', 'approved', 'system', now())
    ON CONFLICT (user_id, role) DO NOTHING
  `, [user.id]);
  await deps.client.query(`
    INSERT INTO ${deps.qname('notification_preferences')} (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `, [user.id]);

  return { identity, user };
}

async function resolveArtist(identifier, deps) {
  const key = cleanText(identifier, 220).toLowerCase();
  if (!key) throw notFound();
  const result = await deps.client.query(`
    SELECT a.*,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} f WHERE f.artist_key = a.artist_key) AS follower_count,
      (SELECT COUNT(*)::int FROM ${deps.qname('song_artists')} sa WHERE sa.artist_id = a.id) AS song_count
    FROM ${deps.qname('artists')} a
    WHERE (lower(a.artist_key) = $1 OR lower(a.slug) = $1)
      AND a.status = 'published'
    LIMIT 1
  `, [key]);
  if (!result.rowCount) throw notFound();
  return result.rows[0];
}

async function bestEffortNotificationSync(account, artist, following, deps) {
  try {
    await deps.client.query(`
      INSERT INTO ${deps.qname('notification_preferences')} (user_id, artist_keys)
      VALUES ($1, CASE WHEN $3 THEN jsonb_build_array($2::text) ELSE '[]'::jsonb END)
      ON CONFLICT (user_id)
      DO UPDATE SET
        artist_keys = CASE
          WHEN $3 THEN CASE
            WHEN COALESCE(notification_preferences.artist_keys, '[]'::jsonb) @> jsonb_build_array($2::text)
              THEN COALESCE(notification_preferences.artist_keys, '[]'::jsonb)
            ELSE COALESCE(notification_preferences.artist_keys, '[]'::jsonb) || jsonb_build_array($2::text)
          END
          ELSE COALESCE((
            SELECT jsonb_agg(value)
            FROM jsonb_array_elements_text(COALESCE(notification_preferences.artist_keys, '[]'::jsonb)) item(value)
            WHERE value <> $2
          ), '[]'::jsonb)
        END,
        updated_at = now()
    `, [account.user.id, artist.artist_key, following]);
  } catch (error) {
    console.warn('[artist follow] notification preference sync skipped', {
      userId: account.user.id,
      artistKey: artist.artist_key,
      message: error?.message
    });
  }
}

async function bestEffortAudit(event, account, artist, action, deps) {
  try {
    await deps.client.query(`
      INSERT INTO ${deps.qname('account_audit_log')} (
        actor_user_id, target_user_id, action, details, source_ip_hash
      ) VALUES ($1, $1, $2, $3::jsonb, NULL)
    `, [account.user.id, action, JSON.stringify({ artist_key: artist.artist_key })]);
  } catch (error) {
    console.warn('[artist follow] audit logging skipped', {
      userId: account.user.id,
      artistKey: artist.artist_key,
      action,
      message: error?.message
    });
  }
}

async function listFollows(account, deps) {
  const result = await deps.client.query(`
    SELECT a.*,
      f.notifications_enabled,
      f.created_at AS followed_at,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} fx WHERE fx.artist_key = a.artist_key) AS follower_count,
      (SELECT COUNT(*)::int FROM ${deps.qname('song_artists')} sa WHERE sa.artist_id = a.id) AS song_count
    FROM ${deps.qname('user_follows')} f
    JOIN ${deps.qname('artists')} a ON a.artist_key = f.artist_key
    WHERE f.user_id = $1
    ORDER BY f.created_at DESC
  `, [account.user.id]);
  return result.rows.map(row => ({
    ...publicArtist(row, true),
    notifications_enabled: Boolean(row.notifications_enabled),
    followed_at: row.followed_at
  }));
}

async function followArtist(event, account, artist, deps) {
  const body = deps.parseBody(event);
  const notificationsEnabled = body.notifications_enabled === undefined
    ? true
    : Boolean(body.notifications_enabled);

  await deps.client.query(`
    INSERT INTO ${deps.qname('user_follows')} AS follow (
      user_id, artist_key, artist_name, artist_id, notifications_enabled, updated_at
    ) VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (user_id, artist_key)
    DO UPDATE SET
      artist_name = EXCLUDED.artist_name,
      artist_id = EXCLUDED.artist_id,
      notifications_enabled = EXCLUDED.notifications_enabled,
      updated_at = now()
  `, [account.user.id, artist.artist_key, artist.name, artist.id, notificationsEnabled]);

  await bestEffortNotificationSync(account, artist, true, deps);
  await bestEffortAudit(event, account, artist, 'artist_followed', deps);
  const refreshed = await resolveArtist(artist.artist_key, deps);
  return publicArtist(refreshed, true);
}

async function unfollowArtist(event, account, artist, deps) {
  await deps.client.query(`
    DELETE FROM ${deps.qname('user_follows')}
    WHERE user_id = $1 AND artist_key = $2
  `, [account.user.id, artist.artist_key]);

  await bestEffortNotificationSync(account, artist, false, deps);
  await bestEffortAudit(event, account, artist, 'artist_unfollowed', deps);
  const refreshed = await resolveArtist(artist.artist_key, deps);
  return publicArtist(refreshed, false);
}

export function isDedicatedArtistFollowRequest(segments) {
  return segments[0] === 'radio' && segments[1] === 'me' && segments[2] === 'follows';
}

export async function handleDedicatedArtistFollowRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  const segments = deps.getRouteSegments(event);
  const account = await syncAccount(event, deps);
  await enforceRateLimit({
    client: deps.client,
    qname: deps.qname,
    event,
    identity: account.identity,
    scope: method === 'GET' ? 'artist_follow_read' : 'artist_follow_write',
    limit: method === 'GET' ? 600 : 180,
    windowSeconds: 15 * 60
  });

  const identifier = segments[3] ? decodeURIComponent(segments[3]) : '';
  if (method === 'GET' && !identifier) {
    const follows = await listFollows(account, deps);
    return deps.response(200, { success: true, follows, count: follows.length });
  }
  if (!identifier) {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  const artist = await resolveArtist(identifier, deps);
  if (method === 'POST') {
    return deps.response(200, { success: true, artist: await followArtist(event, account, artist, deps) });
  }
  if (method === 'DELETE') {
    return deps.response(200, { success: true, artist: await unfollowArtist(event, account, artist, deps) });
  }
  return deps.response(405, { success: false, error: 'Method not allowed.' });
}
