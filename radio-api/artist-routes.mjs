import crypto from 'node:crypto';
import { ensureAccountTables } from './account-routes.mjs';
import { enforceRateLimit } from './rate-limit.mjs';

const ARTIST_STATUSES = new Set(['draft', 'published', 'hidden']);
const ARTIST_ACCESS_LEVELS = new Set(['viewer', 'editor', 'manager', 'owner']);
const ARTIST_WRITE_LEVELS = new Set(['editor', 'manager', 'owner']);
const LABEL_ACCESS_LEVELS = new Set(['viewer', 'editor', 'manager', 'owner']);
const SONG_ARTIST_ROLES = new Set(['primary', 'featured', 'remixer', 'producer']);

function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function cleanArray(value, maxItems = 200, maxLength = 300) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [...new Set(source.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function cleanJson(value, maxBytes = 20000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes ? value : { truncated: true };
  } catch (_) {
    return {};
  }
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseLimit(event, fallback = 100, maximum = 500) {
  const raw = Number(event?.queryStringParameters?.limit || fallback);
  return Number.isFinite(raw) ? Math.max(1, Math.min(maximum, Math.round(raw))) : fallback;
}

function errorWith(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function badRequest(message) {
  return errorWith(400, 'BAD_REQUEST', message);
}

function unauthorized(message = 'Authentication is required.') {
  return errorWith(401, 'UNAUTHORIZED', message);
}

function forbidden(message = 'You do not have permission to manage this artist.') {
  return errorWith(403, 'FORBIDDEN', message);
}

function notFound(message = 'Artist not found.') {
  return errorWith(404, 'NOT_FOUND', message);
}

export function slugifyArtist(value) {
  return cleanText(value, 220)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'artist';
}

function publicArtist(row, { includePrivate = false } = {}) {
  const artist = {
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
    follower_count: Number(row.follower_count || 0),
    song_count: Number(row.song_count || 0),
    is_following: Boolean(row.is_following),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  if (includePrivate) {
    artist.status = row.status;
    artist.notes = row.notes || '';
    artist.metadata = row.metadata || {};
    artist.created_by = row.created_by || '';
  }
  return artist;
}

export async function ensureArtistTables({ client, qname }) {
  await ensureAccountTables({ client, qname });
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('artists')} (
      id TEXT PRIMARY KEY,
      artist_key TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_name TEXT NOT NULL DEFAULT '',
      profile_image_url TEXT,
      banner_image_url TEXT,
      bio TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      website_url TEXT,
      spotify_url TEXT,
      apple_music_url TEXT,
      youtube_url TEXT,
      instagram_url TEXT,
      x_url TEXT,
      facebook_url TEXT,
      merch_url TEXT,
      verified BOOLEAN NOT NULL DEFAULT false,
      featured BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT artists_status_check CHECK (status IN ('draft', 'published', 'hidden'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS artists_public_idx ON ${qname('artists')} (status, featured DESC, lower(name))`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('song_artists')} (
      song_key TEXT NOT NULL,
      artist_id TEXT NOT NULL REFERENCES ${qname('artists')}(id) ON DELETE CASCADE,
      artist_role TEXT NOT NULL DEFAULT 'primary',
      position INTEGER NOT NULL DEFAULT 0,
      display_credit TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (song_key, artist_id, artist_role),
      CONSTRAINT song_artists_role_check CHECK (artist_role IN ('primary', 'featured', 'remixer', 'producer'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS song_artists_artist_idx ON ${qname('song_artists')} (artist_id, position, song_key)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('labels')} (
      id TEXT PRIMARY KEY,
      label_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      logo_url TEXT,
      website_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('label_artists')} (
      label_id TEXT NOT NULL REFERENCES ${qname('labels')}(id) ON DELETE CASCADE,
      artist_id TEXT NOT NULL REFERENCES ${qname('artists')}(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL DEFAULT 'label',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (label_id, artist_id)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_label_access')} (
      user_id TEXT NOT NULL REFERENCES ${qname('users')}(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES ${qname('labels')}(id) ON DELETE CASCADE,
      access_level TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, label_id)
    )
  `);

  await client.query(`ALTER TABLE ${qname('user_artist_access')} ADD COLUMN IF NOT EXISTS artist_id TEXT`);
  await client.query(`ALTER TABLE ${qname('user_artist_access')} ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await client.query(`ALTER TABLE ${qname('user_follows')} ADD COLUMN IF NOT EXISTS artist_id TEXT`);
  await client.query(`ALTER TABLE ${qname('user_follows')} ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true`);
  await client.query(`ALTER TABLE ${qname('user_follows')} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await client.query(`CREATE INDEX IF NOT EXISTS user_follows_artist_idx ON ${qname('user_follows')} (artist_key, created_at)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('artist_change_requests')} (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES ${qname('artists')}(id) ON DELETE CASCADE,
      requested_by_user_id TEXT REFERENCES ${qname('users')}(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
      review_notes TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT artist_change_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
    )
  `);
}

async function audit(event, deps, actorUserId, action, details = {}) {
  await deps.client.query(`
    INSERT INTO ${deps.qname('account_audit_log')} (actor_user_id, target_user_id, action, details)
    VALUES ($1, $1, $2, $3::jsonb)
  `, [actorUserId || null, cleanText(action, 160), JSON.stringify(cleanJson(details))]);
}

async function syncIdentity(event, deps, { required = true } = {}) {
  const identity = await deps.verifyIdentity(event, { required });
  if (!identity) return null;
  await ensureArtistTables(deps);
  const id = crypto.randomUUID();
  const email = cleanEmail(identity.email);
  const displayName = cleanText(identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'), 120);
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub) DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [id, identity.sub, email, Boolean(identity.emailVerified), displayName]);
  const user = result.rows[0];
  if (user.status !== 'active') throw forbidden('This Stashbox Radio account is disabled or unavailable.');
  await deps.client.query(`
    INSERT INTO ${deps.qname('user_roles')} (user_id, role, status, granted_by, approved_at)
    VALUES ($1, 'listener', 'approved', 'system', now())
    ON CONFLICT (user_id, role) DO NOTHING
  `, [user.id]);
  const roles = await deps.client.query(`
    SELECT role FROM ${deps.qname('user_roles')}
    WHERE user_id = $1 AND status = 'approved'
  `, [user.id]);
  return { identity, user, roles: roles.rows.map(row => row.role) };
}

async function resolveArtist(identifier, deps, { includeHidden = false } = {}) {
  const key = cleanText(identifier, 220).toLowerCase();
  if (!key) throw notFound();
  const result = await deps.client.query(`
    SELECT a.*,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} f WHERE f.artist_key = a.artist_key) AS follower_count,
      (SELECT COUNT(*)::int FROM ${deps.qname('song_artists')} sa WHERE sa.artist_id = a.id) AS song_count
    FROM ${deps.qname('artists')} a
    WHERE (lower(a.artist_key) = $1 OR lower(a.slug) = $1)
      ${includeHidden ? '' : "AND a.status = 'published'"}
    LIMIT 1
  `, [key]);
  if (!result.rowCount) throw notFound();
  return result.rows[0];
}

async function optionalFollowState(event, artist, deps) {
  const account = await syncIdentity(event, deps, { required: false });
  if (!account) return false;
  const result = await deps.client.query(`
    SELECT 1 FROM ${deps.qname('user_follows')}
    WHERE user_id = $1 AND artist_key = $2
    LIMIT 1
  `, [account.user.id, artist.artist_key]);
  return Boolean(result.rowCount);
}

async function listArtists(event, deps, { includePrivate = false, allowedArtistIds = null } = {}) {
  const q = cleanText(event?.queryStringParameters?.q, 200).toLowerCase();
  const featuredOnly = bool(event?.queryStringParameters?.featured, false);
  const limit = parseLimit(event, 100, 500);
  const params = [];
  const filters = [];
  if (!includePrivate) filters.push(`a.status = 'published'`);
  if (featuredOnly) filters.push('a.featured = true');
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(lower(a.name) LIKE $${params.length} OR lower(a.artist_key) LIKE $${params.length} OR lower(a.slug) LIKE $${params.length})`);
  }
  if (Array.isArray(allowedArtistIds)) {
    if (!allowedArtistIds.length) return [];
    params.push(allowedArtistIds);
    filters.push(`a.id = ANY($${params.length}::text[])`);
  }
  params.push(limit);
  const result = await deps.client.query(`
    SELECT a.*,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} f WHERE f.artist_key = a.artist_key) AS follower_count,
      (SELECT COUNT(*)::int FROM ${deps.qname('song_artists')} sa WHERE sa.artist_id = a.id) AS song_count
    FROM ${deps.qname('artists')} a
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY a.featured DESC, lower(COALESCE(NULLIF(a.sort_name, ''), a.name)), a.created_at
    LIMIT $${params.length}
  `, params);
  return result.rows.map(row => publicArtist(row, { includePrivate }));
}

async function listArtistSongs(artist, deps) {
  const result = await deps.client.query(`
    SELECT s.*, sa.artist_role, sa.position AS artist_position, sa.display_credit
    FROM ${deps.qname('song_artists')} sa
    JOIN ${deps.qname('songs')} s ON s.song_key = sa.song_key
    WHERE sa.artist_id = $1
    ORDER BY sa.position, COALESCE(s.created_at, s.updated_at) DESC NULLS LAST, s.song_key
  `, [artist.id]);
  return result.rows;
}

async function listFollows(account, deps) {
  const result = await deps.client.query(`
    SELECT a.*,
      f.notifications_enabled,
      f.created_at AS followed_at,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} fx WHERE fx.artist_key = a.artist_key) AS follower_count,
      (SELECT COUNT(*)::int FROM ${deps.qname('song_artists')} sa WHERE sa.artist_id = a.id) AS song_count,
      true AS is_following
    FROM ${deps.qname('user_follows')} f
    JOIN ${deps.qname('artists')} a ON a.artist_key = f.artist_key
    WHERE f.user_id = $1
    ORDER BY f.created_at DESC
  `, [account.user.id]);
  return result.rows.map(row => ({ ...publicArtist(row), notifications_enabled: Boolean(row.notifications_enabled), followed_at: row.followed_at }));
}

async function followArtist(event, identifier, account, deps) {
  const artist = await resolveArtist(identifier, deps);
  const body = deps.parseBody(event);
  const notificationsEnabled = body.notifications_enabled === undefined ? true : bool(body.notifications_enabled, true);
  await deps.client.query(`
    INSERT INTO ${deps.qname('user_follows')} AS follow (
      user_id, artist_key, artist_name, artist_id, notifications_enabled, updated_at
    ) VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (user_id, artist_key) DO UPDATE SET
      artist_name = EXCLUDED.artist_name,
      artist_id = EXCLUDED.artist_id,
      notifications_enabled = EXCLUDED.notifications_enabled,
      updated_at = now()
  `, [account.user.id, artist.artist_key, artist.name, artist.id, notificationsEnabled]);
  await deps.client.query(`
    UPDATE ${deps.qname('notification_preferences')}
    SET artist_keys = CASE
      WHEN artist_keys ? $2 THEN artist_keys
      ELSE artist_keys || jsonb_build_array($2::text)
    END,
    updated_at = now()
    WHERE user_id = $1
  `, [account.user.id, artist.artist_key]);
  await audit(event, deps, account.user.id, 'artist_followed', { artist_key: artist.artist_key, notifications_enabled: notificationsEnabled });
  const refreshed = await resolveArtist(artist.artist_key, deps);
  refreshed.is_following = true;
  return publicArtist(refreshed);
}

async function unfollowArtist(event, identifier, account, deps) {
  const artist = await resolveArtist(identifier, deps);
  const result = await deps.client.query(`
    DELETE FROM ${deps.qname('user_follows')}
    WHERE user_id = $1 AND artist_key = $2
  `, [account.user.id, artist.artist_key]);
  if (!result.rowCount) throw notFound('Follow relationship not found.');
  await deps.client.query(`
    UPDATE ${deps.qname('notification_preferences')}
    SET artist_keys = COALESCE((
      SELECT jsonb_agg(value)
      FROM jsonb_array_elements_text(artist_keys) item(value)
      WHERE value <> $2
    ), '[]'::jsonb), updated_at = now()
    WHERE user_id = $1
  `, [account.user.id, artist.artist_key]);
  await audit(event, deps, account.user.id, 'artist_unfollowed', { artist_key: artist.artist_key });
  const refreshed = await resolveArtist(artist.artist_key, deps);
  refreshed.is_following = false;
  return publicArtist(refreshed);
}

async function listFollowDrivenNotifications(account, event, deps) {
  const limit = parseLimit(event, 50, 200);
  const result = await deps.client.query(`
    SELECT n.id, n.headline, n.message, n.category, n.image_url, n.action_label, n.action_url,
      n.priority, n.pinned, n.dismissible, n.audience_type, n.artist_keys, n.publish_at, n.expires_at,
      s.read_at, s.clicked_at, s.dismissed_at
    FROM ${deps.qname('notifications')} n
    LEFT JOIN ${deps.qname('user_notification_state')} s
      ON s.notification_id = n.id AND s.user_id = $1
    WHERE n.status = 'published'
      AND (n.publish_at IS NULL OR n.publish_at <= now())
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (
        n.audience_type = 'public'
        OR n.audience_type = 'all_registered_users'
        OR (n.audience_type = 'specific_users' AND n.target_user_ids ? $1)
        OR (n.audience_type = 'premium_members' AND EXISTS (
          SELECT 1 FROM ${deps.qname('user_roles')} r
          WHERE r.user_id = $1 AND r.role = 'premium_listener' AND r.status = 'approved'
        ))
        OR (n.audience_type = 'artist_followers' AND EXISTS (
          SELECT 1
          FROM ${deps.qname('user_follows')} f
          WHERE f.user_id = $1
            AND f.notifications_enabled = true
            AND n.artist_keys ? f.artist_key
        ))
      )
      AND s.dismissed_at IS NULL
    ORDER BY n.pinned DESC, n.priority DESC, n.publish_at DESC NULLS LAST, n.created_at DESC
    LIMIT $2
  `, [account.user.id, limit]);
  return result.rows;
}

async function adminContext(event, deps, { artist = null, requirePlatformAdmin = false } = {}) {
  const suppliedAdminToken = cleanText(deps.getHeader(event, 'x-admin-token'), 1000);
  if (suppliedAdminToken) {
    await deps.requireAdmin(event);
    return { mode: 'platform_admin', account: null, allowedArtistIds: null };
  }
  const account = await syncIdentity(event, deps, { required: true });
  if (account.roles.includes('administrator')) return { mode: 'platform_admin', account, allowedArtistIds: null };
  if (requirePlatformAdmin) throw forbidden('Only a Stashbox administrator can perform this action.');

  const grants = await deps.client.query(`
    SELECT DISTINCT a.id, a.artist_key, uaa.access_level
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
  `, [account.user.id]);
  const allowedArtistIds = grants.rows.map(row => row.id);
  if (artist) {
    const grant = grants.rows.find(row => row.id === artist.id);
    if (!grant) throw forbidden();
    const level = cleanText(grant.access_level || 'manager', 40).toLowerCase();
    if (!ARTIST_WRITE_LEVELS.has(level) && !account.roles.includes('label_staff')) throw forbidden('This assignment is view-only.');
  }
  return { mode: 'assigned_user', account, allowedArtistIds };
}

function artistInput(body, current = {}) {
  const name = Object.prototype.hasOwnProperty.call(body, 'name') ? cleanText(body.name, 220) : current.name;
  if (!name) throw badRequest('Artist name is required.');
  const requestedSlug = Object.prototype.hasOwnProperty.call(body, 'slug') ? slugifyArtist(body.slug || name) : (current.slug || slugifyArtist(name));
  const requestedKey = Object.prototype.hasOwnProperty.call(body, 'artist_key') || Object.prototype.hasOwnProperty.call(body, 'artistKey')
    ? slugifyArtist(body.artist_key ?? body.artistKey)
    : (current.artist_key || requestedSlug);
  const statusInput = cleanText(body.status ?? current.status ?? 'draft', 40).toLowerCase();
  return {
    artist_key: requestedKey,
    slug: requestedSlug,
    name,
    sort_name: cleanText(body.sort_name ?? body.sortName ?? current.sort_name ?? name, 220),
    profile_image_url: cleanText(body.profile_image_url ?? body.profileImageUrl ?? current.profile_image_url, 2000) || null,
    banner_image_url: cleanText(body.banner_image_url ?? body.bannerImageUrl ?? current.banner_image_url, 2000) || null,
    bio: cleanText(body.bio ?? current.bio, 12000),
    location: cleanText(body.location ?? current.location, 300),
    website_url: cleanText(body.website_url ?? body.websiteUrl ?? current.website_url, 2000) || null,
    spotify_url: cleanText(body.spotify_url ?? body.spotifyUrl ?? current.spotify_url, 2000) || null,
    apple_music_url: cleanText(body.apple_music_url ?? body.appleMusicUrl ?? current.apple_music_url, 2000) || null,
    youtube_url: cleanText(body.youtube_url ?? body.youtubeUrl ?? current.youtube_url, 2000) || null,
    instagram_url: cleanText(body.instagram_url ?? body.instagramUrl ?? current.instagram_url, 2000) || null,
    x_url: cleanText(body.x_url ?? body.xUrl ?? current.x_url, 2000) || null,
    facebook_url: cleanText(body.facebook_url ?? body.facebookUrl ?? current.facebook_url, 2000) || null,
    merch_url: cleanText(body.merch_url ?? body.merchUrl ?? current.merch_url, 2000) || null,
    verified: Object.prototype.hasOwnProperty.call(body, 'verified') ? bool(body.verified) : Boolean(current.verified),
    featured: Object.prototype.hasOwnProperty.call(body, 'featured') ? bool(body.featured) : Boolean(current.featured),
    status: ARTIST_STATUSES.has(statusInput) ? statusInput : 'draft',
    notes: cleanText(body.notes ?? current.notes, 5000),
    metadata: cleanJson(body.metadata ?? current.metadata)
  };
}

async function createArtist(event, deps, context) {
  if (context.mode !== 'platform_admin') throw forbidden('Only a Stashbox administrator can create artists.');
  const body = deps.parseBody(event);
  const input = artistInput(body);
  const id = crypto.randomUUID();
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('artists')} (
      id, artist_key, slug, name, sort_name, profile_image_url, banner_image_url, bio, location,
      website_url, spotify_url, apple_music_url, youtube_url, instagram_url, x_url, facebook_url,
      merch_url, verified, featured, status, notes, metadata, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23
    ) RETURNING *
  `, [
    id, input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url,
    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,
    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,
    input.status, input.notes, JSON.stringify(input.metadata), context.account?.user.id || 'admin-token'
  ]);
  await audit(event, deps, context.account?.user.id, 'artist_created', { artist_key: input.artist_key });
  return publicArtist(result.rows[0], { includePrivate: true });
}

