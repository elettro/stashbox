import crypto from 'node:crypto';
import { enforceRateLimit, getSourceIp, subjectHash } from './rate-limit.mjs';

const ACCOUNT_STATUSES = new Set(['active', 'disabled', 'suspended', 'deleted']);
const ROLE_NAMES = new Set(['listener', 'premium_listener', 'artist', 'band_manager', 'label_staff', 'sponsor', 'administrator']);
const HISTORY_EVENTS = new Set(['play_start', 'play_partial', 'play_full', 'skip', 'video_start', 'video_full']);
const NOTIFICATION_EVENTS = new Set(['view', 'open', 'click', 'dismiss']);
const AUTH_GUARD_LIMITS = {
  signup: { limit: 5, windowSeconds: 15 * 60 },
  login: { limit: 20, windowSeconds: 15 * 60 },
  verify: { limit: 10, windowSeconds: 15 * 60 },
  forgot_password: { limit: 5, windowSeconds: 60 * 60 },
  reset_password: { limit: 10, windowSeconds: 60 * 60 },
  refresh: { limit: 60, windowSeconds: 15 * 60 }
};

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function cleanArray(value, maxItems = 100, maxLength = 200) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function cleanMetadata(value, maxBytes = 12000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) return value;
  return { truncated: true };
}

function parseLimit(event, fallback = 50, maximum = 200) {
  const raw = Number(event?.queryStringParameters?.limit || fallback);
  return Number.isFinite(raw) ? Math.max(1, Math.min(maximum, Math.round(raw))) : fallback;
}

function notFound(message = 'Not found.') {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'BAD_REQUEST';
  return error;
}

