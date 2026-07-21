import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  easternDateKey,
  highestReached,
  isPersonalizedNotificationFeedRequest
} from '../personalized-notifications.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('personalized notification feed route matches only the collection GET shape', () => {
  assert.equal(isPersonalizedNotificationFeedRequest(['radio', 'notifications']), true);
  assert.equal(isPersonalizedNotificationFeedRequest(['radio', 'notifications', 'notice-1']), false);
  assert.equal(isPersonalizedNotificationFeedRequest(['radio', 'songs']), false);
});

test('milestone selection returns the highest achieved threshold', () => {
  assert.equal(highestReached(9, [10, 50, 100]), 0);
  assert.equal(highestReached(10, [10, 50, 100]), 10);
  assert.equal(highestReached(87, [10, 50, 100]), 50);
  assert.equal(highestReached(500, [10, 50, 100]), 100);
});

test('daily notification keys use an Eastern calendar date', () => {
  assert.match(easternDateKey(new Date('2026-07-21T16:00:00Z')), /^2026-07-21$/);
});

test('personalized feed includes public, registered, specific, followed artist, and premium audiences', () => {
  const source = read('radio-api/personalized-notifications.mjs');
  assert.match(source, /n\.audience_type = 'public'/);
  assert.match(source, /n\.audience_type = 'all_registered_users'/);
  assert.match(source, /n\.audience_type = 'specific_users'/);
  assert.match(source, /n\.target_user_ids @> jsonb_build_array\(\$1::text\)/);
  assert.match(source, /n\.audience_type = 'artist_followers'/);
  assert.match(source, /f\.notifications_enabled = true/);
  assert.match(source, /n\.artist_keys @> jsonb_build_array\(f\.artist_key::text\)/);
  assert.match(source, /n\.audience_type = 'premium_members'/);
  assert.match(source, /r\.role = 'premium_listener'/);
});

test('personalized feed respects in-app and category preferences', () => {
  const source = read('radio-api/personalized-notifications.mjs');
  assert.match(source, /COALESCE\(pref\.in_app_enabled, true\) = true/);
  assert.match(source, /jsonb_array_length\(pref\.categories\)/);
  assert.match(source, /pref\.categories @> jsonb_build_array\(n\.category::text\)/);
});

test('listener and favorite milestones are deduplicated by stable source keys', () => {
  const source = read('radio-api/personalized-notifications.mjs');
  assert.match(source, /listener:\$\{account\.user\.id\}:\$\{achievement\.type\}:\$\{milestone\}/);
  assert.match(source, /favorite-like:\$\{account\.user\.id\}:\$\{presentation\.songKey\}:\$\{milestone\}/);
  assert.match(source, /ON CONFLICT \(source_type, source_key\) WHERE source_key IS NOT NULL DO NOTHING/);
  assert.match(source, /if \(created >= 3\) break/);
  assert.match(source, /\[10, 50, 100, 250\]/);
  assert.match(source, /You rock/);
});

test('daily top song uses existing qualified play events and updates one daily record', () => {
  const source = read('radio-api/personalized-notifications.mjs');
  assert.match(source, /event_type = 'play_start'/);
  assert.match(source, /America\/New_York/);
  assert.match(source, /HAVING COUNT\(\*\) >= 3/);
  assert.match(source, /daily-top-song:\$\{easternDateKey\(\)\}/);
  assert.match(source, /DO UPDATE SET/);
  assert.match(source, /Today's most-played song/);
});

test('DEV wrapper intercepts notification feed before the original public handler', () => {
  const wrapper = read('radio-api/video-factory/entry.mjs');
  assert.match(wrapper, /isPersonalizedNotificationFeedRequest/);
  assert.match(wrapper, /personalizedNotificationFeedRequest/);
  assert.match(wrapper, /handlePersonalizedNotificationFeedRequest/);
  assert.ok(wrapper.indexOf('if (personalizedNotificationFeedRequest)') < wrapper.indexOf('if (accountRequest)'));
});

test('notification drawer sends Cognito credentials and reloads after follow changes', () => {
  const loader = read('radio/dev/notifications.js');
  const client = read('radio/dev/notifications-core.js');
  assert.match(loader, /notifications-core\.js\?v=20260721-personalized1/);
  assert.match(client, /TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens'/);
  assert.match(client, /Authorization: `Bearer \$\{token\.accessToken\}`/);
  assert.match(client, /'X-Cognito-Id-Token'/);
  assert.match(client, /payload\.personalized/);
  assert.match(client, /stashbox:artist-follow-changed/);
  assert.match(client, /requestNotifications\(false\)/);
});