async function updateArtist(event, artist, deps, context) {
  const body = deps.parseBody(event);
  const input = artistInput(body, artist);
  if (context.mode !== 'platform_admin') {
    input.artist_key = artist.artist_key;
    input.slug = artist.slug;
    input.verified = Boolean(artist.verified);
    input.featured = Boolean(artist.featured);
    input.status = artist.status;
  }
  const result = await deps.client.query(`
    UPDATE ${deps.qname('artists')} SET
      artist_key=$1, slug=$2, name=$3, sort_name=$4, profile_image_url=$5, banner_image_url=$6,
      bio=$7, location=$8, website_url=$9, spotify_url=$10, apple_music_url=$11, youtube_url=$12,
      instagram_url=$13, x_url=$14, facebook_url=$15, merch_url=$16, verified=$17, featured=$18,
      status=$19, notes=$20, metadata=$21::jsonb, updated_at=now()
    WHERE id=$22 RETURNING *
  `, [
    input.artist_key, input.slug, input.name, input.sort_name, input.profile_image_url, input.banner_image_url,
    input.bio, input.location, input.website_url, input.spotify_url, input.apple_music_url, input.youtube_url,
    input.instagram_url, input.x_url, input.facebook_url, input.merch_url, input.verified, input.featured,
    input.status, input.notes, JSON.stringify(input.metadata), artist.id
  ]);
  await deps.client.query(`UPDATE ${deps.qname('user_follows')} SET artist_key=$1, artist_name=$2, updated_at=now() WHERE artist_id=$3`, [input.artist_key, input.name, artist.id]);
  await deps.client.query(`UPDATE ${deps.qname('user_artist_access')} SET artist_key=$1, updated_at=now() WHERE artist_id=$2`, [input.artist_key, artist.id]);
  await audit(event, deps, context.account?.user.id, 'artist_updated', { artist_key: input.artist_key });
  return publicArtist(result.rows[0], { includePrivate: true });
}

