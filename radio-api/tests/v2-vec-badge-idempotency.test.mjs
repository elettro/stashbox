import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const main = read('radio/dev/v2/index.html');
const alt = read('radio/dev/v2/alt-player/index.html');
const overlay = read('radio/dev/v2/v2-viewer-overlay.js');
const overlayCss = read('radio/dev/v2/v2-viewer-overlay.css');
const controller = read('radio/dev/v2/v2-vec-player-controller.js');
const headerRepair = read('radio/dev/v2/v2-mobile-player-header-repair.js');

test('VEC badge has one stable DOM identity and overlay container', () => {
  assert.match(overlay, /const OVERLAY_ID = 'viewer-overlay-left'/);
  assert.match(overlay, /const BADGE_ID = 'viewer-vec-status'/);
  assert.match(overlay, /badge\.id = BADGE_ID/);
  assert.match(overlay, /overlay\.id = OVERLAY_ID/);
});

test('badge updater reuses the existing element and removes duplicates', () => {
  assert.match(overlay, /candidates\.find\(node => node\.id === BADGE_ID\) \|\| candidates\[0\]/);
  assert.match(overlay, /if \(!badge\) badge = createBadge\(\)/);
  assert.match(overlay, /removeDuplicateBadges\(player, badge\)/);
  assert.match(overlay, /if \(node !== keep\) node\.remove\(\)/);
  assert.match(overlay, /cleanExisting\(player = currentPlayer\(\)\)/);
});

test('VEC stage creation updates the permanent badge instead of inserting a badge', () => {
  const stageFunction = controller.slice(controller.indexOf('function stage'), controller.indexOf('function tray'));
  assert.match(controller, /function vecBadge\(p,label\)/);
  assert.match(stageFunction, /vecBadge\(p,label\)/);
  assert.doesNotMatch(stageFunction, /data-mobile-vec-status/);
  assert.doesNotMatch(stageFunction, /innerHTML/);
});

test('header repair delegates badge ownership to the overlay manager', () => {
  assert.match(headerRepair, /StashboxV2ViewerOverlay/);
  assert.match(headerRepair, /manager\?\.cleanExisting\?\.\(player\)/);
  assert.doesNotMatch(headerRepair, /header\.insertBefore\(pill/);
  assert.doesNotMatch(headerRepair, /repairVecPill/);
});

test('upper-left overlay and right action rail are independently positioned', () => {
  assert.match(overlayCss, /\.viewer-overlay-left\s*\{[\s\S]*position:\s*absolute/);
  assert.match(overlayCss, /top:\s*calc\(env\(safe-area-inset-top, 0px\)/);
  assert.match(overlayCss, /\.viewer-action-rail[\s\S]*position:\s*absolute\s*!important/);
  assert.match(overlayCss, /right:\s*18px\s*!important/);
  assert.match(overlayCss, /z-index:\s*30\s*!important/);
});

test('orientation and rerender checks only resynchronize the existing overlay', () => {
  assert.match(overlay, /addEventListener\('orientationchange', queueSync\)/);
  assert.match(overlay, /new MutationObserver\(queueSync\)/);
  assert.match(overlay, /observer\.observe\(app, \{ childList: true, subtree: true \}\)/);
  assert.match(overlay, /if \(queued\) return/);
});

test('main and alternate viewers load overlay manager before VEC controller', () => {
  for (const html of [main, alt]) {
    const managerPosition = html.indexOf('/radio/dev/v2/v2-viewer-overlay.js');
    const controllerPosition = html.indexOf('/radio/dev/v2/v2-vec-player-controller.js');
    const headerPosition = html.indexOf('/radio/dev/v2/v2-mobile-player-header-repair.js');
    assert.ok(managerPosition > -1, 'Missing viewer overlay manager');
    assert.ok(managerPosition < controllerPosition, 'Overlay manager must load before VEC controller');
    assert.ok(managerPosition < headerPosition, 'Overlay manager must load before mobile header repair');
    assert.match(html, /v2-viewer-overlay\.css\?v=20260725-vecbadge81/);
  }
});

test('published viewer builds contain the VEC badge repair', () => {
  assert.match(main, /vec-badge-idempotent-20260725-81/);
  assert.match(alt, /alt-vec-badge-idempotent-20260725-81/);
  assert.match(main, /v2-vec-player-controller\.js\?v=20260725-vecbadge81/);
  assert.match(alt, /v2-vec-player-controller\.js\?v=20260725-vecbadge81/);
});
