/* Stashbox shared JavaScript loader.
   Loads the preserved shared site script, then keeps the global Radio menu current. */
(function () {
  'use strict';

  document.write('<script src="/main-core.js?v=20260805"><\/script>');

  function ensureRadioBlogLink() {
    document.querySelectorAll('.nav__dropdown-menu[aria-label="Radio submenu"]').forEach(function (menu) {
      var exists = Array.from(menu.querySelectorAll('a')).some(function (link) {
        try {
          return new URL(link.href, window.location.origin).pathname.replace(/index\.html$/, '').replace(/\/+$/, '') === '/radio/blog';
        } catch (error) {
          return false;
        }
      });

      if (exists) return;

      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '/radio/blog/';
      link.textContent = 'Blog';
      item.appendChild(link);
      menu.appendChild(item);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureRadioBlogLink, { once: true });
  } else {
    ensureRadioBlogLink();
  }
})();
