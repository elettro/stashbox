import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';
import { createYoutubePublishService } from './youtube-publish.mjs';

const REVIEW_PREFIX = 'drafts/';
const SCHEDULE_GRACE_MS = 60 * 1000;

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

function safeReviewId(value) {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9-]{8,120}$/.test(text)) {
    throw serviceError('invalid_review_id', 422);
  }
  return text;
}

async function bodyToString(body) {
  if (!body) return '';
  if (typeof body.transformToString === 'function') return body.transformToString('utf-8');
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export function createAwsReviewPublishStore({ bucketName = process.env.SOCIAL_PUBLISH_BUCKET } = {}) {
  if (!bucketName) throw new Error('social_publish_bucket_missing');
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
    async getReview(reviewId) {
      const [{ GetObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        const result = await client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: `${REVIEW_PREFIX}${reviewId}.json`
        }));
        return JSON.parse(await bodyToString(result.Body));
      } catch (error) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },

    async putReview(reviewId, review) {
      const [{ PutObjectCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: `${REVIEW_PREFIX}${reviewId}.json`,
        Body: JSON.stringify(review, null, 2),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store'
      }));
      return review;
    }
  };
}

export function createReviewPublishService({
  secretStore = createAwsSecretStore(),
  store = null,
  youtubePublish = createYoutubePublishService(),
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  now = () => new Date()
} = {}) {
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');
  let resolvedStore = store;

  function getStore() {
    if (!resolvedStore) resolvedStore = createAwsReviewPublishStore();
    return resolvedStore;
  }

  async function authorize(event) {
    const config = await secretStore.read(configSecretId);
    assertAdmin(event, config);
  }

  return {
    async publish(event, reviewId) {
      await authorize(event);
      const id = safeReviewId(reviewId);
      const item = await getStore().getReview(id);
      if (!item) throw serviceError('review_item_not_found', 404);

      if (item.publishing_status === 'published' && item.platform_results?.youtube?.video_id) {
        return {
          publishing_triggered: false,
          uploaded: false,
          mode: 'already_published',
          review_id: id,
          item
        };
      }

      if (item.status !== 'approved' || item.approval_state !== 'approved') {
        throw serviceError('review_item_not_approved', 409, {
          status: String(item.status || ''),
          approval_state: String(item.approval_state || '')
        });
      }

      const input = parseBody(event);
      const scheduledAt = item.publish_settings?.scheduled_at
        ? Date.parse(item.publish_settings.scheduled_at)
        : NaN;
      const isFutureSchedule = Number.isFinite(scheduledAt) && scheduledAt > now().getTime() + SCHEDULE_GRACE_MS;

      if (input.confirm_upload === true && isFutureSchedule) {
        throw serviceError('scheduled_publish_queue_required', 409, {
          scheduled_at: new Date(scheduledAt).toISOString(),
          next_step: 'configure_asynchronous_publish_queue'
        });
      }

      const publishEvent = {
        ...event,
        body: JSON.stringify({
          object_key: item.video?.object_key,
          title: item.metadata?.selected_title,
          description: item.metadata?.description,
          tags: item.metadata?.tags,
          category_id: item.metadata?.category_id || '10',
          made_for_kids: Boolean(item.publish_settings?.made_for_kids),
          notify_subscribers: Boolean(item.publish_settings?.notify_subscribers),
          confirm_upload: input.confirm_upload === true
        }),
        isBase64Encoded: false
      };

      const result = await youtubePublish.publish(publishEvent);
      if (!result.uploaded) {
        return {
          publishing_triggered: false,
          review_id: id,
          scheduled_at: Number.isFinite(scheduledAt) ? new Date(scheduledAt).toISOString() : null,
          requested_visibility: String(item.publish_settings?.visibility || 'unlisted'),
          ...result
        };
      }

      const publishedAt = now().toISOString();
      const updated = {
        ...item,
        publishing_status: 'published',
        published_at: publishedAt,
        publish_settings: {
          ...item.publish_settings,
          actual_visibility: 'unlisted'
        },
        platform_results: {
          ...item.platform_results,
          youtube: {
            status: 'published',
            video_id: result.youtube_video_id,
            url: result.youtube_url,
            privacy_status: result.privacy_status || 'unlisted',
            published_at: publishedAt
          }
        },
        updated_at: publishedAt
      };

      await getStore().putReview(id, updated);
      return {
        publishing_triggered: true,
        review_id: id,
        ...result,
        item: updated
      };
    }
  };
}
