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
    headers: { 'x-admin-token': 'test-admin-token' },
    body: JSON.stringify(body)
  };
}

test('review schedule route delegates to the isolated scheduling service', async () => {
  const calls = [];
  const handler = createHandler({
    youtubeOAuth: {},
    reviewScheduler: {
      async schedule(event, reviewId) {
        calls.push({ event, reviewId });
        return {
          scheduled: false,
          mode: 'validation_only',
          review_id: reviewId,
          scheduled_at: '2026-07-29T15:00:00.000Z'
        };
      }
    }
  });

  const response = await handler(request(
    '/social/review-items/render-job-12345678/schedule',
    { confirm_schedule: false }
  ));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'validation_only');
  assert.equal(body.review_id, 'render-job-12345678');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reviewId, 'render-job-12345678');
});
