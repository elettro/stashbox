(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagesCompatBridgeInstalled || document.getElementById('songImagesCompatBridgeScript')) return;

  // Every deployed Songs CMS loader already includes this helper. Load the
  // browser-side compatibility bridge here so ZIP and individual image uploads
  // work even when an older cached app.js is still present.
  const script = document.createElement('script');
  script.id = 'songImagesCompatBridgeScript';
  script.src = '/radio-admin/songs/dev/song-images-compat-bridge.js?v=20260729-song-images-compat2';
  script.async = false;
  document.head.appendChild(script);
})();