#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'radio/dev/v2/v2-stability-contract.json'), 'utf8'));
const mainHtml = fs.readFileSync(path.join(repoRoot, contract.entry), 'utf8');
const desktopEntry = 'radio/dev/v2/desktop/index.html';
const desktopHtml = fs.readFileSync(path.join(repoRoot, desktopEntry), 'utf8');
const buildFrom = html => html.match(new RegExp(`<meta\\s+name=["']${contract.buildMetaName}["']\\s+content=["']([^"']+)["']`, 'i'))?.[1] || '';
const expectedMainBuild = buildFrom(mainHtml);
const expectedDesktopBuild = buildFrom(desktopHtml);
const baseUrl = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const attempts = Math.max(1, Number.parseInt(process.env.V2_SMOKE_ATTEMPTS || '4', 10));
const retryDelayMs = Math.max(1000, Number.parseInt(process.env.V2_SMOKE_RETRY_DELAY_MS || '20000', 10));
const timeoutMs = Math.max(10000, Number.parseInt(process.env.V2_SMOKE_TIMEOUT_MS || String(contract.maximumStartupMs || 30000), 10));
const requireBuildMatch = process.env.REQUIRE_V2_BUILD_MATCH !== 'false';
const artifactsDir = path.join(repoRoot, 'artifacts', 'v2-stability');
fs.mkdirSync(artifactsDir, { recursive: true });

