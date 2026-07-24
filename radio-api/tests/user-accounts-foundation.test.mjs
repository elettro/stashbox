import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  handleAccountRequest,
  isAccountRequest,
  isNotificationEventRequest
} from '../account-routes.mjs';
import { isProfileMediaUploadRequest } from '../profile-media-routes.mjs';
import { subjectHash } from '../rate-limit.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const radioApiRoot = path.resolve(currentDirectory, '..');
const repositoryRoot = path.resolve(radioApiRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repositoryRoot, relativePath), 'utf8');
}

test('account route detection is limited to radio auth and radio me', () => {
  assert.equal(isAccountRequest(['radio', 'auth', 'config']), true);
  assert.equal(isAccountRequest(['radio', 'me']), true);
  assert.equal(isAccountRequest(['radio', 'songs']), false);
  assert.equal(isAccountRequest(['admin', 'songs']), false);
});

test('listener profile media route supports read, write, and presign paths', () => {
  assert.equal(isProfileMediaUploadRequest(['radio', 'me', 'media']), true);
  assert.equal(isProfileMediaUploadRequest(['radio', 'me', 'media', 'presign']), true);
  assert.equal(isProfileMediaUploadRequest(['radio', 'me', 'preferences']), false);
  assert.equal(isProfileMediaUploadRequest(['radio', 'artists', 'stashbox', 'media']), false);
});

test('notification event interception matches writes only by route shape', () => {
  assert.equal(isNotificationEventRequest(['radio', 'notifications', 'notice-1', 'events']), true);
  assert.equal(isNotificationEventRequest(['radio', 'notifications']), false);
  assert.equal(isNotificationEventRequest(['radio', 'notifications', 'notice-1']), false);
});

test('public auth config route works without a database connection', async () => {
  const result = await handleAccountRequest({
    requestContext: { http: { method: 'GET' } },
    rawPath: '/radio/auth/config'
  }, {
    client: null,
    qname: () => { throw new Error('Database should not be used for auth config.'); },
    response: (statusCode, body) => ({ statusCode, body }),
    parseBody: () => ({}),
    getMethod: event => event.requestContext.http.method,
    getRouteSegments: () => ['radio', 'auth', 'config'],
    verifyIdentity: async () => { throw new Error('Identity should not be required for auth config.'); },
    getAuthConfig: () => ({ enabled: false, region: 'us-east-1' })
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.auth.enabled, false);
});

test('rate-limit subject hashes do not expose raw identifiers', () => {
  const source = 'user:11111111-2222-3333-4444-555555555555';
  const hash = subjectHash(source);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes('11111111'), false);
});

