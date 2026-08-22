(() => {
  'use strict';

  if (window.__stashboxMobileCatalogRescueLoaded) return;
  window.__stashboxMobileCatalogRescueLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 899px)');
  if (!mobileQuery.matches) return;

  const PROD_HOST = 'je3zud66nb.execute-api.us-east-1.amazonaws.com';
  const PROD_PATH = '/prod-v2/radio/songs';
  const LOCAL_FALLBACK = '/radio/catalog-fallback.json';
  const baseFetch = window.fetch.bind(window);

  function parsed(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      return new URL(raw, location.href);
    } catch (_) {
      return null;
    }
  }

  function isProdSongs(input) {
    const url = parsed(input);
    return Boolean(url && url.hostname === PROD_HOST && url.pathname.replace(/\/$/, '') === PROD_PATH);
  }

  async function localCatalog() {
    const response = await baseFetch(`${LOCAL_FALLBACK}?mobile_rescue=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Local catalog fallback HTTP ${response.status}`);
    const text = await response.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Stashbox-Catalog-Source': 'mobile-same-origin-rescue'
      }
    });
  }

  window.fetch = async (input, init = {}) => {
    if (!isProdSongs(input)) return baseFetch(input, init);

    try {
      const response = await baseFetch(input, init);
      if (response?.ok) return response;
      console.warn('[Mobile Catalog Rescue] PROD catalog returned', response?.status || 'unknown');
    } catch (error) {
      console.warn('[Mobile Catalog Rescue] PROD catalog failed', error?.message || error);
    }

    try {
      const fallback = await localCatalog();
      console.warn('[Mobile Catalog Rescue] Using same-origin catalog snapshot');
      return fallback;
    } catch (error) {
      console.error('[Mobile Catalog Rescue] Same-origin fallback failed', error?.message || error);
      throw error;
    }
  };
})();
