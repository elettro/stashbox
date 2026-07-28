import { createReviewPublishService, createAwsReviewPublishStore } from './review-publish.mjs';

function safeMessage(record = {}) {
  let payload;
  try {
    payload = JSON.parse(String(record.body || ''));
  } catch {
    const error = new Error('invalid_schedule_message_json');
    error.statusCode = 422;
    throw error;
  }

  const reviewId = String(payload.review_id || '').trim();
  const scheduledAt = String(payload.scheduled_at || '').trim();
  if (!/^[a-zA-Z0-9-]{8,120}$/.test(reviewId)) {
    const error = new Error('invalid_schedule_review_id');
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isFinite(Date.parse(scheduledAt))) {
    const error = new Error('invalid_schedule_timestamp');
    error.statusCode = 422;
    throw error;
  }
  return { reviewId, scheduledAt, payload };
}

export function createScheduledPublishWorker({
  reviewPublisher = null,
  reviewStore = null,
  now = () => new Date()
} = {}) {
  let resolvedReviewPublisher = reviewPublisher;
  let resolvedReviewStore = reviewStore;

  function getReviewPublisher() {
    if (!resolvedReviewPublisher) resolvedReviewPublisher = createReviewPublishService();
    return resolvedReviewPublisher;
  }

  function getReviewStore() {
    if (!resolvedReviewStore) resolvedReviewStore = createAwsReviewPublishStore();
    return resolvedReviewStore;
  }

  async function recordFailure(reviewId, error) {
    if (!reviewId) return;
    try {
      const item = await getReviewStore().getReview(reviewId);
      if (!item || item.publishing_status === 'published') return;
      const timestamp = now().toISOString();
      await getReviewStore().putReview(reviewId, {
        ...item,
        publishing_status: 'retrying',
        schedule: {
          ...item.schedule,
          status: 'retrying',
          last_error: String(error?.message || error || 'scheduled_publish_failed').slice(0, 500),
          last_failed_at: timestamp
        },
        updated_at: timestamp
      });
    } catch (storeError) {
      console.error('Unable to record scheduled publish failure', {
        reviewId,
        error: storeError?.message || storeError
      });
    }
  }

  return async function scheduledPublishWorker(event = {}) {
    const failures = [];
    const records = Array.isArray(event.Records) ? event.Records : [];

    for (const record of records) {
      let reviewId = '';
      try {
        const message = safeMessage(record);
        reviewId = message.reviewId;
        const result = await getReviewPublisher().publishScheduled(
          message.reviewId,
          message.scheduledAt
        );
        console.log('Scheduled Social Factory publish processed', {
          reviewId: message.reviewId,
          mode: result.mode || '',
          uploaded: Boolean(result.uploaded),
          skipped: Boolean(result.skipped)
        });
      } catch (error) {
        console.error('Scheduled Social Factory publish failed', {
          reviewId,
          messageId: record?.messageId || '',
          error: error?.message || error
        });
        await recordFailure(reviewId, error);
        failures.push({ itemIdentifier: String(record?.messageId || '') });
      }
    }

    return {
      batchItemFailures: failures.filter((item) => item.itemIdentifier)
    };
  };
}

export const handler = createScheduledPublishWorker();
