import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isPlaylistReorderRequest } from '../playlist-reorder-routes.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const radioApiRoot = path.resolve(currentDirectory, '..');
const repositoryRoot = path.resolve(radioApiRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repositoryRoot, relativePath), 'utf8');
}

test('playlist reorder route is matched only for the dedicated item-order endpoint', () => {
  assert.equal(isPlaylistReorderRequest(['radio', 'me', 'playlists', 'playlist-1', 'items', 'reorder']), true);
  assert.equal(isPlaylistReorderRequest(['radio', 'me', 'playlists', 'playlist-1', 'items']), false);
  assert.equal(isPlaylistReorderRequest(['radio', 'playlists', 'playlist-1', 'items', 'reorder']), false);
});

test('playlist reorder handler validates the full item set and persists positions', () => {
  const route = read('radio-api/playlist-reorder-routes.mjs');
  assert.match(route, /ordered_item_ids must be an array/);
  assert.match(route, /cannot contain duplicates/);
  assert.match(route, /must include every song currently in the playlist/);
  assert.match(route, /SET position = \$1/);
  assert.match(route, /ORDER BY position, added_at, id/);
  assert.match(route, /COMMIT/);
  assert.match(route, /ROLLBACK/);
});

test('V2 profile playlist rows expose drag handles and an explicit save action', () => {
  const client = read('radio/dev/v2/profile/profile-playlist-reorder.js');
  const styles = read('radio/dev/v2/profile/profile-playlist-reorder.css');
  const page = read('radio/dev/v2/profile/index.html');
  assert.doesNotThrow(() => new Function(client));
  assert.match(client, /data-reorder-handle/);
  assert.match(client, /data-save-playlist-order/);
  assert.match(client, /ordered_item_ids/);
  assert.match(client, /pointermove/);
  assert.match(client, /ArrowUp/);
  assert.match(styles, /cursor: grab/);
  assert.match(page, /profile-playlist-reorder\.js/);
});
