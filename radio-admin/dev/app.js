(() => {
  'use strict';

  // The Songs CMS and DEV dashboard depend on the full application binding
  // its token, form, and table controls before deferred header enhancements run.
  // Keep this bootstrap synchronous; dynamically appended scripts may execute
  // after the shared header has already restructured the legacy top bar.
  document.write('<script src="/radio-admin/dev/app-core.js?v=20260721-songs-access1"><\/script>');
})();
