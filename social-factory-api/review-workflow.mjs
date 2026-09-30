import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const DEFAULT_RADIO_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const EXPECTED_RADIO_API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
const REVIEW_PREFIX = 'drafts/';
const VIDEO_PREFIX = 'incoming/render-jobs/';
const CHATGPT_IMPORT_PREFIX = 'incoming/chatgpt-imports/';
const CHATGPT_IMPORT_STATUS_PREFIX = 'imports/chatgpt/';
const DEFAULT_YOUTUBE_PLAYLIST_TITLE = 'Stashbox Radio - Video Library - Stashbox';
const VIDEO_UPLOAD_TTL_SECONDS = 15 * 60;
const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const MAX_CHATGPT_ATTACHMENTS = 10;
const YOUTUBE_ASPECT_RATIOS = new Set(['9:16', '16:9']);
const DEFAULT_COLLABORATORS = Object.freeze([{
  name: 'Elettro TV',
  youtube_handle: '@Elettrotv',
  channel_id: '',
  credit: 'Collaborator'
}]);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function getHeader(event, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(event?.headers || {})) {
    if (String(key).toLowerCase() === target) return String(value || '');
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
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : String(event.body);
  try {
    return JSON.parse(text);
  } catch {
    throw serviceError('invalid_json_body', 400);
  }
}

function validateBridgeConfig(config = {}) {
  const baseUrl = String(config.radio_api_base_url || DEFAULT_RADIO_API_BASE).trim().replace(/\/$/, '');
  const adminToken = String(config.radio_api_admin_token || '').trim();
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw serviceError('radio_api_bridge_invalid_base_url', 500);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== EXPECTED_RADIO_API_HOST ||
    parsed.pathname.replace(/\/$/, '') !== '/dev' ||
    parsed.search ||
    parsed.hash
  ) {
    throw serviceError('radio_api_bridge_invalid_base_url', 500);
  }

  if (!adminToken || adminToken === 'REPLACE_RADIO_DEV_ADMIN_TOKEN') {
    throw serviceError('radio_api_bridge_not_configured', 409);
  }

  return { baseUrl, adminToken };
}

function normalizeSongList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function safeId(value, label = 'id') {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(text)) {
    throw serviceError(`invalid_${label}`, 422);
  }
  return text;
}

function safeFileName(value) {
  const cleaned = String(value || 'video.mp4')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
  return cleaned || 'video.mp4';
}

function validateVideoImportInput(body, maxBytes) {
  if (!String(body.file_name || '').trim()) {
    throw serviceError('invalid_video_import', 422, { required: ['file_name'] });
  }
  const fileName = safeFileName(body.file_name);
  const sizeBytes = Number(body.size_bytes);
  if (!fileName.toLowerCase().endsWith('.mp4')) {
    throw serviceError('unsupported_video_type', 422, { allowed_content_types: ['video/mp4'] });
  }
  if (
    String(body.content_type || '').split(';')[0].trim().toLowerCase() !== 'video/mp4' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maxBytes
  ) {
    throw serviceError('invalid_video_import', 422, {
      allowed_content_types: ['video/mp4'],
      max_bytes: maxBytes
    });
  }
  const title = String(body.title || fileName.replace(/\.mp4$/i, '')).trim();
  if (!title || title.length > 100) {
    throw serviceError('invalid_video_title', 422, { max_characters: 100 });
  }
  const aspectRatio = String(body.aspect_ratio || '').trim();
  if (aspectRatio && !YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
    throw serviceError('invalid_video_aspect_ratio', 422, {
      allowed: [...YOUTUBE_ASPECT_RATIOS]
    });
  }
  return { fileName, sizeBytes, title, aspectRatio };
}

function safeImportId(value) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw serviceError('invalid_import_id', 422);
  }
  return text.toLowerCase();
}

function isTrustedChatGptFileHost(hostname) {
  return hostname.endsWith('.oaiusercontent.com');
}