const DESKTOP_REQUIRED_SCRIPTS = [
  '/radio/dev/v2/v2-boot-guard.js',
  '/radio/dev/v2/v2-recovery.js',
  '/radio/dev/v2/desktop/desktop-vec2.js',
  '/radio/dev/v2/desktop/desktop-audio-master.js',
  '/radio/dev/v2/desktop/desktop-health.js',
  '/radio/dev/v2/v2-spacebar-transport.js'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

async function eventLoopHeartbeat(page, label, report) {
  try {
    await page.evaluate(() => {
      window.__stashboxSmokeHeartbeat = 0;
      window.setTimeout(() => {
        window.__stashboxSmokeHeartbeat = performance.now();
      }, 100);
    });
    await page.waitForFunction(() => Number(window.__stashboxSmokeHeartbeat || 0) > 0, null, { timeout: 2500 });
    report.heartbeats.push({ label, ok: true, at: nowIso() });
    return true;
  } catch (error) {
    report.heartbeats.push({ label, ok: false, error: error?.message || String(error), at: nowIso() });
    report.failures.push(`Interface event loop stopped responding after ${label}.`);
    return false;
  }
}

async function readHealth(page, runtime) {
  return page.evaluate(currentRuntime => {
    if (currentRuntime === 'desktop-clean') {
      const api = window.STASHBOX_DESKTOP_HEALTH;
      const desktopHealth = api?.refresh?.() || api?.snapshot?.() || null;
      const vec = window.StashboxDesktopVec2?.state?.() || null;
      const audioMaster = window.StashboxDesktopAudioMaster?.state?.() || null;
      return { desktopHealth, vec, audioMaster };
    }
    const health = window.STASHBOX_HEALTH || null;
    if (!health) return { health: null };
    return {
      health: JSON.parse(JSON.stringify(health, (key, value) => typeof value === 'function' ? undefined : value))
    };
  }, runtime);
}

async function readPlayerState(page) {
  return page.evaluate(() => {
    const player = document.querySelector('#v2App [data-player]');
    const audio = player?.querySelector('[data-audio], audio') || null;
    return {
      playerPresent: Boolean(player),
      playerHidden: Boolean(player?.hidden),
      playerDisplay: player ? getComputedStyle(player).display : '',
      title: player?.querySelector('[data-ptitle]')?.textContent?.trim() || '',
      artist: player?.querySelector('[data-partist]')?.textContent?.trim() || '',
      songKey: player?.dataset?.songKey || player?.dataset?.vec2SongKey || '',
      audioSource: audio?.currentSrc || audio?.src || '',
      audioPaused: Boolean(audio?.paused),
      audioEnded: Boolean(audio?.ended),
      audioReadyState: Number(audio?.readyState || 0),
      audioNetworkState: Number(audio?.networkState || 0),
      audioCurrentTime: Number(audio?.currentTime || 0),
      audioErrorCode: audio?.error?.code || null,
      vecState: player?.dataset?.vec2State || '',
      vecPoolSize: Number(player?.dataset?.vec2PoolSize || 0),
      vecPlayedCount: Number(player?.dataset?.vec2PlayedCount || 0),
      vecFailedCount: Number(player?.dataset?.vec2FailedCount || 0)
    };
  });
}

async function runAttempt(attempt) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Stashbox-V2-Stability-Monitor/2.0'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedResources = [];
  const startedAt = Date.now();
  const url = new URL(baseUrl);
  url.searchParams.set('stability_check', `${Date.now()}-${attempt}`);

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    const responseUrl = new URL(response.url());
    const isRequiredV2Resource = responseUrl.hostname === url.hostname && responseUrl.pathname.startsWith('/radio/dev/v2/');
    const isCatalog = responseUrl.pathname.endsWith('/radio/songs');
    if ((isRequiredV2Resource || isCatalog) && response.status() >= 400) {
      failedResources.push({ url: response.url(), status: response.status() });
    }
  });

  const report = {
    attempt,
    checkedAt: nowIso(),
    requestedUrl: url.toString(),
    finalUrl: '',
    runtime: 'unknown',
    expectedBuild: '',
    liveBuild: '',
    songCount: 0,
    startupMs: null,
    health: null,
    playerOpened: false,
    mediaSourcePresent: false,
    playerState: null,
    postClickPlayerState: null,
    heartbeats: [],
    pageErrors,
    consoleErrors,
    failedResources,
    pass: false,
    failures: []
  };

  try {
    const navigation = await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    });
    if (!navigation || navigation.status() !== 200) {
      report.failures.push(`V2 page returned HTTP ${navigation?.status() ?? 'n/a'}.`);
    }

    await page.waitForFunction(
      minimum => document.querySelectorAll('[data-song]').length >= minimum,
      contract.minimumSongCards || 1,
      { timeout: timeoutMs }
    );

    report.finalUrl = page.url();
    report.runtime = await page.evaluate(() => document.body.classList.contains('desktop-clean-runtime') ? 'desktop-clean' : 'legacy');
    report.expectedBuild = report.runtime === 'desktop-clean' ? expectedDesktopBuild : expectedMainBuild;
    report.liveBuild = await page.locator(`meta[name="${contract.buildMetaName}"]`).getAttribute('content') || '';
    report.songCount = await page.locator(contract.readySelector).count();
    report.startupMs = Date.now() - startedAt;
    report.health = await readHealth(page, report.runtime);
    report.playerState = await readPlayerState(page);

    const loadedResources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    const requiredScripts = report.runtime === 'desktop-clean' ? DESKTOP_REQUIRED_SCRIPTS : contract.requiredCoreScripts;
    for (const required of requiredScripts) {
      if (!loadedResources.some(resource => {
        try { return new URL(resource).pathname === required; } catch (_) { return false; }
      })) {
        report.failures.push(`Required core script did not load: ${required}`);
      }
    }

    if (requireBuildMatch && report.expectedBuild && report.liveBuild !== report.expectedBuild) {
      report.failures.push(`Live build ${report.liveBuild || 'missing'} does not match repository build ${report.expectedBuild}.`);
    }
    if (report.songCount < (contract.minimumSongCards || 1)) {
      report.failures.push(`Only ${report.songCount} song card(s) rendered.`);
    }

    if (report.runtime === 'desktop-clean') {
      if (!report.health?.desktopHealth) report.failures.push('Desktop health diagnostics did not initialize.');
      if (!report.health?.desktopHealth?.playerReady) report.failures.push('Desktop player or audio element did not initialize.');
    } else {
      const legacyHealth = report.health?.health;
      if (legacyHealth?.status !== 'ready') report.failures.push(`Health status is ${legacyHealth?.status || 'missing'}, not ready.`);
      if (!legacyHealth?.playerReady || !legacyHealth?.mediaReady) report.failures.push('Player or media element did not initialize.');
    }

    await eventLoopHeartbeat(page, 'catalog-render', report);

    const cards = page.locator(contract.readySelector);
    const cardCount = Math.min(await cards.count(), 6);
    for (let index = 0; index < cardCount; index += 1) {
      await cards.nth(index).evaluate(element => element.click());
      await eventLoopHeartbeat(page, `song-click-${index + 1}`, report);

      try {
        await page.locator(contract.playerSelector).waitFor({ state: 'visible', timeout: 5000 });
        report.playerOpened = true;
      } catch {}

      const source = await page.locator(contract.audioSelector)
        .evaluate(element => element.currentSrc || element.src || '')
        .catch(() => '');
      if (source) {
        report.mediaSourcePresent = true;
        report.postClickPlayerState = await readPlayerState(page);
        break;
      }

      await page.locator('[data-close]').first().evaluate(element => element.click()).catch(() => {});
      await eventLoopHeartbeat(page, `song-close-${index + 1}`, report);
    }

    if (!report.playerOpened) report.failures.push('A song card did not open the player.');
    if (!report.mediaSourcePresent) report.failures.push('No tested song produced a playable media source.');

    if (report.mediaSourcePresent) {
      await sleep(1500);
      await eventLoopHeartbeat(page, 'post-playback-settle', report);
      report.postClickPlayerState = await readPlayerState(page);
      report.health = await readHealth(page, report.runtime);

      if (report.runtime === 'desktop-clean') {
        const desktopHealth = report.health?.desktopHealth;
        if (desktopHealth?.status === 'ERROR') {
          report.failures.push(`Desktop health entered ERROR state: ${desktopHealth.lastError || 'unknown error'}.`);
        }
        if (report.health?.vec?.status === 'ERROR') {
          report.failures.push('Desktop VEC entered ERROR state.');
        }
      }
    }

    if (pageErrors.length) report.failures.push(`Critical browser errors: ${pageErrors.join(' | ')}`);
    if (failedResources.length) report.failures.push(`Required network failures: ${failedResources.map(item => `${item.status} ${item.url}`).join(' | ')}`);

    report.pass = report.failures.length === 0;
    if (!report.pass) {
      await page.screenshot({ path: path.join(artifactsDir, `failure-attempt-${attempt}.png`), fullPage: true });
    }
  } catch (error) {
    report.failures.push(error.message || String(error));
    report.finalUrl = page.url();
    report.playerState = await readPlayerState(page).catch(() => null);
    report.health = await readHealth(page, report.runtime).catch(() => null);
    await page.screenshot({ path: path.join(artifactsDir, `failure-attempt-${attempt}.png`), fullPage: true }).catch(() => {});
  } finally {
    report.finishedAt = nowIso();
    report.elapsedMs = Date.now() - startedAt;
    fs.writeFileSync(path.join(artifactsDir, `report-attempt-${attempt}.json`), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }

  return report;
}

let finalReport = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  console.log(`V2 browser smoke attempt ${attempt}/${attempts}`);
  finalReport = await runAttempt(attempt);
  if (finalReport.pass) break;
  console.error(finalReport.failures.map(failure => `  [FAIL] ${failure}`).join('\n'));
  if (attempt < attempts) await sleep(retryDelayMs);
}

fs.writeFileSync(path.join(artifactsDir, 'latest-report.json'), `${JSON.stringify(finalReport, null, 2)}\n`);

if (!finalReport?.pass) {
  console.error('\nStashbox Radio V2 live browser smoke test failed.');
  console.error(`Runtime: ${finalReport?.runtime || 'unknown'}`);
  console.error(`Final URL: ${finalReport?.finalUrl || 'unknown'}`);
  process.exit(1);
}

console.log('\nStashbox Radio V2 live browser smoke test passed.');
console.log(`Runtime: ${finalReport.runtime}`);
console.log(`Build: ${finalReport.liveBuild}`);
console.log(`Songs rendered: ${finalReport.songCount}`);
console.log(`Startup: ${finalReport.startupMs}ms`);
console.log(`Player source present: ${finalReport.mediaSourcePresent}`);
