import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.V2_URL || 'https://stashbox.com/radio/dev/v2/';
const SONG_TITLE = process.env.VEC_HEALTH_SONG_TITLE || 'Freedom Street';
const OUTPUT_DIR = path.resolve(process.env.VEC_HEALTH_OUTPUT_DIR || 'artifacts/vec-live-health');
const TIMEOUT_MS = Number(process.env.VEC_HEALTH_TIMEOUT_MS || 45000);
const TOKEN_JSON = process.env.V2_COGNITO_TOKENS_JSON || '';

const profiles = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

function visible(node) {
  if (!node || !node.isConnected || node.hidden) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
}

async function pickSong(page) {
  const songs = page.locator('#v2App [data-song]');
  await songs.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  let target = songs.filter({ hasText: SONG_TITLE }).first();
  if (await target.count() === 0) target = songs.first();
  const selected = await target.evaluate(node => ({
    songKey: node.getAttribute('data-song') || '',
    text: String(node.textContent || '').trim().replace(/\s+/g, ' '),
  }));
  await target.click({ force: true });
  return selected;
}

async function waitForPlayer(page) {
  const player = page.locator('#v2App [data-player]:visible').first();
  await player.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  return player;
}

async function startAudio(page, player) {
  const playButton = player.locator('[data-play]').first();
  if (await playButton.count()) await playButton.click({ force: true });
  await page.waitForFunction(() => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(visible);
    const audio = player?.querySelector('audio');
    return Boolean(audio && !audio.paused && !audio.ended && audio.currentTime > 0.1);
  }, null, { timeout: TIMEOUT_MS });
}

