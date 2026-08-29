(() => {
  'use strict';

  // PRODUCTION ADMIN ANALYTICS FREEZE — 2026-08-19
  // Scope is intentionally limited to the private /radio-admin/ presentation layer.
  // Public Radio/player behavior and event collection are NOT changed here.
  // The full original production admin application is preserved in ./app-live.js.
  // This wrapper blocks only the five heavy dashboard analytics reads while
  // leaving the Songs CMS, editor, uploads, archive controls, and manual Events tab live.

  const nativeFetch = window.fetch.bind(window);

  const pausedEndpoints = new Map([
    ['/prod-v2/admin/stats/summary', {
      success: true,
      summary: {},
      today: {},
      devices: [],
      event_types: [],
      generated_at: '',
      paused: true
    }],
    ['/prod-v2/admin/stats/products', {
      success: true,
      summary: {},
      products: [],
      recent_clicks: [],
      generated_at: '',
      paused: true
    }],
    ['/prod-v2/admin/stats/songs', {
      success: true,
      count: 0,
      limit: 100,
      songs: [],
      generated_at: '',
      paused: true
    }],
    ['/prod-v2/admin/stats/referrers', {
      success: true,
      summary: {},
      referrers: [],
      recent_events: [],
      generated_at: '',
      paused: true
    }],
    ['/prod-v2/admin/stats/devices', {
      success: true,
      summary: {},
      devices: [],
      recent_events: [],
      generated_at: '',
      paused: true
    }]
  ]);

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url || '';
  }

  function getPausedPayload(url) {
    let parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch {
      return null;
    }

    for (const [pathname, payload] of pausedEndpoints) {
      if (parsed.pathname === pathname) return payload;
    }

    return null;
  }

  window.fetch = function pausedAdminAnalyticsFetch(input, init) {
    const payload = getPausedPayload(getRequestUrl(input));
    if (!payload) return nativeFetch(input, init);

    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Stashbox-Analytics-State': 'paused'
      }
    }));
  };

  function enforcePausedUi() {
    const refresh = document.getElementById('refreshDashboardButton');
    if (refresh) {
      if (!refresh.disabled) refresh.disabled = true;
      refresh.textContent = 'Analytics Paused';
      refresh.title = 'Private dashboard analytics reads are paused to reduce AWS usage.';
    }

    let notice = document.getElementById('adminAnalyticsPausedNotice');
    const dashboardHeading = document.getElementById('dashboardHeading');
    const dashboardCard = dashboardHeading?.closest('.dashboard-card');
    if (!notice && dashboardCard) {
      notice = document.createElement('div');
      notice.id = 'adminAnalyticsPausedNotice';
      notice.className = 'stats-warning';
      notice.textContent = 'Analytics paused for AWS optimization. Song CMS and manual admin tools remain live.';
      dashboardCard.insertBefore(notice, dashboardCard.querySelector('#kpiGrid'));
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#refreshDashboardButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      enforcePausedUi();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    enforcePausedUi();
    window.setTimeout(enforcePausedUi, 0);
    window.setTimeout(enforcePausedUi, 250);
    window.setTimeout(enforcePausedUi, 1000);
  });

  // app.js is parser-loaded at the end of radio-admin/index.html, so the preserved
  // application is loaded synchronously here and still receives DOMContentLoaded.
  document.write('<script src="./app-live.js?v=20260819-admin-stats-freeze2"><\/script>');
})();
