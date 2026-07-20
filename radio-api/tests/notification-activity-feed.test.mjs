import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_MAX_PER_HOUR,
  activityBucketStart,
  activityHourStart,
  buildActivityCopy,
  buildActivitySourceKey
} from '../notification-activity-feed.mjs';

test('activity notifications use stable thirty-minute dedupe buckets', () => {
  const first = buildActivitySourceKey('like', 'sun-ra-stashbox', '2026-07-20T19:01:00Z');
  const sameBucket = buildActivitySourceKey('like', 'sun-ra-stashbox', '2026-07-20T19:29:59Z');
  const nextBucket = buildActivitySourceKey('like', 'sun-ra-stashbox', '2026-07-20T19:30:00Z');

  assert.equal(first, sameBucket);
  assert.notEqual(first, nextBucket);
});

test('activity bucket and hour calculations are UTC stable', () => {
  assert.equal(activityBucketStart('2026-07-20T19:44:00Z').toISOString(), '2026-07-20T19:30:00.000Z');
  assert.equal(activityHourStart('2026-07-20T19:44:00Z').toISOString(), '2026-07-20T19:00:00.000Z');
  assert.equal(ACTIVITY_MAX_PER_HOUR, 10);
});

test('activity copy protects listener privacy', () => {
  const liked = buildActivityCopy('like', 'Sun Ra', 'Stashbox');
  const shared = buildActivityCopy('share', 'Help Jamaica Now', 'Stashbox');

  assert.match(liked.message, /^A listener liked/);
  assert.match(shared.message, /^A listener shared/);
  assert.equal(liked.message.includes('user'), false);
  assert.equal(shared.message.includes('user'), false);
});