async function replaceArtistSongs(event, artist, deps, context) {
  const body = deps.parseBody(event);
  const songKeys = cleanArray(body.song_keys ?? body.songKeys, 1000, 300);
  const roleInput = cleanText(body.artist_role ?? body.artistRole ?? 'primary', 40).toLowerCase();
  const role = SONG_ARTIST_ROLES.has(roleInput) ? roleInput : 'primary';
  const replace = body.replace === undefined ? true : bool(body.replace, true);
  await deps.client.query('BEGIN');
  try {
    if (replace) await deps.client.query(`DELETE FROM ${deps.qname('song_artists')} WHERE artist_id=$1 AND artist_role=$2`, [artist.id, role]);
    let position = 0;
    for (const songKey of songKeys) {
      const exists = await deps.client.query(`SELECT 1 FROM ${deps.qname('songs')} WHERE song_key=$1 LIMIT 1`, [songKey]);
      if (!exists.rowCount) throw badRequest(`Unknown song_key: ${songKey}`);
      await deps.client.query(`
        INSERT INTO ${deps.qname('song_artists')} (song_key, artist_id, artist_role, position, display_credit, updated_at)
        VALUES ($1,$2,$3,$4,$5,now())
        ON CONFLICT (song_key, artist_id, artist_role) DO UPDATE SET position=EXCLUDED.position, display_credit=EXCLUDED.display_credit, updated_at=now()
      `, [songKey, artist.id, role, position, cleanText(body.display_credit ?? body.displayCredit, 300)]);
      position += 1;
    }
    await deps.client.query('COMMIT');
  } catch (error) {
    await deps.client.query('ROLLBACK');
    throw error;
  }
  await audit(event, deps, context.account?.user.id, 'artist_songs_updated', { artist_key: artist.artist_key, song_count: songKeys.length, role, replace });
  return listArtistSongs(artist, deps);
}

