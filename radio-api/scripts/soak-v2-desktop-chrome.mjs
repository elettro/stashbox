import fs from 'node:fs/promises';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const SONG_TITLE = process.env.DESKTOP_HEALTH_SONG_TITLE || 'Freedom Street';
const SOAK_MS = Number(process.env.DESKTOP_SOAK_MS || 30 * 60 * 1000);
const SAMPLE_MS = Number(process.env.DESKTOP_SOAK_SAMPLE_MS || 15000);
const OUTPUT = process.env.DESKTOP_SOAK_OUTPUT || '/tmp/desktop-v2-chrome-soak.json';
const TIMEOUT_MS = Number(process.env.DESKTOP_HEALTH_TIMEOUT_MS || 60000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const options = new chrome.Options();
options.addArguments('--headless=new');
options.addArguments('--autoplay-policy=no-user-gesture-required');
options.addArguments('--disable-background-timer-throttling');
options.addArguments('--disable-renderer-backgrounding');
options.addArguments('--disable-gpu');
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
let result = { browser: 'system-chrome-soak', ok: false };
try {
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: TIMEOUT_MS, script: TIMEOUT_MS });
  await driver.manage().window().setRect({ width: 1440, height: 900 });
  const url = new URL(BASE_URL);
  url.searchParams.set('chrome_soak', '1');
  url.searchParams.set('cache_bust', `${Date.now()}-${Math.random()}`);
  await driver.get(url.href);

  await driver.wait(async () => driver.executeScript("return document.body && document.body.classList.contains('desktop-clean-runtime')"), 15000);
  await driver.wait(until.elementsLocated(By.css('#v2App [data-song]')), TIMEOUT_MS);
  const cards = await driver.findElements(By.css('#v2App [data-song]'));
  let target = cards[0];
  for (const card of cards) {
    const text = String(await card.getText()).replace(/\s+/g, ' ');
    if (text.toLowerCase().includes(SONG_TITLE.toLowerCase())) { target = card; break; }
  }
  await driver.executeScript('arguments[0].click()', target);
  await driver.wait(async () => driver.executeScript(`
    const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
    return Boolean(audio && !audio.paused && audio.currentTime > 0.2);
  `), 15000);
  await driver.wait(async () => driver.executeScript(`
    const state = window.StashboxDesktopVec2?.state?.();
    return Boolean(state && state.songKey && state.currentAsset);
  `), 35000);

  const startedAt = Date.now();
  const samples = [];
  const uniqueAssets = new Set();
  const uniqueSongs = new Set();
  const failures = [];
  let lastAudioTime = -1;
  let lastSongKey = '';
  let stationarySamples = 0;

  while (Date.now() - startedAt < SOAK_MS) {
    const sample = await driver.executeScript(`
      const player = document.querySelector('#v2App [data-player]:not([hidden])');
      const audio = player?.querySelector('audio');
      const vec = window.StashboxDesktopVec2?.state?.() || null;
      const health = window.STASHBOX_DESKTOP_HEALTH?.snapshot?.() || null;
      const video = player?.querySelector('.desktop-vec2-layer.is-current video');
      const scripts = [...document.scripts].map(s => s.src || '').filter(src => /watchdog|rescue|v2-desktop-video-runtime|v2-desktop-vec-video-start-fix|v2-media-transition-guard/.test(src));
      return {
        at: Date.now(),
        title: String(player?.querySelector('[data-ptitle]')?.textContent || '').trim(),
        audioTime: Number(audio?.currentTime || 0),
        audioPaused: Boolean(audio?.paused),
        audioEnded: Boolean(audio?.ended),
        audioReadyState: Number(audio?.readyState || 0),
        audioError: Number(audio?.error?.code || 0),
        vec,
        health,
        videoTime: video ? Number(video.currentTime || 0) : null,
        videoPaused: video ? Boolean(video.paused) : null,
        videoReadyState: video ? Number(video.readyState || 0) : null,
        stageCount: player?.querySelectorAll('.desktop-vec2-stage').length || 0,
        currentLayerCount: player?.querySelectorAll('.desktop-vec2-layer.is-current').length || 0,
        legacyScripts: scripts,
        bodyResponsive: document.body?.classList.contains('desktop-clean-runtime') || false
      };
    `);
    samples.push(sample);
    if (sample?.vec?.currentAsset?.url) uniqueAssets.add(sample.vec.currentAsset.url);
    if (sample?.vec?.songKey) uniqueSongs.add(sample.vec.songKey);

    if (!sample.bodyResponsive) failures.push('Clean desktop runtime class disappeared.');
    if (sample.stageCount !== 1) failures.push(`VEC stage count became ${sample.stageCount}.`);
    if (sample.currentLayerCount > 1) failures.push(`Multiple current VEC layers detected: ${sample.currentLayerCount}.`);
    if (sample.legacyScripts?.length) failures.push(`Legacy desktop VEC script loaded: ${sample.legacyScripts.join(', ')}`);
    if (!sample.vec?.songKey) failures.push('VEC lost song session identity.');
    if (!sample.vec?.currentAsset && sample.vec?.status !== 'ARTWORK_INTRO') failures.push(`VEC lost current asset in state ${sample.vec?.status || 'unknown'}.`);
    if (sample.audioPaused && !sample.audioEnded) failures.push('Audio paused unexpectedly during unattended soak.');

    if (lastSongKey && sample.vec?.songKey === lastSongKey && sample.audioTime <= lastAudioTime + 0.01 && !sample.audioPaused && !sample.audioEnded) stationarySamples += 1;
    else stationarySamples = 0;
    if (stationarySamples >= 3) failures.push('Audio clock stopped advancing for three consecutive soak samples.');
    lastAudioTime = sample.audioTime;
    lastSongKey = sample.vec?.songKey || '';

    if (failures.length) break;
    await sleep(Math.min(SAMPLE_MS, Math.max(0, SOAK_MS - (Date.now() - startedAt))));
  }

  result = {
    browser: 'system-chrome-soak',
    ok: failures.length === 0 && samples.length >= 2 && uniqueAssets.size >= 2,
    requestedDurationMs: SOAK_MS,
    elapsedMs: Date.now() - startedAt,
    sampleIntervalMs: SAMPLE_MS,
    sampleCount: samples.length,
    uniqueAssetCount: uniqueAssets.size,
    uniqueSongCount: uniqueSongs.size,
    failures: [...new Set(failures)],
    firstSample: samples[0] || null,
    lastSample: samples.at(-1) || null,
    samples
  };
} catch (error) {
  result = { browser: 'system-chrome-soak', ok: false, fatalError: error?.stack || error?.message || String(error) };
} finally {
  await driver.quit();
}

await fs.writeFile(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, ...result }, null, 2) + '\n');
console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
process.exit(result.ok ? 0 : 1);