function validateChatGptAttachments(value, { currentTime = Date.now(), allowExpired = false } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CHATGPT_ATTACHMENTS) {
    throw serviceError('invalid_chatgpt_attachments', 422, {
      minimum: 1,
      maximum: MAX_CHATGPT_ATTACHMENTS
    });
  }
  return value.map((attachment, index) => {
    const id = String(attachment?.id || '').trim();
    const suppliedFileName = safeFileName(attachment?.name);
    const fileName = suppliedFileName.toLowerCase().endsWith('.mp4')
      ? suppliedFileName
      : `${suppliedFileName}.mp4`;
    let downloadUrl;
    try {
      downloadUrl = new URL(String(attachment?.download_link || ''));
    } catch {
      throw serviceError('invalid_chatgpt_attachment', 422, {
        file_index: index,
        failed_rules: ['download_link_url']
      });
    }
    const expiresAt = Date.parse(downloadUrl.searchParams.get('se') || '');
    const signedReadUrl = downloadUrl.searchParams.get('sp') === 'r' &&
      downloadUrl.searchParams.get('sr') === 'b' &&
      Boolean(downloadUrl.searchParams.get('sv')) &&
      Boolean(downloadUrl.searchParams.get('sig'));
    const failedRules = [];
    if (!/^file[-_][a-zA-Z0-9_-]{8,200}$/.test(id)) failedRules.push('id_format');
    if (String(attachment?.mime_type || '').split(';')[0].trim().toLowerCase() !== 'video/mp4') {
      failedRules.push('mime_type');
    }
    if (downloadUrl.protocol !== 'https:') failedRules.push('download_link_protocol');
    if (!isTrustedChatGptFileHost(downloadUrl.hostname)) failedRules.push('download_link_host');
    if (downloadUrl.port || downloadUrl.username || downloadUrl.password || downloadUrl.hash) {
      failedRules.push('download_link_authority_or_fragment');
    }
    const hasFileIdPath = downloadUrl.pathname === `/${id}`;
    const hasRawUuidPath = /^\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/raw$/i
      .test(downloadUrl.pathname);
    if (!hasFileIdPath && !hasRawUuidPath) {
      failedRules.push('download_link_path');
    }
    if (!signedReadUrl) failedRules.push('download_link_signature');
    if (!Number.isFinite(expiresAt)) failedRules.push('download_link_expiry');
    else if (!allowExpired && expiresAt <= currentTime) failedRules.push('download_link_expired');
    if (failedRules.length) {
      throw serviceError('invalid_chatgpt_attachment', 422, {
        file_index: index,
        failed_rules: failedRules
      });
    }
    return { id, fileName, downloadUrl: downloadUrl.toString() };
  });
}

function createMp4VerificationStream(maxBytes, expectedBytes = null) {
  let totalBytes = 0;
  let prefix = Buffer.alloc(0);
  let contentSha256 = '';
  const hash = crypto.createHash('sha256');
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes || (expectedBytes != null && totalBytes > expectedBytes)) {
        callback(serviceError('uploaded_video_size_mismatch', 422, {
          max_bytes: maxBytes,
          expected_size_bytes: expectedBytes,
          actual_size_bytes: totalBytes
        }));
        return;
      }
      if (prefix.length < 12) prefix = Buffer.concat([prefix, buffer]).subarray(0, 12);
      if (prefix.length >= 8 && prefix.toString('ascii', 4, 8) !== 'ftyp') {
        callback(serviceError('uploaded_file_is_not_mp4', 422));
        return;
      }
      hash.update(buffer);
      callback(null, buffer);
    },
    flush(callback) {
      if (expectedBytes != null && totalBytes !== expectedBytes) {
        callback(serviceError('uploaded_video_size_mismatch', 422, {
          expected_size_bytes: expectedBytes,
          actual_size_bytes: totalBytes
        }));
        return;
      }
      if (totalBytes <= 0 || prefix.length < 12 || prefix.toString('ascii', 4, 8) !== 'ftyp') {
        callback(serviceError('uploaded_file_is_not_mp4', 422));
        return;
      }
      contentSha256 = hash.digest('hex');
      callback();
    }
  });
  return {
    stream,
    get contentSha256() { return contentSha256; }
  };
}

async function hashAndVerifyMp4(body, expectedBytes) {
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw serviceError('uploaded_video_unreadable', 422);
  }
  const hash = crypto.createHash('sha256');
  let totalBytes = 0;
  let prefix = Buffer.alloc(0);
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    if (prefix.length < 12) prefix = Buffer.concat([prefix, buffer]).subarray(0, 12);
    totalBytes += buffer.length;
    if (totalBytes > expectedBytes) {
      throw serviceError('uploaded_video_size_mismatch', 422, {
        expected_size_bytes: expectedBytes,
        actual_size_bytes: totalBytes
      });
    }
    hash.update(buffer);
  }
  if (totalBytes !== expectedBytes) {
    throw serviceError('uploaded_video_size_mismatch', 422, {
      expected_size_bytes: expectedBytes,
      actual_size_bytes: totalBytes
    });
  }
  if (prefix.length < 12 || prefix.toString('ascii', 4, 8) !== 'ftyp') {
    throw serviceError('uploaded_file_is_not_mp4', 422);
  }
  return hash.digest('hex');
}

