(() => {
  'use strict';
  if (window.StashboxProfileNativeFetch) return;
  window.StashboxProfileNativeFetch = window.fetch.bind(window);
})();