async function listArtistAccess(artist, deps) {
  const result = await deps.client.query(`
    SELECT uaa.user_id, u.email, u.display_name, uaa.artist_key, uaa.access_level, uaa.status,
      uaa.permissions, uaa.approved_by, uaa.approved_at, uaa.created_at, uaa.updated_at
    FROM ${deps.qname('user_artist_access')} uaa
    JOIN ${deps.qname('users')} u ON u.id = uaa.user_id
    WHERE uaa.artist_id = $1 OR lower(uaa.artist_key) = lower($2)
    ORDER BY uaa.status, lower(u.display_name), lower(u.email)
  `, [artist.id, artist.artist_key]);
  return result.rows;
}

async function grantArtistAccess(event, artist, deps, context) {
  if (context.mode !== 'platform_admin') throw forbidden('Only a Stashbox administrator can grant artist access.');
  const body = deps.parseBody(event);
  const userIdInput = cleanText(body.user_id ?? body.userId, 200);
  const email = cleanEmail(body.email);
  const userResult = userIdInput
    ? await deps.client.query(`SELECT * FROM ${deps.qname('users')} WHERE id=$1 LIMIT 1`, [userIdInput])
    : await deps.client.query(`SELECT * FROM ${deps.qname('users')} WHERE lower(email)=$1 LIMIT 1`, [email]);
  if (!userResult.rowCount) throw notFound('User account not found. The user must create and verify an account first.');
  const levelInput = cleanText(body.access_level ?? body.accessLevel ?? 'editor', 40).toLowerCase();
  const accessLevel = ARTIST_ACCESS_LEVELS.has(levelInput) ? levelInput : 'editor';
  const status = cleanText(body.status ?? 'approved', 40).toLowerCase() === 'pending' ? 'pending' : 'approved';
  const user = userResult.rows[0];
  await deps.client.query(`
    INSERT INTO ${deps.qname('user_artist_access')} AS grant_row (
      user_id, artist_key, artist_id, access_level, status, permissions, approved_by, approved_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,CASE WHEN $5='approved' THEN now() ELSE NULL END,now())
    ON CONFLICT (user_id, artist_key) DO UPDATE SET
      artist_id=EXCLUDED.artist_id, access_level=EXCLUDED.access_level, status=EXCLUDED.status,
      permissions=EXCLUDED.permissions, approved_by=EXCLUDED.approved_by,
      approved_at=CASE WHEN EXCLUDED.status='approved' THEN now() ELSE grant_row.approved_at END,
      updated_at=now()
  `, [user.id, artist.artist_key, artist.id, accessLevel, status, JSON.stringify(cleanJson(body.permissions)), context.account?.user.id || 'admin-token']);
  const role = cleanText(body.role, 80).toLowerCase();
  if (['artist', 'band_manager', 'label_staff'].includes(role)) {
    await deps.client.query(`
      INSERT INTO ${deps.qname('user_roles')} (user_id, role, status, granted_by, approved_at)
      VALUES ($1,$2,'approved',$3,now())
      ON CONFLICT (user_id, role) DO UPDATE SET status='approved', granted_by=EXCLUDED.granted_by, approved_at=now(), updated_at=now()
    `, [user.id, role, context.account?.user.id || 'admin-token']);
  }
  await audit(event, deps, context.account?.user.id, 'artist_access_granted', { artist_key: artist.artist_key, user_id: user.id, access_level: accessLevel, role });
  return listArtistAccess(artist, deps);
}

