/* Stashbox shared JavaScript loader.
   Loads the preserved shared site script, keeps the global Radio menu current,
   and prevents incomplete VideoObject JSON-LD from generating Google rich-result errors. */
(function () {
  'use strict';

  function repairIncompleteVideoSchema() {
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
      var raw = (script.textContent || '').trim();
      if (!raw) return;

      var data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        return;
      }

      var changed = false;

      function visit(node) {
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }

        if (!node || typeof node !== 'object') return;

        var type = node['@type'];
        var isVideoObject = type === 'VideoObject' || (Array.isArray(type) && type.indexOf('VideoObject') !== -1);

        if (isVideoObject && !node.uploadDate) {
          if (Array.isArray(type)) {
            var replacementTypes = type.map(function (entry) {
              return entry === 'VideoObject' ? 'CreativeWork' : entry;
            });
            node['@type'] = replacementTypes;
          } else {
            node['@type'] = 'CreativeWork';
          }
          changed = true;
        }

        Object.keys(node).forEach(function (key) {
          visit(node[key]);
        });
      }

      visit(data);

      if (changed) {
        script.textContent = JSON.stringify(data);
      }
    });
  }

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

  repairIncompleteVideoSchema();

  var core = document.createElement('script');
  core.src = '/main-core.js?v=20260805';
  core.async = false;
  core.addEventListener('load', ensureRadioBlogLink, { once: true });
  core.addEventListener('error', ensureRadioBlogLink, { once: true });
  document.head.appendChild(core);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      repairIncompleteVideoSchema();
      ensureRadioBlogLink();
    }, { once: true });
  } else {
    repairIncompleteVideoSchema();
    ensureRadioBlogLink();
  }
})();
