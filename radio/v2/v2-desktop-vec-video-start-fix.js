(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;
  if (document.documentElement.dataset.vecEngine === '2') return;

  const DESKTOP = window.matchMedia('(min-width: 700px)');
  const retryTimers = new WeakMap();
  const stageState = new WeakMap();

  // Demo stability: keep desktop VEC on one renderer. The recovery watchdog
  // otherwise competes with the native VEC stage by hiding/pausing native
  // videos while also creating its own video elements.
  if (DESKTOP.matches && !window.StashboxMainVecVideoWatchdog) {
    window.StashboxMainVecVideoWatchdog = Object.freeze({
      disabled: true,
      reason: 'desktop-native-vec-owner',
      refresh: () => syncDesktopVideo(),
      rescueActive: () => false,
      rescueUrl: () => '',
      state: () => ({ owner: 'native', status: 'desktop-native-vec-owner' }),
      stop: () => {}
    });
  }

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

  function stageFor(player) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function vecVideos(player) {
    return [...(player?.querySelectorAll('[data-mobile-vec-stage] video.v2-mobile-vec-media') || [])];
  }

  function videoEligible(video) {
    return Boolean(video && video.isConnected && !video.ended && video.classList.contains('is-active'));
  }

  function activeVideo(player) {
    const videos = vecVideos(player).filter(videoEligible);
    return videos.findLast?.(video => video.classList.contains('is-active'))
      || [...videos].reverse().find(video => video.classList.contains('is-active'))
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
    video.style.setProperty('z-index', '8', 'important');
    video.style.setProperty('visibility', 'visible', 'important');
  }

  function suppressArtwork(player, video) {
    const stage = stageFor(player);
    if (!stage || !videoEligible(video)) return;

    if (!stageState.has(stage)) {
      stageState.set(stage, {
        backgroundImage: stage.style.getPropertyValue('background-image'),
        backgroundPriority: stage.style.getPropertyPriority('background-image')
      });
    }

    stage.dataset.desktopVecVideoOwner = 'native';
    stage.style.setProperty('background-image', 'none', 'important');
    player?.classList.add('is-desktop-video-artwork-locked');

    stage.querySelectorAll('.v2-mobile-vec-media').forEach(media => {
      if (media === video || media instanceof HTMLVideoElement) return;
      if (media.dataset.desktopVecPreviousVisibility === undefined) {
        media.dataset.desktopVecPreviousVisibility = media.style.visibility || '';
        media.dataset.desktopVecPreviousOpacity = media.style.opacity || '';
      }
      media.style.setProperty('visibility', 'hidden', 'important');
      media.style.setProperty('opacity', '0', 'important');
    });
  }

  function restoreArtwork(player) {
    const stage = stageFor(player);
    if (!stage) return;
    const saved = stageState.get(stage);
    if (saved) {
      if (saved.backgroundImage) {
        stage.style.setProperty('background-image', saved.backgroundImage, saved.backgroundPriority || '');
      } else {
        stage.style.removeProperty('background-image');
      }
      stageState.delete(stage);
    }
    delete stage.dataset.desktopVecVideoOwner;
    player?.classList.remove('is-desktop-video-artwork-locked');
    stage.querySelectorAll('[data-desktop-vec-previous-visibility]').forEach(media => {
      media.style.removeProperty('visibility');
      media.style.removeProperty('opacity');
      if (media.dataset.desktopVecPreviousVisibility) media.style.visibility = media.dataset.desktopVecPreviousVisibility;
      if (media.dataset.desktopVecPreviousOpacity) media.style.opacity = media.dataset.desktopVecPreviousOpacity;
      delete media.dataset.desktopVecPreviousVisibility;
      delete media.dataset.desktopVecPreviousOpacity;
    });
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
    suppressArtwork(player, video);

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
      });
    }
  }

  function scheduleRetries(player, video) {
    if (!video) return;
    clearRetries(video);
    const timers = [0, 100, 300, 700, 1400, 2400, 4000, 6500].map(delay => window.setTimeout(() => {
      if (!canPlayWithAudio(player, video)) return;
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
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
      restoreArtwork(player);
      return;
    }

    videos.forEach(item => {
      if (item !== video) pauseVideo(item);
    });

    if (!video) {
      restoreArtwork(player);
      return;
    }

    suppressArtwork(player, video);
    if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      scheduleRetries(player, video);
    }
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
    ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach(eventName => {
      video.addEventListener(eventName, syncDesktopVideo, { passive: true });
    });
    video.addEventListener('playing', () => {
      const player = currentPlayer();
      if (player && videoEligible(video)) suppressArtwork(player, video);
    }, { passive: true });
    ['stalled', 'suspend', 'waiting'].forEach(eventName => {
      video.addEventListener(eventName, () => {
        const player = currentPlayer();
        if (player && canPlayWithAudio(player, video)) scheduleRetries(player, video);
      }, { passive: true });
    });
    ['ended', 'error', 'emptied'].forEach(eventName => {
      video.addEventListener(eventName, syncDesktopVideo, { passive: true });
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