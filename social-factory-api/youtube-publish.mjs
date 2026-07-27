import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 15 * 60;
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm'
]);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) {
    error.details = details;
  }
  return error;
}

function getHeader(event, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(event?.headers || {})) {
    if (String(key).toLowerCase() === target) {
      return String(value || '');
    }
  }
  return '';
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertAdmin(event, config) {
  const supplied = getHeader(event, 'x-admin-token');
  if (!supplied || !timingSafeEqualText(supplied, config.admin_token)) {
    throw serviceError('unauthorized', 401);
  }
}

function parseBody(event = {}) {
  if (!event.body) {
    return {};
  }

  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : String(event.body);

  try {
    return JSON.parse(text);
  } catch {
    throw serviceError('invalid_json_body', 400);
  }
}

function normalizeContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function safeFileName(value) {
  const cleaned = String(value || 'video.mp4')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

  return cleaned || 'video.mp4';
}

function validateUploadInput(body, maxBytes) {
  const contentType = normalizeContentType(body.content_type);
  const sizeBytes = Number(body.size_bytes);

  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    throw serviceError('unsupported_video_type', 422, {
      allowed_content_types: [...ALLOWED_VIDEO_TYPES]
    });
  }

  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw serviceError('invalid_video_size', 422, {
      max_bytes: maxBytes
    });
  }

  return {
    contentType,
    sizeBytes,
    fileName: safeFileName(body.file_name)
  };
}

function validatePublishMetadata(body = {}) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 30)
    : [];

  if (!title || title.length > 100) {
    throw serviceError('invalid_youtube_title', 422, {
      max_characters: 100
    });
  }

  if (description.length > 5000) {
    throw serviceError('invalid_youtube_description', 422, {
      max_characters: 5000
    });
  }

  return {
    title,
    description,
    tags,
    categoryId: String(body.category_id || '10'),
    madeForKids: Boolean(body.made_for_kids),
    notifySubscribers: Boolean(body.notify_subscribers)
  };
}

function assertStagingObjectKey(value) {
  const objectKey = String(value || '');
  if (!objectKey.startsWith('incoming/') || objectKey.includes('..')) {
    throw serviceError('invalid_staging_object_key', 422);
  }
  return objectKey;
}

function accessTokenStillValid(tokens = {}, now = Date.now()) {
  if (!tokens.access_token || !tokens.access_token_expires_at) {
    return false;
  }
  const expiresAt = Date.parse(tokens.access_token_expires_at);
  return Number.isFinite(expiresAt) && expiresAt - now > 120_000;
}

async function refreshAccessToken({ fetchImpl, config, tokens, now }) {
  if (!tokens.refresh_token) {
    throw serviceError('youtube_not_connected', 409);
  }

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw serviceError(
      payload?.error_description || payload?.error || 'youtube_token_refresh_failed',
      502
    );
  }

  return {
    ...tokens,
    access_token: payload.access_token,
    access_token_expires_at: new Date(now + Number(payload.expires_in || 3600) * 1000).toISOString(),
    token_type: payload.token_type || 'Bearer',
    scope: payload.scope || tokens.scope,
    last_verified_at: new Date(now).toISOString()
  };
}

export function createAwsStagingStore({ bucketName = process.env.SOCIAL_PUBLISH_BUCKET } = {}) {
  let sdkPromise;
  let presignerPromise;
  let clientPromise;

  if (!bucketName) {
    throw new Error('social_publish_bucket_missing');
  }

  async function getSdk() {
    if (!sdkPromise) {
      sdkPromise = import('@aws-sdk/client-s3');
    }
    return sdkPromise;
  }

  async function getPresigner() {
    if (!presignerPromise) {
      presignerPromise = import('@aws-sdk/s3-request-presigner');
    }
    return presignerPromise;
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = getSdk().then(({ S3Client }) => new S3Client({}));
    }
    return clientPromise;
  }

  return {
    bucketName,

    async createUploadUrl({ objectKey, contentType, sizeBytes }) {
      const [{ PutObjectCommand }, { getSignedUrl }, client] = await Promise.all([
        getSdk(),
        getPresigner(),
        getClient()
      ]);
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: contentType,
        Metadata: {
          expected_size_bytes: String(sizeBytes),
          source: 'stashbox-social-factory-dev'
        }
      });
      return getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    },

    async head(objectKey) {
      const [{ HeadObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      return client.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }));
    },

    async read(objectKey) {
      const [{ GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      return client.send(new GetObjectCommand({ Bucket: bucketName, Key: objectKey }));
    }
  };
}