function artistRouteParts(segments) {
  const index = segments.indexOf('artists');
  return index >= 0 ? segments.slice(index + 1) : [];
}

export function isArtistRequest(segments) {
  if (segments[0] !== 'radio') return false;
  if (segments[1] === 'artists') return true;
  if (segments[1] === 'me' && (segments[2] === 'follows' || segments[2] === 'artist-notifications' || segments[2] === 'artist-access')) return true;
  return segments[1] === 'admin' && segments[2] === 'artists';
}

export async function handleArtistRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  const segments = deps.getRouteSegments(event);
  await ensureArtistTables(deps);

  if (segments[1] === 'artists') {
    await enforceRateLimit({ client: deps.client, qname: deps.qname, event, scope: 'artist_public_read', limit: 900, windowSeconds: 15 * 60 });
    const parts = artistRouteParts(segments);
    if (!parts.length && method === 'GET') {
      const artists = await listArtists(event, deps);
      return deps.response(200, { success: true, artists, count: artists.length });
    }
    const artist = await resolveArtist(decodeURIComponent(parts[0] || ''), deps);
    if (method === 'GET' && parts[1] === 'songs') return deps.response(200, { success: true, artist: publicArtist(artist), songs: await listArtistSongs(artist, deps) });
    if (method === 'GET' && !parts[1]) {
      artist.is_following = await optionalFollowState(event, artist, deps);
      return deps.response(200, { success: true, artist: publicArtist(artist), songs: await listArtistSongs(artist, deps) });
    }
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  if (segments[1] === 'me') {
    const account = await syncIdentity(event, deps, { required: true });
    await enforceRateLimit({ client: deps.client, qname: deps.qname, event, identity: account.identity, scope: method === 'GET' ? 'artist_account_read' : 'artist_account_write', limit: method === 'GET' ? 600 : 180, windowSeconds: 15 * 60 });
    if (segments[2] === 'follows') {
      const identifier = segments[3] ? decodeURIComponent(segments[3]) : '';
      if (method === 'GET' && !identifier) return deps.response(200, { success: true, follows: await listFollows(account, deps) });
      if (method === 'POST' && identifier) return deps.response(200, { success: true, artist: await followArtist(event, identifier, account, deps) });
      if (method === 'DELETE' && identifier) return deps.response(200, { success: true, artist: await unfollowArtist(event, identifier, account, deps) });
    }
    if (segments[2] === 'artist-notifications' && method === 'GET') {
      const notifications = await listFollowDrivenNotifications(account, event, deps);
      return deps.response(200, { success: true, notifications, count: notifications.length });
    }
    if (segments[2] === 'artist-access' && method === 'GET') {
      const context = await adminContext(event, deps);
      const artists = await listArtists(event, deps, { includePrivate: true, allowedArtistIds: context.allowedArtistIds });
      return deps.response(200, { success: true, mode: context.mode, artists });
    }
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  if (segments[1] === 'admin' && segments[2] === 'artists') {
    await enforceRateLimit({ client: deps.client, qname: deps.qname, event, scope: 'artist_admin', limit: 600, windowSeconds: 15 * 60 });
    const identifier = segments[3] ? decodeURIComponent(segments[3]) : '';
    if (!identifier) {
      const context = await adminContext(event, deps, { requirePlatformAdmin: method === 'POST' });
      if (method === 'GET') return deps.response(200, { success: true, mode: context.mode, artists: await listArtists(event, deps, { includePrivate: true, allowedArtistIds: context.allowedArtistIds }) });
      if (method === 'POST') return deps.response(201, { success: true, artist: await createArtist(event, deps, context) });
      return deps.response(405, { success: false, error: 'Method not allowed.' });
    }

    const artist = await resolveArtist(identifier, deps, { includeHidden: true });
    const context = await adminContext(event, deps, { artist, requirePlatformAdmin: segments[4] === 'access' });
    if (method === 'GET' && !segments[4]) return deps.response(200, { success: true, mode: context.mode, artist: publicArtist(artist, { includePrivate: true }), songs: await listArtistSongs(artist, deps) });
    if (['PUT', 'PATCH'].includes(method) && !segments[4]) return deps.response(200, { success: true, artist: await updateArtist(event, artist, deps, context) });
    if (segments[4] === 'songs') {
      if (method === 'GET') return deps.response(200, { success: true, songs: await listArtistSongs(artist, deps) });
      if (['PUT', 'POST'].includes(method)) return deps.response(200, { success: true, songs: await replaceArtistSongs(event, artist, deps, context) });
    }
    if (segments[4] === 'access') {
      if (method === 'GET') return deps.response(200, { success: true, access: await listArtistAccess(artist, deps) });
      if (method === 'POST') return deps.response(200, { success: true, access: await grantArtistAccess(event, artist, deps, context) });
    }
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  throw unauthorized();
}
