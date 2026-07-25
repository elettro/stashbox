#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'radio/dev/v2/v2-stability-contract.json'), 'utf8'));
const localHtml = fs.readFileSync(path.join(repoRoot, contract.entry), 'utf8');
const expectedBuild = localHtml.match(new RegExp(`<meta\\s+name=["']${contract.buildMetaName}["']\\s+content=["']([^"']+)["']`, 'i'))?.[1] || '';
const baseUrl = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const attempts = Math.max(1, Number.parseInt(process.env.V2_SMOKE_ATTEMPTS || '4', 10));
const retryDelayMs = Math.max(1000, Number.parseInt(process.env.V2_SMOKE_RETRY_DELAY_MS || '20000', 10));
const timeoutMs = Math.max(10000, Number.parseInt(process.env.V2_SMOKE_TIMEOUT_MS || String(contract.maximumStartupMs || 30000), 10));
const requireBuildMatch = process.env.REQUIRE_V2_BUILD_MATCH !== 'false';
const artifactsDir = path.join(repoRoot, 'artifacts', 'v2-stability');
fs.mkdirSync(artifactsDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

async function runAttempt(attempt) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Stashbox-V2-Stability-Monitor/1.0'
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
    url: url.toString(),
    expectedBuild,
    liveBuild: '',
    songCount: 0,
    startupMs: null,
    health: null,
    playerOpened: false,
    mediaSourcePresent: false,
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

    await page.waitForFunction(
      () => window.STASHBOX_HEALTH?.status === 'ready',
      null,
      { timeout: timeoutMs }
    );

    report.liveBuild = await page.locator(`meta[name="${contract.buildMetaName}"]`).getAttribute('content') || '';
    report.songCount = await page.locator(contract.readySelector).count();
    report.health = await page.evaluate(() => {
      const health = window.STASHBOX_HEALTH || null;
      if (!health) return null;
      return JSON.parse(JSON.stringify(health, (key, value) => typeof value === 'function' ? undefined : value));
    });
    report.startupMs = report.health?.startupMs ?? Date.now() - startedAt;

    const loadedResources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    for (const required of contract.requiredCoreScripts) {
      if (!loadedResources.some(resource => new URL(resource).pathname === required)) {
        report.failures.push(`Required core script did not load: ${required}`);
      }
    }

    if (requireBuildMatch && expectedBuild && report.liveBuild !== expectedBuild) {
      report.failures.push(`Live build ${report.liveBuild || 'missing'} does not match repository build ${expectedBuild}.`);
    }
    if (report.songCount < (contract.minimumSongCards || 1)) {
      report.failures.push(`Only ${report.songCount} song card(s) rendered.`);
    }
    if (report.health?.status !== 'ready') {
      report.failures.push(`Health status is ${report.health?.status || 'missing'}, not ready.`);
    }
    if (!report.health?.playerReady || !report.health?.mediaReady) {
      report.failures.push('Player or media element did not initialize.');
    }

    const cards = page.locator(contract.readySelector);
    const cardCount = Math.min(await cards.count(), 6);
    for (let index = 0; index < cardCount; index += 1) {
      await cards.nth(index).evaluate(element => element.click());
      try {
        await page.locator(contract.playerSelector).waitFor({ state: 'visible', timeout: 5000 });
        report.playerOpened = true;
      } catch {}
      const source = await page.locator(contract.audioSelector).evaluate(element => element.currentSrc || element.src || '').catch(() => '');
      if (source) {
        report.mediaSourcePresent = true;
        break;
      }
      await page.locator('[data-close]').first().evaluate(element => element.click()).catch(() => {});
    }

    if (!report.playerOpened) report.failures.push('A song card did not open the player.');
    if (!report.mediaSourcePresent) report.failures.push('No tested song produced a playable media source.');
    if (pageErrors.length) report.failures.push(`Critical browser errors: ${pageErrors.join(' | ')}`);
    if (failedResources.length) report.failures.push(`Required network failures: ${failedResources.map(item => `${item.status} ${item.url}`).join(' | ')}`);

    report.pass = report.failures.length === 0;
    if (!report.pass) {
      await page.screenshot({ path: path.join(artifactsDir, `failure-attempt-${attempt}.png`), fullPage: true });
    }
  } catch (error) {
    report.failures.push(error.message || String(error));
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
  process.exit(1);
}

console.log('\nStashbox Radio V2 live browser smoke test passed.');
console.log(`Build: ${finalReport.liveBuild}`);
console.log(`Songs rendered: ${finalReport.songCount}`);
console.log(`Startup: ${finalReport.startupMs}ms`);
console.log(`Catalog source: ${finalReport.health?.catalogSource || 'unknown'}`);
