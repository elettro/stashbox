(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(max-width:899px)').matches) return;

  const source = '/radio/dev/v2/v2-mobile-vec-motion-override.js?v=20260806-motion2';
  if (document.querySelector(`script[src="${source}"]`)) return;

  const script = document.createElement('script');
  script.src = source;
  script.async = false;
  script.dataset.mobileVecMotionLoader = 'true';
  script.onerror = () => {
    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => !node.hidden);
    if (player) {
      player.dataset.mobileVecMotionState = 'loader-error';
      player.dataset.mobileVecMotionReason = source;
    }
  };
  document.head.appendChild(script);
})();