function forbidden(message = 'You do not have permission to perform this action.') {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

async function ensureNotificationTables({ client, qname }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notifications')} (
      id TEXT PRIMARY KEY,
      internal_title TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'stashbox_news',
      image_url TEXT,
      action_label TEXT,
      action_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      priority INTEGER NOT NULL DEFAULT 50,
      pinned BOOLEAN NOT NULL DEFAULT false,
      dismissible BOOLEAN NOT NULL DEFAULT true,
      audience_type TEXT NOT NULL DEFAULT 'public',
      artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
      publish_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notification_events')} (
      id BIGSERIAL PRIMARY KEY,
      notification_id TEXT NOT NULL REFERENCES ${qname('notifications')}(id) ON DELETE CASCADE,
      anonymous_visitor_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_notification_state')} (
      user_id TEXT NOT NULL,
      notification_id TEXT NOT NULL REFERENCES ${qname('notifications')}(id) ON DELETE CASCADE,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      dismissed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, notification_id)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notification_preferences')} (
      user_id TEXT PRIMARY KEY,
      in_app_enabled BOOLEAN NOT NULL DEFAULT true,
      browser_push_enabled BOOLEAN NOT NULL DEFAULT false,
      email_enabled BOOLEAN NOT NULL DEFAULT false,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function ensureAccountTables({ client, qname }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('users')} (
      id TEXT PRIMARY KEY,
      cognito_sub TEXT NOT NULL UNIQUE,
      email TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'suspended', 'deleted'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS users_email_idx ON ${qname('users')} (lower(email))`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_roles')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      granted_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, role),
      CONSTRAINT user_roles_role_check CHECK (role IN ('listener', 'premium_listener', 'artist', 'band_manager', 'label_staff', 'sponsor', 'administrator')),
      CONSTRAINT user_roles_status_check CHECK (status IN ('pending', 'approved', 'revoked'))
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_artist_access')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      artist_key TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, artist_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_favorites')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      song_key TEXT NOT NULL,
      song_id TEXT,
      display_title TEXT,
      artist TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, song_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_follows')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      artist_key TEXT NOT NULL,
      artist_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, artist_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('playlists')} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT playlists_visibility_check CHECK (visibility IN ('private', 'unlisted'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS playlists_user_idx ON ${qname('playlists')} (user_id, updated_at DESC)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('playlist_items')} (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES ${qname('playlists')}(id) ON DELETE CASCADE,
      song_key TEXT NOT NULL,
      song_id TEXT,
      display_title TEXT,
      artist TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (playlist_id, song_key)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS playlist_items_order_idx ON ${qname('playlist_items')} (playlist_id, position, added_at)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_listening_history')} (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      song_key TEXT NOT NULL,
      song_id TEXT,
      display_title TEXT,
      artist TEXT,
      event_type TEXT NOT NULL DEFAULT 'play_start',
      seconds_played NUMERIC NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT false,
      client_event_id TEXT,
      source TEXT NOT NULL DEFAULT 'public_player',
      listened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS user_history_recent_idx ON ${qname('user_listening_history')} (user_id, listened_at DESC)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_history_client_event_unique ON ${qname('user_listening_history')} (user_id, client_event_id) WHERE client_event_id IS NOT NULL`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_preferences')} (
      user_id TEXT PRIMARY KEY REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      autoplay_enabled BOOLEAN NOT NULL DEFAULT true,
      explicit_content_enabled BOOLEAN NOT NULL DEFAULT true,
      default_view_mode TEXT NOT NULL DEFAULT 'visual',
      preferred_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
      preferred_artists JSONB NOT NULL DEFAULT '[]'::jsonb,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('account_audit_log')} (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id TEXT,
      target_user_id TEXT,
      action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_ip_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS account_audit_recent_idx ON ${qname('account_audit_log')} (created_at DESC)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('anonymous_activity_merge_log')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      anonymous_visitor_hash TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, anonymous_visitor_hash, payload_fingerprint)
    )
  `);

  await ensureNotificationTables({ client, qname });
}

async function audit({ client, qname, event, actorUserId, targetUserId, action, details = {} }) {
  await client.query(`
    INSERT INTO ${qname('account_audit_log')} (
      actor_user_id, target_user_id, action, details, source_ip_hash
    ) VALUES ($1, $2, $3, $4::jsonb, $5)
  `, [actorUserId || null, targetUserId || null, cleanText(action, 160), JSON.stringify(cleanMetadata(details)), subjectHash(getSourceIp(event))]);
}

function fallbackDisplayName(identity) {
  if (identity.displayName) return cleanText(identity.displayName, 120);
  if (identity.email.includes('@')) return cleanText(identity.email.split('@')[0], 120);
  return 'Listener';
}

async function syncUser(identity, deps, event) {
  const { client, qname } = deps;
  await ensureAccountTables(deps);
  const userId = crypto.randomUUID();
  const displayName = fallbackDisplayName(identity);
  const result = await client.query(`
    INSERT INTO ${qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub)
    DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      display_name = CASE WHEN account_user.display_name = '' THEN EXCLUDED.display_name ELSE account_user.display_name END,
      last_login_at = now(),
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [userId, identity.sub, cleanEmail(identity.email), Boolean(identity.emailVerified), displayName]);

  const user = result.rows[0];
  if (!ACCOUNT_STATUSES.has(user.status) || user.status !== 'active') {
    throw forbidden('This Stashbox Radio account is disabled or unavailable.');
  }

  const listenerRole = await client.query(`
    INSERT INTO ${qname('user_roles')} (user_id, role, status, granted_by, approved_at)
    VALUES ($1, 'listener', 'approved', 'system', now())
    ON CONFLICT (user_id, role) DO NOTHING
    RETURNING role
  `, [user.id]);

  await client.query(`INSERT INTO ${qname('user_preferences')} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
  await client.query(`INSERT INTO ${qname('notification_preferences')} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);

  if (listenerRole.rowCount) {
    await audit({
      client,
      qname,
      event,
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'account_created',
      details: { role: 'listener' }
    });
  }

  const roles = await client.query(`
    SELECT role FROM ${qname('user_roles')}
    WHERE user_id = $1 AND status = 'approved'
    ORDER BY role
  `, [user.id]);
  return { user, roles: roles.rows.map(row => row.role) };
}

function publicUser(account) {
  return {
    id: account.user.id,
    email: account.user.email || '',
    email_verified: Boolean(account.user.email_verified),
    display_name: account.user.display_name || 'Listener',
    status: account.user.status,
    roles: account.roles,
    created_at: account.user.created_at,
    last_seen_at: account.user.last_seen_at
  };
}

