import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function slugifyArtist(value) {
  return String(value ?? '').trim().slice(0, 220).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'artist';
}

test('artist slugs are stable and URL-safe', () => {
  assert.equal(slugifyArtist('Toots & The Maytals'), 'toots-and-the-maytals');
  assert.equal(slugifyArtist('  Tahiti Cora  '), 'tahiti-cora');
  assert.equal(slugifyArtist('Beyoncé'), 'beyonce');
});

test('artist route classifier covers public, account, and admin route families', () => {
  const routes = read('radio-api/artist-routes.mjs');
  assert.match(routes, /segments\[1\] === 'artists'/);
  assert.match(routes, /segments\[2\] === 'follows'/);
  assert.match(routes, /segments\[2\] === 'artist-notifications'/);
  assert.match(routes, /segments\[1\] === 'admin' && segments\[2\] === 'artists'/);
});

test('migration is locked to radio_dev and includes canonical artist relationships', () => {
  const migration = read('radio-api/migrations/20260721_artist_foundation_follow_system_dev.sql');
  assert.match(migration, /SET LOCAL search_path TO radio_dev/);
  assert.match(migration, /Refusing to run artist foundation migration outside radio_dev/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS artists/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS song_artists/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_label_access/);
  assert.match(migration, /notifications_enabled BOOLEAN NOT NULL DEFAULT true/);
});

test('artist writes require backend assignment checks', () => {
  const routes = read('radio-api/artist-routes.mjs');
  assert.match(routes, /user_artist_access/);
  assert.match(routes, /user_label_access/);
  assert.match(routes, /label_artists/);
  assert.match(routes, /Only a Stashbox administrator can grant artist access/);
  assert.match(routes, /ARTIST_WRITE_LEVELS/);
});

