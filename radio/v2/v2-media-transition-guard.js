(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app || window.StashboxV2MediaTransitionGuard) return;

  const DESKTOP_MIN_WIDTH = 900;
  const VIDEO_RELEASE_GRACE_MS = 1800;
  let stageObserver = null;
  let observedStage = null;
  let installTimer = 0;
  let resizeTimer = 0;
  let releaseTimer = 0;
  let lockedStage = null;
  let lockedBackgroundImage = '';
  let lockedBackgroundPriority = '';

  function activePlayer() {
    return [...app.querySelectorAll('[data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function activeStage(player = activePlayer()) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function desktopWideSurface() {
    const player = activePlayer();
    const surface = activeStage(player) || player;
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    const height = Math.max(1, rect?.height || window.innerHeight || 1);
    return width >= DESKTOP_MIN_WIDTH && width / height >= 1.2;
  }

  function clearRejectedState(media) {
    if (!media) return;
    media.style.removeProperty('visibility');
    media.style.removeProperty('pointer-events');
    media.style.removeProperty('opacity');
    delete media.dataset.desktopRatioState;
    delete media.dataset.desktopAspectRatio;
    delete media.dataset.desktopRatioSkipSent;
    delete media.dataset.desktopRatioTimer;
  }

  function prepareMedia(media) {
    if (!media || !desktopWideSurface()) return;
    clearRejectedState(media);
    media.style.objectFit = 'contain';
    media.style.objectPosition = 'center center';
    media.style.transform = 'none';
    media.style.backgroundColor = 'transparent';
    media.dataset.desktopRatioState = 'approved-contained';
  }

  function stageVideos(stage = activeStage()) {
    if (!stage) return [];
    return [...stage.querySelectorAll('video.v2-mobile-vec-media, video[data-main-vec-watchdog="true"]')];
  }

  function videoIsActive(video) {
    if (!video || !video.isConnected || video.ended) return false;
    const style = getComputedStyle(video);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    if (!visible) return false;
    return !video.paused || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  function watchdogOwnsVideoStage(player = activePlayer()) {
    if (!player) return false;
    const owner = String(player.dataset.mainVecWatchdogOwner || '').trim().toLowerCase();
    const status = String(player.dataset.mainVecWatchdogState || '').trim().toLowerCase();
    return owner === 'fallback'
      || owner === 'native'
      || status.includes('fallback-video')
      || status.includes('starting-fallback-video')
      || status.includes('native-video');
  }

  function lockArtworkBehindVideo(stage = activeStage()) {
    if (!stage || !desktopWideSurface()) return;
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;

    if (lockedStage !== stage) {
      lockedStage = stage;
      lockedBackgroundImage = stage.style.getPropertyValue('background-image');
      lockedBackgroundPriority = stage.style.getPropertyPriority('background-image');
    }

    if (stage.style.getPropertyValue('background-image') !== 'none') {
      stage.style.setProperty('background-image', 'none', 'important');
    }
    stage.dataset.desktopVideoArtworkLock = 'true';
    activePlayer()?.classList.add('is-desktop-video-artwork-locked');
  }

  function releaseArtworkLock({ immediate = false } = {}) {
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;
    const release = () => {
      const stage = lockedStage;
      if (!stage) return;
      if (watchdogOwnsVideoStage() || stageVideos(stage).some(videoIsActive)) {
        lockArtworkBehindVideo(stage);
        return;
      }

      if (lockedBackgroundImage) {
        stage.style.setProperty('background-image', lockedBackgroundImage, lockedBackgroundPriority || 'important');
      } else {
        stage.style.removeProperty('background-image');
      }
      delete stage.dataset.desktopVideoArtworkLock;
      activePlayer()?.classList.remove('is-desktop-video-artwork-locked');
      lockedStage = null;
      lockedBackgroundImage = '';
      lockedBackgroundPriority = '';
      window.StashboxDesktopOfficialArtwork16x9?.refresh?.();
    };

    if (immediate) release();
    else releaseTimer = window.setTimeout(release, VIDEO_RELEASE_GRACE_MS);
  }

  function syncVideoArtworkLock() {
    const player = activePlayer();
    const stage = activeStage(player);
    if (!stage || !desktopWideSurface()) {
      releaseArtworkLock({ immediate: true });
      return;
    }
    if (watchdogOwnsVideoStage(player) || stageVideos(stage).some(videoIsActive)) {
      lockArtworkBehindVideo(stage);
    } else if (lockedStage) {
      releaseArtworkLock();
    }
  }

  function bindMedia(media) {
    if (!media || media.dataset.transitionGuardBound === 'true') return;
    media.dataset.transitionGuardBound = 'true';
    prepareMedia(media);
    ['load', 'loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => {
      media.addEventListener(eventName, () => {
        prepareMedia(media);
        syncVideoArtworkLock();
      }, { passive: true });
    });
    ['playing', 'play'].forEach(eventName => {
      media.addEventListener(eventName, () => {
        prepareMedia(media);
        lockArtworkBehindVideo(media.closest('[data-mobile-vec-stage]') || activeStage());
      }, { passive: true });
    });
    ['pause', 'ended', 'error', 'emptied'].forEach(eventName => {
      media.addEventListener(eventName, () => releaseArtworkLock(), { passive: true });
    });
  }

  function inspectStage() {
    document.querySelectorAll('.v2-media-transition-art').forEach(node => node.remove());
    const stage = activeStage();
    if (!stage) return false;
    stage.querySelectorAll('.v2-mobile-vec-media, video[data-main-vec-watchdog="true"]').forEach(media => {
      bindMedia(media);
      prepareMedia(media);
    });
    syncVideoArtworkLock();
    return true;
  }

  function observeStage() {
    const stage = activeStage();
    if (!stage) return false;
    if (stage === observedStage) return true;

    stageObserver?.disconnect();
    observedStage = stage;
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'attributes' && record.attributeName === 'style' && stage.dataset.desktopVideoArtworkLock === 'true') {
          if (stage.style.getPropertyValue('background-image') !== 'none') {
            stage.style.setProperty('background-image', 'none', 'important');
          }
        }
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches?.('.v2-mobile-vec-media, video[data-main-vec-watchdog="true"]')) bindMedia(node);
          node.querySelectorAll?.('.v2-mobile-vec-media, video[data-main-vec-watchdog="true"]').forEach(bindMedia);
        });
      });
      inspectStage();
    });
    stageObserver.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    inspectStage();
    return true;
  }

  window.addEventListener('stashbox:vec-asset-change', () => {
    observeStage();
    window.requestAnimationFrame(inspectStage);
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(inspectStage, 100);
  }, { passive: true });

  installTimer = window.setInterval(() => {
    if (observeStage()) window.clearInterval(installTimer);
  }, 60);
  observeStage();

  window.StashboxV2MediaTransitionGuard = Object.freeze({
    refresh: inspectStage,
    isDesktopWideSurface: desktopWideSurface,
    minHorizontalRatio: 0,
    videoArtworkLocked: () => Boolean(lockedStage),
    watchdogOwnsVideoStage
  });
})();