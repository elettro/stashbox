import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublishService } from '../review-publish.mjs';

function fixture(overrides = {}) {
  const reviewId = 'render-job-12345678';
  const review = {
    id: reviewId,
    status: 'approved',
    approval_state: 'approved',
    publishing_status: 'scheduled',
    video: {
      object_key: 'incoming/render-jobs/job-12345678/test.mp4',
      aspect_ratio: '9:16'
    },
    metadata: {
      selected_title: 'Scheduled Test Song',
      description: 'Scheduled description',
      tags: ['Stashbox'],
      category_id: '10'
    },
    publish_settings: {
      visibility: 'unlisted',
      made_for_kids: false,
      notify_subscribers: false,
      scheduled_at: '2026-07-29T15:00:00.000Z'
    },
    schedule: {
      schedule_name: 'social-review-test',
      scheduled_at: '2026-07-29T15:00:00.000Z',
      status: 'scheduled',
      attempt_count: 0
    },
    ...overrides
  };
  const reviews = new Map([[reviewId, structuredClone(review)]]);
  const calls = [];
  const store = {
    async getReview(id) {
      return reviews.has(id) ? structuredClone(reviews.get(id)) : null;
    },
    async putReview(id, item) {
      reviews.set(id, structuredClone(item));
      return item;
    }
  };
  const secretStore = {
    async read() {
      return { admin_token: 'test-admin-token' };
    }
  };
  const youtubePublish = {
    async publish(event) {
      const body = JSON.parse(event.body);
      calls.push({ event, body });
      return {
        uploaded: true,
        mode: 'unlisted_upload',
        privacy_status: 'unlisted',
        youtube_video_id: 'scheduled-video-123',
        youtube_url: 'https://example.com/video/scheduled-video-123'
      };
    }
  };

  return {
    reviewId,
    reviews,
    calls,
    service: createReviewPublishService({
      secretStore,
      store,
      youtubePublish,
      configSecretId: 'config',
      now: () => new Date('2026-07-29T15:00:10.000Z')
    })
  };
}

test('scheduled worker publishes due approved item', async () => {
  const { service, reviewId, reviews, calls } = fixture();
  const result = await service.publishScheduled(reviewId, '2026-07-29T15:00:00.000Z');

  assert.equal(result.uploaded, true);
  assert.equal(result.item.publishing_status, 'published');
  assert.equal(result.item.schedule.status, 'completed');
  assert.equal(result.item.schedule.attempt_count, 1);
  assert.equal(result.item.platform_results.youtube.video_id, 'scheduled-video-123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event.headers['x-admin-token'], 'test-admin-token');
  assert.equal(calls[0].body.confirm_upload, true);
  assert.equal(reviews.get(reviewId).published_at, '2026-07-29T15:00:10.000Z');
});

test('scheduled worker rejects unsupported 4:5 YouTube content', async () => {
  const { service, reviewId, calls } = fixture({
    video: {
      object_key: 'incoming/render-jobs/job-12345678/test.mp4',
      aspect_ratio: '4:5'
    }
  });

  await assert.rejects(
    service.publishScheduled(reviewId, '2026-07-29T15:00:00.000Z'),
    error => error.statusCode === 409
      && error.message === 'youtube_aspect_ratio_not_supported'
      && error.details?.aspect_ratio === '4:5'
  );
  assert.equal(calls.length, 0);
});

test('stale schedule message is acknowledged without uploading', async () => {
  const { service, reviewId, calls } = fixture();
  const result = await service.publishScheduled(reviewId, '2026-07-29T14:00:00.000Z');

  assert.equal(result.skipped, true);
  assert.equal(result.mode, 'stale_schedule_message');
  assert.equal(calls.length, 0);
});

test('item placed on hold before its scheduled time is skipped', async () => {
  const { service, reviewId, calls } = fixture({
    status: 'held',
    approval_state: 'held'
  });
  const result = await service.publishScheduled(reviewId, '2026-07-29T15:00:00.000Z');

  assert.equal(result.skipped, true);
  assert.equal(result.mode, 'scheduled_item_no_longer_approved');
  assert.equal(calls.length, 0);
});

test('scheduled publishing refuses an early queue delivery', async () => {
  const base = fixture();
  const service = createReviewPublishService({
    secretStore: { async read() { return { admin_token: 'test-admin-token' }; } },
    store: {
      async getReview(id) { return structuredClone(base.reviews.get(id)); },
      async putReview(id, item) { base.reviews.set(id, structuredClone(item)); }
    },
    youtubePublish: { async publish() { throw new Error('should_not_publish'); } },
    configSecretId: 'config',
    now: () => new Date('2026-07-29T14:50:00.000Z')
  });

  await assert.rejects(
    service.publishScheduled(base.reviewId, '2026-07-29T15:00:00.000Z'),
    (error) => error.statusCode === 409 && error.message === 'scheduled_publish_not_due'
  );
});