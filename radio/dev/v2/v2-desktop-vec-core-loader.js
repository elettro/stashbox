(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (document.querySelector('script[data-desktop-vec-core="true"]')) return;

  const loadRecovery = () => {
    if (document.querySelector('script[data-desktop-vec-recovery="true"]')) return;
    const recovery = document.createElement('script');
    recovery.src = '/radio/dev/v2/v2-desktop-vec-video-recovery-20260815.js?v=20260815-video-recovery1';
    recovery.async = false;
    recovery.dataset.desktopVecRecovery = 'true';
    document.head.appendChild(recovery);
  };

  const script = document.createElement('script');
  script.src = '/radio/dev/v2/v2-vec-player-controller.js?v=20260806-desktop-only1';
  script.async = false;
  script.dataset.desktopVecCore = 'true';
  script.onerror = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'load-error';
    loadRecovery();
  };
  script.onload = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'loaded';
    loadRecovery();
  };
  document.head.appendChild(script);
})();