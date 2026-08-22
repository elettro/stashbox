import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const root = 'radio/v2';
const main = read(`${root}/index.html`);
const desktop = read(`${root}/desktop/index.html`);
const vec = read(`${root}/desktop/desktop-vec2.js`);
const vecSafety = read(`${root}/desktop/desktop-vec-safety.js`);
const authPersist = read(`${root}/desktop/desktop-auth-persist.js`);
const audioMap = read(`${root}/desktop/browser-audio-map.js`);
const audioCompat = read(`${root}/desktop/desktop-audio-compat.js`);
const audioMaster = read(`${root}/desktop/desktop-audio-master.js`);
const health = read(`${root}/desktop/desktop-health.js`);
const css = read(`${root}/desktop/desktop-stable.css`);

// Compile critical browser JavaScript without executing it.
new vm.Script(vec, { filename: 'desktop-vec2.js' });
new vm.Script(vecSafety, { filename: 'desktop-vec-safety.js' });
new vm.Script(authPersist, { filename: 'desktop-auth-persist.js' });
new vm.Script(audioMap, { filename: 'browser-audio-map.js' });
new vm.Script(audioCompat, { filename: 'desktop-audio-compat.js' });
new vm.Script(audioMaster, { filename: 'desktop-audio-master.js' });
new vm.Script(health, { filename: 'desktop-health.js' });

assert(main.includes("matchMedia('(min-width: 900px)').matches"), 'Main V2 page must detect desktop before legacy scripts boot.');
assert(main.includes("new URL('/radio/attempt2/desktop/'"), 'Main V2 page must route desktop to the clean runtime.');
assert(main.includes("desktopruntime') === 'legacy'"), 'Desktop legacy escape hatch must remain explicit.');

const requiredDesktopScripts = [
  '/radio/attempt2/v2-boot-guard.js',
  '/radio/attempt2/v2-session-manager.js',
  '/radio/attempt2/desktop/browser-audio-map.js',
  '/radio/attempt2/desktop/desktop-audio-compat.js',
  '/radio/attempt2/v2-recovery.js',
  '/radio/attempt2/desktop/desktop-auth-persist.js',
  '/radio/attempt2/desktop/desktop-vec2.js',
  '/radio/attempt2/desktop/desktop-vec-safety.js',
  '/radio/attempt2/desktop/desktop-audio-master.js',
  '/radio/attempt2/desktop/desktop-health.js',
  '/radio/attempt2/v2-spacebar-transport.js'
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
  'v2-health.js'
];
for (const script of forbiddenDesktopScripts) {
  assert(!desktop.includes(script), `Clean desktop runtime must not load legacy/observer script ${script}`);
}

assert(!vec.includes('MutationObserver'), 'Desktop VEC 2 must remain free of MutationObserver feedback loops.');
assert(!vec.includes('setInterval('), 'Desktop VEC 2 must remain free of polling intervals.');
assert(!vecSafety.includes('MutationObserver'), 'Desktop VEC safety must remain event-driven.');
assert(!vecSafety.includes('setInterval('), 'Desktop VEC safety must remain free of polling intervals.');
assert(vecSafety.includes("addEventListener('stashbox:desktop-vec2-diagnostic'"), 'Desktop VEC safety must consume VEC diagnostics.');
assert(vecSafety.includes('FAILURE_LIMIT = 4'), 'Desktop VEC safety must cap rapid media failures.');
assert(vecSafety.includes('StashboxDesktopVec2?.stop?.()'), 'Desktop VEC safety must stop only the visual engine when tripped.');
assert(!authPersist.includes('MutationObserver'), 'Desktop auth persistence must not observe the player/VEC subtree.');
assert(!authPersist.includes('setInterval('), 'Desktop auth persistence must use bounded boot repairs, not polling.');
assert(authPersist.includes('const bootDelays = ['), 'Desktop auth persistence must use finite boot repair timers.');
assert(!audioCompat.includes('MutationObserver'), 'Desktop audio compatibility must remain observer-free.');
assert(!audioCompat.includes('setInterval('), 'Desktop audio compatibility must remain free of polling intervals.');
assert(audioCompat.includes('browser_original_audio_url'), 'Desktop audio compatibility must preserve original master audio as fallback.');
assert(audioCompat.includes("document.addEventListener('error'"), 'Desktop audio compatibility must fall back if a derivative fails.');
assert(audioMap.includes('STASHBOX_BROWSER_AUDIO_MAP'), 'Browser audio derivative map must define the shared map.');
assert(!audioMaster.includes('MutationObserver'), 'Desktop audio master must remain free of MutationObserver feedback loops.');
assert(!audioMaster.includes('setInterval('), 'Desktop audio master must remain free of polling intervals.');
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
  'state.imageDeadlineAudioSeconds',
  'scheduleImageAdvance(',
  'clearTimeout(state.imageTimer)',
  'state.played.clear()',
  'state.failed.add(',
  'folderId !== folder'
]) {
  assert(vec.includes(expected), `Desktop VEC 2 is missing expected stability behavior: ${expected}`);
}

for (const expected of [
  "addEventListener('waiting'",
  "addEventListener('seeking'",
  "addEventListener('stalled'",
  "addEventListener('ratechange'",
  'video.pause()',
  'video.playbackRate = rate',
  'video.play().catch'
]) {
  assert(audioMaster.includes(expected), `Desktop audio master is missing expected transport behavior: ${expected}`);
}

assert(css.includes('.desktop-vec2-stage'), 'Clean desktop VEC stage CSS is missing.');
assert(css.includes('pointer-events: none !important'), 'VEC visual stage must remain click-through.');
assert(css.includes('z-index: 5'), 'Player controls must remain above VEC visual layers.');
assert(css.includes('Keep the base artwork as a true fallback'), 'Base artwork fallback must remain visible beneath VEC.');
assert(desktop.includes('history.replaceState'), 'Clean desktop runtime must preserve the normal V2 URL in browser history.');

console.log('Desktop V2 clean runtime smoke test passed.');
