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
  let presentedVideo = null;
  let presentedCallbackId = 0;
  let lastPresentedAt = 0;
  let presentedFrames = 0;

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

  function clearPresentationWatch() {
    if (presentedVideo && presentedCallbackId && typeof presentedVideo.cancelVideoFrameCallback === 'function') {
      try { presentedVideo.cancelVideoFrameCallback(presentedCallbackId); } catch (_) {}
    }
    presentedVideo = null;
    presentedCallbackId = 0;
    lastPresentedAt = 0;
    presentedFrames = 0;
  }

  function armPresentationWatch(node) {
    clearPresentationWatch();
    if (!node || typeof node.requestVideoFrameCallback !== 'function') return false;

    presentedVideo = node;
    lastPresentedAt = performance.now();
    const onFrame = (_now, metadata) => {
      if (node !== presentedVideo || node !== watchedVideo) return;
      lastPresentedAt = performance.now();
      const count = Number(metadata?.presentedFrames);
      if (Number.isFinite(count)) presentedFrames = count;
      try { presentedCallbackId = node.requestVideoFrameCallback(onFrame); } catch (_) { presentedCallbackId = 0; }
    };

    try {
      presentedCallbackId = node.requestVideoFrameCallback(onFrame);
      return true;
    } catch (_) {
      clearPresentationWatch();
      return false;
    }
  }

  function reset(nextVideo = video()) {
    clearRetry();
    watchedVideo = nextVideo || null;
    lastVideoTime = Number(watchedVideo?.currentTime || 0);
    lastFrameCount = renderedFrames(watchedVideo);
    lastProgressAt = performance.now();
    armedAt = 0;
    armPresentationWatch(watchedVideo);
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
        readyState: Number(current.readyState || 0),
        presentationWatch: current === presentedVideo,
        presentedFrames,
        msSincePresentedFrame: lastPresentedAt ? Math.round(performance.now() - lastPresentedAt) : null
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

    if (current.ended) {
      failCurrent('video-ended-without-handoff');
      return;
    }

    if (document.visibilityState === 'visible' && current === presentedVideo) {
      const noPresentedFrameFor = now - lastPresentedAt;
      if (noPresentedFrameFor >= STALL_MS) {
        failCurrent('video-no-presented-frame');
        return;
      }
      clearRetry();
      return;
    }

    if (framesProgressed || (frameCount === null && timeProgressed)) {
      lastProgressAt = now;
      armedAt = 0;
      clearRetry();
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reset(video());
  });

  const interval = window.setInterval(inspect, 750);

  window.StashboxDesktopVideoStallWatchdog = Object.freeze({
    inspect,
    reset,
    state: () => ({
      watching: Boolean(watchedVideo),
      presentationWatch: watchedVideo === presentedVideo,
      presentedFrames,
      msSincePresentedFrame: lastPresentedAt ? Math.round(performance.now() - lastPresentedAt) : null,
      videoTime: Number(watchedVideo?.currentTime || 0),
      frameCount: renderedFrames(watchedVideo)
    }),
    stop: () => {
      clearRetry();
      clearPresentationWatch();
      clearInterval(interval);
    }
  });
})();
