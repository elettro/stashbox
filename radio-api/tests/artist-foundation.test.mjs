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

test('Artist CMS supports profile and banner upload, replacement, deletion, and dimension guidance', () => {
  const cmsHtml = read('radio-admin/artists/dev/index.html');
  const cmsApp = read('radio-admin/artists/dev/app.js');
  assert.match(cmsHtml, /Recommended: 1200 × 1200 px/);
  assert.match(cmsHtml, /Recommended: 1920 × 1080 px/);
  assert.match(cmsHtml, /Upload \/ Replace/);
  assert.match(cmsHtml, /Delete Image/);
  assert.match(cmsApp, /UPLOAD_PRESIGN_URL/);
  assert.match(cmsApp, /purpose: 'artwork'/);
  assert.match(cmsApp, /readImageDimensions/);
  assert.match(cmsApp, /Click Save Artist/);
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

test('Song CMS is the artist catalog source of truth and manual assignments are removed', () => {
  const cmsHtml = read('radio-admin/artists/dev/index.html');
  const cmsApp = read('radio-admin/artists/dev/app.js');
  const publicProfile = read('radio/artists/dev/app.js');
  assert.doesNotMatch(cmsHtml, /Replace Song Assignments/);
  assert.doesNotMatch(cmsHtml, /id="songKeys"/);
  assert.doesNotMatch(cmsApp, /saveSongs/);
  assert.match(cmsHtml, /Song CMS Controls Artist Music/);
  assert.match(publicProfile, /api\(`\$\{API_ROOT\}\/radio\/songs`\)/);
  assert.match(publicProfile, /songsForArtist/);
  assert.match(publicProfile, /normalizeArtistName\(song\.artist\) === target/);
});

test('production player files are excluded from the artist sprint', () => {
  const status = read('radio-api/docs/ARTIST_FOUNDATION_SPRINT_1A.md');
  assert.match(status, /Scope: DEV only/);
  assert.match(status, /Production changes: None/);
});
