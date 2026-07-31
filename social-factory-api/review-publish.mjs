import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';
import { createYoutubePublishService } from './youtube-publish.mjs';

const REVIEW_PREFIX = 'drafts/';
const SCHEDULE_GRACE_MS = 60 * 1000;
const YOUTUBE_ASPECT_RATIOS = new Set(['9:16', '16:9']);
const DEFAULT_YOUTUBE_PLAYLIST_TITLE = 'Stashbox Radio - Video Library - Stashbox';
const DEFAULT_PUBLISH_TIME_ZONE = process.env.SOCIAL_PUBLISH_TIME_ZONE || 'America/New_York';

function dateOnlyInTimeZone(value, timeZone = DEFAULT_PUBLISH_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw serviceError('invalid_recording_date_source', 500);
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveRecordingDate(item, currentDate) {
  const explicit = String(item?.publish_settings?.recording_date || '').trim();
  if (explicit) return explicit;
  const publishMoment = item?.publish_settings?.scheduled_at || currentDate;
  return dateOnlyInTimeZone(publishMoment);
}

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

function assertYoutubeAspectRatio(item) {
  const aspectRatio = String(item?.video?.aspect_ratio || '').trim();
  if (!YOUTUBE_ASPECT_RATIOS.has(aspectRatio)) {
    throw serviceError('youtube_aspect_ratio_not_supported', 409, {
      aspect_ratio: aspectRatio || 'missing',
      allowed: [...YOUTUBE_ASPECT_RATIOS]
    });
  }
}

function errorText(error, fallback = 'youtube_upload_failed') {
  return String(error?.message || error?.error || error || fallback).trim().slice(0, 1000) || fallback;
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

export function createAwsImmediatePublishQueue({
  queueUrl = process.env.SOCIAL_SCHEDULE_QUEUE_URL
} = {}) {
  if (!queueUrl) throw new Error('social_publish_queue_url_missing');
  let sdkPromise;
  let clientPromise;

  async function getSdk() {
    if (!sdkPromise) sdkPromise = import('@aws-sdk/client-sqs');
    return sdkPromise;
  }

  async function getClient() {
    if (!clientPromise) clientPromise = getSdk().then(({ SQSClient }) => new SQSClient({}));
    return clientPromise;
  }

  return {
    queueUrl,
    async enqueue({ reviewId, queuedAt }) {
      const [{ SendMessageCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageGroupId: 'immediate-youtube-publish',
        MessageBody: JSON.stringify({
          schema_version: 1,
          type: 'social_factory_immediate_publish',
          review_id: reviewId,
          queued_at: queuedAt
        })
      }));
      return { review_id: reviewId, queued_at: queuedAt };
    }
  };
}

export function createReviewPublishService({
  secretStore = createAwsSecretStore(),
  store = null,
  publishQueue = null,
  youtubePublish = createYoutubePublishService(),
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  now = () => new Date()
} = {}) {
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');
  let resolvedStore = store;
  let resolvedPublishQueue = publishQueue;

  function getStore() {
    if (!resolvedStore) resolvedStore = createAwsReviewPublishStore();
    return resolvedStore;
  }

  function getPublishQueue() {
    if (!resolvedPublishQueue) resolvedPublishQueue = createAwsImmediatePublishQueue();
    return resolvedPublishQueue;
  }

  async function loadReview(reviewId) {
    const id = safeReviewId(reviewId);
    const item = await getStore().getReview(id);
    if (!item) throw serviceError('review_item_not_found', 404);
    return { id, item };
  }

  function alreadyPublished(item, id) {
    if (item.publishing_status !== 'published' || !item.platform_results?.youtube?.video_id) return null;
    return {
      publishing_triggered: false,
      uploaded: false,
      mode: 'already_published',
      review_id: id,
      item
    };
  }

  function alreadyInProgress(item, id) {
    if (!['queued', 'publishing', 'retrying'].includes(String(item.publishing_status || ''))) return null;
    return {
      publishing_triggered: false,
      uploaded: false,
      queued: true,
      mode: 'already_queued',
      review_id: id,
      item
    };
  }

  function assertApproved(item) {
    if (item.status !== 'approved' || item.approval_state !== 'approved') {
      throw serviceError('review_item_not_approved', 409, {
        status: String(item.status || ''),
        approval_state: String(item.approval_state || '')
      });
    }
  }

  async function markQueued(id, item, validation = {}) {
    const queuedAt = now().toISOString();
    const updated = {
      ...item,
      publishing_status: 'queued',
      publish_error: null,
      publish_attempt: {
        ...item.publish_attempt,
        status: 'queued',
        queued_at: queuedAt,
        failed_at: null,
        completed_at: null,
        last_error: null
      },
      platform_results: {
        ...item.platform_results,
        youtube: {
          ...item.platform_results?.youtube,
          status: 'queued',
          queued_at: queuedAt,
          content_length: Number(validation.content_length || item.video?.size_bytes || 0),
          failed_at: null,
          error: null
        }
      },
      updated_at: queuedAt
    };
    await getStore().putReview(id, updated);
    return updated;
  }

  async function markPublishing(id, item, scheduledContext) {
    const startedAt = now().toISOString();
    const updated = {
      ...item,
      publishing_status: 'publishing',
      publish_error: null,
      publish_attempt: {
        ...item.publish_attempt,
        status: 'publishing',
        attempt_count: Number(item.publish_attempt?.attempt_count || 0) + 1,
        started_at: startedAt,
        failed_at: null,
        completed_at: null,
        last_error: null
      },
      platform_results: {
        ...item.platform_results,
        youtube: {
          ...item.platform_results?.youtube,
          status: 'publishing',
          started_at: startedAt,
          failed_at: null,
          error: null
        }
      },
      schedule: scheduledContext
        ? {
            ...item.schedule,
            status: 'publishing',
            started_at: item.schedule?.started_at || startedAt,
            last_error: null
          }
        : item.schedule,
      updated_at: startedAt
    };
    await getStore().putReview(id, updated);
    return updated;
  }

  async function markPublishFailed(id, item, error, scheduledContext) {
    const failedAt = now().toISOString();
    const message = errorText(error);
    const updated = {
      ...item,
      publishing_status: 'publish_failed',
      publish_error: message,
      publish_attempt: {
        ...item.publish_attempt,
        status: 'failed',
        failed_at: failedAt,
        completed_at: null,
        last_error: message
      },
      platform_results: {
        ...item.platform_results,
        youtube: {
          ...item.platform_results?.youtube,
          status: 'failed',
          failed_at: failedAt,
          error: message
        }
      },
      schedule: scheduledContext
        ? {
            ...item.schedule,
            status: 'failed',
            failed_at: failedAt,
            last_error: message
          }
        : item.schedule,
      updated_at: failedAt
    };
    await getStore().putReview(id, updated);
    return updated;
  }

  async function executePublish({ event, id, item, confirmUpload, scheduledContext = null }) {
    let workingItem = item;
    if (confirmUpload === true) {
      workingItem = await markPublishing(id, item, scheduledContext);
    }

    const recordingDate = resolveRecordingDate(workingItem, now());

    const publishEvent = {
      ...event,
      body: JSON.stringify({
        object_key: workingItem.video?.object_key,
        title: workingItem.metadata?.selected_title,
        description: workingItem.metadata?.description,
        tags: workingItem.metadata?.tags,
        category_id: workingItem.metadata?.category_id || '10',
        made_for_kids: Boolean(workingItem.publish_settings?.made_for_kids),
        contains_synthetic_media: workingItem.publish_settings?.contains_synthetic_media !== false,
        playlist_titles: Array.isArray(workingItem.publish_settings?.playlist_titles)
          && workingItem.publish_settings.playlist_titles.length
          ? workingItem.publish_settings.playlist_titles
          : [DEFAULT_YOUTUBE_PLAYLIST_TITLE],
        recording_date: recordingDate,
        notify_subscribers: Boolean(workingItem.publish_settings?.notify_subscribers),
        confirm_upload: confirmUpload === true
      }),
      isBase64Encoded: false
    };

    let result;
    try {
      result = await youtubePublish.publish(publishEvent);
    } catch (error) {
      if (confirmUpload === true) {
        await markPublishFailed(id, workingItem, error, scheduledContext);
      }
      throw error;
    }

    if (!result.uploaded) {
      if (confirmUpload === true) {
        const failed = await markPublishFailed(
          id,
          workingItem,
          result.error || result.message || result.mode || 'youtube_upload_not_completed',
          scheduledContext
        );
        throw serviceError('youtube_upload_not_completed', 502, {
          mode: String(result.mode || ''),
          review_id: id,
          publishing_status: failed.publishing_status
        });
      }
      return {
        publishing_triggered: false,
        review_id: id,
        scheduled_at: workingItem.publish_settings?.scheduled_at || null,
        requested_visibility: String(workingItem.publish_settings?.visibility || 'unlisted'),
        ...result
      };
    }

    const publishedAt = now().toISOString();
    const updated = {
      ...workingItem,
      publishing_status: 'published',
      published_at: publishedAt,
      publish_error: null,
      publish_attempt: {
        ...workingItem.publish_attempt,
        status: 'published',
        completed_at: publishedAt,
        failed_at: null,
        last_error: null
      },
      publish_settings: {
        ...workingItem.publish_settings,
        actual_visibility: 'unlisted',
        actual_recording_date: result.recording_date || recordingDate
      },
      schedule: scheduledContext
        ? {
            ...workingItem.schedule,
            status: 'completed',
            completed_at: publishedAt,
            last_error: null
          }
        : workingItem.schedule,
      platform_results: {
        ...workingItem.platform_results,
        youtube: {
          ...workingItem.platform_results?.youtube,
          status: 'published',
          video_id: result.youtube_video_id,
          url: result.youtube_url,
          privacy_status: result.privacy_status || 'unlisted',
          contains_synthetic_media: result.contains_synthetic_media !== false,
          playlist_results: Array.isArray(result.playlist_results) ? result.playlist_results : [],
          recording_date: result.recording_date || recordingDate,
          published_at: publishedAt,
          failed_at: null,
          error: null
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

  return {
    async publish(event, reviewId) {
      const config = await secretStore.read(configSecretId);
      assertAdmin(event, config);
      const { id, item } = await loadReview(reviewId);
      const published = alreadyPublished(item, id);
      if (published) return published;
      const active = alreadyInProgress(item, id);
      if (active) return active;
      assertApproved(item);
      assertYoutubeAspectRatio(item);

      const input = parseBody(event);
      const scheduledAt = item.publish_settings?.scheduled_at
        ? Date.parse(item.publish_settings.scheduled_at)
        : NaN;
      const isFutureSchedule = Number.isFinite(scheduledAt) && scheduledAt > now().getTime() + SCHEDULE_GRACE_MS;

      if (input.confirm_upload === true && isFutureSchedule) {
        throw serviceError('scheduled_publish_queue_required', 409, {
          scheduled_at: new Date(scheduledAt).toISOString(),
          next_step: 'queue_the_scheduled_publish'
        });
      }

      if (input.confirm_upload !== true) {
        return executePublish({ event, id, item, confirmUpload: false });
      }

      const validation = await executePublish({ event, id, item, confirmUpload: false });
      const contentLength = Number(validation.content_length || item.video?.size_bytes || 0);
      const directLimit = Number(validation.max_direct_publish_bytes || 0);

      if (directLimit > 0 && contentLength > directLimit) {
        let queuedItem = await markQueued(id, item, validation);
        try {
          await getPublishQueue().enqueue({ reviewId: id, queuedAt: queuedItem.updated_at });
        } catch (error) {
          queuedItem = await markPublishFailed(id, queuedItem, error, null);
          throw serviceError('youtube_background_queue_failed', 502, {
            review_id: id,
            publishing_status: queuedItem.publishing_status,
            error: errorText(error)
          });
        }
        return {
          publishing_triggered: true,
          uploaded: false,
          queued: true,
          mode: 'background_upload',
          review_id: id,
          content_length: contentLength,
          max_direct_publish_bytes: directLimit,
          item: queuedItem
        };
      }

      return executePublish({ event, id, item, confirmUpload: true });
    },

    async publishQueued(reviewId) {
      const config = await secretStore.read(configSecretId);
      const { id, item } = await loadReview(reviewId);
      const published = alreadyPublished(item, id);
      if (published) return published;
      if (item.status !== 'approved' || item.approval_state !== 'approved') {
        return {
          publishing_triggered: false,
          uploaded: false,
          mode: 'queued_item_no_longer_approved',
          review_id: id,
          skipped: true,
          item
        };
      }
      assertYoutubeAspectRatio(item);
      const internalEvent = {
        headers: { 'x-admin-token': config.admin_token },
        body: JSON.stringify({ confirm_upload: true }),
        isBase64Encoded: false
      };
      return executePublish({
        event: internalEvent,
        id,
        item,
        confirmUpload: true
      });
    },

    async publishScheduled(reviewId, expectedScheduledAt) {
      const config = await secretStore.read(configSecretId);
      const { id, item } = await loadReview(reviewId);
      const published = alreadyPublished(item, id);
      if (published) return published;

      if (item.status !== 'approved' || item.approval_state !== 'approved') {
        return {
          publishing_triggered: false,
          uploaded: false,
          mode: 'scheduled_item_no_longer_approved',
          review_id: id,
          skipped: true,
          item
        };
      }
      assertYoutubeAspectRatio(item);

      const itemScheduledAt = String(item.schedule?.scheduled_at || item.publish_settings?.scheduled_at || '');
      if (expectedScheduledAt && itemScheduledAt !== String(expectedScheduledAt)) {
        return {
          publishing_triggered: false,
          uploaded: false,
          mode: 'stale_schedule_message',
          review_id: id,
          skipped: true,
          item
        };
      }

      const scheduledMs = Date.parse(itemScheduledAt);
      if (!Number.isFinite(scheduledMs)) {
        throw serviceError('scheduled_at_required', 409);
      }
      if (scheduledMs > now().getTime() + SCHEDULE_GRACE_MS) {
        throw serviceError('scheduled_publish_not_due', 409, {
          scheduled_at: new Date(scheduledMs).toISOString()
        });
      }

      const startedAt = now().toISOString();
      const processing = {
        ...item,
        publishing_status: 'publishing',
        schedule: {
          ...item.schedule,
          status: 'publishing',
          started_at: startedAt,
          attempt_count: Number(item.schedule?.attempt_count || 0) + 1,
          last_error: null
        },
        updated_at: startedAt
      };
      await getStore().putReview(id, processing);

      const internalEvent = {
        headers: { 'x-admin-token': config.admin_token },
        body: JSON.stringify({ confirm_upload: true }),
        isBase64Encoded: false
      };
      return executePublish({
        event: internalEvent,
        id,
        item: processing,
        confirmUpload: true,
        scheduledContext: { expectedScheduledAt }
      });
    }
  };
}
