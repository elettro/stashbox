import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const REVIEW_PREFIX = 'drafts/';
const PREVIEW_TTL_SECONDS = 15 * 60;
const ALLOWED_VISIBILITY = new Set(['private', 'unlisted', 'public']);
const ALLOWED_DECISIONS = new Set(['approve', 'hold', 'reopen', 'hide']);

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

function cleanString(value, maxLength = 5000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanStringList(value, limit = 30, maxItemLength = 120) {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const text = cleanString(item, maxItemLength);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeCollaborators(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    name: cleanString(item?.name, 120),
    youtube_handle: cleanString(item?.youtube_handle || item?.handle, 120),
    channel_id: cleanString(item?.channel_id, 120),
    credit: cleanString(item?.credit, 160)
  })).filter((item) => item.name || item.youtube_handle || item.channel_id);
}

function normalizeCredits(value = {}, current = {}) {
  return {
    artist: cleanString(value.artist ?? current.artist, 160),
    song_title: cleanString(value.song_title ?? current.song_title, 200),
    album_name: cleanString(value.album_name ?? current.album_name, 200),
    publisher: cleanString(value.publisher ?? current.publisher, 200),
    writers: cleanStringList(value.writers ?? current.writers, 20, 160),
    producers: cleanStringList(value.producers ?? current.producers, 20, 160),
    additional_credits: cleanString(value.additional_credits ?? current.additional_credits, 2000)
  };
}

function normalizeScheduledAt(value) {
  const text = cleanString(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw serviceError('invalid_scheduled_at', 422);
  return new Date(parsed).toISOString();
}

async function bodyToString(body) {
  if (!body) return '';
  if (typeof body.transformToString === 'function') return body.transformToString('utf-8');
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function createAwsReviewActionStore({ bucketName = process.env.SOCIAL_PUBLISH_BUCKET } = {}) {
  if (!bucketName) throw new Error('social_publish_bucket_missing');
  let sdkPromise;
  let presignerPromise;
  let clientPromise;

  async function getSdk() {
    if (!sdkPromise) sdkPromise = import('@aws-sdk/client-s3');
    return sdkPromise;
  }

  async function getPresigner() {
    if (!presignerPromise) presignerPromise = import('@aws-sdk/s3-request-presigner');
    return presignerPromise;
  }

  async function getClient() {
    if (!clientPromise) clientPromise = getSdk().then(({ S3Client }) => new S3Client({}));
    return clientPromise;
  }

  return {
    bucketName,

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
    },

    async createPreviewUrl(item) {
      const bucket = String(item?.video?.bucket || '');
      const objectKey = String(item?.video?.object_key || '');
      if (bucket !== bucketName || !objectKey.startsWith('incoming/') || objectKey.includes('..')) {
        throw serviceError('review_video_location_invalid', 409);
      }
      const [{ GetObjectCommand }, { getSignedUrl }, client] = await Promise.all([
        getSdk(),
        getPresigner(),
        getClient()
      ]);
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ResponseContentType: String(item?.video?.content_type || 'video/mp4')
      });
      return getSignedUrl(client, command, { expiresIn: PREVIEW_TTL_SECONDS });
    }
  };
}

