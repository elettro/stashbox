import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const script = read('radio/dev/v2/v2-mobile-player-swipe.js');
const styles = read('radio/dev/v2/v2-video-focus-mode.css');
const html = read('radio/dev/v2/index.html');

test('down flick cycles full interface, title mode, cinema, then full interface', () => {
  assert.match(script, /const VIEW_MODES = \['full', 'title', 'cinema'\]/);
  assert.match(script, /cyclePlayerMode\(current\.player\)/);
  assert.match(script, /nextMode\(currentMode\(player\)\)/);
  assert.match(script, /is-video-title-mode/);
  assert.match(script, /is-video-cinema-mode/);
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

test('mobile mode messaging exposes title, cinema, and full interface', () => {
  assert.match(script, /label: 'Title Mode'/);
  assert.match(script, /label: 'Cinema Mode'/);
  assert.match(script, /label: 'Full Interface'/);
  assert.match(script, /Flick down for Full Interface/);
});

test('title mode keeps identity and transport UI at seventy percent opacity', () => {
  assert.match(styles, /is-video-title-mode[\s\S]*\.v2-player-content > h2/);
  assert.match(styles, /is-video-title-mode[\s\S]*\.v2-artist-row/);
  assert.match(styles, /is-video-title-mode[\s\S]*\.v2-li-meta-chips/);
  assert.match(styles, /is-video-title-mode[\s\S]*\.v2-timeline/);
  assert.match(styles, /is-video-title-mode[\s\S]*\.v2-player-controls/);
  assert.match(styles, /opacity: \.70 !important/);
});

test('title mode hides upper-right player actions and right rail', () => {
  assert.match(styles, /is-video-title-mode \.v2-player-header \.v2-li-player-head-actions/);
  assert.match(styles, /is-video-title-mode \.v2-li-player-rail/);
  assert.match(styles, /opacity: 0 !important/);
  assert.match(styles, /pointer-events: none !important/);
});

test('cinema mode remains nearly empty and supports temporary tap-to-peek controls', () => {
  assert.match(styles, /is-video-cinema-mode[\s\S]*opacity: \.025 !important/);
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

test('published V2 entry loads the current three-mode gesture build', () => {
  assert.match(html, /v2-mobile-player-swipe\.js\?v=20260821-titlemode1/);
  assert.match(html, /v2-mobile-player-swipe\.css\?v=20260725-flick80/);
  assert.match(html, /v2-video-focus-mode\.css\?v=20260821-titlemode1/);
});
