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

function validationFailure(item, error) {
  return {
    review_id: item.review_id,
    scheduled_at: item.scheduled_at,
    valid: false,
    approved: false,
    error: String(error?.message || 'validation_failed'),
    status_code: Number(error?.statusCode || error?.status || 400),
    details: error?.details || null
  };
}

export function createBatchScheduleService({ scheduler = null } = {}) {
  const resolvedScheduler = scheduler || createSchedulePublishService();
  return {
    async schedule(event) {
      const input = parseBody(event);
      const items = normalizeItems(input);
      const timezone = String(input.timezone || 'America/New_York').trim() || 'America/New_York';
      const confirmBatch = input.confirm_batch_schedule === true || input.confirm_schedule === true;

      const validations = [];
      for (const item of items) {
        try {
          const result = await resolvedScheduler.schedule(
            childEvent(event, {
              scheduled_at: item.scheduled_at,
              timezone,
              confirm_schedule: false
            }),
            item.review_id
          );
          validations.push({
            review_id: result.review_id || item.review_id,
            scheduled_at: result.scheduled_at || item.scheduled_at,
            schedule_name: result.schedule_name || null,
            valid: true,
            approved: true,
            error: null,
            details: null
          });
        } catch (error) {
          validations.push(validationFailure(item, error));
        }
      }

      const batchReady = validations.every((result) => result.valid === true);

      if (!confirmBatch) {
        return {
          scheduled: false,
          mode: 'validation_only',
          approval_required: batchReady,
          batch_ready_for_confirmation: batchReady,
          timezone,
          item_count: items.length,
          valid_item_count: validations.filter((result) => result.valid).length,
          invalid_item_count: validations.filter((result) => !result.valid).length,
          items: validations
        };
      }

      if (!batchReady) {
        return {
          scheduled: false,
          mode: 'validation_failed',
          approval_required: false,
          batch_ready_for_confirmation: false,
          timezone,
          item_count: items.length,
          valid_item_count: validations.filter((result) => result.valid).length,
          invalid_item_count: validations.filter((result) => !result.valid).length,
          items: validations
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
        batch_ready_for_confirmation: true,
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
