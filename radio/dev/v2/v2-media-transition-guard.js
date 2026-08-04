(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app || window.StashboxV2MediaTransitionGuard) return;

  const DESKTOP_MIN_WIDTH = 900;
  let stageObserver = null;
  let observedStage = null;
  let installTimer = 0;
  let resizeTimer = 0;

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

  function bindMedia(media) {
    if (!media || media.dataset.transitionGuardBound === 'true') return;
    media.dataset.transitionGuardBound = 'true';
    prepareMedia(media);
    ['load', 'loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(eventName => {
      media.addEventListener(eventName, () => prepareMedia(media), { passive: true });
    });
  }

  function inspectStage() {
    document.querySelectorAll('.v2-media-transition-art').forEach(node => node.remove());
    const stage = activeStage();
    if (!stage) return false;
    stage.querySelectorAll('.v2-mobile-vec-media').forEach(media => {
      bindMedia(media);
      prepareMedia(media);
    });
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
        record.addedNodes.forEach(node => {
          if (node instanceof HTMLElement && node.matches?.('.v2-mobile-vec-media')) bindMedia(node);
        });
      });
      inspectStage();
    });
    stageObserver.observe(stage, { childList: true, subtree: true });
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
    minHorizontalRatio: 0
  });
})();