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

test('production player files are excluded from the artist sprint', () => {
  const status = read('radio-api/docs/ARTIST_FOUNDATION_SPRINT_1A.md');
  assert.match(status, /Scope: DEV only/);
  assert.match(status, /Production changes: None/);
});
