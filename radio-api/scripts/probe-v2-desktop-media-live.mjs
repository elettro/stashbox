import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from 'playwright';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const OUTPUT_DIR = path.resolve(process.env.DESKTOP_MEDIA_PROBE_OUTPUT_DIR || 'artifacts/desktop-v2-media-probe');
const SONG_TITLE = process.env.DESKTOP_HEALTH_SONG_TITLE || 'Freedom Street';
const TIMEOUT_MS = Number(process.env.DESKTOP_HEALTH_TIMEOUT_MS || 60000);

const browsers = [
  {
    name: 'chrome',
    type: chromium,
    launch: {
      channel: 'chrome',
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    },
  },
  { name: 'firefox', type: firefox, launch: { headless: true } },
];

async function run(def) {
  const browser = await def.type.launch(def.launch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);

  const mediaResponses = [];
  const failedRequests = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on('response', response => {
    const url = response.url();
    if (!/\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url)) return;
    const headers = response.headers();
    mediaResponses.push({
      url,
      status: response.status(),
      ok: response.ok(),
      contentType: headers['content-type'] || '',
      contentLength: headers['content-length'] || '',
      acceptRanges: headers['accept-ranges'] || '',
      contentRange: headers['content-range'] || '',
      cacheControl: headers['cache-control'] || '',
    });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (/\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url)) {
      failedRequests.push({ url, failure: request.failure()?.errorText || '' });
    }
  });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    window.__STASHBOX_MEDIA_ERRORS = [];
    const nativeCreate = Document.prototype.createElement;
    Document.prototype.createElement = function(tagName, options) {
      const node = nativeCreate.call(this, tagName, options);
      if (String(tagName).toLowerCase() === 'video') {
        node.addEventListener('error', () => {
          window.__STASHBOX_MEDIA_ERRORS.push({
            at: Date.now(),
            src: node.currentSrc || node.src || '',
            errorCode: node.error?.code || 0,
            errorMessage: node.error?.message || '',
            networkState: node.networkState,
            readyState: node.readyState,
          });
        });
      }
      return node;
    };
  });

  const url = new URL(BASE_URL);
  url.searchParams.set('desktop_media_probe', def.name);
  url.searchParams.set('cache_bust', `${Date.now()}-${Math.random()}`);

  let result = { browser: def.name, ok: false };
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForFunction(() => document.body?.classList.contains('desktop-clean-runtime'), null, { timeout: 15000 });
    const cards = page.locator('#v2App [data-song]');
    await cards.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    let target = cards.filter({ hasText: SONG_TITLE }).first();
    if ((await target.count()) === 0) target = cards.first();
    const selected = await target.evaluate(node => ({
      key: node.getAttribute('data-song') || '',
      text: String(node.textContent || '').trim().replace(/\s+/g, ' '),
    }));
    await target.click();

    const player = page.locator('#v2App [data-player]:visible').first();
    await player.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
      return Boolean(audio && !audio.paused && audio.currentTime > 0.2);
    }, null, { timeout: 10000 });

    await page.waitForFunction(() => {
      const state = window.StashboxDesktopVec2?.state?.();
      return Boolean(state && state.songKey && (state.currentAsset || state.status === 'FALLBACK' || state.failedCount > 0));
    }, null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => window.StashboxDesktopVec2?.state?.() || null);
    const diagnostics = await page.evaluate(() => window.StashboxDesktopVec2?.diagnostics?.() || []);
    const mediaErrors = await page.evaluate(() => window.__STASHBOX_MEDIA_ERRORS || []);
    const audio = await page.evaluate(() => {
      const el = document.querySelector('#v2App [data-player]:not([hidden]) audio');
      return el ? {
        currentTime: Number(el.currentTime || 0),
        paused: el.paused,
        errorCode: el.error?.code || 0,
        errorMessage: el.error?.message || '',
        networkState: el.networkState,
        readyState: el.readyState,
        currentSrc: el.currentSrc || '',
      } : null;
    });

    result = {
      browser: def.name,
      ok: Boolean(state?.currentAsset),
      selected,
      state,
      audio,
      mediaErrors,
      mediaResponses: mediaResponses.slice(0, 40),
      failedRequests: failedRequests.slice(0, 40),
      diagnostics: diagnostics.slice(-80),
      consoleErrors,
      pageErrors,
    };
  } catch (error) {
    result = {
      browser: def.name,
      ok: false,
      fatalError: error?.stack || error?.message || String(error),
      mediaResponses: mediaResponses.slice(0, 40),
      failedRequests: failedRequests.slice(0, 40),
      consoleErrors,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
  return result;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const results = [];
for (const def of browsers) {
  try { results.push(await run(def)); }
  catch (error) { results.push({ browser: def.name, ok: false, fatalError: error?.stack || error?.message || String(error) }); }
}
const summary = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, ok: results.every(result => result.ok), results };
await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
for (const result of results) await fs.writeFile(path.join(OUTPUT_DIR, `${result.browser}.json`), JSON.stringify(result, null, 2) + '\n');
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.browser}`);
  if (result.state) console.log(`  VEC ${result.state.status} pool=${result.state.poolSize} failed=${result.state.failedCount}`);
  for (const item of result.mediaErrors || []) console.log(`  media error code=${item.errorCode} ready=${item.readyState} network=${item.networkState} ${item.src}`);
  for (const item of result.mediaResponses || []) console.log(`  HTTP ${item.status} ${item.contentType} ${item.url}`);
  for (const item of result.failedRequests || []) console.log(`  request failed ${item.failure} ${item.url}`);
}
process.exit(summary.ok ? 0 : 1);
