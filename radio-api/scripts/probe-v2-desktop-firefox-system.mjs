import fs from 'node:fs/promises';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const SONG_TITLE = process.env.DESKTOP_HEALTH_SONG_TITLE || 'Freedom Street';
const TIMEOUT_MS = Number(process.env.DESKTOP_HEALTH_TIMEOUT_MS || 60000);
const OUTPUT = process.env.DESKTOP_FIREFOX_PROBE_OUTPUT || '/tmp/desktop-v2-system-firefox.json';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const options = new firefox.Options();
options.addArguments('-headless');
options.setPreference('media.autoplay.default', 0);
options.setPreference('media.autoplay.blocking_policy', 0);
options.setPreference('media.autoplay.allow-muted', true);
options.setPreference('media.ffmpeg.enabled', true);

const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
let result = { browser: 'system-firefox', ok: false };
try {
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: TIMEOUT_MS, script: TIMEOUT_MS });
  await driver.manage().window().setRect({ width: 1440, height: 900 });
  const url = new URL(BASE_URL);
  url.searchParams.set('system_firefox_probe', '1');
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
  const selected = {
    key: await target.getAttribute('data-song'),
    text: String(await target.getText()).replace(/\s+/g, ' ')
  };
  await driver.executeScript('arguments[0].click()', target);

  await driver.wait(async () => driver.executeScript(`
    const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
    return Boolean(audio && !audio.paused && audio.currentTime > 0.2);
  `), 15000);

  await driver.wait(async () => driver.executeScript(`
    const state = window.StashboxDesktopVec2?.state?.();
    return Boolean(state && state.songKey && (state.currentAsset || state.status === 'FALLBACK' || state.failedCount > 0));
  `), 35000);
  await sleep(1500);

  const snapshot = await driver.executeScript(`
    const state = window.StashboxDesktopVec2?.state?.() || null;
    const diagnostics = window.StashboxDesktopVec2?.diagnostics?.() || [];
    const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
    const video = document.querySelector('#v2App [data-player]:not([hidden]) .desktop-vec2-layer.is-current video');
    const probe = document.createElement('video');
    return {
      state,
      diagnostics: diagnostics.slice(-100),
      capabilities: {
        h264Baseline: probe.canPlayType('video/mp4; codecs="avc1.42E01E"'),
        h264High: probe.canPlayType('video/mp4; codecs="avc1.64001F"'),
        mp4: probe.canPlayType('video/mp4')
      },
      audio: audio ? {
        currentTime: Number(audio.currentTime || 0), paused: audio.paused, ended: audio.ended,
        readyState: audio.readyState, networkState: audio.networkState,
        errorCode: audio.error?.code || 0, errorMessage: audio.error?.message || '', currentSrc: audio.currentSrc || ''
      } : null,
      activeVideo: video ? {
        currentTime: Number(video.currentTime || 0), paused: video.paused, ended: video.ended,
        readyState: video.readyState, networkState: video.networkState,
        errorCode: video.error?.code || 0, errorMessage: video.error?.message || '', currentSrc: video.currentSrc || ''
      } : null
    };
  `);

  result = {
    browser: 'system-firefox',
    ok: Boolean(snapshot?.state?.currentAsset && snapshot?.audio && !snapshot.audio.paused && snapshot.audio.currentTime > 0.2),
    selected,
    ...snapshot
  };
} catch (error) {
  let snapshot = null;
  try {
    snapshot = await driver.executeScript(`
      const state = window.StashboxDesktopVec2?.state?.() || null;
      const diagnostics = window.StashboxDesktopVec2?.diagnostics?.() || [];
      const audio = document.querySelector('#v2App audio');
      return { state, diagnostics: diagnostics.slice(-100), audio: audio ? {
        currentTime: Number(audio.currentTime || 0), paused: audio.paused, readyState: audio.readyState,
        networkState: audio.networkState, errorCode: audio.error?.code || 0, errorMessage: audio.error?.message || '', currentSrc: audio.currentSrc || ''
      } : null };
    `);
  } catch (_) {}
  result = { browser: 'system-firefox', ok: false, fatalError: error?.stack || error?.message || String(error), snapshot };
} finally {
  await driver.quit();
}

await fs.writeFile(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, ...result }, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);