function parseS3Uri(value) {
  const text = String(value || '').trim();
  const match = text.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) throw serviceError('render_output_s3_uri_required', 409);
  const bucket = match[1];
  const key = match[2];
  if (!bucket || !key || key.includes('..') || !key.startsWith('video-factory/')) {
    throw serviceError('render_output_s3_uri_invalid', 409);
  }
  return { bucket, key };
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function titleLimit(value) {
  const text = String(value || '').trim();
  return text.length <= 100 ? text : `${text.slice(0, 97).trim()}...`;
}

function hashtag(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim();
}

function buildLinkLines(song = {}) {
  const links = [
    ['Stashbox Radio', song.official_song_page_url || song.officialSongPageUrl],
    ['Spotify', song.spotify_url || song.spotifyUrl],
    ['Apple Music', song.apple_music_url || song.appleMusicUrl],
    ['YouTube Music', song.youtube_music_url || song.youtubeMusicUrl],
    ['Shop', song.shop_url || song.shopUrl]
  ].filter(([, url]) => String(url || '').trim());
  return links.map(([label, url]) => `${label}: ${String(url).trim()}`);
}

export function generateReviewMetadata({ song = {}, job = {} } = {}) {
  const songKey = String(song.song_key || job.song_key || '').trim();
  const title = String(
    song.display_title || song.song_name || job.song_title || songKey || 'Stashbox Music'
  ).trim();
  const artist = String(song.artist || job.artist || 'Stashbox').trim();
  const genre = String(song.genre || '').trim();
  const secondaryGenre = String(song.secondary_genre || '').trim();
  const moods = stringList(song.mood_tags);
  const aspectRatio = String(job.aspect_ratio || '9:16');
  const durationSeconds = Number(job.duration_seconds || 30);

  const titleOptions = unique([
    `${artist} - ${title} | Official Short`,
    `${title} by ${artist} | ${Math.round(durationSeconds)}-Second Vertical Video`,
    `${artist} - ${title} | Stashbox Radio`
  ]).map(titleLimit);

  const linkLines = buildLinkLines(song);
  const descriptionLines = [
    `${artist} - ${title}`,
    '',
    `A ${Math.round(durationSeconds)}-second ${aspectRatio} video created through Stashbox Video Factory and prepared by Stashbox Social Factory.`,
    '',
    ...linkLines,
    ...(linkLines.length ? [''] : []),
    'Discover more music and dynamic video experiences at Stashbox Radio.',
    '',
    `#${hashtag(artist) || 'Stashbox'} #${hashtag(genre) || 'Music'} #StashboxRadio`
  ];

  const tags = unique([
    artist,
    title,
    genre,
    secondaryGenre,
    ...moods,
    'Stashbox',
    'Stashbox Radio',
    'Social Factory',
    'Music Video',
    aspectRatio === '9:16' ? 'Vertical Video' : '',
    durationSeconds <= 60 ? 'Short Form Video' : ''
  ]).slice(0, 30);

  const hashtags = unique([
    hashtag(artist),
    hashtag(genre),
    'Stashbox',
    'StashboxRadio'
  ].filter(Boolean)).slice(0, 6).map((item) => `#${item}`);

  return {
    title_options: titleOptions,
    selected_title: titleOptions[0],
    description: descriptionLines.join('\n').trim(),
    tags,
    hashtags,
    category_id: '10',
    collaborators: DEFAULT_COLLABORATORS.map(item => ({ ...item })),
    collaborator_review_required: true,
    credits: {
      artist,
      song_title: title,
      album_name: String(song.album_name || job.album_name || '').trim(),
      publisher: 'Elettro Incorporated'
    }
  };
}

