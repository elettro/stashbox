import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const SONG_TITLE = process.env.VEC_HEALTH_SONG_TITLE || 'Freedom Street';
const TIMEOUT_MS = Number(process.env.VEC_HEALTH_TIMEOUT_MS || 45000);
const OUTPUT_DIR = path.resolve(process.env.VEC_HEALTH_OUTPUT_DIR || 'artifacts/vec-health');
const TOKEN_JSON = process.env.V2_COGNITO_TOKENS_JSON || '';

const devices = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const nowIso = () => new Date().toISOString();
const sanitize = value => String(value || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

async function selectSong(page) {
  const songs = page.locator('#v2App [data-song]');
  await songs.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  let target = songs.filter({ hasText: SONG_TITLE }).first();
  if ((await target.count()) === 0) target = songs.first();
  await target.scrollIntoViewIfNeeded();
  const selected = await target.evaluate(node => ({
    songKey: node.getAttribute('data-song') || '',
    text: (node.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  await target.click({ force: true });
  return selected;
}

async function visiblePlayer(page) {
  const player = page.locator('#v2App [data-player]:visible').first();
  await player.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  return player;
}

async function startAudio(page, player) {
  const playButton = player.locator('[data-play]').first();
  if ((await playButton.count()) > 0) await playButton.click({ force: true });
  await page.waitForFunction(() => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => {
      if (node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const audio = player?.querySelector('audio');
    return Boolean(audio && !audio.paused && !audio.ended && audio.currentTime > 0.05);
  }, { timeout: TIMEOUT_MS });
}

async function waitForIntro(page) {
  return page.evaluate(async timeoutMs => {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => {
        if (node.hidden) return false;
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const audio = player?.querySelector('audio');
      const intro = Number(
        player?.dataset?.mobileVecMotionIntroSeconds ||
        player?.dataset?.mobileVecRuntimeIntroSeconds ||
        player?.dataset?.mainVecWatchdogIntroSeconds ||
        2
      );
      if (audio && !audio.paused && audio.currentTime >= intro) {
        return { introSeconds: intro, audioTime: audio.currentTime, crossedAt: performance.now() };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Audio never crossed the configured VEC artwork intro time.');
  }, TIMEOUT_MS);
}

async function waitForMotion(page) {
  return page.evaluate(async timeoutMs => {
    const visible = node => {
      if (!node || !node.isConnected || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const start = performance.now();
    let lastVideo = null;
    let lastTime = 0;
    let lastAdvanceAt = 0;
    while (performance.now() - start < timeoutMs) {
      const player = [...document.querySelectorAll('#v2App [data-player]')].find(visible);
      const stage = player?.querySelector('[data-mobile-vec-stage]');
      const videos = [...(stage?.querySelectorAll('video') || [])].filter(visible);
      const video = videos.find(item => !item.paused && !item.ended) || videos[0] || null;
      if (video !== lastVideo) {
        lastVideo = video;
        lastTime = Number(video?.currentTime || 0);
        lastAdvanceAt = performance.now();
      }
      if (video) {
        const current = Number(video.currentTime || 0);
        if (current > lastTime + 0.06) {
          lastTime = current;
          lastAdvanceAt = performance.now();
        }
        if (current > 0.08 && !video.paused && !video.ended && video.readyState >= 2 && performance.now() - lastAdvanceAt < 1200) {
          return {
            motionAt: performance.now(),
            currentTime: current,
            readyState: video.readyState,
            visibleVideoCount: videos.length,
            source: video.currentSrc || video.src || '',
          };
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('No advancing VEC video frame was detected before the health timeout.');
  }, TIMEOUT_MS);
}

async function samplePresentation(page, sampleMs = 5000) {
  return page.evaluate(async durationMs => {
    const visible = node => {
      if (!node || !node.isConnected || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(visible);
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const audio = player?.querySelector('audio');
    const videos = [...(stage?.querySelectorAll('video') || [])].filter(visible);
    const images = [...(stage?.querySelectorAll('img') || [])].filter(visible);
    const video = videos.find(item => !item.paused && !item.ended) || videos[0] || null;
    if (!player || !stage || !audio || !video) throw new Error('The active VEC presentation surface was incomplete.');

    const startTime = Number(video.currentTime || 0);
    const startQuality = video.getVideoPlaybackQuality?.() || null;
    const startWall = performance.now();
    let maxFrozenMs = 0;
    let lastTime = startTime;
    let lastAdvanceAt = startWall;
    while (performance.now() - startWall < durationMs) {
      const current = Number(video.currentTime || 0);
      if (current > lastTime + 0.025) {
        lastTime = current;
        lastAdvanceAt = performance.now();
      } else {
        maxFrozenMs = Math.max(maxFrozenMs, performance.now() - lastAdvanceAt);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const endQuality = video.getVideoPlaybackQuality?.() || null;
    const rect = video.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const totalFrames = endQuality?.totalVideoFrames || 0;
    const droppedFrames = endQuality?.droppedVideoFrames || 0;
    const frameDelta = totalFrames - (startQuality?.totalVideoFrames || 0);
    const droppedDelta = droppedFrames - (startQuality?.droppedVideoFrames || 0);
    const droppedRatio = frameDelta > 0 ? droppedDelta / frameDelta : 0;
    const sourceScale = rect.width > 0 && rect.height > 0
      ? Math.min(video.videoWidth / rect.width, video.videoHeight / rect.height)
      : 0;

    return {
      build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || '',
      pageUrl: location.href,
      runtimeState: player.dataset.mobileVecMotionState || player.dataset.mobileVecRuntimeState || player.dataset.mainVecWatchdogState || '',
      runtimeReason: player.dataset.mobileVecMotionReason || player.dataset.mobileVecRuntimeReason || player.dataset.mainVecWatchdogReason || '',
      songKey: player.dataset.mobileVecMotionSongKey || player.dataset.mobileVecRuntimeSongKey || player.dataset.mainVecWatchdogSongKey || player.dataset.songKey || '',
      clipCount: Number(player.dataset.mobileVecMotionClipCount || player.dataset.mobileVecRuntimeClipCount || player.dataset.mainVecWatchdogClipCount || 0),
      audioTime: Number(audio.currentTime || 0),
      audioPaused: audio.paused,
      videoSource: video.currentSrc || video.src || '',
      videoTimeStart: startTime,
      videoTimeEnd: Number(video.currentTime || 0),
      videoPaused: video.paused,
      videoEnded: video.ended,
      videoReadyState: video.readyState,
      videoNetworkState: video.networkState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      sourceScale,
      visibleVideoCount: videos.length,
      visibleImageCount: images.length,
      totalFrames,
      droppedFrames,
      sampledFrames: frameDelta,
      sampledDroppedFrames: droppedDelta,
      droppedRatio,
      maxFrozenMs,
      motionSeconds: Number(video.currentTime || 0) - startTime,
    };
  }, sampleMs);
}

function grade(result) {
  const failures = [];
  const warnings = [];
  if (result.startupLatencyMs > 10000) failures.push(`Video startup took ${Math.round(result.startupLatencyMs)} ms.`);
  else if (result.startupLatencyMs > 4000) warnings.push(`Video startup took ${Math.round(result.startupLatencyMs)} ms.`);
  if (result.presentation.visibleVideoCount !== 1) failures.push(`Expected one visible video, found ${result.presentation.visibleVideoCount}.`);
  if (result.presentation.videoPaused) failures.push('The VEC video was paused while the song was playing.');
  if (result.presentation.motionSeconds < 2.5) failures.push(`Only ${result.presentation.motionSeconds.toFixed(2)} seconds of motion occurred during the sample.`);
  if (result.presentation.maxFrozenMs > 3500) failures.push(`The video stopped advancing for ${Math.round(result.presentation.maxFrozenMs)} ms.`);
  else if (result.presentation.maxFrozenMs > 1800) warnings.push(`The video briefly stopped advancing for ${Math.round(result.presentation.maxFrozenMs)} ms.`);
  if (result.presentation.droppedRatio > 0.15) failures.push(`Dropped-frame ratio was ${(result.presentation.droppedRatio * 100).toFixed(1)}%.`);
  else if (result.presentation.droppedRatio > 0.06) warnings.push(`Dropped-frame ratio was ${(result.presentation.droppedRatio * 100).toFixed(1)}%.`);
  if (result.presentation.videoWidth <= 0 || result.presentation.videoHeight <= 0) failures.push('The browser did not decode valid video dimensions.');
  if (result.presentation.sourceScale > 0 && result.presentation.sourceScale < 0.65) warnings.push(`The decoded video is being enlarged ${Math.round(1 / result.presentation.sourceScale * 100)}%.`);
  if (result.presentation.stageWidth <= 0 || result.presentation.stageHeight <= 0) failures.push('The VEC stage has no visible dimensions.');
  if (result.presentation.clipCount <= 0) failures.push('The runtime reported zero eligible VEC videos for the tested song.');
  if (result.pageErrors.length) failures.push(`Page errors: ${result.pageErrors.join(' | ')}`);
  return { ok: failures.length === 0, status: failures.length ? 'failed' : warnings.length ? 'warning' : 'healthy', failures, warnings };
}

async function runDevice(browser, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    locale: 'en-US',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  if (TOKEN_JSON) {
    await context.addInitScript(tokens => localStorage.setItem('stashbox_radio_dev_cognito_tokens', tokens), TOKEN_JSON);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim()));

  const startedAt = nowIso();
  const testUrl = new URL(BASE_URL);
  testUrl.searchParams.set('vec_health_test', profile.name);
  testUrl.searchParams.set('cache_bust', String(Date.now()));
  let report;
  try {
    await page.goto(testUrl.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForSelector('meta[name="stashbox-v2-build"]', { timeout: TIMEOUT_MS });
    const selectedSong = await selectSong(page);
    const player = await visiblePlayer(page);
    await startAudio(page, player);
    const intro = await waitForIntro(page);
    const motion = await waitForMotion(page);
    const presentation = await samplePresentation(page, 5000);
    report = {
      device: profile.name,
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      startedAt,
      finishedAt: nowIso(),
      selectedSong,
      intro,
      motion,
      startupLatencyMs: Math.max(0, motion.motionAt - intro.crossedAt),
      presentation,
      consoleErrors,
      pageErrors,
      failedRequests,
    };
    report.grade = grade(report);
  } catch (error) {
    report = {
      device: profile.name,
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      startedAt,
      finishedAt: nowIso(),
      consoleErrors,
      pageErrors,
      failedRequests,
      fatalError: error?.stack || error?.message || String(error),
      grade: { ok: false, status: 'failed', failures: [error?.message || String(error)], warnings: [] },
    };
  }
  const stem = sanitize(profile.name);
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${stem}.png`), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(OUTPUT_DIR, `${stem}.json`), JSON.stringify(report, null, 2));
  await context.close();
  return report;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const reports = [];
try {
  for (const profile of devices) reports.push(await runDevice(browser, profile));
} finally {
  await browser.close();
}
const summary = { generatedAt: nowIso(), baseUrl: BASE_URL, requestedSongTitle: SONG_TITLE, ok: reports.every(report => report.grade?.ok), reports };
await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
for (const report of reports) {
  console.log(`[${String(report.grade?.status || 'failed').toUpperCase()}] ${report.device}`);
  for (const warning of report.grade?.warnings || []) console.log(`  warning: ${warning}`);
  for (const failure of report.grade?.failures || []) console.error(`  failure: ${failure}`);
}
if (!summary.ok) process.exitCode = 1;
