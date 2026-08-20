(() => {
  'use strict';

  const LEGACY_PATH = '/dev/admin/stats/products';
  const LITE_PATH = '/dev/admin/stats/products-lite';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function stashboxDevProductStatsLiteFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;

    if (!url || !String(url).includes(LEGACY_PATH) || String(url).includes(LITE_PATH)) {
      return nativeFetch(input, init);
    }

    const liteUrl = String(url).replace(LEGACY_PATH, LITE_PATH);

    try {
      const liteResponse = await nativeFetch(liteUrl, init);
      if (liteResponse.ok) return liteResponse;
      console.warn('[DEV Admin] products-lite unavailable; falling back to legacy product stats', liteResponse.status);
    } catch (error) {
      console.warn('[DEV Admin] products-lite request failed; falling back to legacy product stats', error);
    }

    return nativeFetch(input, init);
  };
})();