export async function requireApprovedRole(account, allowedRoles) {
  const requested = new Set((Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(role => cleanText(role, 80)));
  if (![...requested].every(role => ROLE_NAMES.has(role))) throw new Error('Invalid role requirement.');
  if (!account.roles.some(role => requested.has(role))) throw forbidden();
}

async function getAccountSummary(account, deps) {
  const { client, qname } = deps;
  const [favorites, playlists, history, unread] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS count FROM ${qname('user_favorites')} WHERE user_id = $1`, [account.user.id]),
    client.query(`SELECT COUNT(*)::int AS count FROM ${qname('playlists')} WHERE user_id = $1`, [account.user.id]),
    client.query(`SELECT COUNT(*)::int AS count FROM ${qname('user_listening_history')} WHERE user_id = $1`, [account.user.id]),
    client.query(`SELECT COUNT(*)::int AS count FROM ${qname('user_notification_state')} WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`, [account.user.id])
  ]);
  return {
    favorites: favorites.rows[0]?.count || 0,
    playlists: playlists.rows[0]?.count || 0,
    history_events: history.rows[0]?.count || 0,
    unread_notifications: unread.rows[0]?.count || 0
  };
}

async function listFavorites(account, deps) {
  const result = await deps.client.query(`
    SELECT song_key, song_id, display_title, artist, metadata, created_at, updated_at
    FROM ${deps.qname('user_favorites')}
    WHERE user_id = $1
    ORDER BY updated_at DESC
  `, [account.user.id]);
  return result.rows;
}

async function saveFavorite(event, account, deps) {
  const body = deps.parseBody(event);
  const songKey = cleanText(body.song_key ?? body.songKey, 300);
  if (!songKey) throw badRequest('song_key is required.');
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('user_favorites')} AS favorite (
      user_id, song_key, song_id, display_title, artist, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (user_id, song_key)
    DO UPDATE SET
      song_id = COALESCE(EXCLUDED.song_id, favorite.song_id),
      display_title = COALESCE(EXCLUDED.display_title, favorite.display_title),
      artist = COALESCE(EXCLUDED.artist, favorite.artist),
      metadata = favorite.metadata || EXCLUDED.metadata,
      updated_at = now()
    RETURNING *
  `, [
    account.user.id,
    songKey,
    cleanText(body.song_id ?? body.songId, 300) || null,
    cleanText(body.display_title ?? body.displayTitle ?? body.title, 300) || null,
    cleanText(body.artist, 300) || null,
    JSON.stringify(cleanMetadata(body.metadata))
  ]);
  return result.rows[0];
}

async function deleteFavorite(songKey, account, deps) {
  const result = await deps.client.query(`DELETE FROM ${deps.qname('user_favorites')} WHERE user_id = $1 AND song_key = $2`, [account.user.id, songKey]);
  if (!result.rowCount) throw notFound('Favorite not found.');
}

async function listPlaylists(account, deps) {
  const result = await deps.client.query(`
    SELECT p.*, COUNT(i.id)::int AS item_count
    FROM ${deps.qname('playlists')} p
    LEFT JOIN ${deps.qname('playlist_items')} i ON i.playlist_id = p.id
    WHERE p.user_id = $1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `, [account.user.id]);
  return result.rows;
}

async function createPlaylist(event, account, deps) {
  const body = deps.parseBody(event);
  const name = cleanText(body.name, 160);
  if (!name) throw badRequest('Playlist name is required.');
  const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'private';
  const id = crypto.randomUUID();
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('playlists')} (id, user_id, name, description, visibility)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [id, account.user.id, name, cleanText(body.description, 1000), visibility]);
  await audit({ client: deps.client, qname: deps.qname, event, actorUserId: account.user.id, targetUserId: account.user.id, action: 'playlist_created', details: { playlist_id: id } });
  return result.rows[0];
}

async function getPlaylist(playlistId, account, deps) {
  const playlist = await deps.client.query(`SELECT * FROM ${deps.qname('playlists')} WHERE id = $1 AND user_id = $2 LIMIT 1`, [playlistId, account.user.id]);
  if (!playlist.rowCount) throw notFound('Playlist not found.');
  const items = await deps.client.query(`
    SELECT * FROM ${deps.qname('playlist_items')}
    WHERE playlist_id = $1
    ORDER BY position, added_at
  `, [playlistId]);
  return { ...playlist.rows[0], items: items.rows };
}

async function updatePlaylist(event, playlistId, account, deps) {
  const body = deps.parseBody(event);
  const current = await getPlaylist(playlistId, account, deps);
  const name = Object.prototype.hasOwnProperty.call(body, 'name') ? cleanText(body.name, 160) : current.name;
  if (!name) throw badRequest('Playlist name is required.');
  const description = Object.prototype.hasOwnProperty.call(body, 'description') ? cleanText(body.description, 1000) : current.description;
  const visibility = Object.prototype.hasOwnProperty.call(body, 'visibility') && body.visibility === 'unlisted' ? 'unlisted' : current.visibility;
  const result = await deps.client.query(`
    UPDATE ${deps.qname('playlists')}
    SET name = $1, description = $2, visibility = $3, updated_at = now()
    WHERE id = $4 AND user_id = $5
    RETURNING *
  `, [name, description, visibility, playlistId, account.user.id]);
  return result.rows[0];
}

