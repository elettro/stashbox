(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsLiveRefresh) return;

  let lastForcedAt = 0;
  const MIN_FORCE_GAP_MS = 1500;

  function forceRefresh() {
    const now = Date.now();
    if (now - lastForcedAt < MIN_FORCE_GAP_MS) return;
    const ads = window.StashboxV2Ads;
    if (!ads?.refresh) return;
    lastForcedAt = now;
    Promise.resolve(ads.refresh()).catch(() => {});
  }

  window.addEventListener('focus', forceRefresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) forceRefresh();
  });

  // If this module loads just before the Ads runtime has exposed its API,
  // do one bounded retry rather than polling indefinitely.
  window.setTimeout(forceRefresh, 500);
  window.setTimeout(forceRefresh, 1500);

  window.StashboxV2AdsLiveRefresh = Object.freeze({ refresh: forceRefresh });
})();
