import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const DEFAULT_RADIO_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const EXPECTED_RADIO_API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
const REVIEW_PREFIX = 'drafts/';
const VIDEO_PREFIX = 'incoming/render-jobs/';
const DEFAULT_YOUTUBE_PLAYLIST_TITLE = 'Stashbox Radio - Video Library - Stashbox';
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
  sourceBucketName = process.env.VIDEO_FACTORY_SOURCE_BUCKET
} = {}) {
  if (!bucketName) throw new Error('social_publish_bucket_missing');
  if (!sourceBucketName) throw new Error('video_factory_source_bucket_missing');

  let sdkPromise;
  let clientPromise;
  async function getSdk() {
    if (!sdkPromise) sdkPromise = import('@aws-sdk/client-s3');
    return sdkPromise;
  }
  async function getClient() {
    if (!clientPromise) clientPromise = getSdk().then(({ S3Client }) => new S3Client({}));
    return clientPromise;
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
  sourceBucketName = process.env.VIDEO_FACTORY_SOURCE_BUCKET
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

  return {
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
