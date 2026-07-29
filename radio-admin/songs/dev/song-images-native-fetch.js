(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (!window.__stashboxNativeFetch) {
    window.__stashboxNativeFetch = window.fetch.bind(window);
  }
})();
