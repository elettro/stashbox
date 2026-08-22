(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopRescueVisibilityRepair20260817) return;

  const PLAYER_ACTIVE_CLASS = 'is-desktop-rescue-video-active';
  const VIDEO_SELECTOR = 'video[data-desktop-minimal-rescue="true"], video[data-main-vec-watchdog="true"], video.v2-mobile-vec-media';
  let observer = null;
  let observedStage = null;
  let timer = 0;

  function visiblePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(player => {
      if (!player?.isConnected || player.hidden) return false;
      const style = getComputedStyle(player);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function stageFor(player = visiblePlayer()) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function videoRunning(video) {
    if (!video?.isConnected || video.ended || video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    const style = getComputedStyle(video);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
  }

  function runningVideos(stage = stageFor()) {
    return [...(stage?.querySelectorAll(VIDEO_SELECTOR) || [])].filter(videoRunning);
  }

  function activate(video) {
    const player = video?.closest('[data-player]') || visiblePlayer();
    const stage = video?.closest('[data-mobile-vec-stage]') || stageFor(player);
    if (!player || !stage) return;

    player.classList.add('is-mobile-vec-active', 'is-vec-active', PLAYER_ACTIVE_CLASS);
    player.dataset.desktopRescueVisualActive = 'true';
    stage.dataset.desktopRescueVisualActive = 'true';

    if (video.dataset.desktopMinimalRescue === 'true') {
      video.style.setProperty('opacity', '1', 'important');
      video.style.setProperty('visibility', 'visible', 'important');
      video.style.setProperty('display', 'block', 'important');
      video.style.setProperty('z-index', '8', 'important');
      video.style.setProperty('pointer-events', 'none', 'important');
    }

    stage.querySelectorAll('img.v2-mobile-vec-media, img[data-desktop-official-placeholder="true"]').forEach(image => {
      image.dataset.desktopRescueSuppressed = 'true';
      image.style.setProperty('opacity', '0', 'important');
      image.style.setProperty('visibility', 'hidden', 'important');
    });

    stage.style.setProperty('background-image', 'none', 'important');
    window.StashboxV2MediaTransitionGuard?.refresh?.();
  }

  function release(player = visiblePlayer()) {
    const stage = stageFor(player);
    if (!player || !stage || runningVideos(stage).length) return;

    player.classList.remove(PLAYER_ACTIVE_CLASS);
    delete player.dataset.desktopRescueVisualActive;
    delete stage.dataset.desktopRescueVisualActive;

    stage.querySelectorAll('[data-desktop-rescue-suppressed="true"]').forEach(image => {
      image.style.removeProperty('opacity');
      image.style.removeProperty('visibility');
      delete image.dataset.desktopRescueSuppressed;
    });

    stage.style.removeProperty('background-image');
    window.StashboxDesktopOfficialArtwork16x9?.refresh?.();
    window.StashboxV2MediaTransitionGuard?.refresh?.();
  }

  function bind(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.desktopRescueVisibilityBound === 'true') return;
    video.dataset.desktopRescueVisibilityBound = 'true';

    ['play', 'playing', 'loadeddata', 'canplay'].forEach(eventName => {
      video.addEventListener(eventName, () => {
        if (!video.paused && !video.ended) activate(video);
      }, { passive: true });
    });

    ['pause', 'ended', 'error', 'emptied', 'abort'].forEach(eventName => {
      video.addEventListener(eventName, () => {
        window.setTimeout(() => release(video.closest('[data-player]') || visiblePlayer()), 160);
      }, { passive: true });
    });

    if (videoRunning(video)) activate(video);
  }

  function inspect() {
    const player = visiblePlayer();
    const stage = stageFor(player);
    if (!stage) return false;

    stage.querySelectorAll(VIDEO_SELECTOR).forEach(bind);
    const active = runningVideos(stage);
    if (active.length) activate(active.at(-1));
    else release(player);
    return true;
  }

  function observe() {
    const stage = stageFor();
    if (!stage) return false;
    if (stage === observedStage) return true;

    observer?.disconnect();
    observedStage = stage;
    observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(VIDEO_SELECTOR)) bind(node);
        node.querySelectorAll?.(VIDEO_SELECTOR).forEach(bind);
      }));
      inspect();
    });
    observer.observe(stage, { childList: true, subtree: true });
    inspect();
    return true;
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement && event.target.matches(VIDEO_SELECTOR)) bind(event.target);
  }, true);

  window.addEventListener('stashbox:vec-asset-change', () => window.requestAnimationFrame(() => {
    observe();
    inspect();
  }));

  timer = window.setInterval(() => {
    observe();
    inspect();
  }, 350);

  observe();
  inspect();

  window.StashboxDesktopRescueVisibilityRepair20260817 = Object.freeze({
    refresh: inspect,
    stop: () => {
      window.clearInterval(timer);
      observer?.disconnect();
    }
  });
})();
