import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

const redirects = new Map([
  ['radio-admin/index.html', '/radio-admin/dev/'],
  ['radio-admin/songs/index.html', '/radio-admin/songs/dev/'],
  ['radio-admin/video-library/index.html', '/radio/visual-experience/dev/'],
  ['radio-admin/vec/index.html', '/radio-admin/dev/vec/'],
  ['radio-admin/video-factory/index.html', '/radio-admin/dev/video-factory/'],
  ['radio-admin/ads/index.html', '/radio-admin/dev/ads/'],
  ['radio-admin/ads/dev/index.html', '/radio-admin/dev/ads/'],
  ['radio-admin/notifications/index.html', '/radio-admin/notifications/dev/'],
  ['radio-admin/artists/index.html', '/radio-admin/artists/dev/'],
  ['radio-admin/social-factory/index.html', '/radio-admin/dev/social-factory/'],
  ['radio-admin/bugs/index.html', '/radio-admin/dev/bugs/'],
  ['radio-admin/system-health/index.html', '/radio-admin/dev/system-health/']
]);

const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [relativePath, target] of redirects) {
  test(`${relativePath} redirects to ${target}`, () => {
    const html = read(relativePath);
    const escapedTarget = escapeRegExp(target);

    assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=${escapedTarget}">`));
    assert.match(html, new RegExp(`new URL\\('${escapedTarget}', location\\.origin\\)`));
    assert.match(html, /target\.search = location\.search/);
    assert.match(html, /target\.hash = location\.hash/);
    assert.match(html, /location\.replace\(target\.href\)/);
    assert.match(html, new RegExp(`<a href="${escapedTarget}">`));

    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, `${relativePath} should include a JavaScript redirect`);

    let redirectedUrl = '';
    vm.runInNewContext(script, {
      URL,
      location: {
        origin: 'https://stashbox.com',
        search: '?source=admin-test',
        hash: '#section',
        replace(value) { redirectedUrl = value; }
      }
    });
    assert.equal(redirectedUrl, `https://stashbox.com${target}?source=admin-test#section`);
  });
}
