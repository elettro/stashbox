import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../index.mjs';
import { createReviewPublishService } from '../review-publish.mjs';
import { createYoutubePublishService } from '../youtube-publish.mjs';

function request(path, body = {}) {
  return {
    rawPath: path,
    requestContext: {
      stage: '$default',
      http: {
        method: 'POST',
        path
      }
    },
    headers: {
      'x-admin-token': 'social-admin'
    },
    body: JSON.stringify(body)
  };
}

test('review publish route delegates to the isolated review publisher', async () => {
  const calls = [];
  const handler = createHandler({
    youtubeOAuth: {},
    reviewPublisher: {
      async publish(event, reviewId) {
        calls.push({ event, reviewId });
        return {
          publishing_triggered: false,
          uploaded: false,
          mode: 'validation_only',
          review_id: reviewId
        };
      }
    }
  });

  const response = await handler(request(
    '/social/review-items/render-job-12345678/publish',
    { confirm_upload: false }
  ));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'validation_only');
  assert.equal(body.review_id, 'render-job-12345678');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reviewId, 'render-job-12345678');
});

test('ChatGPT video validation reports a sanitized Google OAuth refresh failure', async () => {
  const reviewId = 'upload-54af0446e258d6eae1dd61907de9f5333f8b5004452fe3f27897d0a003e795ae';
  const item = {
    id: reviewId,
    status: 'approved',
    approval_state: 'approved',
    publishing_status: 'not_published',
    video: {
      object_key: 'incoming/chatgpt/imported-video.mp4',
      content_type: 'video/mp4',
      size_bytes: 31_422_001,
      aspect_ratio: '9:16'
    },
    metadata: { selected_title: 'Imported ChatGPT video', description: '', tags: [] },
    publish_settings: {
      visibility: 'public',
      made_for_kids: false,
      notify_subscribers: false,
      scheduled_at: null
    }
  };
  const reviews = new Map([[reviewId, structuredClone(item)]]);
  const calls = [];
  const secretStore = {
    async read(id) {
      if (id === 'config') {
        return {
          admin_token: 'social-admin',
          client_id: 'client-id',
          client_secret: 'client-secret'
        };
      }
      return {
        refresh_token: 'refresh-token-secret',
        access_token: 'expired-access-token-secret',
        access_token_expires_at: '2026-07-27T20:00:00.000Z',
        channel_id: 'UC123'
      };
    },
    async write() {
      calls.push('secret_write');
    }
  };
  const youtubePublish = createYoutubePublishService({
    secretStore,
    stagingStore: {
      async head() {
        calls.push('s3_head');
        return {
          ContentType: 'video/mp4',
          ContentLength: item.video.size_bytes,
          Metadata: { expected_size_bytes: String(item.video.size_bytes) }
        };
      }
    },
    fetchImpl: async (_url, options) => {
      calls.push('google_oauth');
      assert.equal(String(options.body).includes('refresh-token-secret'), true);
      return {
        ok: false,
        status: 400,
        async json() {
          return {
            error: 'invalid_grant',
            error_description: 'Refresh token refresh-token-secret was revoked'
          };
        }
      };
    },
    now: () => Date.UTC(2026, 6, 28, 13),
    configSecretId: 'config',
    tokenSecretId: 'tokens'
  });
  const reviewPublisher = createReviewPublishService({
    secretStore: { async read() { return { admin_token: 'social-admin' }; } },
    store: {
      async getReview(id) { return structuredClone(reviews.get(id)); },
      async putReview(id, value) { reviews.set(id, structuredClone(value)); }
    },
    youtubePublish,
    configSecretId: 'config',
    now: () => new Date('2026-07-28T13:00:00.000Z')
  });
  const handler = createHandler({ youtubeOAuth: {}, reviewPublisher });

  const response = await handler(request(
    `/social/review-items/${reviewId}/publish`,
    { confirm_upload: false }
  ));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 502);
  assert.equal(body.error, 'youtube_token_refresh_failed');
  assert.deepEqual(body.diagnostic, {
    stage: 'review_publish_validation',
    error_code: 'youtube_token_refresh_failed',
    status_code: 502,
    failure_stage: 'youtube_credentials',
    failure_category: 'oauth_token_refresh_failed',
    dependency: 'google_oauth',
    internal_error_code: 'youtube_token_refresh_failed',
    provider_error_code: 'invalid_grant',
    upstream_status: 400,
    message: 'Google OAuth rejected the access-token refresh request.'
  });
  assert.equal(response.body.includes('refresh-token-secret'), false);
  assert.equal(response.body.includes('revoked'), false);
  assert.deepEqual(calls, ['s3_head', 'google_oauth']);
  assert.equal(reviews.get(reviewId).publishing_status, 'not_published');
});
