(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (document.querySelector('script[data-desktop-artwork-runtime]')) return;

  const script = document.createElement('script');
  script.src = '/radio/attempt2/v2-portrait-artwork-reliability.js?v=20260807-desktoponly1';
  script.defer = true;
  script.dataset.desktopArtworkRuntime = 'true';
  document.head.appendChild(script);
})();