async function bodyToString(body) {
  if (!body) return '';
  if (typeof body.transformToString === 'function') return body.transformToString('utf-8');
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export function createAwsReviewStore({
  bucketName = process.env.SOCIAL_PUBLISH_BUCKET,
  sourceBucketName = process.env.VIDEO_FACTORY_SOURCE_BUCKET,
  chatGptImportQueueUrl = process.env.CHATGPT_IMPORT_QUEUE_URL
} = {}) {
  if (!bucketName) throw new Error('social_publish_bucket_missing');
  if (!sourceBucketName) throw new Error('video_factory_source_bucket_missing');

  let sdkPromise;
  let clientPromise;
  let sqsSdkPromise;
  let sqsClientPromise;
  async function getSdk() {
    if (!sdkPromise) sdkPromise = import('@aws-sdk/client-s3');
    return sdkPromise;
  }
  async function getClient() {
    if (!clientPromise) clientPromise = getSdk().then(({ S3Client }) => new S3Client({}));
    return clientPromise;
  }
  async function getSqsSdk() {
    if (!sqsSdkPromise) sqsSdkPromise = import('@aws-sdk/client-sqs');
    return sqsSdkPromise;
  }
  async function getSqsClient() {
    if (!sqsClientPromise) sqsClientPromise = getSqsSdk().then(({ SQSClient }) => new SQSClient({}));
    return sqsClientPromise;
  }

  return {
    bucketName,
    sourceBucketName,

    async copyVideo({ sourceBucket, sourceKey, destinationKey }) {
      if (sourceBucket !== sourceBucketName) throw serviceError('render_output_bucket_not_allowed', 409);
      const [{ CopyObjectCommand, HeadObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      const copySource = `${encodeURIComponent(sourceBucket)}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
      await client.send(new CopyObjectCommand({
        Bucket: bucketName,
        Key: destinationKey,
        CopySource: copySource,
        MetadataDirective: 'COPY'
      }));
      return client.send(new HeadObjectCommand({ Bucket: bucketName, Key: destinationKey }));
    },

    async createVideoImportUploadUrl({ importId, fileName, sizeBytes }) {
      const [{ PutObjectCommand }, client, { getSignedUrl }] = await Promise.all([
        getSdk(),
        getClient(),
        import('@aws-sdk/s3-request-presigner')
      ]);
      const objectKey = `${CHATGPT_IMPORT_PREFIX}${importId}/video.mp4`;
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: 'video/mp4',
        Metadata: {
          expected_size_bytes: String(sizeBytes),
          source: 'chatgpt-video-import',
          file_name: fileName
        }
      });
      return {
        objectKey,
        uploadUrl: await getSignedUrl(client, command, { expiresIn: VIDEO_UPLOAD_TTL_SECONDS })
      };
    },

    async uploadChatGptVideo({ importId, fileName, body }) {
      const [{ Upload }, client] = await Promise.all([
        import('@aws-sdk/lib-storage'),
        getClient()
      ]);
      const objectKey = `${CHATGPT_IMPORT_PREFIX}${importId}/video.mp4`;
      const upload = new Upload({
        client,
        params: {
          Bucket: bucketName,
          Key: objectKey,
          Body: body,
          ContentType: 'video/mp4',
          Metadata: {
            source: 'chatgpt-video-import',
            file_name: fileName
          }
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false
      });
      await upload.done();
      return { objectKey };
    },

    async enqueueChatGptImportBatch(batchId, payload) {
      if (!chatGptImportQueueUrl) throw new Error('chatgpt_import_queue_url_missing');
      const [{ SendMessageCommand }, client] = await Promise.all([getSqsSdk(), getSqsClient()]);
      await client.send(new SendMessageCommand({
        QueueUrl: chatGptImportQueueUrl,
        MessageBody: JSON.stringify({ batch_id: batchId, ...payload })
      }));
    },

    async putChatGptImportBatch(batchId, batch) {
      const [{ PutObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: `${CHATGPT_IMPORT_STATUS_PREFIX}${batchId}.json`,
        Body: JSON.stringify(batch, null, 2),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store'
      }));
      return batch;
    },

    async getChatGptImportBatch(batchId) {
      const [{ GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        const result = await client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: `${CHATGPT_IMPORT_STATUS_PREFIX}${batchId}.json`
        }));
        return JSON.parse(await bodyToString(result.Body));
      } catch (error) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },

    async headImportedVideo(objectKey) {
      const [{ HeadObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      return client.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }));
    },

    async getImportedVideo(objectKey) {
      const [{ GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      return client.send(new GetObjectCommand({ Bucket: bucketName, Key: objectKey }));
    },

    async putReview(reviewKey, review) {
      const [{ PutObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: reviewKey,
        Body: JSON.stringify(review, null, 2),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store'
      }));
      return review;
    },

    async putImportedReview(reviewKey, review) {
      const [{ PutObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: reviewKey,
        Body: JSON.stringify(review, null, 2),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store',
        IfNoneMatch: '*'
      }));
      return review;
    },

    async getReview(reviewKey) {
      const [{ GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: reviewKey }));
        return JSON.parse(await bodyToString(result.Body));
      } catch (error) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },

    async listReviews(limit = 50) {
      const [{ ListObjectsV2Command, GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: REVIEW_PREFIX,
        MaxKeys: Math.max(1, Math.min(Number(limit) || 50, 100))
      }));
      const keys = (listed.Contents || [])
        .map((item) => item.Key)
        .filter((key) => key?.endsWith('.json'));
      const reviews = [];
      for (const key of keys) {
        const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        reviews.push(JSON.parse(await bodyToString(result.Body)));
      }
      return reviews.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    }
  };
}

export function createReviewWorkflowService({
  secretStore = createAwsSecretStore(),
  reviewStore = null,
  fetchImpl = globalThis.fetch,
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  now = () => new Date(),
  sourceBucketName = process.env.VIDEO_FACTORY_SOURCE_BUCKET,
  maxUploadBytes = Number(process.env.SOCIAL_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES),
  createImportId = () => crypto.randomUUID()
} = {}) {
  if (!fetchImpl) throw new Error('fetch_unavailable');
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');
  let resolvedReviewStore = reviewStore;

  function getReviewStore() {
    if (!resolvedReviewStore) {
      resolvedReviewStore = createAwsReviewStore({ sourceBucketName });
    }
    return resolvedReviewStore;
  }

  async function authorize(event) {
    const config = await secretStore.read(configSecretId);
    assertAdmin(event, config);
    return config;
  }

  async function radioRequest(config, pathname) {
    const bridge = validateBridgeConfig(config);
    if (!String(pathname).startsWith('/admin/')) {
      throw serviceError('radio_api_bridge_path_not_allowed', 500);
    }
    const response = await fetchImpl(`${bridge.baseUrl}${pathname}`, {
      method: 'GET',
      headers: { 'x-admin-token': bridge.adminToken }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw serviceError('radio_api_request_failed', 502, {
        downstream_status: response.status,
        downstream_path: pathname,
        downstream_error: String(payload?.error || payload?.message || 'unknown_error').slice(0, 240)
      });
    }
    return payload;
  }

  async function completeVideoImport(
    importId,
    titleOverride,
    verifiedContentSha256 = '',
    aspectRatio = ''
  ) {
    const safeIdValue = safeImportId(importId);
    const objectKey = `${CHATGPT_IMPORT_PREFIX}${safeIdValue}/video.mp4`;
    const store = getReviewStore();
    let uploaded;
    try {
      uploaded = await store.headImportedVideo(objectKey);
    } catch (error) {
      if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        throw serviceError('uploaded_video_not_found', 404);
      }
      throw error;
    }

    const contentLength = Number(uploaded.ContentLength || 0);
    const expectedSize = Number(uploaded.Metadata?.expected_size_bytes || contentLength);
    const uploadedName = String(uploaded.Metadata?.file_name || '');
    const fileName = safeFileName(uploadedName);
    const title = String(titleOverride || fileName.replace(/\.mp4$/i, '')).trim();
    if (
      uploaded.ContentType !== 'video/mp4' ||
      uploaded.Metadata?.source !== 'chatgpt-video-import' ||
      !fileName.toLowerCase().endsWith('.mp4') ||
      uploadedName !== fileName ||
      !Number.isSafeInteger(expectedSize) ||
      expectedSize <= 0 ||
      expectedSize > maxUploadBytes ||
      contentLength !== expectedSize ||
      !title ||
      title.length > 100
    ) {
      throw serviceError('invalid_uploaded_video', 422, {
        content_type: uploaded.ContentType || null,
        content_length: contentLength,
        expected_size_bytes: expectedSize,
        max_bytes: maxUploadBytes
      });
    }

    const contentSha256 = verifiedContentSha256 || await (async () => {
      const object = await store.getImportedVideo(objectKey);
      return hashAndVerifyMp4(object.Body, contentLength);
    })();
    if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
      throw serviceError('invalid_video_content_hash', 500);
    }
    const reviewId = `upload-${contentSha256}`;
    const reviewKey = `${REVIEW_PREFIX}${reviewId}.json`;
    const existing = await store.getReview(reviewKey);
    if (existing) {
      if (existing.source?.content_sha256 !== contentSha256) {
        throw serviceError('video_import_hash_collision', 409);
      }
      return { imported: false, duplicate: true, review_item: existing };
    }

    const createdAt = now().toISOString();
    const review = {
      schema_version: 1,
      id: reviewId,
      status: 'in_review',
      approval_state: 'pending',
      publishing_status: 'not_published',
      source: {
        type: 'chatgpt_video_upload',
        import_id: safeIdValue,
        content_sha256: contentSha256
      },
      song: {
        song_key: '',
        title,
        artist: 'Stashbox',
        genre: '',
        artwork_url: ''
      },
      video: {
        bucket: store.bucketName,
        object_key: objectKey,
        staging_uri: `s3://${store.bucketName}/${objectKey}`,
        file_name: fileName,
        content_type: 'video/mp4',
        size_bytes: contentLength,
        aspect_ratio: aspectRatio,
        duration_seconds: null,
        width: 0,
        height: 0
      },
      metadata: {
        title_options: [title],
        selected_title: title,
        description: 'Video uploaded through the Stashbox Radio Custom GPT and awaiting Content Review.',
        tags: ['Stashbox', 'Stashbox Radio'],
        hashtags: ['#Stashbox', '#StashboxRadio'],
        category_id: '10',
        collaborators: DEFAULT_COLLABORATORS.map(item => ({ ...item })),
        collaborator_review_required: true,
        credits: {
          artist: 'Stashbox',
          song_title: title,
          album_name: '',
          publisher: 'Elettro Incorporated'
        }
      },
      publish_settings: {
        visibility: 'unlisted',
        made_for_kids: false,
        contains_synthetic_media: true,
        playlist_titles: [DEFAULT_YOUTUBE_PLAYLIST_TITLE],
        recording_date_mode: 'publish_date',
        notify_subscribers: false,
        scheduled_at: null
      },
      automation: {
        auto_publish: false,
        review_required: true,
        review_window_status: 'open'
      },
      created_at: createdAt,
      updated_at: createdAt
    };

    try {
      await store.putImportedReview(reviewKey, review);
      return { imported: true, duplicate: false, review_item: review };
    } catch (error) {
      if (
        ![409, 412].includes(Number(error?.$metadata?.httpStatusCode)) &&
        error?.name !== 'PreconditionFailed' &&
        error?.name !== 'ConditionalRequestConflict'
      ) {
        throw error;
      }
      const racedReview = await store.getReview(reviewKey);
      if (racedReview?.source?.content_sha256 !== contentSha256) {
        throw serviceError('video_import_hash_collision', 409);
      }
      return { imported: false, duplicate: true, review_item: racedReview };
    }
  }

  async function importChatGptAttachments(attachments, aspectRatio, batchId) {
    const store = getReviewStore();
    const items = await Promise.all(attachments.map(async (attachment) => {
      try {
        const response = await fetchImpl(attachment.downloadUrl, {
          method: 'GET',
          redirect: 'error'
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw serviceError('chatgpt_attachment_download_failed', 502, {
            upstream_status: response.status
          });
        }
        const responseContentType = String(response.headers?.get('content-type') || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (responseContentType && !['video/mp4', 'application/octet-stream'].includes(responseContentType)) {
          await response.body?.cancel();
          throw serviceError('chatgpt_attachment_not_mp4', 422);
        }
        if (!response.body) throw serviceError('chatgpt_attachment_body_missing', 502);

        const contentLengthHeader = response.headers?.get('content-length');
        const expectedBytes = contentLengthHeader == null ? null : Number(contentLengthHeader);
        if (
          expectedBytes != null &&
          (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > maxUploadBytes)
        ) {
          await response.body?.cancel();
          throw serviceError('invalid_video_size', 422, { max_bytes: maxUploadBytes });
        }
        const importId = safeImportId(createImportId());
        const guardedBody = createMp4VerificationStream(maxUploadBytes, expectedBytes);
        await store.uploadChatGptVideo({
          importId,
          fileName: attachment.fileName,
          body: Readable.fromWeb(response.body).pipe(guardedBody.stream)
        });
        const result = await completeVideoImport(
          importId,
          undefined,
          guardedBody.contentSha256,
          aspectRatio
        );
        return {
          file_name: attachment.fileName,
          status: result.duplicate ? 'duplicate' : 'imported',
          review_item: result.review_item
        };
      } catch (error) {
        return {
          file_name: attachment.fileName,
          status: 'failed',
          error: error?.statusCode ? error.message : 'video_import_failed'
        };
      }
    }));
    const failedCount = items.filter((item) => item.status === 'failed').length;
    return {
      batch_id: batchId,
      count: items.length,
      imported_count: items.filter((item) => item.status === 'imported').length,
      duplicate_count: items.filter((item) => item.status === 'duplicate').length,
      failed_count: failedCount,
      status: failedCount === items.length ? 'failed' : failedCount ? 'completed_with_errors' : 'completed',
      completed_at: now().toISOString(),
      items
    };
  }

  return {
    async importChatGptVideos(event) {
      await authorize(event);
      const input = parseBody(event);
      const attachments = validateChatGptAttachments(input.openaiFileIdRefs, {
        currentTime: now().getTime()
      });
      const aspectRatio = String(input.aspect_ratio || '').trim();
      if (aspectRatio && !YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
        throw serviceError('invalid_video_aspect_ratio', 422, {
          allowed: [...YOUTUBE_ASPECT_RATIOS]
        });
      }
      return importChatGptAttachments(attachments, aspectRatio, '');
    },

    async queueChatGptImport(event) {
      await authorize(event);
      const input = parseBody(event);
      const attachments = validateChatGptAttachments(input.openaiFileIdRefs, {
        currentTime: now().getTime()
      });
      const aspectRatio = String(input.aspect_ratio || '').trim();
      if (aspectRatio && !YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
        throw serviceError('invalid_video_aspect_ratio', 422, {
          allowed: [...YOUTUBE_ASPECT_RATIOS]
        });
      }
      const store = getReviewStore();
      const batchId = safeImportId(createImportId());
      const createdAt = now().toISOString();
      const batch = {
        batch_id: batchId,
        status: 'queued',
        count: attachments.length,
        imported_count: 0,
        duplicate_count: 0,
        failed_count: 0,
        created_at: createdAt,
        items: attachments.map(({ fileName }) => ({ file_name: fileName, status: 'queued' }))
      };
      await store.putChatGptImportBatch(batchId, batch);
      try {
        await store.enqueueChatGptImportBatch(batchId, {
          openaiFileIdRefs: attachments.map(({ id, fileName, downloadUrl }) => ({
            id,
            name: fileName,
            mime_type: 'video/mp4',
            download_link: downloadUrl
          })),
          aspect_ratio: aspectRatio
        });
      } catch (error) {
        await store.putChatGptImportBatch(batchId, {
          ...batch,
          status: 'failed',
          failed_count: attachments.length,
          error: 'chatgpt_import_enqueue_failed',
          completed_at: now().toISOString()
        });
        throw error;
      }
      return {
        batch_id: batchId,
        status: 'queued',
        count: attachments.length,
        status_url: `/social/uploads/imports/${batchId}`
      };
    },

    async getChatGptImportBatch(event, batchId) {
      await authorize(event);
      const safeIdValue = safeImportId(batchId);
      const batch = await getReviewStore().getChatGptImportBatch(safeIdValue);
      if (!batch) throw serviceError('chatgpt_import_batch_not_found', 404);
      return batch;
    },

    async processChatGptImportBatch(batchId, payload) {
      const safeIdValue = safeImportId(batchId);
      const store = getReviewStore();
      const batch = await store.getChatGptImportBatch(safeIdValue);
      if (!batch) throw serviceError('chatgpt_import_batch_not_found', 404);
      if (['completed', 'completed_with_errors', 'failed'].includes(batch.status)) {
        return { skipped: true, status: batch.status };
      }
      const attachments = validateChatGptAttachments(payload.openaiFileIdRefs, { allowExpired: true });
      const aspectRatio = String(payload.aspect_ratio || '').trim();
      if (aspectRatio && !YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
        throw serviceError('invalid_video_aspect_ratio', 422, {
          allowed: [...YOUTUBE_ASPECT_RATIOS]
        });
      }
      const processingBatch = {
        ...batch,
        status: 'processing',
        started_at: now().toISOString()
      };
      await store.putChatGptImportBatch(safeIdValue, processingBatch);
      const result = await importChatGptAttachments(attachments, aspectRatio, safeIdValue);
      const completedBatch = { ...processingBatch, ...result };
      await store.putChatGptImportBatch(safeIdValue, completedBatch);
      return completedBatch;
    },

    async createVideoImport(event) {
      await authorize(event);
      const input = validateVideoImportInput(parseBody(event), maxUploadBytes);
      const importId = safeImportId(createImportId());
      const store = getReviewStore();
      const upload = await store.createVideoImportUploadUrl({
        importId,
        fileName: input.fileName,
        sizeBytes: input.sizeBytes
      });
      return {
        import_id: importId,
        default_title: input.title,
        aspect_ratio: input.aspectRatio,
        object_key: upload.objectKey,
        upload_url: upload.uploadUrl,
        upload_method: 'PUT',
        required_headers: {
          'Content-Type': 'video/mp4',
          'x-amz-meta-expected_size_bytes': String(input.sizeBytes),
          'x-amz-meta-source': 'chatgpt-video-import',
          'x-amz-meta-file_name': input.fileName
        },
        expires_in_seconds: VIDEO_UPLOAD_TTL_SECONDS,
        max_upload_bytes: maxUploadBytes
      };
    },

    async completeVideoImport(event, importId) {
      await authorize(event);
      const input = parseBody(event);
      const title = input.title == null ? undefined : String(input.title);
      if (title != null && (!title.trim() || title.trim().length > 100)) {
        throw serviceError('invalid_video_title', 422, { max_characters: 100 });
      }
      const aspectRatio = String(input.aspect_ratio || '').trim();
      if (aspectRatio && !YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
        throw serviceError('invalid_video_aspect_ratio', 422, {
          allowed: [...YOUTUBE_ASPECT_RATIOS]
        });
      }
      return completeVideoImport(importId, title, '', aspectRatio);
    },

    async stageRender(event, jobId) {
      const config = await authorize(event);
      const safeJobId = safeId(jobId, 'render_job_id');
      const input = parseBody(event);
      const jobPayload = await radioRequest(config, `/admin/video-factory/jobs/${encodeURIComponent(safeJobId)}`);
      const job = jobPayload?.job || jobPayload;
      if (String(job?.status || '').toLowerCase() !== 'completed') {
        throw serviceError('render_job_not_completed', 409, { status: String(job?.status || 'unknown') });
      }

      const source = parseS3Uri(job.output_url || job.outputs?.[0]?.output_url);
      const store = getReviewStore();
      if (source.bucket !== store.sourceBucketName) {
        throw serviceError('render_output_bucket_not_allowed', 409);
      }

      const fileName = safeFileName(job.output_filename || source.key.split('/').pop());
      const destinationKey = `${VIDEO_PREFIX}${safeJobId}/${fileName}`;
      const reviewId = `render-${safeJobId}`;
      const reviewKey = `${REVIEW_PREFIX}${reviewId}.json`;

      if (input.confirm_stage !== true) {
        return {
          staged: false,
          mode: 'validation_only',
          approval_required: true,
          job_id: safeJobId,
          source_uri: `s3://${source.bucket}/${source.key}`,
          destination_key: destinationKey,
          review_id: reviewId
        };
      }

      const songsPayload = await radioRequest(config, '/admin/songs');
      const song = normalizeSongList(songsPayload).find((item) => String(item.song_key) === String(job.song_key)) || {};
      const copied = await store.copyVideo({
        sourceBucket: source.bucket,
        sourceKey: source.key,
        destinationKey
      });

      const createdAt = now().toISOString();
      const metadata = generateReviewMetadata({ song, job });
      const review = {
        schema_version: 1,
        id: reviewId,
        status: 'in_review',
        approval_state: 'pending',
        publishing_status: 'not_published',
        source: {
          type: 'video_factory_render',
          render_job_id: safeJobId,
          render_batch_id: String(job.batch_id || ''),
          source_uri: `s3://${source.bucket}/${source.key}`
        },
        song: {
          song_key: String(job.song_key || song.song_key || ''),
          title: String(song.display_title || song.song_name || job.song_title || ''),
          artist: String(song.artist || job.artist || ''),
          genre: String(song.genre || ''),
          artwork_url: String(song.song_artwork_url || '')
        },
        video: {
          bucket: store.bucketName,
          object_key: destinationKey,
          staging_uri: `s3://${store.bucketName}/${destinationKey}`,
          file_name: fileName,
          content_type: String(copied.ContentType || 'video/mp4'),
          size_bytes: Number(copied.ContentLength || 0),
          aspect_ratio: String(job.aspect_ratio || ''),
          duration_seconds: job.duration_seconds == null ? null : Number(job.duration_seconds),
          width: Number(job.width || 0),
          height: Number(job.height || 0)
        },
        metadata,
        publish_settings: {
          visibility: 'unlisted',
          made_for_kids: false,
          contains_synthetic_media: true,
          playlist_titles: [DEFAULT_YOUTUBE_PLAYLIST_TITLE],
          recording_date_mode: 'publish_date',
          notify_subscribers: false,
          scheduled_at: null
        },
        automation: {
          auto_publish: false,
          review_required: true,
          review_window_status: 'open'
        },
        created_at: createdAt,
        updated_at: createdAt
      };

      await store.putReview(reviewKey, review);
      return { staged: true, review_item: review };
    },

    async listReviewItems(event) {
      await authorize(event);
      const limit = Number(event?.queryStringParameters?.limit || 50);
      const items = await getReviewStore().listReviews(limit);
      return { count: items.length, items };
    },

    async getReviewItem(event, reviewId) {
      await authorize(event);
      const safeReviewId = safeId(reviewId, 'review_id');
      const item = await getReviewStore().getReview(`${REVIEW_PREFIX}${safeReviewId}.json`);
      if (!item) throw serviceError('review_item_not_found', 404);
      return { item };
    }
  };
}
