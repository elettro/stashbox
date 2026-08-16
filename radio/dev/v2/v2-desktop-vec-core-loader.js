(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (document.querySelector('script[data-desktop-vec-core="true"]')) return;

  const loadDesktopVideoRuntime = () => {
    if (document.querySelector('script[data-desktop-video-runtime="true"]')) return;
    const runtime = document.createElement('script');
    runtime.src = '/radio/dev/v2/v2-desktop-video-runtime-20260816-153.js';
    runtime.async = false;
    runtime.dataset.desktopVideoRuntime = 'true';
    document.head.appendChild(runtime);
  };

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