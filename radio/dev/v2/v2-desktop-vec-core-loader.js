(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;

  const params = new URLSearchParams(location.search);
  const vec2 = params.get('vec2') === '1' || localStorage.getItem('stashbox_vec2_dev') === '1';

  if (vec2) {
    document.documentElement.dataset.vecEngine = '2';
    document.documentElement.dataset.vecLegacyDisabled = 'true';

    // Block later legacy VEC owners before their static script tags execute.
    window.StashboxMainVecVideoWatchdog = Object.freeze({
      refresh: () => {}, stop: () => {}, rescueActive: () => false,
      activeSongKey: () => '', clipCount: () => 0, rescueUrl: () => '', state: () => ({ disabledBy: 'vec2' })
    });
    window.StashboxV2MediaTransitionGuard = Object.freeze({
      refresh: () => {}, isDesktopWideSurface: () => true, minHorizontalRatio: 0,
      videoArtworkLocked: () => false, watchdogOwnsVideoStage: () => false
    });
    window.StashboxDesktopOfficialArtwork16x9 = Object.freeze({
      refresh: () => {}, applyCurrent: () => false, applySong: () => false,
      desktopSurface: () => true, state: () => ({ disabledBy: 'vec2' })
    });

    if (!document.querySelector('script[data-desktop-artwork-runtime]')) {
      const marker = document.createElement('script');
      marker.type = 'application/json';
      marker.dataset.desktopArtworkRuntime = 'true';
      marker.textContent = '{}';
      document.head.appendChild(marker);
    }

    if (!document.querySelector('link[data-vec2-style="true"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/radio/dev/v2/vec2/vec2-stage.css?v=20260817-core4';
      css.dataset.vec2Style = 'true';
      document.head.appendChild(css);
    }

    const loadBridge = () => {
      if (document.querySelector('script[data-vec2-cms-bridge="true"]')) return;
      const bridge = document.createElement('script');
      bridge.src = '/radio/dev/v2/vec2/vec2-cms-bridge.js?v=20260817-cms1';
      bridge.async = false;
      bridge.dataset.vec2CmsBridge = 'true';
      document.head.appendChild(bridge);
    };

    if (!document.querySelector('script[data-vec2-controller="true"]')) {
      const controller = document.createElement('script');
      controller.src = '/radio/dev/v2/vec2/vec2-controller.js?v=20260817-core4';
      controller.async = false;
      controller.dataset.vec2Controller = 'true';
      controller.onload = loadBridge;
      controller.onerror = () => {
        document.documentElement.dataset.vecEngine = 'vec2-load-error';
        console.error('[VEC2] Controller failed to load. Reload without ?vec2=1 for legacy VEC.');
      };
      document.head.appendChild(controller);
    } else if (window.StashboxVec2) {
      loadBridge();
    }
    return;
  }

  if (document.querySelector('script[data-desktop-vec-core="true"]')) return;

  const loadVisibilityRepair = () => {
    if (document.querySelector('script[data-desktop-rescue-visibility-repair="true"]')) return;
    const repair = document.createElement('script');
    repair.src = '/radio/dev/v2/v2-desktop-rescue-visibility-repair-20260817.js?v=20260817-desktopvideo1';
    repair.async = false;
    repair.dataset.desktopRescueVisibilityRepair = 'true';
    document.head.appendChild(repair);
  };

  const loadDesktopVideoRuntime = () => {
    if (document.querySelector('script[data-desktop-video-runtime="true"]')) return;
    const runtime = document.createElement('script');
    runtime.src = '/radio/dev/v2/v2-desktop-video-runtime-20260816-153.js?v=20260817-visibilityrepair1';
    runtime.async = false;
    runtime.dataset.desktopVideoRuntime = 'true';
    document.head.appendChild(runtime);
  };

  loadVisibilityRepair();

  const script = document.createElement('script');
  script.src = '/radio/dev/v2/v2-vec-player-controller.js?v=20260806-desktop-only1';
  script.async = false;
  script.dataset.desktopVecCore = 'true';
  script.onerror = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'load-error';
    loadDesktopVideoRuntime();
  };
  script.onload = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'loaded';
    loadDesktopVideoRuntime();
  };
  document.head.appendChild(script);
})();
