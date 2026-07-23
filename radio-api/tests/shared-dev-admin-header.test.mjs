import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const targetPages = [
  'radio-admin/dev/index.html',
  'radio-admin/songs/dev/index.html',
  'radio-admin/artists/dev/index.html',
  'radio/visual-experience/dev/index.html',
  'radio-admin/dev/vec/index.html',
  'radio-admin/dev/video-factory/index.html',
  'radio-admin/ads/dev/index.html',
  'radio-admin/dev/ads/index.html',
  'radio-admin/notifications/dev/index.html',
  'radio/dashboard/dev/index.html'
];

const loaderPath = '/radio-admin/dev/shared-admin-header.js?v=20260721-shared-header1';

test('every DEV CMS entry page loads the shared admin header exactly once', () => {
  targetPages.forEach(relativePath => {
    const html = read(relativePath);
    const count = html.split(loaderPath).length - 1;
    assert.equal(count, 1, `${relativePath} should load the shared header exactly once`);
  });
});

test('shared admin navigation uses the approved button order', () => {
  const source = read('radio-admin/dev/shared-admin-header.js');
  const labels = [
    "label: 'Songs'",
    "label: 'Video Library'",
    "label: 'VEC Lab'",
    "label: 'Video Factory'",
    "label: 'Ads'",
    "label: 'Artists'",
    "label: 'Notifications'",
    "label: 'Dashboard'",
    "label: 'Radio Dev'",
    "label: 'Radio Dev 2.0'"
  ];
  const positions = labels.map(label => source.indexOf(label));
  positions.forEach((position, index) => assert.notEqual(position, -1, `Missing ${labels[index]}`));
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
});

test('Radio Dev 2.0 is directly after Radio Dev and points to V2', () => {
  const source = read('radio-admin/dev/shared-admin-header.js');
  const radio = source.indexOf("label: 'Radio Dev'");
  const radioV2 = source.indexOf("label: 'Radio Dev 2.0'");
  assert.ok(radio < radioV2);
  assert.match(source, /label: 'Radio Dev 2\.0', href: 'https:\/\/stashbox\.com\/radio\/dev\/v2\/'/);
});

test('Artists is located between Ads and Notifications', () => {
  const source = read('radio-admin/dev/shared-admin-header.js');
  const ads = source.indexOf("label: 'Ads'");
  const artists = source.indexOf("label: 'Artists'");
  const notifications = source.indexOf("label: 'Notifications'");
  assert.ok(ads < artists && artists < notifications);
});

test('each DEV tool receives its relevant title and active key', () => {
  const source = read('radio-admin/dev/shared-admin-header.js');
  const expected = [
    "return { key: 'songs', title: 'Songs CMS' }",
    "return { key: 'artists', title: 'Artist CMS' }",
    "return { key: 'video-library', title: 'Video Library' }",
    "return { key: 'vec', title: 'VEC Lab' }",
    "return { key: 'video-factory', title: 'Video Factory' }",
    "return { key: 'ads', title: 'Ads CMS' }",
    "return { key: 'notifications', title: 'Notifications CMS' }",
    "return { key: 'dashboard', title: 'Dashboard' }"
  ];
  expected.forEach(value => assert.match(source, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('legacy navigation headers are removed while content heroes remain eligible', () => {
  const source = read('radio-admin/dev/shared-admin-header.js');
  assert.match(source, /\.radio-admin-macro-header/);
  assert.match(source, /\.stashbox-site-header/);
  assert.match(source, /nav\[aria-label\*="admin" i\]/);
  assert.doesNotMatch(source, /element\.matches\([^)]*\.hero/);
  assert.match(source, /legacyHeaders\.forEach\(legacyHeader => legacyHeader\.remove\(\)\)/);
});

test('production pages are not included in shared DEV header targets', () => {
  targetPages.forEach(relativePath => {
    assert.ok(relativePath.includes('/dev/') || relativePath.startsWith('radio-admin/dev/'));
  });
  const source = read('radio-admin/dev/shared-admin-header.js');
  assert.doesNotMatch(source, /\/radio-admin\/songs\/'\s*}/);
  assert.doesNotMatch(source, /\/radio\/visual-experience\/'\s*}/);
});