async function deletePlaylist(event, playlistId, account, deps) {
  const result = await deps.client.query(`DELETE FROM ${deps.qname('playlists')} WHERE id = $1 AND user_id = $2`, [playlistId, account.user.id]);
  if (!result.rowCount) throw notFound('Playlist not found.');
  await audit({ client: deps.client, qname: deps.qname, event, actorUserId: account.user.id, targetUserId: account.user.id, action: 'playlist_deleted', details: { playlist_id: playlistId } });
}

async function addPlaylistItem(event, playlistId, account, deps) {
  await getPlaylist(playlistId, account, deps);
  const body = deps.parseBody(event);
  const songKey = cleanText(body.song_key ?? body.songKey, 300);
  if (!songKey) throw badRequest('song_key is required.');
  const positionResult = await deps.client.query(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM ${deps.qname('playlist_items')} WHERE playlist_id = $1`, [playlistId]);
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('playlist_items')} AS item (
      id, playlist_id, song_key, song_id, display_title, artist, position, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    ON CONFLICT (playlist_id, song_key)
    DO UPDATE SET
      song_id = COALESCE(EXCLUDED.song_id, item.song_id),
      display_title = COALESCE(EXCLUDED.display_title, item.display_title),
      artist = COALESCE(EXCLUDED.artist, item.artist),
      metadata = item.metadata || EXCLUDED.metadata
    RETURNING *
  `, [
    crypto.randomUUID(),
    playlistId,
    songKey,
    cleanText(body.song_id ?? body.songId, 300) || null,
    cleanText(body.display_title ?? body.displayTitle ?? body.title, 300) || null,
    cleanText(body.artist, 300) || null,
    Number(positionResult.rows[0]?.position || 0),
    JSON.stringify(cleanMetadata(body.metadata))
  ]);
  await deps.client.query(`UPDATE ${deps.qname('playlists')} SET updated_at = now() WHERE id = $1`, [playlistId]);
  return result.rows[0];
}

async function deletePlaylistItem(itemId, playlistId, account, deps) {
  await getPlaylist(playlistId, account, deps);
  const result = await deps.client.query(`DELETE FROM ${deps.qname('playlist_items')} WHERE id = $1 AND playlist_id = $2`, [itemId, playlistId]);
  if (!result.rowCount) throw notFound('Playlist item not found.');
  await deps.client.query(`UPDATE ${deps.qname('playlists')} SET updated_at = now() WHERE id = $1`, [playlistId]);
}

function normalizeHistoryItem(item = {}) {
  const songKey = cleanText(item.song_key ?? item.songKey, 300);
  if (!songKey) return null;
  const eventType = cleanText(item.event_type ?? item.eventType ?? 'play_start', 80);
  return {
    songKey,
    songId: cleanText(item.song_id ?? item.songId, 300) || null,
    displayTitle: cleanText(item.display_title ?? item.displayTitle ?? item.title, 300) || null,
    artist: cleanText(item.artist, 300) || null,
    eventType: HISTORY_EVENTS.has(eventType) ? eventType : 'play_start',
    secondsPlayed: Math.max(0, Math.min(86400, Number(item.seconds_played ?? item.secondsPlayed ?? 0) || 0)),
    completed: Boolean(item.completed),
    clientEventId: cleanText(item.client_event_id ?? item.clientEventId, 300) || null,
    source: cleanText(item.source || 'public_player', 120) || 'public_player',
    listenedAt: item.listened_at ?? item.listenedAt ?? null,
    metadata: cleanMetadata(item.metadata)
  };
}

async function insertHistoryItems(items, account, deps) {
  let inserted = 0;
  for (const item of items.map(normalizeHistoryItem).filter(Boolean).slice(0, 100)) {
    const result = await deps.client.query(`
      INSERT INTO ${deps.qname('user_listening_history')} (
        user_id, song_key, song_id, display_title, artist, event_type, seconds_played,
        completed, client_event_id, source, listened_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, now()), $12::jsonb)
      ON CONFLICT (user_id, client_event_id) WHERE client_event_id IS NOT NULL DO NOTHING
      RETURNING id
    `, [
      account.user.id,
      item.songKey,
      item.songId,
      item.displayTitle,
      item.artist,
      item.eventType,
      item.secondsPlayed,
      item.completed,
      item.clientEventId,
      item.source,
      item.listenedAt,
      JSON.stringify(item.metadata)
    ]);
    inserted += result.rowCount;
  }
  return inserted;
}

