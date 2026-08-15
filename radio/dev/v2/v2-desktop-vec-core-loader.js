(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (document.querySelector('script[data-desktop-vec-core="true"]')) return;

  const loadMinimalRescue = () => {
    if (document.querySelector('script[data-desktop-video-minimal-rescue="true"]')) return;
    const rescue = document.createElement('script');
    rescue.src = '/radio/dev/v2/v2-desktop-video-minimal-rescue-20260815.js?v=20260815-minrescue1';
    rescue.async = false;
    rescue.dataset.desktopVideoMinimalRescue = 'true';
    document.head.appendChild(rescue);
  };

  const script = document.createElement('script');
  script.src = '/radio/dev/v2/v2-vec-player-controller.js?v=20260806-desktop-only1';
  script.async = false;
  script.dataset.desktopVecCore = 'true';
  script.onerror = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'load-error';
    loadMinimalRescue();
  };
  script.onload = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) player.dataset.desktopVecCoreState = 'loaded';
    loadMinimalRescue();
  };
  document.head.appendChild(script);
})();