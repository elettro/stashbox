(() => {
  'use strict';

  if (window.__stashboxCanonicalVisualSourceInstalled) return;
  window.__stashboxCanonicalVisualSourceInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const DEV_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const PROD_HOST = 'je3zud66nb.execute-api.us-east-1.amazonaws.com';
  const PROD_BASE = `https://${PROD_HOST}/prod-v2`;
  const VISUAL_TIMEOUT_MS = 10000;

  function parsedUrl(rawUrl) {
    try { return new URL(rawUrl, location.href); }
    catch (_) { return null; }
  }

  function visualApiPath(url) {
    if (!url || (url.hostname !== DEV_HOST && url.hostname !== PROD_HOST)) return '';
    const match = url.pathname.match(/(\/radio\/(?:vec\/(?:recipe|song-assets)|visuals\/folders(?:\/[^/]+\/assets)?|songs\/[^/]+\/visual-settings))\/?$/);
    return match ? match[1].replace(/\/$/, '') : '';
  }

  function isCanonicalVisualRequest(rawUrl) {
    return Boolean(visualApiPath(parsedUrl(rawUrl)));
  }

  function canonicalVisualUrl(rawUrl) {
    const requested = parsedUrl(rawUrl);
    const path = visualApiPath(requested);
    if (!path) return '';
    const target = new URL(`${PROD_BASE}${path}`);
    target.search = requested.search;
    return target.toString();
  }

  async function timedFetch(input, init = {}, timeoutMs = VISUAL_TIMEOUT_MS) {
    if (init.signal) return nativeFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await nativeFetch(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  async function canonicalVisualFetch(rawUrl, init = {}) {
    const target = canonicalVisualUrl(rawUrl);
    if (!target) throw new Error('Canonical visual URL could not be resolved.');
    const response = await timedFetch(target, {
      ...init,
      method: 'GET',
      headers: { Accept: 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
      credentials: 'omit'
    });
    const headers = new Headers(response.headers);
    headers.set('x-stashbox-visual-source', 'canonical-prod-api');
    const body = await response.clone().arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  window.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    if (!isCanonicalVisualRequest(rawUrl)) return nativeFetch(input, init);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      return Promise.reject(new Error(`Blocked non-read visual player request: ${method}`));
    }
    return canonicalVisualFetch(rawUrl, init);
  };

  window.StashboxCanonicalVisualSource = Object.freeze({
    apiBase: PROD_BASE,
    environment: 'prod',
    readOnly: true,
    endpoints: Object.freeze([
      '/radio/vec/recipe',
      '/radio/vec/song-assets',
      '/radio/visuals/folders/{folder_id}/assets',
      '/radio/songs/{song_key}/visual-settings'
    ])
  });
})();
