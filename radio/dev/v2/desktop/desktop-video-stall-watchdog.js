(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopVideoStallWatchdog) return;

  const STALL_MS = 3200;
  const RETRY_GRACE_MS = 1400;
  const MIN_PROGRESS = 0.08;

  let watchedVideo = null;
  let lastVideoTime = 0;
  let lastFrameCount = null;
  let lastProgressAt = 0;
  let retryTimer = 0;
  let armedAt = 0;

  const player = () => document.querySelector('#v2App [data-player]:not([hidden])');
  const audio = () => player()?.querySelector('[data-audio], audio') || null;
  const video = () => player()?.querySelector('.desktop-vec2-layer.is-current video') || null;

  function renderedFrames(node) {
    if (!node) return null;
    try {
      const quality = node.getVideoPlaybackQuality?.();
      const frames = Number(quality?.totalVideoFrames);
      if (Number.isFinite(frames)) return frames;
    } catch (_) {}
    const fallback = Number(node.webkitDecodedFrameCount ?? node.mozPresentedFrames);
    return Number.isFinite(fallback) ? fallback : null;
  }

  function clearRetry() {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }

  function reset(nextVideo = video()) {
    clearRetry();
    watchedVideo = nextVideo || null;
    lastVideoTime = Number(watchedVideo?.currentTime || 0);
    lastFrameCount = renderedFrames(watchedVideo);
    lastProgressAt = performance.now();
    armedAt = 0;
  }

  function failCurrent(reason) {
    const current = video();
    const currentAudio = audio();
    if (!current || current !== watchedVideo || !currentAudio || currentAudio.paused || currentAudio.ended) return;

    window.dispatchEvent(new CustomEvent('stashbox:desktop-video-stall', {
      detail: {
        reason,
        audioTime: Number(currentAudio.currentTime || 0),
        videoTime: Number(current.currentTime || 0),
        readyState: Number(current.readyState || 0)
      }
    }));

    let handedOff = false;
    try {
      handedOff = window.StashboxDesktopVec2?.recoverCurrent?.(reason) === true;
    } catch (_) {}
    if (!handedOff) {
      try { current.dispatchEvent(new Event('error')); } catch (_) {}
    }
    reset(null);
  }

  function tryRecover(reason) {
    const current = video();
    const currentAudio = audio();
    if (!current || !currentAudio || currentAudio.paused || currentAudio.ended) return;
    if (current.ended) {
      failCurrent('video-ended-without-handoff');
      return;
    }

    if (current !== watchedVideo) reset(current);
    const before = Number(current.currentTime || 0);
    armedAt = performance.now();

    try { current.play().catch(() => {}); } catch (_) {}
    clearRetry();
    retryTimer = setTimeout(() => {
      const latest = video();
      const latestAudio = audio();
      if (!latest || latest !== current || !latestAudio || latestAudio.paused || latestAudio.ended) return reset(latest);
      const progressed = Number(latest.currentTime || 0) > before + MIN_PROGRESS;
      if (progressed) return reset(latest);
      failCurrent(reason);
    }, RETRY_GRACE_MS);
  }

  function inspect() {
    const current = video();
    const currentAudio = audio();

    if (!current || !currentAudio || currentAudio.paused || currentAudio.ended) {
      if (current !== watchedVideo) reset(current);
      return;
    }

    if (current !== watchedVideo) reset(current);

    const now = performance.now();
    const currentTime = Number(current.currentTime || 0);
    const frameCount = renderedFrames(current);
    const timeProgressed = currentTime > lastVideoTime + MIN_PROGRESS;
    const framesProgressed = frameCount !== null && (lastFrameCount === null || frameCount > lastFrameCount);

    if (timeProgressed) lastVideoTime = currentTime;
    if (frameCount !== null) lastFrameCount = frameCount;

    if (framesProgressed || (frameCount === null && timeProgressed)) {
      lastProgressAt = now;
      armedAt = 0;
      clearRetry();
      return;
    }

    if (current.ended) {
      failCurrent('video-ended-without-handoff');
      return;
    }

    const stuckFor = now - lastProgressAt;
    if (stuckFor >= STALL_MS && !retryTimer && (!armedAt || now - armedAt >= STALL_MS)) {
      tryRecover(current.paused ? 'video-paused-while-audio-playing' : 'video-no-progress');
    }
  }

  document.addEventListener('waiting', event => {
    if (event.target instanceof HTMLVideoElement && event.target === video()) {
      if (event.target !== watchedVideo) reset(event.target);
      window.setTimeout(inspect, STALL_MS);
    }
  }, true);

  document.addEventListener('stalled', event => {
    if (event.target instanceof HTMLVideoElement && event.target === video()) {
      if (event.target !== watchedVideo) reset(event.target);
      window.setTimeout(inspect, STALL_MS);
    }
  }, true);

  document.addEventListener('playing', event => {
    if (event.target instanceof HTMLVideoElement && event.target === video()) reset(event.target);
  }, true);

  const interval = window.setInterval(inspect, 750);

  window.StashboxDesktopVideoStallWatchdog = Object.freeze({
    inspect,
    reset,
    stop: () => {
      clearRetry();
      clearInterval(interval);
    }
  });
})();
