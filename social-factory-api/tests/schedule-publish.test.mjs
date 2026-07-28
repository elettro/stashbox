import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchedulePublishService } from '../schedule-publish.mjs';

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
    publish_settings: {
      visibility: 'unlisted',
      scheduled_at: '2026-07-29T15:00:00.000Z'
    },
    ...overrides
  };
  const reviews = new Map([[reviewId, structuredClone(review)]]);
  const operations = [];
  const reviewStore = {
    async getReview(id) {
      return reviews.has(id) ? structuredClone(reviews.get(id)) : null;
    },
    async putReview(id, item) {
      reviews.set(id, structuredClone(item));
      return item;
    }
  };
  const scheduleStore = {
    groupName: 'stashbox-social-publish-dev',
    queueArn: 'arn:aws:sqs:us-east-1:123456789012:stashbox-social-publish-dev',
    targetRoleArn: 'arn:aws:iam::123456789012:role/stashbox-social-scheduler-dev',
    async delete(name) {
      operations.push({ action: 'delete', name });
    },
    async create(input) {
      operations.push({ action: 'create', ...input });
    }
  };
  const secretStore = {
    async read() {
      return { admin_token: 'social-admin' };
    }
  };

  return {
    reviewId,
    reviews,
    operations,
    service: createSchedulePublishService({
      secretStore,
      reviewStore,
      scheduleStore,
      configSecretId: 'config',
      now: () => new Date('2026-07-28T15:00:00.000Z')
    })
  };
}

test('scheduled publishing validates without creating a schedule', async () => {
  const { service, reviewId, operations, reviews } = fixture();
  const result = await service.schedule(event({ confirm_schedule: false }), reviewId);

  assert.equal(result.scheduled, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.scheduled_at, '2026-07-29T15:00:00.000Z');
  assert.equal(operations.length, 0);
  assert.equal(reviews.get(reviewId).publishing_status, 'not_published');
});

test('confirmed scheduling creates a one-time queue schedule and updates review state', async () => {
  const { service, reviewId, operations, reviews } = fixture();
  const result = await service.schedule(event({ confirm_schedule: true }), reviewId);

  assert.equal(result.scheduled, true);
  assert.equal(result.mode, 'scheduled_queue');
  assert.equal(operations.length, 1);
  assert.equal(operations[0].action, 'create');
  assert.equal(operations[0].reviewId, reviewId);
  assert.equal(operations[0].scheduledAt.toISOString(), '2026-07-29T15:00:00.000Z');
  assert.equal(reviews.get(reviewId).publishing_status, 'scheduled');
  assert.equal(reviews.get(reviewId).schedule.status, 'scheduled');
});

test('same scheduled time is idempotent', async () => {
  const base = fixture();
  const first = await base.service.schedule(event({ confirm_schedule: true }), base.reviewId);
  base.operations.length = 0;
  const second = await base.service.schedule(event({ confirm_schedule: true }), base.reviewId);

  assert.equal(first.scheduled, true);
  assert.equal(second.mode, 'already_scheduled');
  assert.equal(base.operations.length, 0);
});

test('rescheduling deletes the previous one-time schedule and creates a new name', async () => {
  const base = fixture();
  const first = await base.service.schedule(event({ confirm_schedule: true }), base.reviewId);
  base.operations.length = 0;
  const second = await base.service.schedule(event({
    confirm_schedule: true,
    scheduled_at: '2026-07-30T15:00:00.000Z'
  }), base.reviewId);

  assert.equal(second.scheduled, true);
  assert.notEqual(second.schedule_name, first.schedule_name);
  assert.deepEqual(base.operations.map((item) => item.action), ['delete', 'create']);
  assert.equal(base.operations[0].name, first.schedule_name);
  assert.equal(base.operations[1].name, second.schedule_name);
});

test('schedule requires an approved item', async () => {
  const { service, reviewId } = fixture({ status: 'in_review', approval_state: 'pending' });
  await assert.rejects(
    service.schedule(event({ confirm_schedule: true }), reviewId),
    (error) => error.statusCode === 409 && error.message === 'review_item_not_approved'
  );
});

test('schedule rejects times with less than two minutes lead time', async () => {
  const { service, reviewId } = fixture({
    publish_settings: {
      visibility: 'unlisted',
      scheduled_at: '2026-07-28T15:01:00.000Z'
    }
  });
  await assert.rejects(
    service.schedule(event({ confirm_schedule: true }), reviewId),
    (error) => error.statusCode === 422 && error.message === 'scheduled_at_too_soon'
  );
});

test('schedule requires the Social Factory admin token', async () => {
  const { service, reviewId } = fixture();
  await assert.rejects(
    service.schedule(event({ confirm_schedule: false }, ''), reviewId),
    (error) => error.statusCode === 401 && error.message === 'unauthorized'
  );
});
