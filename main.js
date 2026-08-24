/* Stashbox shared JavaScript loader.
   Loads the preserved shared site script, keeps the global Radio menu current,
   prevents incomplete VideoObject JSON-LD from generating Google rich-result errors,
   and keeps historical show records out of Google's current Event rich-result feed. */
(function () {
  'use strict';

  function repairStructuredData() {
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
      var today = new Date();
      today.setHours(0, 0, 0, 0);

      function isExpiredEvent(node, type) {
        var eventTypes = Array.isArray(type) ? type : [type];
        var isEvent = eventTypes.some(function (entry) {
          return entry === 'Event' || entry === 'MusicEvent';
        });

        if (!isEvent || !node.startDate) return false;

        var start = new Date(node.startDate);
        if (Number.isNaN(start.getTime())) return false;

        return start.getTime() < today.getTime();
      }

      function convertExpiredEventToArchiveRecord(node) {
        var originalDate = node.startDate;
        var originalLocation = node.location;
        var originalPerformer = node.performer;

        node['@type'] = 'CreativeWork';
        node.dateCreated = originalDate;
        node.description = node.description || (node.name ? node.name + ' from the Stashbox live performance archive.' : 'Historical Stashbox live performance record.');

        if (originalLocation) node.contentLocation = originalLocation;
        if (originalPerformer) node.creator = originalPerformer;

        delete node.startDate;
        delete node.endDate;
        delete node.eventStatus;
        delete node.previousStartDate;
        delete node.location;
        delete node.performer;
        delete node.organizer;
        delete node.offers;

        changed = true;
      }

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
            node['@type'] = type.map(function (entry) {
              return entry === 'VideoObject' ? 'CreativeWork' : entry;
            });
          } else {
            node['@type'] = 'CreativeWork';
          }
          changed = true;
          type = node['@type'];
        }

        if (isExpiredEvent(node, type)) {
          convertExpiredEventToArchiveRecord(node);
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

  function ensureRadioMenuLinks() {
    document.querySelectorAll('.nav__dropdown-menu[aria-label="Radio submenu"]').forEach(function (menu) {
      var links = Array.from(menu.querySelectorAll('a'));
      var blogLink = links.find(function (link) {
        try {
          var url = new URL(link.href, window.location.origin);
          return url.pathname.replace(/index\.html$/, '').replace(/\/+$/, '') === '/radio/blog' && !url.hash;
        } catch (error) {
          return false;
        }
      });

      if (!blogLink) {
        var blogItem = document.createElement('li');
        blogLink = document.createElement('a');
        blogLink.href = '/radio/blog/';
        blogLink.textContent = 'Blog';
        blogItem.appendChild(blogLink);
        menu.appendChild(blogItem);
      }

      var industryLink = Array.from(menu.querySelectorAll('a')).find(function (link) {
        try {
          var url = new URL(link.href, window.location.origin);
          return url.pathname.replace(/index\.html$/, '').replace(/\/+$/, '') === '/radio/blog' && url.hash === '#industry-usage-examples';
        } catch (error) {
          return false;
        }
      });

      var industryItem;
      if (!industryLink) {
        industryItem = document.createElement('li');
        industryLink = document.createElement('a');
        industryLink.href = '/radio/blog/#industry-usage-examples';
        industryLink.textContent = 'Industry Examples';
        industryItem.appendChild(industryLink);
      } else {
        industryItem = industryLink.closest('li');
        industryLink.textContent = 'Industry Examples';
      }

      var blogItem = blogLink.closest('li');
      if (blogItem && industryItem && blogItem.nextElementSibling !== industryItem) {
        menu.insertBefore(industryItem, blogItem.nextSibling);
      }
    });
  }

  repairStructuredData();

  var core = document.createElement('script');
  core.src = '/main-core.js?v=20260805';
  core.async = false;
  core.addEventListener('load', ensureRadioMenuLinks, { once: true });
  core.addEventListener('error', ensureRadioMenuLinks, { once: true });
  document.head.appendChild(core);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      repairStructuredData();
      ensureRadioMenuLinks();
    }, { once: true });
  } else {
    repairStructuredData();
    ensureRadioMenuLinks();
  }
})();
