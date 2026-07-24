(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const DESKTOP = window.matchMedia('(min-width: 700px)');
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
    return videos.findLast?.(video => video.classList.contains('is-active'))
      || [...videos].reverse().find(video => video.classList.contains('is-active'))
      || videos.at(-1)
      || null;
  }

  function prepareVideo(video) {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
  }

  function clearRetries(video) {
    const timers = retryTimers.get(video) || [];
    timers.forEach(timer => clearTimeout(timer));
    retryTimers.delete(video);
  }

  function pauseVideo(video) {
    if (!video) return;
    clearRetries(video);
    try { video.pause(); } catch (_) {}
  }

  function canPlayWithAudio(player, video) {
    const audio = audioFor(player);
    return Boolean(
      DESKTOP.matches &&
      player &&
      video &&
      video.isConnected &&
      video.classList.contains('is-active') &&
      audio &&
      !audio.paused &&
      !audio.ended
    );
  }

  function tryPlay(player, video) {
    if (!canPlayWithAudio(player, video)) return;
    prepareVideo(video);
    const result = video.play();
    if (result?.catch) {
      result.catch(error => {
        if (!canPlayWithAudio(player, video)) return;
        console.warn('[V2 desktop VEC] Video play retry needed', error?.name || error?.message || error);
      });
    }
  }

  function scheduleRetries(player, video) {
    if (!video) return;
    clearRetries(video);
    const timers = [0, 120, 420, 1000].map(delay => window.setTimeout(() => {
      if (!canPlayWithAudio(player, video)) return;
      if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        try { video.load(); } catch (_) {}
      }
      tryPlay(player, video);
    }, delay));
    retryTimers.set(video, timers);
  }

  function syncDesktopVideo() {
    const player = currentPlayer();
    if (!player) return;
    const audio = audioFor(player);
    const video = activeVideo(player);

    vecVideos(player).forEach(prepareVideo);

    if (!DESKTOP.matches || !audio || audio.paused || audio.ended) {
      vecVideos(player).forEach(pauseVideo);
      return;
    }

    if (video) scheduleRetries(player, video);
  }

  function bindAudio(player) {
    const audio = audioFor(player);
    if (!audio || audio.dataset.desktopVecPlaybackRepairBound === 'true') return;
    audio.dataset.desktopVecPlaybackRepairBound = 'true';
    audio.addEventListener('play', syncDesktopVideo);
    audio.addEventListener('playing', syncDesktopVideo);
    audio.addEventListener('pause', syncDesktopVideo);
    audio.addEventListener('ended', syncDesktopVideo);
    audio.addEventListener('emptied', syncDesktopVideo);
  }

  function bindVideo(video) {
    if (!video || video.dataset.desktopVecPlaybackRepairBound === 'true') return;
    video.dataset.desktopVecPlaybackRepairBound = 'true';
    prepareVideo(video);
    video.addEventListener('loadeddata', syncDesktopVideo);
    video.addEventListener('canplay', syncDesktopVideo);
    video.addEventListener('stalled', () => {
      const player = currentPlayer();
      if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
    });
  }

  const observer = new MutationObserver(() => {
    const player = currentPlayer();
    if (!player) return;
    bindAudio(player);
    vecVideos(player).forEach(bindVideo);
    syncDesktopVideo();
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  if (typeof DESKTOP.addEventListener === 'function') {
    DESKTOP.addEventListener('change', syncDesktopVideo);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const player = currentPlayer();
      if (player) vecVideos(player).forEach(pauseVideo);
      return;
    }
    syncDesktopVideo();
  });
  window.addEventListener('resize', syncDesktopVideo);

  const player = currentPlayer();
  if (player) {
    bindAudio(player);
    vecVideos(player).forEach(bindVideo);
  }
  syncDesktopVideo();
})();