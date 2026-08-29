(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  if (!window.__stashboxNativeFetch) {
    window.__stashboxNativeFetch = window.fetch.bind(window);
  }

  if (window.__stashboxSongImagesCompatBridgeV3Installed || document.getElementById('songImagesCompatBridgeScript')) return;

  // This helper remains a fallback for older cached Song CMS loaders. The main
  // loader now captures native fetch first and loads the hardened bridge directly.
  const script = document.createElement('script');
  script.id = 'songImagesCompatBridgeScript';
  script.src = '/radio-admin/songs/dev/song-images-compat-bridge.js?v=20260729-song-images-network1';
  script.async = false;
  document.head.appendChild(script);
})();