export function createYoutubePublishService({
  secretStore = createAwsSecretStore(),
  stagingStore = createAwsStagingStore(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  tokenSecretId = process.env.YOUTUBE_OAUTH_TOKEN_SECRET,
  maxUploadBytes = Number(process.env.SOCIAL_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES)
} = {}) {
  if (!fetchImpl) {
    throw new Error('fetch_unavailable');
  }

  async function loadConfig() {
    if (!configSecretId) {
      throw new Error('youtube_oauth_config_secret_missing');
    }
    return secretStore.read(configSecretId);
  }

  async function loadTokens() {
    if (!tokenSecretId) {
      throw new Error('youtube_oauth_token_secret_missing');
    }
    return secretStore.read(tokenSecretId);
  }

  async function getAccessContext(config) {
    let tokens = await loadTokens();
    if (!tokens.refresh_token || !tokens.channel_id) {
      throw serviceError('youtube_not_connected', 409);
    }

    if (!accessTokenStillValid(tokens, now())) {
      tokens = await refreshAccessToken({
        fetchImpl,
        config,
        tokens,
        now: now()
      });
      await secretStore.write(tokenSecretId, tokens);
    }

    return tokens;
  }

  return {
    async presign(event) {
      const config = await loadConfig();
      assertAdmin(event, config);
      const input = validateUploadInput(parseBody(event), maxUploadBytes);
      const datePrefix = new Date(now()).toISOString().slice(0, 10);
      const objectKey = `incoming/${datePrefix}/${randomUUID()}-${input.fileName}`;
      const uploadUrl = await stagingStore.createUploadUrl({
        objectKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes
      });

      return {
        object_key: objectKey,
        upload_url: uploadUrl,
        upload_method: 'PUT',
        required_headers: {
          'Content-Type': input.contentType,
          'x-amz-meta-expected_size_bytes': String(input.sizeBytes),
          'x-amz-meta-source': 'stashbox-social-factory-dev'
        },
        expires_in_seconds: PRESIGN_TTL_SECONDS,
        max_upload_bytes: maxUploadBytes
      };
    },

    async publish(event) {
      const config = await loadConfig();
      assertAdmin(event, config);
      const body = parseBody(event);
      const objectKey = assertStagingObjectKey(body.object_key);
      const metadata = validatePublishMetadata(body);
      const object = await stagingStore.head(objectKey);
      const contentType = normalizeContentType(object.ContentType);
      const contentLength = Number(object.ContentLength || 0);

      if (!ALLOWED_VIDEO_TYPES.has(contentType) || contentLength <= 0 || contentLength > maxUploadBytes) {
        throw serviceError('invalid_staged_video', 422, {
          content_type: contentType || null,
          content_length: contentLength,
          max_bytes: maxUploadBytes
        });
      }

      const tokens = await getAccessContext(config);
      const validation = {
        ready: true,
        channel_id: tokens.channel_id,
        channel_name: tokens.channel_name,
        object_key: objectKey,
        content_type: contentType,
        content_length: contentLength,
        privacy_status: 'unlisted',
        title: metadata.title
      };

      if (body.confirm_upload !== true) {
        return {
          uploaded: false,
          mode: 'validation_only',
          ...validation
        };
      }

      const initUrl = new URL(YOUTUBE_UPLOAD_URL);
      initUrl.searchParams.set('uploadType', 'resumable');
      initUrl.searchParams.set('part', 'snippet,status');
      initUrl.searchParams.set('notifySubscribers', String(metadata.notifySubscribers));

      const initResponse = await fetchImpl(initUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Upload-Content-Length': String(contentLength),
          'X-Upload-Content-Type': contentType
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId
          },
          status: {
            privacyStatus: 'unlisted',
            selfDeclaredMadeForKids: metadata.madeForKids
          }
        })
      });

      if (!initResponse.ok) {
        const payload = await initResponse.json().catch(() => ({}));
        throw serviceError(payload?.error?.message || 'youtube_upload_session_failed', 502);
      }

      const sessionUrl = initResponse.headers.get('location');
      if (!sessionUrl) {
        throw serviceError('youtube_upload_session_missing', 502);
      }

      const source = await stagingStore.read(objectKey);
      if (!source.Body) {
        throw serviceError('staged_video_body_missing', 500);
      }

      const uploadResponse = await fetchImpl(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength)
        },
        body: source.Body,
        duplex: 'half'
      });
      const uploaded = await uploadResponse.json().catch(() => ({}));

      if (!uploadResponse.ok || !uploaded.id) {
        throw serviceError(uploaded?.error?.message || 'youtube_video_upload_failed', 502);
      }

      return {
        uploaded: true,
        mode: 'unlisted_upload',
        ...validation,
        youtube_video_id: uploaded.id,
        youtube_url: `https://www.youtube.com/watch?v=${uploaded.id}`
      };
    }
  };
}
