import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';
import { createAwsReviewPublishStore } from './review-publish.mjs';

const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000;
const MAX_SCHEDULE_LEAD_MS = 366 * 24 * 60 * 60 * 1000;

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

function scheduleName(reviewId, scheduledAt) {
  const reviewDigest = crypto.createHash('sha256').update(reviewId).digest('hex').slice(0, 24);
  const timeDigest = crypto.createHash('sha256').update(scheduledAt.toISOString()).digest('hex').slice(0, 8);
  return `social-review-${reviewDigest}-${timeDigest}`;
}

function scheduleExpression(date) {
  return `at(${date.toISOString().replace(/\.\d{3}Z$/, '')})`;
}

export function createAwsScheduleStore({
  groupName = process.env.SOCIAL_SCHEDULE_GROUP,
  queueArn = process.env.SOCIAL_SCHEDULE_QUEUE_ARN,
  targetRoleArn = process.env.SOCIAL_SCHEDULER_ROLE_ARN
} = {}) {
  if (!groupName) throw new Error('social_schedule_group_missing');
  if (!queueArn) throw new Error('social_schedule_queue_arn_missing');
  if (!targetRoleArn) throw new Error('social_scheduler_role_arn_missing');

  let sdkPromise;
  let clientPromise;

  async function getSdk() {
    if (!sdkPromise) sdkPromise = import('@aws-sdk/client-scheduler');
    return sdkPromise;
  }

  async function getClient() {
    if (!clientPromise) clientPromise = getSdk().then(({ SchedulerClient }) => new SchedulerClient({}));
    return clientPromise;
  }

  return {
    groupName,
    queueArn,
    targetRoleArn,

    async delete(name) {
      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: groupName }));
      } catch (error) {
        if (error?.name !== 'ResourceNotFoundException') throw error;
      }
    },

    async create({ name, reviewId, scheduledAt }) {
      const [{ CreateScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new CreateScheduleCommand({
        Name: name,
        GroupName: groupName,
        Description: `Publish approved Social Factory review ${reviewId} as an unlisted YouTube video.`,
        ScheduleExpression: scheduleExpression(scheduledAt),
        ScheduleExpressionTimezone: 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ActionAfterCompletion: 'DELETE',
        State: 'ENABLED',
        Target: {
          Arn: queueArn,
          RoleArn: targetRoleArn,
          SqsParameters: { MessageGroupId: 'scheduled-publish' },
          Input: JSON.stringify({
            schema_version: 1,
            type: 'social_factory_scheduled_publish',
            review_id: reviewId,
            scheduled_at: scheduledAt.toISOString(),
            schedule_name: name
          })
        }
      }));
    }
  };
}

