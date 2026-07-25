import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const main = read('radio/dev/v2/index.html');
const alt = read('radio/dev/v2/alt-player/index.html');
const avatar = read('radio/dev/v2/v2-player-artist-avatar.js');
const transition = read('radio/dev/v2/v2-media-transition-guard.js');
const transitionCss = read('radio/dev/v2/v2-media-transition-guard.css');
const altScript = read('radio/dev/v2/alt-player/alt-player.js');
const altCss = read('radio/dev/v2/alt-player/alt-player.css');

test('main player loads the Artist CMS avatar resolver after logged-in player injection', () => {
  const stablePosition = main.indexOf('/radio/dev/v2/v2-logged-in-player-stable.js');
  const avatarPosition = main.indexOf('/radio/dev/v2/v2-player-artist-avatar.js');
  assert.ok(stablePosition > -1 && avatarPosition > stablePosition);
  assert.match(main, /v2-player-artist-avatar\.js\?v=20260725-avatar80/);
  assert.match(avatar, /profile_image_url/);
  assert.match(avatar, /\[data-avatar\]/);
  assert.match(avatar, /\[data-li-artist-image\]/);
});

test('artwork remains latched until an image or video is ready', () => {
  assert.match(main, /v2-media-transition-guard\.css\?v=20260725-transition80/);
  assert.match(main, /v2-media-transition-guard\.js\?v=20260725-transition80/);
  assert.match(transition, /holding-artwork/);
  assert.match(transition, /loadeddata/);
  assert.match(transition, /canplay/);
  assert.match(transition, /playing/);
  assert.match(transition, /image-ready/);
  assert.match(transitionCss, /z-index:\s*-1/);
  assert.match(transitionCss, /is-holding/);
});

test('alternate player is a separate route using the same functional engine', () => {
  assert.match(alt, /alt-player-complete-20260725-80/);
  assert.match(alt, /canonical" href="https:\/\/stashbox\.com\/radio\/dev\/v2\/alt-player\//);
  assert.match(alt, /v2-session-manager\.js\?v=20260725-session80/);
  assert.match(alt, /v2-recovery\.js/);
  assert.match(alt, /v2-vec-player-controller\.js/);
  assert.match(alt, /v2-mobile-player-swipe\.js\?v=20260725-flick80/);
  assert.match(alt, /alt-player\.css\?v=20260725-alt80/);
  assert.match(alt, /alt-player\.js\?v=20260725-alt80/);
});

test('alternate layer links back to main V2 without redirecting the alternate route', () => {
  assert.match(altScript, /const ALT_HOME = '\/radio\/dev\/v2\/alt-player\/'/);
  assert.match(altScript, /const MAIN_HOME = '\/radio\/dev\/v2\/'/);
  assert.doesNotMatch(altScript, /location\.replace|location\.assign/);
  assert.match(altCss, /ALT PLAYER LAB/);
});
