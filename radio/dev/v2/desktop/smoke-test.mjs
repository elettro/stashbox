import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const root = 'radio/dev/v2';
const main = read(`${root}/index.html`);
const desktop = read(`${root}/desktop/index.html`);
const vec = read(`${root}/desktop/desktop-vec2.js`);
const health = read(`${root}/desktop/desktop-health.js`);
const css = read(`${root}/desktop/desktop-stable.css`);

// Compile browser JavaScript without executing it.
new vm.Script(vec, { filename: 'desktop-vec2.js' });
new vm.Script(health, { filename: 'desktop-health.js' });

assert(main.includes("matchMedia('(min-width: 900px)').matches"), 'Main V2 page must detect desktop before legacy scripts boot.');
assert(main.includes("new URL('/radio/dev/v2/desktop/'"), 'Main V2 page must route desktop to the clean runtime.');
assert(main.includes("desktopruntime') === 'legacy'"), 'Desktop legacy escape hatch must remain explicit.');

const requiredDesktopScripts = [
  '/radio/dev/v2/v2-boot-guard.js',
  '/radio/dev/v2/v2-recovery.js',
  '/radio/dev/v2/desktop/desktop-vec2.js',
  '/radio/dev/v2/desktop/desktop-health.js',
  '/radio/dev/v2/v2-spacebar-transport.js'
];
for (const script of requiredDesktopScripts) {
  assert(desktop.includes(script), `Clean desktop runtime is missing ${script}`);
}

const forbiddenDesktopScripts = [
  'v2-desktop-vec-core-loader.js',
  'v2-main-vec-video-watchdog.js',
  'v2-desktop-vec-video-start-fix.js',
  'v2-desktop-video-runtime-20260816-153.js',
  'v2-desktop-rescue-visibility-repair-20260817.js',
  'v2-desktop-official-artwork-16x9.js',
  'v2-desktop-artwork-runtime-loader.js',
  'v2-portrait-artwork-reliability.js',
  'v2-media-transition-guard.js',
  'v2-media-session.js',
  'v2-session-manager.js',
  'v2-health.js'
];
for (const script of forbiddenDesktopScripts) {
  assert(!desktop.includes(script), `Clean desktop runtime must not load legacy/observer script ${script}`);
}

assert(!vec.includes('MutationObserver'), 'Desktop VEC 2 must remain free of MutationObserver feedback loops.');
assert(!vec.includes('setInterval('), 'Desktop VEC 2 must remain free of polling intervals.');
assert(!health.includes('MutationObserver'), 'Desktop health diagnostics must remain event-driven.');
assert(!health.includes('setInterval('), 'Desktop health diagnostics must remain free of polling intervals.');

for (const expected of [
  "addEventListener('play'",
  "addEventListener('playing'",
  "addEventListener('pause'",
  "addEventListener('emptied'",
  'preloadNext(',
  'artwork-intro-complete',
  'state.introTargetMs',
  'audio.currentTime',
  'state.played.clear()',
  'state.failed.add(',
  'folderId !== folder'
]) {
  assert(vec.includes(expected), `Desktop VEC 2 is missing expected stability behavior: ${expected}`);
}

assert(css.includes('.desktop-vec2-stage'), 'Clean desktop VEC stage CSS is missing.');
assert(css.includes('pointer-events: none !important'), 'VEC visual stage must remain click-through.');
assert(css.includes('z-index: 5'), 'Player controls must remain above VEC visual layers.');
assert(css.includes('Keep the base artwork as a true fallback'), 'Base artwork fallback must remain visible beneath VEC.');
assert(desktop.includes("history.replaceState"), 'Clean desktop runtime must preserve the normal V2 URL in browser history.');

console.log('Desktop V2 clean runtime smoke test passed.');