async function getPreferences(account, deps) {
  const result = await deps.client.query(`
    SELECT p.*, n.in_app_enabled, n.browser_push_enabled, n.email_enabled, n.categories AS notification_categories, n.artist_keys AS notification_artist_keys
    FROM ${deps.qname('user_preferences')} p
    LEFT JOIN ${deps.qname('notification_preferences')} n ON n.user_id = p.user_id
    WHERE p.user_id = $1
    LIMIT 1
  `, [account.user.id]);
  return result.rows[0] || null;
}

async function updatePreferences(event, account, deps) {
  const body = deps.parseBody(event);
  const viewMode = ['visual', 'list'].includes(body.default_view_mode ?? body.defaultViewMode) ? (body.default_view_mode ?? body.defaultViewMode) : 'visual';
  await deps.client.query(`
    UPDATE ${deps.qname('user_preferences')}
    SET autoplay_enabled = $1,
        explicit_content_enabled = $2,
        default_view_mode = $3,
        preferred_genres = $4::jsonb,
        preferred_artists = $5::jsonb,
        settings = settings || $6::jsonb,
        updated_at = now()
    WHERE user_id = $7
  `, [
    body.autoplay_enabled ?? body.autoplayEnabled ?? true,
    body.explicit_content_enabled ?? body.explicitContentEnabled ?? true,
    viewMode,
    JSON.stringify(cleanArray(body.preferred_genres ?? body.preferredGenres)),
    JSON.stringify(cleanArray(body.preferred_artists ?? body.preferredArtists)),
    JSON.stringify(cleanMetadata(body.settings)),
    account.user.id
  ]);
  await deps.client.query(`
    UPDATE ${deps.qname('notification_preferences')}
    SET in_app_enabled = $1,
        browser_push_enabled = $2,
        email_enabled = $3,
        categories = $4::jsonb,
        artist_keys = $5::jsonb,
        updated_at = now()
    WHERE user_id = $6
  `, [
    body.in_app_enabled ?? body.inAppEnabled ?? true,
    body.browser_push_enabled ?? body.browserPushEnabled ?? false,
    body.email_enabled ?? body.emailEnabled ?? false,
    JSON.stringify(cleanArray(body.notification_categories ?? body.notificationCategories)),
    JSON.stringify(cleanArray(body.notification_artist_keys ?? body.notificationArtistKeys)),
    account.user.id
  ]);
  return getPreferences(account, deps);
}

async function listNotificationState(account, deps) {
  const result = await deps.client.query(`
    SELECT notification_id, delivered_at, read_at, clicked_at, dismissed_at, updated_at
    FROM ${deps.qname('user_notification_state')}
    WHERE user_id = $1
    ORDER BY updated_at DESC
  `, [account.user.id]);
  return result.rows;
}