export function createReviewActionService({
  secretStore = createAwsSecretStore(),
  store = null,
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  now = () => new Date()
} = {}) {
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');
  let resolvedStore = store;

  function getStore() {
    if (!resolvedStore) resolvedStore = createAwsReviewActionStore();
    return resolvedStore;
  }

  async function authorize(event) {
    const config = await secretStore.read(configSecretId);
    assertAdmin(event, config);
  }

  async function load(event, reviewId) {
    await authorize(event);
    const id = safeReviewId(reviewId);
    const item = await getStore().getReview(id);
    if (!item) throw serviceError('review_item_not_found', 404);
    return { id, item };
  }

  return {
    async preview(event, reviewId) {
      const { item } = await load(event, reviewId);
      const previewUrl = await getStore().createPreviewUrl(item);
      const reviewPageUrl = `https://stashbox.com/radio-admin/dev/social-factory/content-review/preview/?review_id=${encodeURIComponent(safeReviewId(reviewId))}`;
      const actorType = getHeader(event, 'x-stashbox-actor-type').toLowerCase();
      const actorId = getHeader(event, 'x-stashbox-actor').toLowerCase();
      const isCustomGptRequest = actorType === 'custom_gpt' || actorId.includes('gpt') || Boolean(getHeader(event, 'authorization'));
      return {
        ...(isCustomGptRequest ? {} : { preview_url: previewUrl }),
        review_page_url: reviewPageUrl,
        expires_in_seconds: PREVIEW_TTL_SECONDS,
        content_type: String(item?.video?.content_type || 'video/mp4'),
        file_name: String(item?.video?.file_name || '')
      };
    },

    async save(event, reviewId) {
      const { id, item } = await load(event, reviewId);
      const input = parseBody(event);
      const currentMetadata = item.metadata || {};
      const selectedTitle = cleanString(
        input.selected_title ?? input.metadata?.selected_title ?? currentMetadata.selected_title,
        101
      );
      const description = cleanString(
        input.description ?? input.metadata?.description ?? currentMetadata.description,
        5001
      );
      if (!selectedTitle || selectedTitle.length > 100) {
        throw serviceError('invalid_youtube_title', 422, { max_characters: 100 });
      }
      if (description.length > 5000) {
        throw serviceError('invalid_youtube_description', 422, { max_characters: 5000 });
      }

      const tags = cleanStringList(input.tags ?? input.metadata?.tags ?? currentMetadata.tags, 30, 120);
      if (tags.join(',').length > 500) {
        throw serviceError('invalid_youtube_tags', 422, { max_combined_characters: 500 });
      }

      const visibility = cleanString(
        input.visibility ?? input.publish_settings?.visibility ?? item.publish_settings?.visibility ?? 'unlisted',
        20
      ).toLowerCase();
      if (!ALLOWED_VISIBILITY.has(visibility)) {
        throw serviceError('invalid_visibility', 422, { allowed: [...ALLOWED_VISIBILITY] });
      }

      const saved = {
        ...item,
        metadata: {
          ...currentMetadata,
          selected_title: selectedTitle,
          description,
          tags,
          hashtags: cleanStringList(
            input.hashtags ?? input.metadata?.hashtags ?? currentMetadata.hashtags,
            10,
            100
          ),
          collaborators: normalizeCollaborators(
            input.collaborators ?? input.metadata?.collaborators ?? currentMetadata.collaborators
          ),
          credits: normalizeCredits(
            input.credits ?? input.metadata?.credits ?? {},
            currentMetadata.credits || {}
          ),
          collaborator_review_required: Boolean(
            input.collaborator_review_required ??
            input.metadata?.collaborator_review_required ??
            currentMetadata.collaborator_review_required
          )
        },
        publish_settings: {
          ...item.publish_settings,
          visibility,
          made_for_kids: Boolean(
            input.made_for_kids ?? input.publish_settings?.made_for_kids ?? item.publish_settings?.made_for_kids
          ),
          notify_subscribers: Boolean(
            input.notify_subscribers ??
            input.publish_settings?.notify_subscribers ??
            item.publish_settings?.notify_subscribers
          ),
          scheduled_at: normalizeScheduledAt(
            input.scheduled_at ?? input.publish_settings?.scheduled_at ?? item.publish_settings?.scheduled_at
          )
        },
        updated_at: now().toISOString()
      };

      await getStore().putReview(id, saved);
      return { saved: true, item: saved };
    },

    async decision(event, reviewId) {
      const { id, item } = await load(event, reviewId);
      const input = parseBody(event);
      const decision = cleanString(input.decision, 20).toLowerCase();
      if (!ALLOWED_DECISIONS.has(decision)) {
        throw serviceError('invalid_review_decision', 422, { allowed: [...ALLOWED_DECISIONS] });
      }
      if (decision === 'hide' && item.publishing_status === 'scheduled') {
        throw serviceError('cancel_schedule_before_hiding', 409, {
          publishing_status: 'scheduled',
          next_step: 'cancel_the_active_schedule'
        });
      }

      const timestamp = now().toISOString();
      const state = decision === 'approve'
        ? { status: 'approved', approval_state: 'approved', review_window_status: 'closed' }
        : decision === 'hold'
          ? { status: 'held', approval_state: 'held', review_window_status: 'held' }
          : decision === 'hide'
            ? { status: 'hidden', approval_state: 'hidden', review_window_status: 'hidden' }
            : { status: 'in_review', approval_state: 'pending', review_window_status: 'open' };

      const updated = {
        ...item,
        status: state.status,
        approval_state: state.approval_state,
        automation: {
          ...item.automation,
          auto_publish: false,
          review_required: true,
          review_window_status: state.review_window_status
        },
        review_decision: {
          decision,
          note: cleanString(input.note, 1000),
          decided_at: timestamp
        },
        updated_at: timestamp
      };

      await getStore().putReview(id, updated);
      return {
        decision_applied: true,
        publishing_triggered: false,
        item: updated
      };
    }
  };
}
