import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublishService } from '../review-publish.mjs';

function event(body, token = 'social-admin') {
  return {
    headers: token ? { 'x-admin-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

function fixture(overrides = {}) {
  const reviewId = 'render-job-12345678';
  const review = {
    id: reviewId,
    status: 'approved',
    approval_state: 'approved',
    publishing_status: 'not_published',
    video: {
      object_key: 'incoming/render-jobs/job-12345678/test.mp4',
      content_type: 'video/mp4',
      size_bytes: 4998155,
      aspect_ratio: '9:16'
    },
    metadata: {
      selected_title: 'Stashbox - Test Song | Official Short',
      description: 'Test description',
      tags: ['Stashbox', 'Test Song'],
      category_id: '10'
    },
    publish_settings: {
      visibility: 'unlisted',
      made_for_kids: false,
      notify_subscribers: false,
      scheduled_at: null
    },
    updated_at: '2026-07-28T12:00:00.000Z',
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
      return { admin_token: 'social-admin' };
    }
  };
  const youtubePublish = {
    async publish(publishEvent) {
      const body = JSON.parse(publishEvent.body);
      calls.push(body);
      if (body.confirm_upload !== true) {
        return {
          uploaded: false,
          mode: 'validation_only',
          ready: true,
          channel_id: 'channel-123',
          object_key: body.object_key,
          privacy_status: 'unlisted',
          title: body.title
        };
      }
      return {
        uploaded: true,
        mode: 'unlisted_upload',
        privacy_status: 'unlisted',
        youtube_video_id: 'youtube-video-123',
        youtube_url: 'https://www.youtube.com/watch?v=youtube-video-123'
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
      now: () => new Date('2026-07-28T13:00:00.000Z')
    })
  };
}

test('approved review item can be validated without publishing', async () => {
  const { service, reviewId, reviews, calls } = fixture();
  const result = await service.publish(event({ confirm_upload: false }), reviewId);

  assert.equal(result.publishing_triggered, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.ready, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].object_key, 'incoming/render-jobs/job-12345678/test.mp4');
  assert.equal(calls[0].title, 'Stashbox - Test Song | Official Short');
  assert.equal(reviews.get(reviewId).publishing_status, 'not_published');
});

test('confirmed publish records the YouTube result on the review item', async () => {
  const { service, reviewId, reviews } = fixture();
  const result = await service.publish(event({ confirm_upload: true }), reviewId);

  assert.equal(result.publishing_triggered, true);
  assert.equal(result.uploaded, true);
  assert.equal(result.item.publishing_status, 'published');
  assert.equal(result.item.publish_settings.actual_visibility, 'unlisted');
  assert.equal(result.item.platform_results.youtube.video_id, 'youtube-video-123');
  assert.equal(result.item.platform_results.youtube.url, 'https://www.youtube.com/watch?v=youtube-video-123');
  assert.equal(reviews.get(reviewId).published_at, '2026-07-28T13:00:00.000Z');
});

test('review item must be approved before publishing', async () => {
  const { service, reviewId } = fixture({ status: 'in_review', approval_state: 'pending' });
  await assert.rejects(
    service.publish(event({ confirm_upload: true }), reviewId),
    (error) => error.statusCode === 409 && error.message === 'review_item_not_approved'
  );
});

test('4:5 review item cannot be validated or published to YouTube', async () => {
  const { service, reviewId, calls } = fixture({
    video: {
      object_key: 'incoming/render-jobs/job-12345678/test.mp4',
      content_type: 'video/mp4',
      size_bytes: 4998155,
      aspect_ratio: '4:5'
    }
  });

  await assert.rejects(
    service.publish(event({ confirm_upload: false }), reviewId),
    error => error.statusCode === 409
      && error.message === 'youtube_aspect_ratio_not_supported'
      && error.details?.aspect_ratio === '4:5'
  );
  assert.equal(calls.length, 0);
});

test('future scheduled items remain locked until the asynchronous queue exists', async () => {
  const { service, reviewId, calls } = fixture({
    publish_settings: {
      visibility: 'private',
      made_for_kids: false,
      notify_subscribers: false,
      scheduled_at: '2026-07-29T13:00:00.000Z'
    }
  });

  await assert.rejects(
    service.publish(event({ confirm_upload: true }), reviewId),
    (error) => error.statusCode === 409 && error.message === 'scheduled_publish_queue_required'
  );
  assert.equal(calls.length, 0);
});

test('published review items are idempotent and do not upload twice', async () => {
  const { service, reviewId, calls } = fixture({
    publishing_status: 'published',
    platform_results: {
      youtube: {
        status: 'published',
        video_id: 'existing-video',
        url: 'https://www.youtube.com/watch?v=existing-video'
      }
    }
  });
  const result = await service.publish(event({ confirm_upload: true }), reviewId);

  assert.equal(result.mode, 'already_published');
  assert.equal(result.publishing_triggered, false);
  assert.equal(calls.length, 0);
});

test('review publishing requires the Social Factory admin token', async () => {
  const { service, reviewId } = fixture();
  await assert.rejects(
    service.publish(event({ confirm_upload: false }, ''), reviewId),
    (error) => error.statusCode === 401 && error.message === 'unauthorized'
  );
});

test('large confirmed publish enters the background upload queue', async () => {
  const reviewId = 'render-large-12345678';
  const reviews = new Map([[reviewId, {
    id: reviewId,
    status: 'approved',
    approval_state: 'approved',
    publishing_status: 'not_published',
    video: { object_key: 'incoming/render-jobs/large/video.mp4', size_bytes: 90_000_000, aspect_ratio: '9:16' },
    metadata: { selected_title: 'Large Test', description: '', tags: [], category_id: '10' },
    publish_settings: { visibility: 'unlisted', made_for_kids: false, notify_subscribers: false, scheduled_at: null }
  }]]);
  const queued = [];
  const service = createReviewPublishService({
    secretStore: { async read() { return { admin_token: 'social-admin' }; } },
    store: {
      async getReview(id) { return structuredClone(reviews.get(id)); },
      async putReview(id, item) { reviews.set(id, structuredClone(item)); }
    },
    publishQueue: { async enqueue(message) { queued.push(message); } },
    youtubePublish: {
      async publish(publishEvent) {
        const body = JSON.parse(publishEvent.body);
        assert.equal(body.confirm_upload, false);
        return {
          uploaded: false,
          mode: 'validation_only',
          ready: true,
          content_length: 90_000_000,
          max_direct_publish_bytes: 25_000_000
        };
      }
    },
    configSecretId: 'config',
    now: () => new Date('2026-07-30T15:30:00.000Z')
  });

  const result = await service.publish(event({ confirm_upload: true }), reviewId);
  assert.equal(result.queued, true);
  assert.equal(result.mode, 'background_upload');
  assert.equal(reviews.get(reviewId).publishing_status, 'queued');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].reviewId, reviewId);
});
