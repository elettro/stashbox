(() => {
  'use strict';

  // The Songs CMS and DEV dashboard depend on the full application binding
  // its token, form, and table controls before deferred header enhancements run.
  // Keep this bootstrap synchronous; dynamically appended scripts may execute
  // after the shared header has already restructured the legacy top bar.
  if (!window.location.pathname.includes('/radio-admin/songs/dev')) {
    document.write('<script src="/radio-admin/dev/stats-summary-lite-bridge.js?v=20260820-summarylite1"><\/script>');
  }
  document.write('<script src="/radio-admin/dev/app-core.js?v=20260721-songs-access1"><\/script>');

  if (window.location.pathname.includes('/radio-admin/songs/dev')) {
    document.write('<script src="/radio-admin/songs/dev/vec-disabled.js?v=20260728-songs-vec-disabled1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-native-fetch.js?v=20260729-song-images-network1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-presign-route.js?v=20260729-song-images-network1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-compat-bridge.js?v=20260730-canonical-artwork1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images.js?v=20260730-canonical-artwork1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-preview-modal.js?v=20260731-full-modal2"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-vertical-preview-v2.js?v=20260731-full-preview1"><\/script>');
    document.write('<script src="/radio-admin/songs/dev/song-images-zip.js?v=20260729-song-images-network1"><\/script>');
  }
})();
