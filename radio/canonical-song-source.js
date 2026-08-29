(() => {
  'use strict';

  if (window.__stashboxCanonicalSongSourceInstalled) return;
  window.__stashboxCanonicalSongSourceInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const DEV_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const PROD_HOST = 'je3zud66nb.execute-api.us-east-1.amazonaws.com';
  const PROD_SONGS = `https://${PROD_HOST}/prod-v2/radio/songs`;
  const LOCAL_SNAPSHOT = '/radio/catalog-fallback.json';
  const CATALOG_TIMEOUT_MS = 9000;

  function parsedUrl(rawUrl) {
    try { return new URL(rawUrl, location.href); }
    catch (_) { return null; }
  }

  function isSongCatalogRequest(rawUrl) {
    const url = parsedUrl(rawUrl);
    return Boolean(
      url &&
      (url.hostname === DEV_HOST || url.hostname === PROD_HOST) &&
      /\/radio\/songs\/?$/.test(url.pathname)
    );
  }

  async function timedFetch(input, init = {}, timeoutMs = CATALOG_TIMEOUT_MS) {
    if (init.signal) return nativeFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await nativeFetch(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  async function getJson(url, source) {
    const response = await timedFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!response.ok) throw new Error(`${source} returned ${response.status}`);
    const body = await response.clone().text();
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-stashbox-catalog-source', source);
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  async function canonicalSongFetch(rawUrl) {
    const requested = parsedUrl(rawUrl);
    const canonical = new URL(PROD_SONGS);
    if (requested?.search) canonical.search = requested.search;

    try {
      return await getJson(canonical.toString(), 'canonical-prod-api');
    } catch (prodError) {
      console.warn('[Canonical Songs] PROD catalog unavailable, trying production snapshot.', prodError?.message || prodError);
      try {
        return await getJson(LOCAL_SNAPSHOT, 'canonical-prod-snapshot');
      } catch (snapshotError) {
        console.warn('[Canonical Songs] Production snapshot unavailable.', snapshotError?.message || snapshotError);
        throw prodError;
      }
    }
  }

  window.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    if (!isSongCatalogRequest(rawUrl)) return nativeFetch(input, init);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      return Promise.reject(new Error(`Blocked non-read song catalog request: ${method}`));
    }
    return canonicalSongFetch(rawUrl);
  };

  window.StashboxCanonicalSongSource = Object.freeze({
    canonicalUrl: PROD_SONGS,
    fallbackUrl: LOCAL_SNAPSHOT,
    environment: 'prod',
    readOnly: true
  });
})();
