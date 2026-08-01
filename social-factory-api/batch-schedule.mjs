import { createSchedulePublishService } from './schedule-publish.mjs';

const MAX_BATCH_ITEMS = 25;

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
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

function childEvent(event, body) {
  return {
    ...event,
    body: JSON.stringify(body),
    isBase64Encoded: false
  };
}

function normalizeItems(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw serviceError('batch_schedule_items_required', 422);
  if (items.length > MAX_BATCH_ITEMS) {
    throw serviceError('batch_schedule_too_large', 422, { maximum_items: MAX_BATCH_ITEMS });
  }
  const seen = new Set();
  return items.map((item, index) => {
    const reviewId = String(item?.review_id || '').trim();
    const scheduledAt = String(item?.scheduled_at || '').trim();
    if (!reviewId) throw serviceError('review_id_required', 422, { index });
    if (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt))) {
      throw serviceError('scheduled_at_required', 422, { index, review_id: reviewId });
    }
    if (seen.has(reviewId)) {
      throw serviceError('duplicate_review_id', 422, { index, review_id: reviewId });
    }
    seen.add(reviewId);
    return { review_id: reviewId, scheduled_at: new Date(scheduledAt).toISOString() };
  });
}

export function createBatchScheduleService({ scheduler = null } = {}) {
  const resolvedScheduler = scheduler || createSchedulePublishService();
  return {
    async schedule(event) {
      const input = parseBody(event);
      const items = normalizeItems(input);
      const timezone = String(input.timezone || 'America/New_York').trim() || 'America/New_York';

      const validations = [];
      for (const item of items) {
        validations.push(await resolvedScheduler.schedule(
          childEvent(event, {
            scheduled_at: item.scheduled_at,
            timezone,
            confirm_schedule: false
          }),
          item.review_id
        ));
      }

      if (input.confirm_batch_schedule !== true) {
        return {
          scheduled: false,
          mode: 'validation_only',
          approval_required: true,
          timezone,
          item_count: items.length,
          items: validations.map((result) => ({
            review_id: result.review_id,
            scheduled_at: result.scheduled_at,
            schedule_name: result.schedule_name,
            valid: true
          }))
        };
      }

      const results = [];
      for (const item of items) {
        results.push(await resolvedScheduler.schedule(
          childEvent(event, {
            scheduled_at: item.scheduled_at,
            timezone,
            confirm_schedule: true
          }),
          item.review_id
        ));
      }

      return {
        scheduled: true,
        mode: 'batch_scheduled',
        timezone,
        item_count: results.length,
        items: results.map((result) => ({
          review_id: result.review_id,
          scheduled_at: result.scheduled_at,
          schedule_name: result.schedule_name,
          publishing_status: result.item?.publishing_status,
          item: result.item
        }))
      };
    }
  };
}
