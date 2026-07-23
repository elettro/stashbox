import { createImageUploadPresign } from './profile-media-routes.mjs';
import { enforceRateLimit } from './rate-limit.mjs';

const WRITE_LEVELS = new Set(['editor', 'manager', 'owner']);
let verticalColumnEnsured = false;

function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function routeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function notFound(message = 'Artist not found.') {
  return routeError(404, 'NOT_FOUND', message);
}

function forbidden(message = 'You do not have permission to manage this artist.') {
  return routeError(403, 'FORBIDDEN', message);
}

async function ensureVerticalColumn(deps) {
  if (verticalColumnEnsured) return;
  await deps.client.query(`ALTER TABLE ${deps.qname('artists')} ADD COLUMN IF NOT EXISTS vertical_banner_image_url TEXT`);
  verticalColumnEnsured = true;
}

async function resolveArtist(identifier, deps, { includeHidden = false } = {}) {
  const key = cleanText(identifier, 220).toLowerCase();
  if (!key) throw notFound();
  await ensureVerticalColumn(deps);
  const result = await deps.client.query(`
    SELECT * FROM ${deps.qname('artists')}
    WHERE (lower(artist_key) = $1 OR lower(slug) = $1)
      ${includeHidden ? '' : "AND status = 'published'"}
    LIMIT 1
  `, [key]);
  if (!result.rowCount) throw notFound();
  return result.rows[0];
}

function mediaPayload(artist) {
  return {
    artist_key: artist.artist_key,
    slug: artist.slug,
    profile_image_url: artist.profile_image_url || '',
    horizontal_banner_image_url: artist.banner_image_url || '',
    vertical_banner_image_url: artist.vertical_banner_image_url || '',
    updated_at: artist.updated_at
  };
}

async function accountForIdentity(identity, deps) {
  if (!identity?.sub) return null;
  const result = await deps.client.query(`
    SELECT * FROM ${deps.qname('users')}
    WHERE cognito_sub = $1 AND status = 'active'
    LIMIT 1
  `, [identity.sub]);
  return result.rows[0] || null;
}

async function authorizeArtistAdmin(event, artist, deps, { write = false } = {}) {
  const suppliedAdminToken = cleanText(deps.getHeader(event, 'x-admin-token'), 1000);
  if (suppliedAdminToken) {
    await deps.requireAdmin(event);
    return { mode: 'platform_admin', identity: null, account: null };
  }

  const identity = await deps.verifyIdentity(event, { required: true });
  const account = await accountForIdentity(identity, deps);
  if (!account) throw forbidden('This account must be created in Stashbox Radio before managing artist media.');

  const roleResult = await deps.client.query(`
    SELECT role FROM ${deps.qname('user_roles')}
    WHERE user_id = $1 AND status = 'approved'
  `, [account.id]);
  const roles = new Set(roleResult.rows.map(row => row.role));
  if (roles.has('administrator')) return { mode: 'platform_admin', identity, account };

  const directGrant = await deps.client.query(`
    SELECT access_level FROM ${deps.qname('user_artist_access')}
    WHERE user_id = $1
      AND status = 'approved'
      AND (artist_id = $2 OR lower(artist_key) = lower($3))
    LIMIT 1
  `, [account.id, artist.id, artist.artist_key]);

  const labelGrant = await deps.client.query(`
    SELECT ula.access_level
    FROM ${deps.qname('label_artists')} la
    JOIN ${deps.qname('user_label_access')} ula ON ula.label_id = la.label_id
    WHERE la.artist_id = $1
      AND ula.user_id = $2
      AND ula.status = 'approved'
    LIMIT 1
  `, [artist.id, account.id]);

  const accessLevel = cleanText(directGrant.rows[0]?.access_level || labelGrant.rows[0]?.access_level || 'viewer', 40).toLowerCase();
  if (!directGrant.rowCount && !labelGrant.rowCount) throw forbidden();
  if (write && !WRITE_LEVELS.has(accessLevel) && !roles.has('label_staff')) {
    throw forbidden('This artist assignment is view-only.');
  }
  return { mode: 'assigned_user', identity, account, accessLevel };
}