async function saveNotificationState(event, account, deps) {
  const body = deps.parseBody(event);
  const notificationId = cleanText(body.notification_id ?? body.notificationId, 300);
  if (!notificationId) throw badRequest('notification_id is required.');
  const exists = await deps.client.query(`SELECT 1 FROM ${deps.qname('notifications')} WHERE id = $1 LIMIT 1`, [notificationId]);
  if (!exists.rowCount) throw notFound('Notification not found.');
  const now = new Date().toISOString();
  const deliveredAt = body.delivered || body.delivered_at ? now : null;
  const readAt = body.read || body.read_at ? now : null;
  const clickedAt = body.clicked || body.clicked_at ? now : null;
  const dismissedAt = body.dismissed || body.dismissed_at ? now : null;
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('user_notification_state')} AS notification_state (
      user_id, notification_id, delivered_at, read_at, clicked_at, dismissed_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, notification_id)
    DO UPDATE SET
      delivered_at = COALESCE(notification_state.delivered_at, EXCLUDED.delivered_at),
      read_at = COALESCE(notification_state.read_at, EXCLUDED.read_at),
      clicked_at = COALESCE(notification_state.clicked_at, EXCLUDED.clicked_at),
      dismissed_at = COALESCE(notification_state.dismissed_at, EXCLUDED.dismissed_at),
      updated_at = now()
    RETURNING *
  `, [account.user.id, notificationId, deliveredAt, readAt, clickedAt, dismissedAt]);
  return result.rows[0];
}

async function mergeAnonymousActivity(event, account, deps) {
  const body = deps.parseBody(event);
  const visitorId = cleanText(body.anonymous_visitor_id ?? body.anonymousVisitorId ?? body.visitor_id, 300);
  if (!visitorId) throw badRequest('anonymous_visitor_id is required.');
  const favorites = Array.isArray(body.favorites) ? body.favorites.slice(0, 200) : [];
  const history = Array.isArray(body.history) ? body.history.slice(0, 200) : [];
  const notificationState = Array.isArray(body.notification_state ?? body.notificationState) ? (body.notification_state ?? body.notificationState).slice(0, 500) : [];
  const preferenceSignals = body.preference_signals ?? body.preferenceSignals ?? {};
  const normalizedPayload = { favorites, history, notificationState, preferenceSignals };
  const visitorHash = subjectHash(visitorId);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex');

  await deps.client.query('BEGIN');
  try {
    const mergeLog = await deps.client.query(`
      INSERT INTO ${deps.qname('anonymous_activity_merge_log')} (user_id, anonymous_visitor_hash, payload_fingerprint)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      RETURNING merged_at
    `, [account.user.id, visitorHash, fingerprint]);
    if (!mergeLog.rowCount) {
      await deps.client.query('ROLLBACK');
      return { already_merged: true, favorites: 0, history: 0, notification_state: 0 };
    }

    let favoriteCount = 0;
    for (const favorite of favorites) {
      const songKey = cleanText(favorite.song_key ?? favorite.songKey, 300);
      if (!songKey) continue;
      const result = await deps.client.query(`
        INSERT INTO ${deps.qname('user_favorites')} (user_id, song_key, song_id, display_title, artist, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (user_id, song_key) DO NOTHING
        RETURNING song_key
      `, [account.user.id, songKey, cleanText(favorite.song_id ?? favorite.songId, 300) || null, cleanText(favorite.display_title ?? favorite.title, 300) || null, cleanText(favorite.artist, 300) || null, JSON.stringify(cleanMetadata(favorite.metadata))]);
      favoriteCount += result.rowCount;
    }

    const historyWithIds = history.map(item => ({
      ...item,
      client_event_id: cleanText(item.client_event_id ?? item.clientEventId, 300) || `anon:${visitorHash.slice(0, 16)}:${crypto.createHash('sha1').update(JSON.stringify(item)).digest('hex')}`
    }));
    const historyCount = await insertHistoryItems(historyWithIds, account, deps);

    let notificationCount = 0;
    for (const state of notificationState) {
      const notificationId = cleanText(state.notification_id ?? state.notificationId ?? state.id, 300);
      if (!notificationId) continue;
      const result = await deps.client.query(`
        INSERT INTO ${deps.qname('user_notification_state')} AS current_state (
          user_id, notification_id, delivered_at, read_at, clicked_at, dismissed_at
        )
        SELECT $1, $2,
          CASE WHEN $3 THEN now() ELSE NULL END,
          CASE WHEN $4 THEN now() ELSE NULL END,
          CASE WHEN $5 THEN now() ELSE NULL END,
          CASE WHEN $6 THEN now() ELSE NULL END
        WHERE EXISTS (SELECT 1 FROM ${deps.qname('notifications')} WHERE id = $2)
        ON CONFLICT (user_id, notification_id)
        DO UPDATE SET
          delivered_at = COALESCE(current_state.delivered_at, EXCLUDED.delivered_at),
          read_at = COALESCE(current_state.read_at, EXCLUDED.read_at),
          clicked_at = COALESCE(current_state.clicked_at, EXCLUDED.clicked_at),
          dismissed_at = COALESCE(current_state.dismissed_at, EXCLUDED.dismissed_at),
          updated_at = now()
        RETURNING notification_id
      `, [account.user.id, notificationId, Boolean(state.delivered ?? true), Boolean(state.read), Boolean(state.clicked), Boolean(state.dismissed)]);
      notificationCount += result.rowCount;
    }

    const currentPreferences = await getPreferences(account, deps);
    const mergedGenres = cleanArray([...(currentPreferences?.preferred_genres || []), ...cleanArray(preferenceSignals.genres || [])]);
    const mergedArtists = cleanArray([...(currentPreferences?.preferred_artists || []), ...cleanArray(preferenceSignals.artists || [])]);
    await deps.client.query(`
      UPDATE ${deps.qname('user_preferences')}
      SET preferred_genres = $1::jsonb, preferred_artists = $2::jsonb, updated_at = now()
      WHERE user_id = $3
    `, [JSON.stringify(mergedGenres), JSON.stringify(mergedArtists), account.user.id]);

    await audit({ client: deps.client, qname: deps.qname, event, actorUserId: account.user.id, targetUserId: account.user.id, action: 'anonymous_activity_merged', details: { favorites: favoriteCount, history: historyCount, notification_state: notificationCount } });
    await deps.client.query('COMMIT');
    return { already_merged: false, favorites: favoriteCount, history: historyCount, notification_state: notificationCount };
  } catch (error) {
    await deps.client.query('ROLLBACK');
    throw error;
  }
}

function accountRouteParts(segments) {
  const index = segments.findIndex((segment, position) => segment === 'me' && (position === 0 || segments[position - 1] === 'radio'));
  return index >= 0 ? segments.slice(index + 1) : [];
}

export function isAccountRequest(segments) {
  return segments[0] === 'radio' && (segments[1] === 'me' || segments[1] === 'auth');
}

export function isNotificationEventRequest(segments) {
  return segments[0] === 'radio' && segments[1] === 'notifications' && Boolean(segments[2]) && segments[3] === 'events';
}

export async function handleNotificationEventRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  if (method !== 'POST') return deps.response(405, { success: false, error: 'Method not allowed.' });
  await ensureAccountTables(deps);
  const identity = await deps.verifyIdentity(event, { required: false });
  const account = identity ? await syncUser(identity, deps, event) : null;
  await enforceRateLimit({ client: deps.client, qname: deps.qname, event, identity, scope: 'notification_event', limit: 240, windowSeconds: 60 * 60 });

  const segments = deps.getRouteSegments(event);
  const notificationId = cleanText(segments[2], 300);
  const body = deps.parseBody(event);
  const eventType = cleanText(body.event_type ?? body.eventType, 40).toLowerCase();
  if (!NOTIFICATION_EVENTS.has(eventType)) throw badRequest('Unsupported notification event.');
  const exists = await deps.client.query(`SELECT 1 FROM ${deps.qname('notifications')} WHERE id = $1 LIMIT 1`, [notificationId]);
  if (!exists.rowCount) throw notFound('Notification not found.');

  const visitorId = cleanText(body.anonymous_visitor_id ?? body.anonymousVisitorId ?? body.visitor_id ?? body.visitorId, 300) || null;
  await deps.client.query(`
    INSERT INTO ${deps.qname('notification_events')} (notification_id, anonymous_visitor_id, user_id, event_type, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [notificationId, visitorId, account?.user.id || null, eventType, JSON.stringify(cleanMetadata(body.metadata))]);

  if (account) {
    const now = new Date().toISOString();
    await deps.client.query(`
      INSERT INTO ${deps.qname('user_notification_state')} AS current_state (
        user_id, notification_id, delivered_at, read_at, clicked_at, dismissed_at
      ) VALUES (
        $1, $2, $3,
        CASE WHEN $4 IN ('open', 'click') THEN $3::timestamptz ELSE NULL END,
        CASE WHEN $4 = 'click' THEN $3::timestamptz ELSE NULL END,
        CASE WHEN $4 = 'dismiss' THEN $3::timestamptz ELSE NULL END
      )
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET
        delivered_at = COALESCE(current_state.delivered_at, EXCLUDED.delivered_at),
        read_at = COALESCE(current_state.read_at, EXCLUDED.read_at),
        clicked_at = COALESCE(current_state.clicked_at, EXCLUDED.clicked_at),
        dismissed_at = COALESCE(current_state.dismissed_at, EXCLUDED.dismissed_at),
        updated_at = now()
    `, [account.user.id, notificationId, now, eventType]);
  }

  return deps.response(201, { success: true, authenticated: Boolean(account) });
}

