import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPublishWorker } from '../scheduled-publish-worker.mjs';

function record(body, messageId = 'message-1') {
  return {
    messageId,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

test('worker publishes a due review item and acknowledges the queue message', async () => {
  const calls = [];
  const worker = createScheduledPublishWorker({
    reviewPublisher: {
      async publishScheduled(reviewId, scheduledAt) {
        calls.push({ reviewId, scheduledAt });
        return { uploaded: true, mode: 'unlisted_upload' };
      }
    },
    reviewStore: {
      async getReview() { return null; },
      async putReview() {}
    }
  });

  const result = await worker({
    Records: [record({
      review_id: 'render-job-12345678',
      scheduled_at: '2026-07-29T15:00:00.000Z'
    })]
  });

  assert.deepEqual(result.batchItemFailures, []);
  assert.deepEqual(calls, [{
    reviewId: 'render-job-12345678',
    scheduledAt: '2026-07-29T15:00:00.000Z'
  }]);
});

test('worker acknowledges stale or no-longer-approved scheduled items', async () => {
  const worker = createScheduledPublishWorker({
    reviewPublisher: {
      async publishScheduled() {
        return { uploaded: false, skipped: true, mode: 'stale_schedule_message' };
      }
    },
    reviewStore: {
      async getReview() { return null; },
      async putReview() {}
    }
  });

  const result = await worker({
    Records: [record({
      review_id: 'render-job-12345678',
      scheduled_at: '2026-07-29T15:00:00.000Z'
    })]
  });

  assert.deepEqual(result.batchItemFailures, []);
});

test('worker returns partial batch failure and records retry state', async () => {
  const reviews = new Map([['render-job-12345678', {
    id: 'render-job-12345678',
    publishing_status: 'scheduled',
    schedule: { status: 'scheduled' }
  }]]);
  const worker = createScheduledPublishWorker({
    reviewPublisher: {
      async publishScheduled() {
        throw new Error('youtube_video_upload_failed');
      }
    },
    reviewStore: {
      async getReview(id) {
        return structuredClone(reviews.get(id));
      },
      async putReview(id, item) {
        reviews.set(id, structuredClone(item));
      }
    },
    now: () => new Date('2026-07-29T15:00:10.000Z')
  });

  const result = await worker({
    Records: [record({
      review_id: 'render-job-12345678',
      scheduled_at: '2026-07-29T15:00:00.000Z'
    }, 'message-retry')]
  });

  assert.deepEqual(result.batchItemFailures, [{ itemIdentifier: 'message-retry' }]);
  assert.equal(reviews.get('render-job-12345678').publishing_status, 'retrying');
  assert.equal(reviews.get('render-job-12345678').schedule.status, 'retrying');
  assert.equal(reviews.get('render-job-12345678').schedule.last_error, 'youtube_video_upload_failed');
});

test('invalid queue messages are sent toward the dead-letter queue', async () => {
  const worker = createScheduledPublishWorker({
    reviewPublisher: {
      async publishScheduled() {
        throw new Error('should_not_run');
      }
    },
    reviewStore: {
      async getReview() { return null; },
      async putReview() {}
    }
  });

  const result = await worker({ Records: [record('{bad-json', 'bad-message')] });
  assert.deepEqual(result.batchItemFailures, [{ itemIdentifier: 'bad-message' }]);
});


test('worker processes an immediate large-video publish message', async () => {
  const calls = [];
  const worker = createScheduledPublishWorker({
    reviewPublisher: {
      async publishQueued(reviewId) {
        calls.push(reviewId);
        return { uploaded: true, mode: 'unlisted_upload' };
      },
      async publishScheduled() {
        throw new Error('scheduled path should not run');
      }
    },
    reviewStore: {
      async getReview() { return null; },
      async putReview() {}
    }
  });

  const result = await worker({
    Records: [record({
      type: 'social_factory_immediate_publish',
      review_id: 'render-large-12345678',
      queued_at: '2026-07-30T15:30:00.000Z'
    }, 'immediate-message')]
  });

  assert.deepEqual(result.batchItemFailures, []);
  assert.deepEqual(calls, ['render-large-12345678']);
});
