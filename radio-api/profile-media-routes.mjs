import crypto from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

export function isProfileMediaUploadRequest(segments) {
  return segments[0] === 'radio' &&
    segments[1] === 'me' &&
    segments[2] === 'media' &&
    segments[3] === 'presign';
}

export async function handleProfileMediaUploadRequest(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  if (method !== 'POST') return deps.response(405, { success: false, error: 'Method not allowed.' });

  const identity = await deps.verifyIdentity(event, { required: true });
  if (!identity?.sub) throw routeError(401, 'AUTH_REQUIRED', 'Log in before uploading profile images.');

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
