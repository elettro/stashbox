import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('down flick cycles full, focus, cinema, then full', () => {
  const source = read('radio/dev/v2/v2-mobile-player-swipe.js');
  assert.match(source, /const VIEW_MODES = \['full', 'focus', 'cinema'\]/);
  assert.match(source, /cyclePlayerMode\(current\.player\)/);
  assert.match(source, /nextMode\(currentMode\(player\)\)/);
});

test('each player mode has a distinct user-facing message', () => {
  const source = read('radio/dev/v2/v2-mobile-player-swipe.js');
  assert.match(source, /label: 'Focus Mode'/);
  assert.match(source, /label: 'Cinema Mode'/);
  assert.match(source, /label: 'Full Interface'/);
  assert.match(source, /Flick down for Cinema Mode/);
  assert.match(source, /Flick down for Full Interface/);
});

test('cinema mode supports temporary tap-to-peek controls', () => {
  const script = read('radio/dev/v2/v2-mobile-player-swipe.js');
  const styles = read('radio/dev/v2/v2-video-focus-mode.css');
  assert.match(script, /is-cinema-controls-peek/);
  assert.match(script, /2400/);
  assert.match(styles, /is-video-cinema-mode\.is-cinema-controls-peek/);
  assert.match(styles, /\.v2-player-controls/);
  assert.match(styles, /\.v2-timeline/);
});

test('published V2 entry loads the mode files with the current build marker', () => {
  const html = read('radio/dev/v2/index.html');
  assert.match(html, /player-view-modes-20260724-76/);
  assert.match(html, /v2-mobile-player-swipe\.js\?v=20260724-modes76/);
  assert.match(html, /v2-mobile-player-swipe\.css\?v=20260724-modes76/);
  assert.match(html, /v2-video-focus-mode\.css\?v=20260724-modes76/);
});
