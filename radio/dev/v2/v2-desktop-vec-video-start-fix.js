(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const DESKTOP = window.matchMedia('(min-width: 700px)');
  const retryTimers = new WeakMap();

  function isVisible(node) {
    if (!node || node.hidden || !node.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function currentPlayer() {
    const playingAudio = [...app.querySelectorAll('audio[data-audio], [data-player] audio')]
      .find(audio => audio.isConnected && !audio.paused && !audio.ended);
    const audioPlayer = playingAudio?.closest?.('[data-player]');
    if (audioPlayer && isVisible(audioPlayer)) return audioPlayer;
    return [...app.querySelectorAll('[data-player]')].find(isVisible) || null;
  }

  function audioFor(player) {
    const local = player?.querySelector('[data-audio], audio');
    if (local && !local.paused && !local.ended) return local;
    return [...app.querySelectorAll('audio[data-audio], [data-player] audio')]
      .find(audio => audio.isConnected && !audio.paused && !audio.ended) || local || null;
  }

  function vecVideos(player) {
    return [...(player?.querySelectorAll(
      '[data-mobile-vec-stage] video.v2-mobile-vec-media, [data-mobile-vec-stage] video[data-main-vec-watchdog="true"]'
    ) || [])];
  }

  function videoEligible(video) {
    if (!video || !video.isConnected || video.ended) return false;
    if (video.matches('video[data-main-vec-watchdog="true"]')) return true;
    return video.classList.contains('is-active');
  }

  function activeVideo(player) {
    const videos = vecVideos(player).filter(videoEligible);
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
    video.autoplay = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.removeAttribute('controls');
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
      videoEligible(video) &&
      audio &&
      !audio.paused &&
      !audio.ended
    );
  }

  function tryPlay(player, video) {
    if (!canPlayWithAudio(player, video)) return;
    prepareVideo(video);

    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      try { video.load(); } catch (_) {}
    }

    let result;
    try { result = video.play(); } catch (error) {
      console.warn('[V2 desktop VEC] Video play threw', error?.name || error?.message || error);
      return;
    }

    if (result?.catch) {
      result.catch(error => {
        if (!canPlayWithAudio(player, video)) return;
        console.warn('[V2 desktop VEC] Video play retry needed', error?.name || error?.message || error);
        try { video.load(); } catch (_) {}
      });
    }
  }

  function scheduleRetries(player, video) {
    if (!video) return;
    clearRetries(video);
    const timers = [0, 100, 300, 700, 1400, 2400].map(delay => window.setTimeout(() => {
      if (!canPlayWithAudio(player, video)) return;
      tryPlay(player, video);
    }, delay));
    retryTimers.set(video, timers);
  }

  function syncDesktopVideo() {
    const player = currentPlayer();
    if (!player) return;
    const audio = audioFor(player);
    const videos = vecVideos(player);
    const video = activeVideo(player);

    videos.forEach(prepareVideo);

    if (!DESKTOP.matches || !audio || audio.paused || audio.ended) {
      videos.forEach(pauseVideo);
      return;
    }

    videos.forEach(item => {
      if (item !== video && !item.matches('video[data-main-vec-watchdog="true"]')) pauseVideo(item);
    });

    if (video) scheduleRetries(player, video);
  }

  function bindAudio(player) {
    const audio = audioFor(player);
    if (!audio || audio.dataset.desktopVecPlaybackRepairBound === 'true') return;
    audio.dataset.desktopVecPlaybackRepairBound = 'true';
    audio.addEventListener('play', syncDesktopVideo);
    audio.addEventListener('playing', syncDesktopVideo);
    audio.addEventListener('timeupdate', syncDesktopVideo);
    audio.addEventListener('pause', syncDesktopVideo);
    audio.addEventListener('ended', syncDesktopVideo);
    audio.addEventListener('emptied', syncDesktopVideo);
  }

  function bindVideo(video) {
    if (!video || video.dataset.desktopVecPlaybackRepairBound === 'true') return;
    video.dataset.desktopVecPlaybackRepairBound = 'true';
    prepareVideo(video);
    ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach(eventName => {
      video.addEventListener(eventName, syncDesktopVideo, { passive: true });
    });
    ['stalled', 'suspend', 'waiting'].forEach(eventName => {
      video.addEventListener(eventName, () => {
        const player = currentPlayer();
        if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
      }, { passive: true });
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
    attributeFilter: ['class', 'hidden', 'src']
  });

  window.addEventListener('stashbox:vec-asset-change', syncDesktopVideo);

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

  window.addEventListener('resize', syncDesktopVideo, { passive: true });

  const player = currentPlayer();
  if (player) {
    bindAudio(player);
    vecVideos(player).forEach(bindVideo);
  }
  syncDesktopVideo();
})();