import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const PROD_API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';

test('canonical content config selects PROD as the single content source for both players', () => {
  const context = { window: {} };
  vm.runInNewContext(read('radio-admin/canonical-content-config.js'), context);
  const config = context.window.StashboxCanonicalContent;

  assert.equal(config.apiRoot, PROD_API_ROOT);
  assert.equal(config.tokenStorageKey, 'radio_admin_token_prod');
  assert.equal(config.sourceEnvironment, 'prod');
  assert.deepEqual([...config.consumers], ['/radio/', '/radio/dev/v2/']);
  assert.equal(Object.isFrozen(config), true);
});

test('original Songs CMS selects canonical PROD only on the Songs route', () => {
  const source = read('radio-admin/dev/app-core.js');

  assert.match(source, /const IS_SONGS_CMS_PAGE = window\.location\.pathname\.includes\('\/radio-admin\/songs\/dev'\)/);
  assert.match(source, /const ADMIN_API_ROOT = IS_SONGS_CMS_PAGE \? CANONICAL_CONTENT\.apiRoot : DEV_API_ROOT/);
  assert.match(source, /const TOKEN_STORAGE_KEY = IS_SONGS_CMS_PAGE \? CANONICAL_CONTENT\.tokenStorageKey : 'stashbox_admin_token_dev'/);
  assert.match(source, /const API_BASE_URL = `\$\{ADMIN_API_ROOT\}\/admin\/songs`/);
});

test('Songs artwork, Video Library, and VEC controllers contain no direct DEV API target', () => {
  const controllerFiles = [
    'radio-admin/songs/dev/song-images.js',
    'radio-admin/songs/dev/song-images-zip.js',
    'radio-admin/songs/dev/song-images-compat-bridge.js',
    'radio/visual-experience/dev/index.html',
    'radio/visual-experience/dev/duplicate-upload-manager.js',
    'radio-admin/dev/vec/vec-controller.js'
  ];

  controllerFiles.forEach(relativePath => {
    const source = read(relativePath);
    assert.doesNotMatch(source, new RegExp(DEV_API_HOST.replaceAll('.', '\\.')), `${relativePath} must not target the DEV API`);
    assert.match(source, /StashboxCanonicalContent/, `${relativePath} must use canonical content configuration`);
  });
});

test('each original controller loads canonical config before its application code', () => {
  const pages = [
    ['radio-admin/songs/dev/index.html', '../../dev/app.js'],
    ['radio/visual-experience/dev/index.html', '<script>'],
    ['radio-admin/dev/vec/index.html', './vec-controller.js'],
    ['radio-admin/dev/video-factory/index.html', './video-factory.js']
  ];

  pages.forEach(([relativePath, controllerMarker]) => {
    const html = read(relativePath);
    const configPosition = html.indexOf('/radio-admin/canonical-content-config.js?v=20260831-unified1');
    const controllerPosition = html.indexOf(controllerMarker, configPosition + 1);
    assert.notEqual(configPosition, -1, `${relativePath} is missing canonical content config`);
    assert.ok(controllerPosition > configPosition, `${relativePath} must load canonical config before its controller`);
  });
});

test('Video Factory keeps private jobs in DEV while reading canonical LIVE content', () => {
  const controller = read('radio-admin/dev/video-factory/video-factory.js');
  const worker = read('video-render-worker/src/index.mjs');
  const stack = read('infra/video-factory/dev-stack.yml');

  assert.match(controller, /const JOBS_URL = `\$\{API_ROOT\}\/admin\/video-factory\/jobs`/);
  assert.match(controller, /const SONGS_URL = `\$\{CONTENT_API_ROOT\}\/radio\/songs`/);
  assert.match(controller, /window\.StashboxCanonicalContent\?\.apiRoot/);
  assert.match(worker, /contentApiBase: requiredEnv\('VIDEO_FACTORY_CONTENT_API_BASE'\)/);
  assert.match(stack, /ContentApiBase:[\s\S]*?prod-v2/);
});

test('PROD and DEV/V2 players both consume canonical song and visual sources', () => {
  [
    'radio/index.html',
    'radio/desktop/index.html',
    'radio/dev/v2/index.html',
    'radio/dev/v2/desktop/index.html'
  ].forEach(relativePath => {
    const html = read(relativePath);
    assert.match(html, /\/radio\/canonical-song-source\.js/);
    assert.match(html, /\/radio\/canonical-visual-source\.js/);
  });

  assert.match(read('radio/canonical-song-source.js'), /const PROD_SONGS = `https:\/\/\$\{PROD_HOST\}\/prod-v2\/radio\/songs`/);
  assert.match(read('radio/canonical-visual-source.js'), /const PROD_BASE = `https:\/\/\$\{PROD_HOST\}\/prod-v2`/);
});

test('environment-specific systems remain isolated from canonical content changes', () => {
  const config = read('radio-admin/admin-env.js');
  assert.match(config, /ads: Object\.freeze\(\{[\s\S]*?targetArchitecture: 'environment-specific'/);
  assert.match(config, /notifications: Object\.freeze\(\{[\s\S]*?targetArchitecture: 'environment-specific'/);
  assert.match(config, /socialFactory: Object\.freeze\(\{[\s\S]*?targetArchitecture: 'separate-service'/);
});
