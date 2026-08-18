import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const API_BASE = process.env.VEC_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const SONG_TITLE = process.env.DESKTOP_HEALTH_SONG_TITLE || 'Freedom Street';
const OUTPUT_DIR = path.resolve(process.env.DESKTOP_HEALTH_OUTPUT_DIR || 'artifacts/desktop-v2-clean-health');
const TIMEOUT_MS = Number(process.env.DESKTOP_HEALTH_TIMEOUT_MS || 60000);
const TEST_ORIGIN = new URL(BASE_URL).origin;

// This is an architecture and interaction gate. Playwright's bundled Chromium
// does not provide a reliable H.264 decoder in this runner. Real VEC media
// promotion is gated separately by system Chrome, official Firefox, and Edge.
const browserDefs = [
  {
    name: 'chromium',
    type: chromium,
    launch: { headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] },
  },
];

const forbiddenRuntimeFragments = [
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
];

function unwrap(value) {
  if (typeof value?.body === 'string') {
    try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
  }
  return value;
}

function rows(value, keys = ['songs', 'items', 'data']) {
  value = unwrap(value);
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  if (value?.data && value.data !== value) return rows(value.data, keys);
  return [];
}

const clean = value => String(value ?? '').trim();
const songKey = song => clean(song?.song_key || song?.songKey || song?.key || song?.id);
const songTitle = song => clean(song?.display_title || song?.song_name || song?.title);
const songAudio = song => clean(song?.audio_url || song?.resolved_audio_url || song?.audioUrl || song?.stream_url || song?.mp3_url);

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Origin: TEST_ORIGIN } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return {
    url,
    ok: response.ok,
    status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin') || '',
    body,
  };
}

async function probeApi() {
  const catalogProbe = await fetchJson(`${API_BASE}/radio/songs`);
  const catalog = rows(catalogProbe.body).filter(song => songKey(song) && songAudio(song));
  const chosen = catalog.find(song => songTitle(song).toLowerCase().includes(SONG_TITLE.toLowerCase())) || catalog[0] || null;
  const key = songKey(chosen);
  const title = songTitle(chosen);
  const probes = { catalog: catalogProbe };
  if (key) {
    probes.recipe = await fetchJson(`${API_BASE}/radio/vec/recipe?song_key=${encodeURIComponent(key)}`);
    probes.assets = await fetchJson(`${API_BASE}/radio/vec/song-assets?song_key=${encodeURIComponent(key)}`);
  }

  const failures = [];
  for (const [name, probe] of Object.entries(probes)) {
    if (!probe.ok) failures.push(`${name} returned HTTP ${probe.status}`);
    if (!probe.allowOrigin) failures.push(`${name} omitted Access-Control-Allow-Origin`);
    else if (probe.allowOrigin !== '*' && probe.allowOrigin !== TEST_ORIGIN) failures.push(`${name} returned unexpected Access-Control-Allow-Origin ${probe.allowOrigin}`);
  }
  if (!key) failures.push('No playable song was available from the DEV catalog.');

  return {
    ok: failures.length === 0,
    failures,
    songKey: key,
    songTitle: title,
    catalogCount: catalog.length,
    directAssetCount: probes.assets ? rows(probes.assets.body, ['assets', 'items', 'data']).length : 0,
    statuses: Object.fromEntries(Object.entries(probes).map(([name, probe]) => [name, probe.status])),
  };
}

async function waitForAudioMotion(page) {
  await page.waitForFunction(() => {
    const player = document.querySelector('#v2App [data-player]:not([hidden])');
    const audio = player?.querySelector('audio');
    return Boolean(audio && !audio.paused && !audio.ended && audio.currentTime > 0.2);
  }, null, { timeout: 10000 });
}

