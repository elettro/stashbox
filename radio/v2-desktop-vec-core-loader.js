(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;

  const params = new URLSearchParams(location.search);
  const allowLegacyDesktopVec = params.get('desktopvec') === 'legacy';
  if (!allowLegacyDesktopVec) {
    document.documentElement.dataset.desktopVecSafeMode = 'artwork-only';
    return;
  }

  if (document.querySelector('script[data-desktop-vec-core="true"]')) return;

  const loadVisibilityRepair = () => {
    if (document.querySelector('script[data-desktop-rescue-visibility-repair="true"]')) return;
    const repair = document.createElement('script');
    repair.src = '/radio/v2-desktop-rescue-visibility-repair-20260817.js?v=20260817-desktopvideo1';
    repair.async = false;
    repair.dataset.desktopRescueVisibilityRepair = 'true';
    document.head.appendChild(repair);
  };

  const loadDesktopVideoRuntime = () => {
    if (document.querySelector('script[data-desktop-video-runtime="true"]')) return;
    const runtime = document.createElement('script');
    runtime.src = '/radio/v2-desktop-video-runtime-20260816-153.js?v=20260817-visibilityrepair1';
    runtime.async = false;
    runtime.dataset.desktopVideoRuntime = 'true';
    document.head.appendChild(runtime);
  };

  loadVisibilityRepair();

  const script = document.createElement('script');
  script.src = '/radio/v2-vec-player-controller.js?v=20260806-desktop-only1';
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