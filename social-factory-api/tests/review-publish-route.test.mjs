import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../index.mjs';

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