test('schema migration is DEV locked and contains the Sprint 1A tables', () => {
  const migration = read('radio-api/migrations/20260720_user_accounts_sprint_1a_dev.sql');
  assert.match(migration, /SET LOCAL search_path TO radio_dev/);
  assert.match(migration, /Refusing to run user account migration outside radio_dev/);
  for (const table of [
    'users',
    'user_roles',
    'user_artist_access',
    'user_favorites',
    'user_follows',
    'playlists',
    'playlist_items',
    'user_listening_history',
    'user_preferences',
    'account_audit_log',
    'api_rate_limit_buckets'
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('browser account client never sends a role assignment', () => {
  const accountClient = read('radio/dev/account.js');
  assert.equal(/["']role["']\s*:/.test(accountClient), false);
  assert.equal(/user_roles/i.test(accountClient), false);
});

test('notification client is preserved and account bootstrap loads first', () => {
  const loader = read('radio/dev/notifications.js');
  const notificationCore = read('radio/dev/notifications-core.js');
  assert.ok(loader.indexOf('./account.js') < loader.indexOf('./notifications-core.js'));
  assert.match(notificationCore, /sbr-notification-bell/);
});

test('account overview cards navigate and profile editing lives in Preferences', () => {
  const loader = read('radio/dev/notifications.js');
  const dashboardUi = read('radio/dev/account-dashboard-ui.js');
  assert.match(loader, /account-dashboard-ui\.js\?v=20260721-dashboard1/);
  assert.match(dashboardUi, /\['favorites', 'favorites'\]/);
  assert.match(dashboardUi, /\['playlists', 'playlists'\]/);
  assert.match(dashboardUi, /\['history events', 'history'\]/);
  assert.match(dashboardUi, /panel\.querySelector\('form\[data-form="profile"\]'\)\?\.remove\(\)/);
  assert.match(dashboardUi, /radio-account-profile-preferences/);
  assert.match(dashboardUi, /data-form="profile"/);
  assert.match(dashboardUi, /Save Changes/);
  assert.match(dashboardUi, /radio-account-overview-actions/);
  assert.match(dashboardUi, /data-action="logout"/);
  assert.match(dashboardUi, /justify-content: flex-end/);
});

test('listener profile images use one dedicated immediate-save media contract', () => {
  const route = read('radio-api/profile-media-routes.mjs');
  const client = read('radio/dev/v2/profile/profile-media-stable.js');
  const profileHtml = read('radio/dev/v2/profile/index.html');

  assert.match(route, /GET \/radio\/me\/media/);
  assert.match(route, /PATCH \/radio\/me\/media/);
  assert.match(route, /POST \/radio\/me\/media\/presign/);
  assert.match(route, /profile_image_url/);
  assert.match(route, /horizontal_banner_image_url/);
  assert.match(route, /vertical_banner_image_url/);
  assert.match(route, /avatar_url/);
  assert.match(route, /banner_url/);
  assert.match(route, /vertical_banner_url/);

  assert.match(client, /fetch\(`\$\{API\}\/radio\/me\/media\?verify=/);
  assert.match(client, /fetch\(`\$\{API\}\/radio\/me\/media`,/);
  assert.match(client, /method: 'PATCH'/);
  assert.match(client, /\/radio\/me\/media\/presign/);
  assert.match(client, /fresh RDS read-back/);
  assert.doesNotMatch(client, /\/radio\/me\/preferences/);
  assert.match(profileHtml, /profile-media-stable\.js\?v=/);
});

test('Following Artists stat opens a thumbnail list with database-backed unfollow controls', () => {
  const loader = read('radio/dev/notifications.js');
  const followingUi = read('radio/dev/account-following-stat.js');
  assert.doesNotThrow(() => new Function(followingUi));
  assert.match(loader, /account-following-stat\.js\?v=20260721-following-list1/);
  assert.match(followingUi, /dataset\.followingArtistsOpen = 'true'/);
  assert.match(followingUi, /data-following-artists-panel/);
  assert.match(followingUi, /radio-following-artist-thumb/);
  assert.match(followingUi, /profile_image_url/);
  assert.match(followingUi, /data-unfollow-artist/);
  assert.match(followingUi, /method: 'DELETE'/);
  assert.match(followingUi, /\/radio\/me\/follows\/\$\{encodeURIComponent\(artistKey\)\}/);
  assert.match(followingUi, /Artist unfollowed/);
  assert.match(followingUi, /stashbox:artist-follow-changed/);
  assert.match(followingUi, /Back to My Account/);
});

test('DEV deployment wrapper delegates unrelated routes and intercepts profile media', () => {
  const wrapper = read('radio-api/video-factory/entry.mjs');
  assert.match(wrapper, /const accountRequest = isAccountRequest\(segments\)/);
  assert.match(wrapper, /const profileMediaUploadRequest = isProfileMediaUploadRequest\(segments\)/);
  assert.match(wrapper, /handleProfileMediaUploadRequest\(safeEvent, deps\)/);
  assert.match(wrapper, /const notificationEventRequest = isNotificationEventRequest\(segments\)/);
  assert.match(wrapper, /const artistRequest = isArtistRequest\(segments\)/);
  assert.match(wrapper, /const videoFactoryRequest = isVideoFactoryRequest\(safeEvent\)/);
  assert.match(wrapper, /return radioHandler\(safeEvent\)/);
  assert.match(wrapper, /X-Cognito-Id-Token/);
});
