import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('DEV desktop VEC loads canonical clip runtime without a legacy query gate', () => {
  const source = read('radio/dev/v2/v2-desktop-vec-core-loader.js');
  assert.doesNotMatch(source, /desktopvec[^\n]*legacy/);
  assert.doesNotMatch(source, /desktopVecSafeMode\s*=\s*['"]artwork-only['"]/);
  assert.match(source, /desktopVecSafeMode\s*=\s*['"]canonical['"]/);
  assert.match(source, /v2-vec-player-controller\.js/);
});

test('PROD remains untouched until explicit structural promotion', () => {
  const source = read('radio/v2-desktop-vec-core-loader.js');
  assert.match(source, /desktopvec[^\n]*legacy/);
  assert.match(source, /desktopVecSafeMode\s*=\s*['"]artwork-only['"]/);
});