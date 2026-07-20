import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNotificationInput,
  validateNotification
} from '../notifications.mjs';

test('public notification defaults remain account-ready', () => {
  const payload = normalizeNotificationInput({
    headline: 'New song',
    message: 'Listen now.'
  });

  assert.equal(payload.status, 'draft');
  assert.equal(payload.audience_type, 'public');
  assert.deepEqual(payload.delivery_channels, ['in_app']);
  assert.deepEqual(payload.artist_keys, []);
  assert.deepEqual(payload.target_user_ids, []);
  assert.equal(validateNotification(payload), '');
});

test('published notification receives a publish timestamp', () => {
  const payload = normalizeNotificationInput({
    headline: 'New video',
    message: 'Watch the new video.',
    status: 'published'
  });

  assert.equal(validateNotification(payload), '');
  assert.ok(payload.publish_at);
  assert.equal(Number.isNaN(new Date(payload.publish_at).getTime()), false);
});

test('artist follower audience requires artist keys', () => {
  const payload = normalizeNotificationInput({
    headline: 'Band update',
    message: 'Tour dates added.',
    audience_type: 'artist_followers'
  });

  assert.match(validateNotification(payload), /artist key/i);
});

test('artist follower audience stores stable artist keys', () => {
  const payload = normalizeNotificationInput({
    headline: 'Band update',
    message: 'Tour dates added.',
    audience_type: 'artist_followers',
    artist_keys: ['stashbox', 'stashbox', 'inner-circle']
  });

  assert.deepEqual(payload.artist_keys, ['stashbox', 'inner-circle']);
  assert.equal(validateNotification(payload), '');
});

test('specific user audience requires internal user IDs', () => {
  const payload = normalizeNotificationInput({
    headline: 'Private release',
    message: 'Your early-access track is ready.',
    audience_type: 'specific_users'
  });

  assert.match(validateNotification(payload), /user ID/i);
});
