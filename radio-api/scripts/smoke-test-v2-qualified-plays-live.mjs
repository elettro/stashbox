import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const API_BASE = process.env.V2_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const SONG_TITLE = process.env.PLAY_HEALTH_SONG_TITLE || 'Freedom Street';
const OUTPUT_DIR = path.resolve(process.env.PLAY_HEALTH_OUTPUT_DIR || 'artifacts/v2-qualified-plays');
const TIMEOUT_MS = Number(process.env.PLAY_HEALTH_TIMEOUT_MS || 60000);
const EXPECTED_TRACKER_TOKEN = process.env.PLAY_TRACKER_TOKEN || '20260818-play10-2';
const EXPECTED_MOBILE_BUILD = process.env.PLAY_MOBILE_BUILD || 'mobile-play10-2-';
const EXPECTED_DESKTOP_BUILD = process.env.PLAY_DESKTOP_BUILD || 'desktop-clean-20260818-play10-2-';

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

function unwrap(value) {
  if (typeof value?.body === 'string') {
    try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
  }
  return value;
}

function rows(value) {
  value = unwrap(value);
  if (Array.isArray(value)) return value;
  for (const key of ['songs', 'items', 'rows', 'data']) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

const songKey = row => clean(row?.song_key || row?.songKey || row?.id || row?.key);
const songTitle = row => clean(row?.display_title || row?.song_name || row?.title);
const totalPlays = row => Number(row?.total_plays ?? row?.play_count ?? row?.plays ?? 0) || 0;
const songAudio = row => clean(row?.audio_stream_url || row?.preferred_audio_url || row?.audio_url || row?.resolved_audio_url || row?.audioUrl);

async function apiCatalog() {
  const response = await fetch(`${API_BASE}/radio/songs?limit=500&play_e2e=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok) throw new Error(`catalog HTTP ${response.status}: ${text.slice(0, 300)}`);
  return rows(body);
}

async function freshSong(key) {
  const catalog = await apiCatalog();
  return catalog.find(row => songKey(row) === key) || null;
}

async function chooseSong() {
  const catalog = await apiCatalog();
  const playable = catalog.filter(row => songKey(row) && songAudio(row));
  const preferred = playable.find(row => norm(songTitle(row)).includes(norm(SONG_TITLE)));
  const chosen = preferred || playable[0] || null;
  if (!chosen) throw new Error('No playable song in DEV catalog.');
  return chosen;
}

async function startSong(page, preferredTitle) {
  const cards = page.locator('#v2App [data-song]');
  await cards.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  let target = cards.filter({ hasText: preferredTitle }).first();
  if ((await target.count()) === 0) target = cards.first();
  const selected = await target.evaluate(node => ({
    key: node.getAttribute('data-song') || '',
    text: clean(node.textContent),
  }));
  await target.click();
  const player = page.locator('#v2App [data-player]:visible').first();
  await player.waitFor({ state: 'visible', timeout: 15000 });

  const moving = async () => page.waitForFunction(() => {
    const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
    return Boolean(audio && !audio.paused && !audio.ended && audio.currentTime > 0.25);
  }, null, { timeout: 12000 });

  try {
    await moving();
  } catch (_) {
    await player.locator('[data-play]').first().click();
    await moving();
  }
  return { player, selected };
}

function qualifyingPayload(postData) {
  try {
    const body = JSON.parse(postData || '{}');
    return body?.event_type === 'play_start' && body?.source === 'v2_play_tracker' ? body : null;
  } catch (_) {
    return null;
  }
}

async function runMode({ name, viewport, buildPrefix, chosen }) {
  const beforeRow = await freshSong(songKey(chosen));
  if (!beforeRow) throw new Error(`${name}: chosen song disappeared before test.`);
  const beforeTotal = totalPlays(beforeRow);

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);

  const qualifyingRequests = [];
  const qualifyingResponses = [];
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', error => pageErrors.push(error?.message || String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().includes('/radio/track')) return;
    const payload = qualifyingPayload(request.postData());
    if (payload) qualifyingRequests.push({ url: request.url(), payload, at: Date.now() });
  });
  page.on('response', async response => {
    const request = response.request();
    if (request.method() !== 'POST' || !request.url().includes('/radio/track')) return;
    const payload = qualifyingPayload(request.postData());
    if (!payload) return;
    let body = null;
    try { body = await response.json(); } catch (_) {}
    qualifyingResponses.push({ status: response.status(), ok: response.ok(), body, at: Date.now() });
  });

  try {
    await page.goto(`${BASE_URL}?play_e2e=${encodeURIComponent(name)}-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForFunction(() => Boolean(window.StashboxV2PlayTracker?.state), null, { timeout: 20000 });
    const boot = await page.evaluate(() => ({
      build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || '',
      trackerScripts: [...document.scripts].map(script => script.src).filter(src => src.includes('v2-play-tracker.js')),
      trackerThreshold: Number(window.StashboxV2PlayTracker?.thresholdSeconds || 0),
    }));

    if (!boot.build.startsWith(buildPrefix)) throw new Error(`${name}: unexpected live build ${boot.build || '(missing)'}`);
    if (boot.trackerScripts.length !== 1) throw new Error(`${name}: expected one direct tracker script, found ${boot.trackerScripts.length}`);
    if (!boot.trackerScripts[0].includes(EXPECTED_TRACKER_TOKEN)) throw new Error(`${name}: tracker token mismatch ${boot.trackerScripts[0]}`);
    if (boot.trackerThreshold !== 10) throw new Error(`${name}: tracker threshold is ${boot.trackerThreshold}, expected 10`);

    const { player, selected } = await startSong(page, songTitle(chosen));

    await page.waitForTimeout(5500);
    const preThreshold = await page.evaluate(() => window.StashboxV2PlayTracker?.state?.() || null);
    if (!preThreshold) throw new Error(`${name}: tracker state missing after playback start.`);
    if (preThreshold.qualified) throw new Error(`${name}: play qualified before 10 seconds.`);
    if (qualifyingRequests.length !== 0) throw new Error(`${name}: emitted play_start before 10 seconds.`);

    await page.waitForFunction(() => window.StashboxV2PlayTracker?.state?.().qualified === true, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const qualified = await page.evaluate(() => window.StashboxV2PlayTracker?.state?.() || null);
    if (qualifyingRequests.length !== 1) throw new Error(`${name}: expected exactly one qualifying request, found ${qualifyingRequests.length}`);
    if (qualifyingResponses.length !== 1) throw new Error(`${name}: expected exactly one qualifying response, found ${qualifyingResponses.length}`);
    if (!qualifyingResponses[0].ok) throw new Error(`${name}: qualifying response HTTP ${qualifyingResponses[0].status}`);
    if (qualified.persistAttempts !== 1 || qualified.persistSuccesses !== 1) {
      throw new Error(`${name}: tracker persistence diagnostics are attempts=${qualified.persistAttempts}, successes=${qualified.persistSuccesses}`);
    }

    const payload = qualifyingRequests[0].payload;
    if (payload.song_key !== songKey(chosen)) throw new Error(`${name}: tracked wrong song ${payload.song_key}, expected ${songKey(chosen)}`);
    if (Number(payload.seconds_played) !== 10) throw new Error(`${name}: qualifying payload seconds_played=${payload.seconds_played}`);
    if (!clean(payload.session_id).startsWith(`play10-${songKey(chosen)}-`)) throw new Error(`${name}: invalid play session id ${payload.session_id}`);

    await page.waitForTimeout(5000);
    if (qualifyingRequests.length !== 1) throw new Error(`${name}: emitted duplicate qualifying request after qualification.`);

    const afterRow = await freshSong(songKey(chosen));
    if (!afterRow) throw new Error(`${name}: song missing from post-play catalog.`);
    const afterTotal = totalPlays(afterRow);
    if (afterTotal !== beforeTotal + 1) throw new Error(`${name}: total_plays changed ${beforeTotal} -> ${afterTotal}, expected exactly +1.`);

    const visible = await player.evaluate(node => ({
      datasetTotal: node.dataset.totalPlays || '',
      counts: [...node.querySelectorAll('[data-plays], [data-play-count], [data-total-plays]')].map(item => clean(item.textContent || item.value)),
    }));

    return {
      name,
      ok: true,
      build: boot.build,
      trackerScript: boot.trackerScripts[0],
      selected,
      songKey: songKey(chosen),
      songTitle: songTitle(chosen),
      beforeTotal,
      afterTotal,
      preThreshold,
      qualified,
      qualifyingRequests,
      qualifyingResponses,
      visible,
      pageErrors,
      consoleErrors,
    };
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || '',
      tracker: window.StashboxV2PlayTracker?.state?.() || null,
      title: document.querySelector('#v2App [data-player]:not([hidden]) [data-ptitle]')?.textContent || '',
      audioTime: Number(document.querySelector('#v2App [data-player]:not([hidden]) audio')?.currentTime || 0),
    })).catch(() => ({}));
    return {
      name,
      ok: false,
      error: error?.stack || error?.message || String(error),
      snapshot,
      qualifyingRequests,
      qualifyingResponses,
      beforeTotal,
      pageErrors,
      consoleErrors,
    };
  } finally {
    await browser.close();
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const chosen = await chooseSong();
const modes = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, buildPrefix: EXPECTED_MOBILE_BUILD, chosen },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, buildPrefix: EXPECTED_DESKTOP_BUILD, chosen },
];

const results = [];
for (const mode of modes) {
  results.push(await runMode(mode));
}

const summary = {
  ranAt: new Date().toISOString(),
  url: BASE_URL,
  apiBase: API_BASE,
  chosen: { songKey: songKey(chosen), songTitle: songTitle(chosen) },
  results,
  ok: results.every(result => result.ok),
};

await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