test('follow UI uses Cognito tokens and the authenticated follow endpoint', () => {
  const followUi = read('radio/dev/artist-follow.js');
  assert.match(followUi, /stashbox_radio_dev_cognito_tokens/);
  assert.match(followUi, /\/radio\/me\/follows\//);
  assert.match(followUi, /notifications_enabled: true/);
  assert.match(followUi, /pending_artist_follow/);
});

test('follow UI updates the displayed count immediately and reconciles server state', () => {
  const followUi = read('radio/dev/artist-follow.js');
  assert.match(followUi, /follower_count: Math\.max\(0, previous\.follower_count \+ \(shouldFollow \? 1 : -1\)\)/);
  assert.match(followUi, /const optimisticControl = renderControl\(meta, optimistic\)/);
  assert.match(followUi, /const confirmed = await loadArtistDetail\(data\.artist\)/);
  assert.match(followUi, /catalogPromise = null/);
  assert.match(followUi, /stashbox:artist-follow-changed/);
});

test('follow UI refreshes expired Cognito sessions and exposes failures', () => {
  const followUi = read('radio/dev/artist-follow.js');
  assert.match(followUi, /REFRESH_TOKEN_AUTH/);
  assert.match(followUi, /tokenExpiresSoon/);
  assert.match(followUi, /response\.status === 401/);
  assert.match(followUi, /Log in again/);
  assert.match(followUi, /Follow failed/);
});

test('public artist profile follow controller persists and hydrates saved follows', () => {
  const controller = read('radio/artists/dev/follow-session-fix.js');
  const html = read('radio/artists/dev/index.html');
  assert.doesNotThrow(() => new Function(controller));
  assert.match(controller, /FOLLOW_CACHE_KEY = 'stashbox_radio_dev_followed_artists'/);
  assert.match(controller, /protectedApi\(`\$\{API_ROOT\}\/radio\/me\/follows`\)/);
  assert.match(controller, /loadSavedFollows/);
  assert.match(controller, /hydrateCurrentArtist/);
  assert.match(controller, /follows\.find\(item => item\.artist_key === artistKey\)/);
  assert.match(controller, /setButton\(button, Boolean\(saved\)\)/);
  assert.match(controller, /setFollowerCount\(saved\.follower_count\)/);
  assert.match(controller, /await loadSavedFollows\(true\)/);
  assert.match(controller, /stashbox:artist-follows-loaded/);
  assert.match(controller, /REFRESH_TOKEN_AUTH/);
  assert.match(controller, /response\.status === 401 && retry/);
  assert.match(controller, /stopImmediatePropagation/);
  assert.match(controller, /stashbox:artist-follow-changed/);
  assert.match(html, /follow-session-fix\.js\?v=20260721-follow-route2/);
});

test('account overview presents a database-backed Following Artists stat and list', () => {
  const statClient = read('radio/dev/account-following-stat.js');
  const loader = read('radio/dev/notifications.js');
  assert.doesNotThrow(() => new Function(statClient));
  assert.match(statClient, /Following Artists<strong>0<\/strong>/);
  assert.match(statClient, /\/radio\/me\/follows/);
  assert.match(statClient, /FOLLOW_CACHE_KEY/);
  assert.match(statClient, /radio-following-artist-thumb/);
  assert.match(statClient, /data-unfollow-artist/);
  assert.match(statClient, /stashbox:artist-follow-changed/);
  assert.match(statClient, /stashbox:artist-follows-loaded/);
  assert.match(loader, /account-following-stat\.js\?v=20260721-following-list1/);
});

test('Artist CMS uses one immediate-save profile media controller for all three images', () => {
  const cmsHtml = read('radio-admin/artists/dev/index.html');
  const controller = read('radio-admin/artists/dev/profile-media-unified.js');
  const routes = read('radio-api/artist-profile-media-routes.mjs');

  assert.match(cmsHtml, /Recommended: 1200 × 1200 px/);
  assert.match(cmsHtml, /Recommended: 1920 × 1080 px/);
  assert.match(cmsHtml, /Recommended: 1080 × 1920 px/);
  assert.match(cmsHtml, /profile-media-unified\.js\?v=/);
  assert.doesNotMatch(cmsHtml, /vertical-banner-simple\.js/);
  assert.match(cmsHtml, /Upload \/ Replace/);
  assert.match(cmsHtml, /Delete Image/);

  assert.doesNotThrow(() => new Function(controller));
  assert.match(controller, /purpose: 'profile_image'/);
  assert.match(controller, /purpose: 'horizontal_banner'/);
  assert.match(controller, /purpose: 'vertical_banner'/);
  assert.match(controller, /\/media\/presign/);
  assert.match(controller, /method: 'PATCH'/);
  assert.match(controller, /fresh RDS read-back/);
  assert.match(controller, /stopImmediatePropagation/);
  assert.doesNotMatch(controller, /purpose: 'artwork'/);
  assert.doesNotMatch(controller, /Click Save Artist/);

  assert.match(routes, /profile_image_url = CASE WHEN/);
  assert.match(routes, /banner_image_url = CASE WHEN/);
  assert.match(routes, /vertical_banner_image_url = CASE WHEN/);
  assert.match(routes, /profile_image_url, horizontal_banner_image_url, or vertical_banner_image_url/);
  assert.match(routes, /user_artist_access/);
  assert.match(routes, /user_label_access/);
  assert.match(routes, /WRITE_LEVELS/);
});

test('Artist CMS uses one authentication mode at a time', () => {
  const cmsApp = read('radio-admin/artists/dev/app.js');
  const mediaController = read('radio-admin/artists/dev/profile-media-unified.js');
  assert.match(cmsApp, /STANDARD_ADMIN_TOKEN_KEY = 'stashbox_admin_token_dev'/);
  assert.match(cmsApp, /LEGACY_ADMIN_TOKEN_KEY = 'stashbox-radio-admin-token-dev'/);
  assert.match(cmsApp, /if \(admin\) \{\s*result\['x-admin-token'\] = admin;\s*\} else \{/s);
  assert.match(mediaController, /if \(token\) \{\s*result\['x-admin-token'\] = token;\s*return result;\s*\}/s);
  assert.match(mediaController, /Authorization = `Bearer \$\{tokens\.accessToken\}`/);
  assert.match(mediaController, /X-Cognito-Id-Token/);
});

test('Artist CMS aggregates likes, shares, and listening time from song analytics', () => {
  const cmsHtml = read('radio-admin/artists/dev/index.html');
  const cmsApp = read('radio-admin/artists/dev/app.js');
  assert.match(cmsHtml, /Total Likes/);
  assert.match(cmsHtml, /Total Shares/);
  assert.match(cmsHtml, /Total Listening Time/);
  assert.match(cmsApp, /admin\/stats\/songs\?limit=500/);
  assert.match(cmsApp, /total_listening_seconds/);
  assert.match(cmsApp, /total_seconds_played/);
});

test('Song CMS is the artist catalog source of truth and public catalog requests stay unauthenticated', () => {
  const cmsHtml = read('radio-admin/artists/dev/index.html');
  const cmsApp = read('radio-admin/artists/dev/app.js');
  const publicProfile = read('radio/artists/dev/app.js');
  assert.doesNotMatch(cmsHtml, /Replace Song Assignments/);
  assert.doesNotMatch(cmsHtml, /id="songKeys"/);
  assert.doesNotMatch(cmsApp, /saveSongs/);
  assert.match(cmsHtml, /Song CMS Controls Artist Music/);
  assert.match(publicProfile, /publicApi\(`\$\{API_ROOT\}\/radio\/songs`\)/);
  assert.match(publicProfile, /credentials: 'omit'/);
  assert.match(publicProfile, /Promise\.allSettled/);
  assert.match(publicProfile, /songsForArtist/);
  assert.match(publicProfile, /normalizeArtistName\(song\.artist\) === target/);
});

test('public artist page prioritizes music and removes the About biography column', () => {
  const publicProfile = read('radio/artists/dev/app.js');
  const styles = read('radio/artists/dev/styles.css');
  assert.match(publicProfile, /social-links-overlay/);
  assert.match(publicProfile, /Top Tracks/);
  assert.match(publicProfile, /See 5 More/);
  assert.match(publicProfile, /All Tracks/);
  assert.match(publicProfile, /Play All/);
  assert.match(publicProfile, /Shuffle All/);
  assert.match(publicProfile, /data-track-view="artwork"/);
  assert.match(publicProfile, /data-track-view="list"/);
  assert.doesNotMatch(publicProfile, /<h2>About<\/h2>/);
  assert.doesNotMatch(publicProfile, /Artist biography coming soon/);
  assert.match(styles, /\.social-links-overlay/);
  assert.match(styles, /\.all-tracks\.artwork-view/);
  assert.match(styles, /\.all-tracks\.list-view/);
});

test('artist track lists show play and share counts and top tracks use listening data', () => {
  const publicProfile = read('radio/artists/dev/app.js');
  assert.match(publicProfile, /function playCount\(song\)/);
  assert.match(publicProfile, /function shareCount\(song\)/);
  assert.match(publicProfile, /function listeningSeconds\(song\)/);
  assert.match(publicProfile, /trackStats\(song\)/);
  assert.match(publicProfile, /listeningSeconds\(b\) - listeningSeconds\(a\)/);
  assert.match(publicProfile, /topVisible: 5/);
  assert.match(publicProfile, /state\.topVisible \+= 5/);
});

test('artist Play All and Shuffle All use the existing DEV playlist queue event', () => {
  const publicProfile = read('radio/artists/dev/app.js');
  const bridge = read('radio/dev/artist-queue-handoff.js');
  const loader = read('radio/dev/notifications.js');
  assert.match(publicProfile, /stashbox_radio_dev_artist_queue_handoff/);
  assert.match(publicProfile, /sessionStorage\.setItem\(QUEUE_STORAGE_KEY/);
  assert.match(publicProfile, /startQueue\(sortedAllSongs\(\), 'ordered'\)/);
  assert.match(publicProfile, /startQueue\(sortedAllSongs\(\), 'shuffle'\)/);
  assert.match(bridge, /stashbox:playlist-play/);
  assert.match(bridge, /stashbox:playlist-player-started/);
  assert.match(bridge, /new CustomEvent\(PLAY_EVENT/);
  assert.match(loader, /artist-queue-handoff\.js\?v=20260721-artistqueue1/);
});

test('production player files are excluded from the artist sprint', () => {
  const status = read('radio-api/docs/ARTIST_FOUNDATION_SPRINT_1A.md');
  assert.match(status, /Scope: DEV only/);
  assert.match(status, /Production changes: None/);
});
