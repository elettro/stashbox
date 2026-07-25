import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const script = read('radio/dev/v2/v2-mobile-player-swipe.js');
const styles = read('radio/dev/v2/v2-video-focus-mode.css');
const html = read('radio/dev/v2/index.html');

test('down flick cycles full, focus, cinema, then full', () => {
  assert.match(script, /const VIEW_MODES = \['full', 'focus', 'cinema'\]/);
  assert.match(script, /cyclePlayerMode\(current\.player\)/);
  assert.match(script, /nextMode\(currentMode\(player\)\)/);
});

test('all four flick directions remain connected', () => {
  assert.match(script, /dx < 0 \? 'next' : 'previous'/);
  assert.match(script, /performAction\(current\.player, 'shuffle'\)/);
  assert.match(script, /cyclePlayerMode\(current\.player\)/);
  assert.match(script, /shuffleFallback\(\)/);
});

test('renewable sessions keep song-navigation flicks active', () => {
  assert.match(script, /StashboxV2Session\?\.hasSession/);
  assert.match(script, /tokens\.accessToken \|\| tokens\.refreshToken/);
  assert.doesNotMatch(script, /classList\.contains\('is-logged-in-player'\) && loggedIn\(\)/);
});

test('each player mode has a distinct user-facing message', () => {
  assert.match(script, /label: 'Focus Mode'/);
  assert.match(script, /label: 'Cinema Mode'/);
  assert.match(script, /label: 'Full Interface'/);
  assert.match(script, /Flick down for Cinema Mode/);
  assert.match(script, /Flick down for Full Interface/);
});

test('cinema mode supports temporary tap-to-peek controls', () => {
  assert.match(script, /is-cinema-controls-peek/);
  assert.match(script, /2400/);
  assert.match(styles, /is-video-cinema-mode\.is-cinema-controls-peek/);
  assert.match(styles, /\.v2-player-controls/);
  assert.match(styles, /\.v2-timeline/);
});

test('gesture observer is scoped to the player instead of the whole app subtree', () => {
  assert.match(script, /playerObserver\.observe\(player/);
  assert.doesNotMatch(script, /observer\.observe\(app,[\s\S]*attributeFilter: \['hidden'\]/);
});

test('published V2 entry loads the current gesture build', () => {
  assert.match(html, /interrupted-tasks-complete-20260725-80/);
  assert.match(html, /v2-mobile-player-swipe\.js\?v=20260725-flick80/);
  assert.match(html, /v2-mobile-player-swipe\.css\?v=20260725-flick80/);
  assert.match(html, /v2-video-focus-mode\.css\?v=20260725-flick80/);
});