export function createSchedulePublishService({
  secretStore = createAwsSecretStore(),
  reviewStore = null,
  scheduleStore = null,
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  now = () => new Date()
} = {}) {
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');
  let resolvedReviewStore = reviewStore;
  let resolvedScheduleStore = scheduleStore;

  function getReviewStore() {
    if (!resolvedReviewStore) resolvedReviewStore = createAwsReviewPublishStore();
    return resolvedReviewStore;
  }

  function getScheduleStore() {
    if (!resolvedScheduleStore) resolvedScheduleStore = createAwsScheduleStore();
    return resolvedScheduleStore;
  }

  return {
    async schedule(event, reviewId) {
      const config = await secretStore.read(configSecretId);
      assertAdmin(event, config);
      const id = safeReviewId(reviewId);
      const input = parseBody(event);
      const item = await getReviewStore().getReview(id);
      if (!item) throw serviceError('review_item_not_found', 404);

      if (item.publishing_status === 'published' || item.platform_results?.youtube?.video_id) {
        throw serviceError('review_item_already_published', 409);
      }
      if (item.status !== 'approved' || item.approval_state !== 'approved') {
        throw serviceError('review_item_not_approved', 409, {
          status: String(item.status || ''),
          approval_state: String(item.approval_state || '')
        });
      }

      const scheduledText = String(
        input.scheduled_at || item.publish_settings?.scheduled_at || ''
      ).trim();
      const scheduledMs = Date.parse(scheduledText);
      if (!Number.isFinite(scheduledMs)) {
        throw serviceError('scheduled_at_required', 422);
      }

      const currentMs = now().getTime();
      const leadMs = scheduledMs - currentMs;
      if (leadMs < MIN_SCHEDULE_LEAD_MS) {
        throw serviceError('scheduled_at_too_soon', 422, {
          minimum_lead_seconds: MIN_SCHEDULE_LEAD_MS / 1000
        });
      }
      if (leadMs > MAX_SCHEDULE_LEAD_MS) {
        throw serviceError('scheduled_at_too_far', 422, {
          maximum_lead_days: MAX_SCHEDULE_LEAD_MS / 86400000
        });
      }

      const scheduledAt = new Date(scheduledMs);
      const name = scheduleName(id, scheduledAt);
      const existingSchedule = item.schedule || {};
      if (
        item.publishing_status === 'scheduled' &&
        existingSchedule.schedule_name === name &&
        existingSchedule.scheduled_at === scheduledAt.toISOString()
      ) {
        return {
          scheduled: true,
          mode: 'already_scheduled',
          review_id: id,
          schedule_name: name,
          scheduled_at: scheduledAt.toISOString(),
          item
        };
      }

      if (input.confirm_schedule !== true) {
        return {
          scheduled: false,
          mode: 'validation_only',
          approval_required: false,
          review_id: id,
          schedule_name: name,
          scheduled_at: scheduledAt.toISOString(),
          queue_arn: getScheduleStore().queueArn
        };
      }

      if (existingSchedule.schedule_name) {
        await getScheduleStore().delete(existingSchedule.schedule_name);
      }
      await getScheduleStore().create({ name, reviewId: id, scheduledAt });

      const timestamp = now().toISOString();
      const updated = {
        ...item,
        publishing_status: 'scheduled',
        publish_settings: {
          ...item.publish_settings,
          scheduled_at: scheduledAt.toISOString(),
          actual_visibility: null
        },
        schedule: {
          schedule_name: name,
          schedule_group: getScheduleStore().groupName,
          queue_arn: getScheduleStore().queueArn,
          scheduled_at: scheduledAt.toISOString(),
          status: 'scheduled',
          created_at: timestamp,
          last_error: null
        },
        updated_at: timestamp
      };
      await getReviewStore().putReview(id, updated);

      return {
        scheduled: true,
        mode: 'scheduled_queue',
        review_id: id,
        schedule_name: name,
        scheduled_at: scheduledAt.toISOString(),
        item: updated
      };
    },

    async cancel(event, reviewId) {
      const config = await secretStore.read(configSecretId);
      assertAdmin(event, config);
      const id = safeReviewId(reviewId);
      const input = parseBody(event);
      const item = await getReviewStore().getReview(id);
      if (!item) throw serviceError('review_item_not_found', 404);

      if (item.publishing_status === 'published' || item.platform_results?.youtube?.video_id) {
        throw serviceError('review_item_already_published', 409);
      }

      const existingSchedule = item.schedule || {};
      const existingName = String(existingSchedule.schedule_name || '').trim();
      if (!existingName || item.publishing_status !== 'scheduled') {
        return {
          cancelled: false,
          mode: 'not_scheduled',
          review_id: id,
          item
        };
      }

      if (input.confirm_cancel_schedule !== true) {
        return {
          cancelled: false,
          mode: 'validation_only',
          approval_required: true,
          review_id: id,
          schedule_name: existingName,
          scheduled_at: String(existingSchedule.scheduled_at || item.publish_settings?.scheduled_at || ''),
          item
        };
      }

      await getScheduleStore().delete(existingName);
      const timestamp = now().toISOString();
      const updated = {
        ...item,
        publishing_status: 'not_published',
        publish_settings: {
          ...item.publish_settings,
          scheduled_at: null
        },
        schedule: {
          ...existingSchedule,
          status: 'cancelled',
          cancelled_at: timestamp,
          last_error: null
        },
        updated_at: timestamp
      };
      await getReviewStore().putReview(id, updated);

      return {
        cancelled: true,
        mode: 'schedule_cancelled',
        review_id: id,
        schedule_name: existingName,
        item: updated,
        publishing_triggered: false,
        youtube_published: false
      };
    }
  };
}
