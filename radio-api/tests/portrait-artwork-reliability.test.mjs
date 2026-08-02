import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const source = read('radio/dev/v2/v2-portrait-artwork-reliability.js');
const mainHtml = read('radio/dev/v2/index.html');
const artistHtml = read('radio/dev/v2/artist/index.html');

test('portrait mobile artwork always prefers 9x16 and keeps square last', () => {
  assert.match(source, /const PORTRAIT_ORDER = Object\.freeze\(\['9x16', '3x4', '4x5', '1x1'\]\)/);
  assert.match(source, /if \(requested === '9x16'\) return PORTRAIT_ORDER/);
});

test('responsive artwork uses canonical artwork sets and persistent weak-signal cache', () => {
  assert.match(source, /\/radio\/songs\/\$\{encodeURIComponent\(song\.key\)\}\/artwork-images/);
  assert.match(source, /localStorage\.getItem\(ARTWORK_CACHE_KEY\)/);
  assert.match(source, /localStorage\.setItem\(ARTWORK_CACHE_KEY/);
  assert.match(source, /attempts: 2, timeout: 16000/);
});

test('failed image loads retry and exact 9x16 remains eligible for another attempt', () => {
  assert.match(source, /function retryImage/);
  assert.match(source, /scheduleExactRetry/);
  assert.match(source, /imageLoads\.delete\(fixUrl\(images\['9x16'\]\)\)/);
  assert.match(source, /portraitArtworkAwaitingExact/);
});

test('main and artist V2 pages load the reliability controller with a cache-busted URL', () => {
  const loader = /v2-portrait-artwork-reliability\.js\?v=20260802-portrait-rule1/;
  assert.match(mainHtml, loader);
  assert.match(artistHtml, loader);
});
