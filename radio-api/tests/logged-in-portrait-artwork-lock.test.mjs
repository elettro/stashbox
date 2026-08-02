import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const source = read('radio/dev/v2/v2-logged-in-portrait-artwork-lock.js');
const controller = read('radio/dev/v2/v2-vec-player-controller.js');
const html = read('radio/dev/v2/index.html');

test('the logged-in VEC controller still begins with square catalog artwork', () => {
  assert.match(controller, /url:s\.art,source:'official-artwork'/);
  assert.match(controller, /el\.style\.background=`center\/cover no-repeat url/);
});

test('the logged-in portrait lock replaces square artwork through the canonical endpoint', () => {
  assert.match(source, /\/radio\/songs\/\$\{encodeURIComponent\(songKey\)\}\/artwork-images/);
  assert.match(source, /const PORTRAIT_ORDER = Object\.freeze\(\['9x16', '3x4', '4x5', '1x1'\]\)/);
  assert.match(source, /source !== 'official-artwork'/);
  assert.match(source, /logged-in-portrait-artwork-lock/);
  assert.match(source, /backgroundSize = 'contain'/);
  assert.match(source, /objectFit = 'contain'/);
});

test('weak signal recovery retries metadata and exact 9x16 image loading', () => {
  assert.match(source, /attempt <= 3/);
  assert.match(source, /window\.setTimeout\(\(\) => controller\.abort\(\), 18000\)/);
  assert.match(source, /window\.setTimeout\(\(\) => finish\(false\), 30000\)/);
  assert.match(source, /scheduleRetry\(songKey\)/);
  assert.match(source, /window\.addEventListener\('online'/);
});

test('the main V2 page loads the lock after the VEC and responsive artwork controllers', () => {
  const vecIndex = html.indexOf('v2-vec-player-controller.js');
  const responsiveIndex = html.indexOf('v2-responsive-song-artwork.js');
  const lockIndex = html.indexOf('v2-logged-in-portrait-artwork-lock.js?v=20260802-loginportrait1');
  assert.ok(vecIndex >= 0);
  assert.ok(responsiveIndex > vecIndex);
  assert.ok(lockIndex > responsiveIndex);
});