export async function handleAccountRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  const segments = deps.getRouteSegments(event);

  if (segments[0] === 'radio' && segments[1] === 'auth' && segments[2] === 'config' && method === 'GET') {
    return deps.response(200, { success: true, auth: deps.getAuthConfig() });
  }

  if (segments[0] === 'radio' && segments[1] === 'auth' && segments[2] === 'guard' && method === 'POST') {
    await ensureAccountTables(deps);
    const body = deps.parseBody(event);
    const action = cleanText(body.action, 80).toLowerCase();
    const rule = AUTH_GUARD_LIMITS[action];
    if (!rule) throw badRequest('Unsupported authentication action.');
    const limit = await enforceRateLimit({ client: deps.client, qname: deps.qname, event, scope: `auth_${action}`, ...rule });
    return deps.response(200, { success: true, action, rate_limit: limit });
  }

  if (!(segments[0] === 'radio' && segments[1] === 'me')) {
    return deps.response(404, { success: false, error: 'Not found.' });
  }

  const identity = await deps.verifyIdentity(event, { required: true });
  const account = await syncUser(identity, deps, event);
  const parts = accountRouteParts(segments);
  const writeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  await enforceRateLimit({
    client: deps.client,
    qname: deps.qname,
    event,
    identity,
    scope: writeMethod ? 'account_write' : 'account_read',
    limit: writeMethod ? 180 : 600,
    windowSeconds: 15 * 60
  });

  if (!parts.length && method === 'GET') {
    return deps.response(200, { success: true, user: publicUser(account), summary: await getAccountSummary(account, deps) });
  }
  if (!parts.length && ['PUT', 'PATCH'].includes(method)) {
    const body = deps.parseBody(event);
    const displayName = cleanText(body.display_name ?? body.displayName, 120);
    if (!displayName) throw badRequest('Display name is required.');
    const result = await deps.client.query(`UPDATE ${deps.qname('users')} SET display_name = $1, updated_at = now() WHERE id = $2 RETURNING *`, [displayName, account.user.id]);
    account.user = result.rows[0];
    await audit({ client: deps.client, qname: deps.qname, event, actorUserId: account.user.id, targetUserId: account.user.id, action: 'profile_updated', details: { display_name_changed: true } });
    return deps.response(200, { success: true, user: publicUser(account) });
  }

  if (parts[0] === 'favorites') {
    if (method === 'GET' && !parts[1]) return deps.response(200, { success: true, favorites: await listFavorites(account, deps) });
    if (method === 'POST' && !parts[1]) return deps.response(201, { success: true, favorite: await saveFavorite(event, account, deps) });
    if (method === 'DELETE' && parts[1]) {
      await deleteFavorite(decodeURIComponent(parts[1]), account, deps);
      return deps.response(200, { success: true });
    }
  }

  if (parts[0] === 'playlists') {
    const playlistId = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (method === 'GET' && !playlistId) return deps.response(200, { success: true, playlists: await listPlaylists(account, deps) });
    if (method === 'POST' && !playlistId) return deps.response(201, { success: true, playlist: await createPlaylist(event, account, deps) });
    if (playlistId && parts[2] === 'items') {
      if (method === 'POST' && !parts[3]) return deps.response(201, { success: true, item: await addPlaylistItem(event, playlistId, account, deps) });
      if (method === 'DELETE' && parts[3]) {
        await deletePlaylistItem(decodeURIComponent(parts[3]), playlistId, account, deps);
        return deps.response(200, { success: true });
      }
    }
    if (method === 'GET' && playlistId) return deps.response(200, { success: true, playlist: await getPlaylist(playlistId, account, deps) });
    if (['PUT', 'PATCH'].includes(method) && playlistId) return deps.response(200, { success: true, playlist: await updatePlaylist(event, playlistId, account, deps) });
    if (method === 'DELETE' && playlistId) {
      await deletePlaylist(event, playlistId, account, deps);
      return deps.response(200, { success: true });
    }
  }

  if (parts[0] === 'history') {
    if (method === 'GET') {
      const result = await deps.client.query(`
        SELECT id, song_key, song_id, display_title, artist, event_type, seconds_played, completed, source, listened_at, metadata
        FROM ${deps.qname('user_listening_history')}
        WHERE user_id = $1
        ORDER BY listened_at DESC
        LIMIT $2
      `, [account.user.id, parseLimit(event, 50, 200)]);
      return deps.response(200, { success: true, history: result.rows });
    }
    if (method === 'POST') {
      const body = deps.parseBody(event);
      const items = Array.isArray(body.items) ? body.items : [body];
      const inserted = await insertHistoryItems(items, account, deps);
      return deps.response(201, { success: true, inserted });
    }
  }

  if (parts[0] === 'preferences') {
    if (method === 'GET') return deps.response(200, { success: true, preferences: await getPreferences(account, deps) });
    if (['PUT', 'PATCH'].includes(method)) return deps.response(200, { success: true, preferences: await updatePreferences(event, account, deps) });
  }

  if (parts[0] === 'notifications' && parts[1] === 'state') {
    if (method === 'GET') return deps.response(200, { success: true, notification_state: await listNotificationState(account, deps) });
    if (method === 'POST') return deps.response(200, { success: true, notification_state: await saveNotificationState(event, account, deps) });
  }

  if (parts[0] === 'anonymous' && parts[1] === 'merge' && method === 'POST') {
    await enforceRateLimit({ client: deps.client, qname: deps.qname, event, identity, scope: 'anonymous_merge', limit: 10, windowSeconds: 60 * 60 });
    return deps.response(200, { success: true, merge: await mergeAnonymousActivity(event, account, deps) });
  }

  return deps.response(405, { success: false, error: 'Method not allowed.' });
}