async function startSong(page, preferredTitle) {
  const cards = page.locator('#v2App [data-song]');
  await cards.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  let target = cards.filter({ hasText: preferredTitle }).first();
  if ((await target.count()) === 0) target = cards.first();
  const selected = await target.evaluate(node => ({
    key: node.getAttribute('data-song') || '',
    text: String(node.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  await target.click();
  const player = page.locator('#v2App [data-player]:visible').first();
  await player.waitFor({ state: 'visible', timeout: 10000 });

  try {
    await waitForAudioMotion(page);
  } catch (_) {
    const play = player.locator('[data-play]').first();
    await play.click();
    await waitForAudioMotion(page);
  }
  return { player, selected };
}

async function waitForVecStarted(page) {
  await page.waitForFunction(() => {
    const api = window.StashboxDesktopVec2;
    if (!api?.state) return false;
    const state = api.state();
    return Boolean(state.songKey && ['ARTWORK_INTRO', 'PLAYING_VIDEO', 'PLAYING_IMAGE', 'FALLBACK'].includes(state.status));
  }, null, { timeout: 15000 });

  await page.waitForFunction(() => {
    const state = window.StashboxDesktopVec2?.state?.();
    return Boolean(state && (state.currentAsset || state.status === 'FALLBACK'));
  }, null, { timeout: 30000 });
}

async function interactionSample(page, player) {
  const play = player.locator('[data-play]').first();
  const clickSurface = await play.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      topTag: top?.tagName || '',
      topClass: top?.className || '',
      buttonOwnsPoint: Boolean(top && (top === button || button.contains(top))),
    };
  });

  const before = await page.evaluate(() => {
    const player = document.querySelector('#v2App [data-player]:not([hidden])');
    const audio = player?.querySelector('audio');
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    const currentVideo = player?.querySelector('.desktop-vec2-layer.is-current video');
    return {
      audioTime: Number(audio?.currentTime || 0),
      audioPaused: Boolean(audio?.paused),
      vec,
      videoTime: currentVideo ? Number(currentVideo.currentTime || 0) : null,
      currentLayerCount: player?.querySelectorAll('.desktop-vec2-layer.is-current').length || 0,
      stageCount: player?.querySelectorAll('.desktop-vec2-stage').length || 0,
    };
  });

  await play.click();
  await page.waitForFunction(() => document.querySelector('#v2App [data-player]:not([hidden]) audio')?.paused === true, null, { timeout: 5000 });
  const pausedStart = await page.evaluate(() => {
    const player = document.querySelector('#v2App [data-player]:not([hidden])');
    const audio = player?.querySelector('audio');
    const video = player?.querySelector('.desktop-vec2-layer.is-current video');
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    return { audioTime: Number(audio?.currentTime || 0), videoTime: video ? Number(video.currentTime || 0) : null, vec };
  });
  await page.waitForTimeout(1400);
  const pausedEnd = await page.evaluate(() => {
    const player = document.querySelector('#v2App [data-player]:not([hidden])');
    const audio = player?.querySelector('audio');
    const video = player?.querySelector('.desktop-vec2-layer.is-current video');
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    return { audioTime: Number(audio?.currentTime || 0), videoTime: video ? Number(video.currentTime || 0) : null, vec };
  });

  await play.click();
  await page.waitForFunction(start => {
    const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
    return Boolean(audio && !audio.paused && audio.currentTime > start + 0.25);
  }, pausedEnd.audioTime, { timeout: 8000 });

  const resumed = await page.evaluate(() => {
    const player = document.querySelector('#v2App [data-player]:not([hidden])');
    const audio = player?.querySelector('audio');
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    return { audioTime: Number(audio?.currentTime || 0), vec };
  });

  return { clickSurface, before, pausedStart, pausedEnd, resumed };
}

async function songChangeSample(page, player) {
  const changes = [];
  for (let index = 0; index < 3; index += 1) {
    const before = clean(await player.locator('[data-ptitle]').textContent());
    await player.locator('[data-next]').click();
    await page.waitForFunction(previous => {
      const player = document.querySelector('#v2App [data-player]:not([hidden])');
      const title = String(player?.querySelector('[data-ptitle]')?.textContent || '').trim();
      const audio = player?.querySelector('audio');
      return Boolean(title && title !== previous && audio && !audio.paused && audio.currentTime > 0.1);
    }, before, { timeout: 10000 });
    await page.waitForFunction(() => Boolean(window.StashboxDesktopVec2?.state?.().songKey), null, { timeout: 10000 });
    changes.push(await page.evaluate(() => ({
      title: String(document.querySelector('#v2App [data-player]:not([hidden]) [data-ptitle]')?.textContent || '').trim(),
      songKey: window.StashboxDesktopVec2?.state?.().songKey || '',
      vecStatus: window.StashboxDesktopVec2?.state?.().status || '',
    })));
  }
  return changes;
}

function grade(result) {
  const failures = [];
  if (!result.build.startsWith('desktop-clean-')) failures.push(`Unexpected deployed build: ${result.build || '(missing)'}`);
  if (!result.desktopRuntime) failures.push('Clean desktop runtime class was not active.');
  if (result.forbiddenResources.length) failures.push(`Legacy desktop scripts loaded: ${result.forbiddenResources.join(', ')}`);
  if (!result.interaction.clickSurface.buttonOwnsPoint) failures.push(`Play control is covered by ${result.interaction.clickSurface.topTag}.${result.interaction.clickSurface.topClass}`);
  if (result.interaction.before.stageCount !== 1) failures.push(`Expected exactly one VEC stage, found ${result.interaction.before.stageCount}`);
  if (result.interaction.before.currentLayerCount > 1) failures.push(`Expected at most one promoted VEC layer, found ${result.interaction.before.currentLayerCount}`);
  const vec = result.interaction.before.vec || {};
  if (!vec.songKey) failures.push('VEC session did not resolve a song key.');
  if (Number(vec.poolSize || 0) < 1) failures.push('VEC session did not resolve an eligible asset pool.');
  if (!['PLAYING_VIDEO', 'PLAYING_IMAGE', 'TRANSITIONING', 'FALLBACK'].includes(vec.status)) failures.push(`Unexpected VEC interaction state: ${vec.status || 'unknown'}`);
  if (Math.abs(result.interaction.pausedEnd.audioTime - result.interaction.pausedStart.audioTime) > 0.08) failures.push('Audio advanced while paused.');
  if (result.interaction.pausedStart.videoTime !== null && result.interaction.pausedEnd.videoTime !== null && Math.abs(result.interaction.pausedEnd.videoTime - result.interaction.pausedStart.videoTime) > 0.08) failures.push('VEC video advanced while audio was paused.');
  if (result.interaction.pausedStart.vec?.currentAsset?.type === 'image') {
    const startDeadline = Number(result.interaction.pausedStart.vec.imageDeadlineAudioSeconds || 0);
    const endDeadline = Number(result.interaction.pausedEnd.vec.imageDeadlineAudioSeconds || 0);
    if (startDeadline !== endDeadline) failures.push('VEC image audio deadline changed while paused.');
  }
  if (result.interaction.resumed.audioTime <= result.interaction.pausedEnd.audioTime + 0.2) failures.push('Audio did not resume after main play control was clicked.');
  if (result.songChanges.length !== 3 || result.songChanges.some(change => !change.songKey)) failures.push('Repeated next-song session reset failed.');
  if (result.pageErrors.length) failures.push(`Page errors: ${result.pageErrors.join(' | ')}`);
  return { ok: failures.length === 0, failures };
}

async function runBrowser(def, api) {
  const browser = await def.type.launch(def.launch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const resources = [];
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/radio/dev/v2/')) resources.push(url);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    const build = await page.locator('meta[name="stashbox-v2-build"]').getAttribute('content').catch(() => '');
    const { player, selected } = await startSong(page, SONG_TITLE);
    await waitForVecStarted(page);
    const interaction = await interactionSample(page, player);
    const songChanges = await songChangeSample(page, player);
    const finalVec = await page.evaluate(() => window.StashboxDesktopVec2?.state?.() || {});
    const finalHealth = await page.evaluate(() => window.STASHBOX_DESKTOP_HEALTH?.snapshot?.() || {});
    const forbiddenResources = [...new Set(resources.filter(url => forbiddenRuntimeFragments.some(fragment => url.includes(fragment))))];
    const result = {
      browser: def.name,
      build: clean(build),
      desktopRuntime: await page.locator('body.desktop-clean-runtime').count() === 1,
      selected,
      interaction,
      songChanges,
      finalVec,
      finalHealth,
      forbiddenResources,
      pageErrors,
      consoleErrors,
    };
    result.grade = grade(result);
    if (!result.grade.ok) await page.screenshot({ path: path.join(OUTPUT_DIR, `${def.name}-failure.png`), fullPage: true }).catch(() => {});
    return result;
  } catch (error) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${def.name}-exception.png`), fullPage: true }).catch(() => {});
    return {
      browser: def.name,
      build: '',
      desktopRuntime: false,
      selected: null,
      interaction: null,
      songChanges: [],
      finalVec: {},
      finalHealth: {},
      forbiddenResources: [],
      pageErrors,
      consoleErrors,
      grade: { ok: false, failures: [error?.stack || error?.message || String(error)] },
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const api = await probeApi();
const results = [];
for (const browser of browserDefs) results.push(await runBrowser(browser, api));
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  api,
  results,
};
await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

const failures = [
  ...api.failures.map(message => `DEV API: ${message}`),
  ...results.flatMap(result => result.grade.failures.map(message => `${result.browser}: ${message}`)),
];
if (failures.length) {
  console.error('\nDesktop V2 clean live-health failures:');
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
}