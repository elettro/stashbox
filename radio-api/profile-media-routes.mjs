import crypto from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ensureAccountTables } from './account-routes.mjs';
import { enforceRateLimit } from './rate-limit.mjs';

const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const PROFILE_PURPOSES = new Set([
  'profile_image',
  'horizontal_banner',
  'vertical_banner'
]);

function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function hasOwn(object, ...keys) {
  return keys.some(key => Object.prototype.hasOwnProperty.call(object || {}, key));
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

export async function createImageUploadPresign({
  purpose,
  filename,
  contentType,
  sizeBytes,
  subjectPath,
  metadata = {}
}) {
  const normalizedPurpose = safeSegment(purpose, 'profile-image');
  const normalizedContentType = cleanText(contentType, 120).toLowerCase();
  const extension = IMAGE_TYPES.get(normalizedContentType);
  if (!extension) throw routeError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Use a JPG, PNG, or WEBP image.');

  const bytes = Number(sizeBytes || 0);
  if (bytes && (!Number.isFinite(bytes) || bytes < 1 || bytes > 10 * 1024 * 1024)) {
    throw routeError(400, 'IMAGE_TOO_LARGE', 'Image must be 10 MB or smaller.');
  }

  const bucket = uploadBucket();
  if (!bucket) throw routeError(500, 'UPLOAD_BUCKET_MISSING', 'The media upload bucket is not configured.');
  const region = uploadRegion();
  const originalName = safeSegment(filename, `image.${extension}`);
  const baseName = originalName.replace(/\.[a-z0-9]+$/i, '').slice(0, 90) || 'image';
  const key = [
    safeSegment(subjectPath, 'profiles'),
    normalizedPurpose,
    `${Date.now()}-${crypto.randomUUID()}-${baseName}.${extension}`
  ].join('/');

  const client = new S3Client({ region });
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: normalizedContentType,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: Object.fromEntries(
      Object.entries(metadata)
        .map(([name, value]) => [safeSegment(name, 'meta').slice(0, 60), cleanText(value, 400)])
        .filter(([, value]) => value)
    )
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  return {
    upload_url: uploadUrl,
    public_url: publicObjectUrl(bucket, region, key),
    method: 'PUT',
    headers: { 'Content-Type': normalizedContentType },
    key,
    purpose: normalizedPurpose,
    expires_in: 900
  };
}

async function syncProfileAccount(identity, deps) {
  await ensureAccountTables(deps);
  const email = cleanEmail(identity.email);
  const displayName = cleanText(identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'), 120) || 'Listener';
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub) DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      display_name = CASE WHEN account_user.display_name = '' THEN EXCLUDED.display_name ELSE account_user.display_name END,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [crypto.randomUUID(), identity.sub, email, Boolean(identity.emailVerified), displayName]);
  const account = result.rows[0];
  if (!account || account.status !== 'active') {
    throw routeError(403, 'ACCOUNT_UNAVAILABLE', 'This Stashbox Radio account is disabled or unavailable.');
  }
  await deps.client.query(`INSERT INTO ${deps.qname('user_preferences')} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [account.id]);
  return account;
}

function listenerMediaPayload(row = {}) {
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return {
    profile_image_url: cleanText(settings.profile_image_url || settings.avatar_url, 2000),
    horizontal_banner_image_url: cleanText(settings.horizontal_banner_image_url || settings.banner_url, 2000),
    vertical_banner_image_url: cleanText(settings.vertical_banner_image_url || settings.vertical_banner_url, 2000),
    updated_at: row.updated_at || null
  };
}

async function readListenerMedia(account, deps) {
  const result = await deps.client.query(`
    SELECT settings, updated_at
    FROM ${deps.qname('user_preferences')}
    WHERE user_id = $1
    LIMIT 1
  `, [account.id]);
  return listenerMediaPayload(result.rows[0] || {});
}

async function patchListenerMedia(event, identity, account, deps) {
  await enforceRateLimit({
    client: deps.client,
    qname: deps.qname,
    event,
    identity,
    scope: 'profile_media_write',
    limit: 120,
    windowSeconds: 15 * 60
  });

  const body = deps.parseBody(event);
  const profilePresent = hasOwn(body, 'profile_image_url', 'avatar_url', 'profileImageUrl', 'avatarUrl');
  const horizontalPresent = hasOwn(body, 'horizontal_banner_image_url', 'banner_url', 'horizontalBannerImageUrl', 'bannerUrl');
  const verticalPresent = hasOwn(body, 'vertical_banner_image_url', 'vertical_banner_url', 'verticalBannerImageUrl', 'verticalBannerUrl');
  if (!profilePresent && !horizontalPresent && !verticalPresent) {
    throw routeError(400, 'MEDIA_FIELDS_REQUIRED', 'Provide profile_image_url, horizontal_banner_image_url, or vertical_banner_image_url.');
  }

  const patch = {};
  if (profilePresent) {
    const value = cleanText(body.profile_image_url ?? body.avatar_url ?? body.profileImageUrl ?? body.avatarUrl, 2000);
    patch.profile_image_url = value;
    patch.avatar_url = value;
  }
  if (horizontalPresent) {
    const value = cleanText(body.horizontal_banner_image_url ?? body.banner_url ?? body.horizontalBannerImageUrl ?? body.bannerUrl, 2000);
    patch.horizontal_banner_image_url = value;
    patch.banner_url = value;
  }
  if (verticalPresent) {
    const value = cleanText(body.vertical_banner_image_url ?? body.vertical_banner_url ?? body.verticalBannerImageUrl ?? body.verticalBannerUrl, 2000);
    patch.vertical_banner_image_url = value;
    patch.vertical_banner_url = value;
  }

  const result = await deps.client.query(`
    UPDATE ${deps.qname('user_preferences')}
    SET settings = settings || $1::jsonb, updated_at = now()
    WHERE user_id = $2
    RETURNING settings, updated_at
  `, [JSON.stringify(patch), account.id]);
  if (!result.rowCount) throw routeError(404, 'PROFILE_PREFERENCES_NOT_FOUND', 'Profile preferences were not found.');

  await deps.client.query(`
    INSERT INTO ${deps.qname('account_audit_log')} (actor_user_id, target_user_id, action, details)
    VALUES ($1, $1, 'profile_media_updated', $2::jsonb)
  `, [account.id, JSON.stringify({ fields: Object.keys(patch).filter(key => key.endsWith('_image_url')) })]);

  return listenerMediaPayload(result.rows[0]);
}

export function isProfileMediaUploadRequest(segments) {
  return segments[0] === 'radio' &&
    segments[1] === 'me' &&
    segments[2] === 'media' &&
    (segments.length === 3 || (segments.length === 4 && segments[3] === 'presign'));
}

export async function handleProfileMediaUploadRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  const segments = deps.getRouteSegments(event);
  const identity = await deps.verifyIdentity(event, { required: true });
  if (!identity?.sub) throw routeError(401, 'AUTH_REQUIRED', 'Log in before managing profile images.');
  const account = await syncProfileAccount(identity, deps);
  const isPresign = segments[3] === 'presign';

  if (!isPresign && method === 'GET') {
    return deps.response(200, { success: true, media: await readListenerMedia(account, deps) });
  }

  if (!isPresign && method === 'PATCH') {
    const media = await patchListenerMedia(event, identity, account, deps);
    return deps.response(200, { success: true, persisted: true, media });
  }

  if (isPresign && method === 'POST') {
    await enforceRateLimit({
      client: deps.client,
      qname: deps.qname,
      event,
      identity,
      scope: 'profile_media_upload',
      limit: 60,
      windowSeconds: 15 * 60
    });

    const body = deps.parseBody(event);
    const purpose = cleanText(body.purpose, 80).toLowerCase();
    if (!PROFILE_PURPOSES.has(purpose)) {
      throw routeError(400, 'INVALID_MEDIA_PURPOSE', 'Choose profile_image, horizontal_banner, or vertical_banner.');
    }

    const subjectHash = crypto.createHash('sha256').update(identity.sub).digest('hex').slice(0, 24);
    const upload = await createImageUploadPresign({
      purpose,
      filename: body.filename,
      contentType: body.content_type || body.contentType,
      sizeBytes: body.size_bytes || body.sizeBytes,
      subjectPath: `user-profiles/${subjectHash}`,
      metadata: {
        owner: subjectHash,
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
    allowed: ['GET /radio/me/media', 'PATCH /radio/me/media', 'POST /radio/me/media/presign']
  });
}
