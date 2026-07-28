import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../index.mjs';

function event(path, body = {}) {
  return {
    rawPath: path,
    requestContext: {
      stage: 'dev',
      http: { method: 'POST', path }
    },
    headers: { 'x-admin-token': 'social-admin' },
    body: JSON.stringify(body)
  };
}

test('POST schedule cancel route forwards to the review scheduler', async () => {
  const calls = [];
  const handler = createHandler({
    youtubeOAuth: {},
    reviewScheduler: {
      async cancel(request, reviewId) {
        calls.push({ request, reviewId });
        return {
          cancelled: true,
          mode: 'schedule_cancelled',
          review_id: reviewId,
          publishing_triggered: false,
          youtube_published: false
        };
      }
    }
  });

  const reviewId = 'render-job-12345678';
  const response = await handler(event(
    `/social/review-items/${reviewId}/schedule/cancel`,
    { confirm_cancel_schedule: true }
  ));

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.cancelled, true);
  assert.equal(payload.mode, 'schedule_cancelled');
  assert.equal(payload.review_id, reviewId);
  assert.equal(payload.publishing_triggered, false);
  assert.equal(payload.youtube_published, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reviewId, reviewId);
});