export function isArtistProfileMediaRequest(segments) {
  const publicRoute = segments[0] === 'radio' &&
    segments[1] === 'artists' &&
    Boolean(segments[2]) &&
    segments[3] === 'media';
  const adminRoute = segments[0] === 'radio' &&
    segments[1] === 'admin' &&
    segments[2] === 'artists' &&
    Boolean(segments[3]) &&
    segments[4] === 'media';
  return publicRoute || adminRoute;
}

export async function handleArtistProfileMediaRequest(event, deps) {
  const segments = deps.getRouteSegments(event);
  const method = deps.getMethod(event).toUpperCase();
  const isAdmin = segments[1] === 'admin';
  const identifier = decodeURIComponent(isAdmin ? segments[3] : segments[2]);
  // Accept both /media/presign and POST /media. The alias prevents an API
  // Gateway path-normalization difference from turning a valid upload into 405.
  const isPresign = isAdmin && (
    segments[5] === 'presign' ||
    (segments.length === 5 && method === 'POST')
  );

  if (!isAdmin) {
    if (method !== 'GET') return deps.response(405, { success: false, error: 'Method not allowed.' });
    const artist = await resolveArtist(identifier, deps, { includeHidden: false });
    return deps.response(200, { success: true, media: mediaPayload(artist) });
  }

  const artist = await resolveArtist(identifier, deps, { includeHidden: true });

  if (method === 'GET' && !isPresign) {
    await authorizeArtistAdmin(event, artist, deps, { write: false });
    return deps.response(200, { success: true, media: mediaPayload(artist) });
  }

  if (method === 'PATCH' && !isPresign) {
    const auth = await authorizeArtistAdmin(event, artist, deps, { write: true });
    if (auth.identity) {
      await enforceRateLimit({
        client: deps.client,
        qname: deps.qname,
        event,
        identity: auth.identity,
        scope: 'artist_media_write',
        limit: 120,
        windowSeconds: 15 * 60
      });
    }
    const body = deps.parseBody(event);
    const verticalUrl = cleanText(
      body.vertical_banner_image_url ?? body.verticalBannerImageUrl,
      2000
    ) || null;
    const result = await deps.client.query(`
      UPDATE ${deps.qname('artists')}
      SET vertical_banner_image_url = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `, [verticalUrl, artist.id]);
    return deps.response(200, { success: true, media: mediaPayload(result.rows[0]) });
  }

  if (method === 'POST' && isPresign) {
    const auth = await authorizeArtistAdmin(event, artist, deps, { write: true });
    if (auth.identity) {
      await enforceRateLimit({
        client: deps.client,
        qname: deps.qname,
        event,
        identity: auth.identity,
        scope: 'artist_media_upload',
        limit: 90,
        windowSeconds: 15 * 60
      });
    }
    const body = deps.parseBody(event);
    const purpose = cleanText(body.purpose, 80).toLowerCase();
    if (!['profile_image', 'horizontal_banner', 'vertical_banner'].includes(purpose)) {
      throw routeError(400, 'INVALID_MEDIA_PURPOSE', 'Choose profile_image, horizontal_banner, or vertical_banner.');
    }
    const upload = await createImageUploadPresign({
      purpose,
      filename: body.filename,
      contentType: body.content_type || body.contentType,
      sizeBytes: body.size_bytes || body.sizeBytes,
      subjectPath: `artist-profiles/${artist.artist_key}`,
      metadata: {
        artist_key: artist.artist_key,
        media_purpose: purpose
      }
    });
    return deps.response(200, { success: true, ...upload });
  }

  return deps.response(405, {
    success: false,
    error: 'Method not allowed.',
    method,
    route: segments.join('/'),
    allowed: ['GET /media', 'PATCH /media', 'POST /media/presign']
  });
}