async function waitForVideoMotion(page) {
  return page.evaluate(async timeoutMs => {
    const visible = node => {
      if (!node || !node.isConnected || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(visible);
    const audio = player?.querySelector('audio');
    if (!player || !audio) throw new Error('Active player or audio element missing.');

    const intro = Number(
      player.dataset.mobileVecMotionIntroSeconds ||
      player.dataset.mobileVecRuntimeIntroSeconds ||
      player.dataset.mainVecWatchdogIntroSeconds ||
      2
    );

    const started = performance.now();
    let firstVideoTime = null;
    let firstWallTime = null;
    while (performance.now() - started < timeoutMs) {
      const stage = player.querySelector('[data-mobile-vec-stage]');
      const videos = [...(stage?.querySelectorAll('video') || [])];
      const video = videos.find(item => !item.paused && !item.ended) || videos.find(visible) || videos[0] || null;
      if (audio.currentTime >= intro && video && video.readyState >= 2) {
        const current = Number(video.currentTime || 0);
        if (firstVideoTime === null) {
          firstVideoTime = current;
          firstWallTime = performance.now();
        }
        if (current >= firstVideoTime + 0.2) {
          return {
            introSeconds: intro,
            audioTime: Number(audio.currentTime || 0),
            videoTime: current,
            startupAfterIntroMs: Math.max(0, performance.now() - firstWallTime),
            source: video.currentSrc || video.src || '',
            readyState: video.readyState,
            visibleVideoCount: videos.filter(visible).length,
          };
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('No advancing VEC video was detected.');
  }, TIMEOUT_MS);
}

async function sampleMotion(page) {
  return page.evaluate(async () => {
    const visible = node => {
      if (!node || !node.isConnected || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    };
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(visible);
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const audio = player?.querySelector('audio');
    const videos = [...(stage?.querySelectorAll('video') || [])];
    const video = videos.find(item => !item.paused && !item.ended) || videos.find(visible) || null;
    if (!player || !stage || !audio || !video) throw new Error('Incomplete VEC presentation surface.');

    const start = Number(video.currentTime || 0);
    const qualityStart = video.getVideoPlaybackQuality?.() || null;
    await new Promise(resolve => setTimeout(resolve, 4000));
    const end = Number(video.currentTime || 0);
    const qualityEnd = video.getVideoPlaybackQuality?.() || null;
    const frameDelta = (qualityEnd?.totalVideoFrames || 0) - (qualityStart?.totalVideoFrames || 0);
    const droppedDelta = (qualityEnd?.droppedVideoFrames || 0) - (qualityStart?.droppedVideoFrames || 0);
    const droppedRatio = frameDelta > 0 ? droppedDelta / frameDelta : 0;

    return {
      build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || '',
      runtimeState: player.dataset.mobileVecMotionState || player.dataset.mobileVecRuntimeState || player.dataset.mainVecWatchdogState || '',
      runtimeReason: player.dataset.mobileVecMotionReason || player.dataset.mobileVecRuntimeReason || player.dataset.mainVecWatchdogReason || '',
      songKey: player.dataset.mobileVecMotionSongKey || player.dataset.mobileVecRuntimeSongKey || player.dataset.mainVecWatchdogSongKey || player.dataset.songKey || '',
      clipCount: Number(player.dataset.mobileVecMotionClipCount || player.dataset.mobileVecRuntimeClipCount || player.dataset.mainVecWatchdogClipCount || 0),
      audioPaused: audio.paused,
      videoPaused: video.paused,
      videoReadyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      motionSeconds: end - start,
      visibleVideoCount: videos.filter(visible).length,
      droppedRatio,
    };
  });
}

function grade(result) {
  const failures = [];
  if (result.sample.audioPaused) failures.push('Audio paused during the sample.');
  if (result.sample.videoPaused) failures.push('Video paused during the sample.');
  if (result.sample.motionSeconds < 2.5) failures.push(`Only ${result.sample.motionSeconds.toFixed(2)} seconds of video motion occurred.`);
  if (result.sample.videoReadyState < 2) failures.push('Video never reached playable readiness.');
  if (result.sample.videoWidth <= 0 || result.sample.videoHeight <= 0) failures.push('Video did not decode valid dimensions.');
  if (result.sample.clipCount <= 0) failures.push('Runtime reported zero eligible clips.');
  if (result.sample.visibleVideoCount !== 1) failures.push(`Expected one visible video, found ${result.sample.visibleVideoCount}.`);
  if (result.sample.droppedRatio > 0.2) failures.push(`Dropped-frame ratio was ${(result.sample.droppedRatio * 100).toFixed(1)}%.`);
  if (result.pageErrors.length) failures.push(`Page errors: ${result.pageErrors.join(' | ')}`);
  return { ok: failures.length === 0, failures };
}

async function runProfile(browser, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    deviceScaleFactor: profile.deviceScaleFactor,
    reducedMotion: 'no-preference',
  });
  if (TOKEN_JSON) {
    await context.addInitScript(tokens => localStorage.setItem('stashbox_radio_dev_cognito_tokens', tokens), TOKEN_JSON);
  }
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  const url = new URL(BASE_URL);
  url.searchParams.set('vec_health', profile.name);
  url.searchParams.set('cache_bust', String(Date.now()));
  let result;
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForSelector('meta[name="stashbox-v2-build"]', { state: 'attached', timeout: TIMEOUT_MS });
    const selectedSong = await pickSong(page);
    const player = await waitForPlayer(page);
    await startAudio(page, player);
    const startup = await waitForVideoMotion(page);
    const sample = await sampleMotion(page);
    result = { profile: profile.name, selectedSong, startup, sample, pageErrors, consoleErrors };
    result.grade = grade(result);
  } catch (error) {
    result = {
      profile: profile.name,
      pageErrors,
      consoleErrors,
      fatalError: error?.stack || error?.message || String(error),
      grade: { ok: false, failures: [error?.message || String(error)] },
    };
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, `${profile.name}.png`), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(OUTPUT_DIR, `${profile.name}.json`), JSON.stringify(result, null, 2));
  await context.close();
  return result;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});

const results = [];
try {
  for (const profile of profiles) results.push(await runProfile(browser, profile));
} finally {
  await browser.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  songTitle: SONG_TITLE,
  ok: results.every(result => result.grade?.ok),
  results,
};
await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

for (const result of results) {
  console.log(`[${result.grade?.ok ? 'HEALTHY' : 'FAILED'}] ${result.profile}`);
  for (const failure of result.grade?.failures || []) console.error(`  ${failure}`);
}
if (!summary.ok) process.exitCode = 1;
