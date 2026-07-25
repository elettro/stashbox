import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const managerPath = 'radio/visual-experience/dev/duplicate-upload-manager.js';

test('Video Library loads the duplicate upload manager through the shared DEV header', () => {
  const header = read('radio-admin/dev/shared-admin-header.js');
  assert.match(header, /configuration\.key !== 'video-library'/);
  assert.match(header, /\/radio\/visual-experience\/dev\/duplicate-upload-manager\.js\?v=20260724-duplicate1/);
});

test('duplicate manager intercepts the old immediate uploader before it runs', () => {
  const source = read(managerPath);
  assert.match(source, /document\.addEventListener\('change',[\s\S]*event\.stopImmediatePropagation\(\)[\s\S]*}, true\)/);
});

test('duplicate review supports Skip, Replace, and Keep Both choices', () => {
  const source = read(managerPath);
  assert.match(source, /Skip this file/);
  assert.match(source, /Replace existing file/);
  assert.match(source, /Keep both — rename new file/);
  assert.match(source, /Skip All/);
  assert.match(source, /Replace All/);
  assert.match(source, /Keep Both All/);
});

test('replacement uploads and saves the new asset before hiding the old asset', () => {
  const source = read(managerPath);
  const start = source.indexOf('async function processRow');
  const end = source.indexOf('function setBusyState', start);
  assert.ok(start >= 0 && end > start, 'processRow should exist');
  const block = source.slice(start, end);
  const presign = block.indexOf('requestPresign');
  const upload = block.indexOf('uploadObject');
  const create = block.indexOf('createRecord');
  const hide = block.indexOf('hideReplacedAssets');
  assert.ok(presign < upload && upload < create && create < hide, 'safe replacement order must be presign → upload → create → hide old');
});

test('Keep Both generates a Windows-style numbered filename', () => {
  const source = read(managerPath);
  assert.match(source, /candidate = `\$\{parts\.base\} \(\$\{counter\}\)\$\{parts\.extension\}`/);
  assert.match(source, /new File\(\[file\], candidate/);
});
