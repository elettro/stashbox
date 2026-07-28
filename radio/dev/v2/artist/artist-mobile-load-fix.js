(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const ARTIST_PROFILE_PATH = /^\/dev\/radio\/artists\/[^/]+\/?$/;

  const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

  function requestUrl(input) {
    try {
      return new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isGetRequest(input, init) {
    const method = String(init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    return method === 'GET';
  }

  async function fetchWithMobileRetry(input, init) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await nativeFetch(input, init);
      } catch (error) {
        lastError = error;
        if (attempt >= 2) break;
        await wait(attempt === 0 ? 300 : 900);
      }
    }
    throw lastError;
  }

  async function fetchLightArtistProfile(url, init) {
    const identifier = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '').trim().toLowerCase();
    const listUrl = new URL('/dev/radio/artists', url.origin);
    listUrl.searchParams.set('limit', '500');

    try {
      const response = await fetchWithMobileRetry(listUrl.toString(), init);
      if (response.ok) {
        const payload = await response.json();
        const artists = Array.isArray(payload?.artists) ? payload.artists : [];
        const artist = artists.find(item => [item.artist_key, item.slug, item.name]
          .some(value => String(value || '').trim().toLowerCase() === identifier));

        if (artist) {
          return new Response(JSON.stringify({ success: true, artist }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    } catch (_) {}

    return fetchWithMobileRetry(url.toString(), init);
  }

  window.fetch = function stashboxArtistFetch(input, init = {}) {
    const url = requestUrl(input);
    const isApiGet = Boolean(url && url.hostname === API_HOST && isGetRequest(input, init));

    if (!isApiGet) return nativeFetch(input, init);
    if (ARTIST_PROFILE_PATH.test(url.pathname)) return fetchLightArtistProfile(url, init);
    return fetchWithMobileRetry(input, init);
  };
})();
