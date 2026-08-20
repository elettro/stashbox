(() => {
  'use strict';

  const LEGACY_PATH = '/dev/admin/stats/summary';
  const LITE_PATH = '/dev/admin/stats/summary-lite';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function stashboxDevSummaryLiteFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;

    if (!url || !String(url).includes(LEGACY_PATH)) {
      return nativeFetch(input, init);
    }

    const liteUrl = String(url).replace(LEGACY_PATH, LITE_PATH);

    try {
      const liteResponse = await nativeFetch(liteUrl, init);
      if (liteResponse.ok) {
        return liteResponse;
      }
      console.warn('[DEV Admin] summary-lite unavailable; falling back to legacy stats summary', liteResponse.status);
    } catch (error) {
      console.warn('[DEV Admin] summary-lite request failed; falling back to legacy stats summary', error);
    }

    return nativeFetch(input, init);
  };
})();
