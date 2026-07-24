(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const retryTimers = new WeakMap();

  function currentPlayer() {
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden || getComputedStyle(player).display === 'none') return null;
    return player;
  }

  function audioFor(player) {
    return player?.querySelector('[data-audio]') || null;
  }

  function vecVideos(player) {
    return [...(player?.querySelectorAll('[data-mobile-vec-stage] video.v2-mobile-vec-media') || [])];
  }

  function activeVideo(player) {
    const videos = vecVideos(player);
    return [...videos].reverse().find(video => video.classList.contains('is-active'))
      || videos.at(-1)
      || null;
  }

  function prepare(video) {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
  }

  function clearRetries(video) {
    const timers = retryTimers.get(video) || [];
    timers.forEach(timer => clearTimeout(timer));
    retryTimers.delete(video);
  }

  function canPlayWithAudio(player, video) {
    const audio = audioFor(player);
    return Boolean(
      MOBILE.matches &&
      player &&
      video &&
      video.isConnected &&
      video.classList.contains('is-active') &&
      audio &&
      !audio.paused &&
      !audio.ended
    );
  }

  function pauseVideo(video) {
    if (!video) return;
    clearRetries(video);
    try { video.pause(); } catch (_) {}
  }

  function tryPlay(player, video) {
    if (!canPlayWithAudio(player, video)) return;
    prepare(video);
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      try { video.load(); } catch (_) {}
    }
    const result = video.play();
    if (result?.catch) {
      result.catch(() => {});
    }
  }

  function scheduleRetries(player, video) {
    if (!video) return;
    clearRetries(video);
    const timers = [0, 80, 220, 550, 1100, 2000].map(delay => window.setTimeout(() => {
      if (!canPlayWithAudio(player, video)) return;
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      tryPlay(player, video);
    }, delay));
    retryTimers.set(video, timers);
  }

  function syncMobileVideo() {
    const player = currentPlayer();
    if (!player || !MOBILE.matches) return;
    const audio = audioFor(player);
    const videos = vecVideos(player);
    videos.forEach(prepare);

    if (!audio || audio.paused || audio.ended) {
      videos.forEach(pauseVideo);
      return;
    }

    const video = activeVideo(player);
    if (video && (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) {
      scheduleRetries(player, video);
    }
  }

  function bindAudio(player) {
    const audio = audioFor(player);
    if (!audio || audio.dataset.mobileVecPlaybackRepairBound === 'true') return;
    audio.dataset.mobileVecPlaybackRepairBound = 'true';
    audio.addEventListener('play', syncMobileVideo);
    audio.addEventListener('playing', syncMobileVideo);
    audio.addEventListener('pause', syncMobileVideo);
    audio.addEventListener('ended', syncMobileVideo);
    audio.addEventListener('emptied', syncMobileVideo);
  }

  function bindVideo(video) {
    if (!video || video.dataset.mobileVecPlaybackRepairBound === 'true') return;
    video.dataset.mobileVecPlaybackRepairBound = 'true';
    prepare(video);

    // The core renderer previously skipped to the next asset roughly 900 ms after
    // a normal mobile startup stall. Keep the same clip and retry it instead.
    video.onstalled = () => {
      const player = currentPlayer();
      if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
    };

    video.addEventListener('loadedmetadata', syncMobileVideo);
    video.addEventListener('loadeddata', syncMobileVideo);
    video.addEventListener('canplay', syncMobileVideo);
    video.addEventListener('canplaythrough', syncMobileVideo);
    video.addEventListener('waiting', () => {
      const player = currentPlayer();
      if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
    });
    video.addEventListener('pause', () => {
      const player = currentPlayer();
      if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
    });
  }

  // Catch a startup stalled event before the renderer's old target handler can
  // treat it as a dead clip and flash to the next asset.
  document.addEventListener('stalled', event => {
    const video = event.target;
    if (!MOBILE.matches || !(video instanceof HTMLVideoElement) || !video.closest('[data-mobile-vec-stage]')) return;
    event.stopImmediatePropagation();
    bindVideo(video);
    const player = currentPlayer();
    if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
  }, true);

  const observer = new MutationObserver(() => {
    const player = currentPlayer();
    if (!player) return;
    bindAudio(player);
    vecVideos(player).forEach(bindVideo);
    syncMobileVideo();
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  if (typeof MOBILE.addEventListener === 'function') {
    MOBILE.addEventListener('change', syncMobileVideo);
  }
  document.addEventListener('visibilitychange', () => {
    const player = currentPlayer();
    if (!player) return;
    if (document.hidden) vecVideos(player).forEach(pauseVideo);
    else syncMobileVideo();
  });

  window.setInterval(syncMobileVideo, 500);

  const player = currentPlayer();
  if (player) {
    bindAudio(player);
    vecVideos(player).forEach(bindVideo);
  }
  syncMobileVideo();
})();
