(() => {
  'use strict';

  // AWS optimization pause — 2026-08-19
  // Scope: DEV System Health only.
  // Do not call the heavy /dashboard/summary analytics route from this page.
  // Public Radio/player behavior and listener event collection are untouched.

  const nativeFetch = window.fetch.bind(window);
  const DASHBOARD_PATH = '/dev/dashboard/summary';

  function requestPath(input) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    try {
      return new URL(raw, window.location.href).pathname;
    } catch {
      return '';
    }
  }

  window.fetch = function systemHealthAnalyticsPause(input, init) {
    if (requestPath(input) !== DASHBOARD_PATH) return nativeFetch(input, init);

    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      summary: {
        total_events: 0,
        events_last_24h: 0,
        events_last_7d: 0,
        total_listening_seconds: 0,
        total_seconds_played: 0,
        average_seconds_played: 0,
        average_completion_percent: 0
      },
      event_types: [],
      top_songs_by_plays: [],
      paused: true,
      generated_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Stashbox-Analytics-State': 'paused'
      }
    }));
  };

  document.addEventListener('DOMContentLoaded', () => {
    const card = document.querySelector('[data-check-card="dashboard-api"]');
    if (!card) return;
    const eyebrow = card.querySelector('.eyebrow');
    const heading = card.querySelector('h2');
    const message = card.querySelector('.health-message');
    if (eyebrow) eyebrow.textContent = 'Analytics API · Paused';
    if (heading) heading.textContent = 'Dashboard Summary Paused';
    if (message) message.textContent = 'Heavy dashboard analytics are intentionally paused for AWS optimization. No summary API request is sent.';
  });
})();