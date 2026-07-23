(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const LEGACY_PRESIGN_URL = `${API_ROOT}/admin/uploads/presign`;
  const originalFetch = window.fetch.bind(window);

  function isArtistMediaPresign(url, method) {
    return method === 'POST' && /^https:\/\/d21fbe6u80\.execute-api\.us-east-1\.amazonaws\.com\/dev\/radio\/admin\/artists\/[^/]+\/media\/presign(?:\?|$)/.test(url);
  }

  function artistKeyFromUrl(url) {
    const match = String(url).match(/\/radio\/admin\/artists\/([^/]+)\/media\/presign/);
    return match ? decodeURIComponent(match[1]) : 'artist';
  }

  function labelForPurpose(purpose) {
    if (purpose === 'vertical_banner') return 'vertical banner';
    if (purpose === 'horizontal_banner') return 'horizontal banner';
    return 'profile image';
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    if (!isArtistMediaPresign(url, method)) return originalFetch(input, init);

    const primary = await originalFetch(input, init);
    if (![404, 405].includes(primary.status)) return primary;

    let requested = {};
    try { requested = typeof init.body === 'string' ? JSON.parse(init.body) : {}; }
    catch (_) {}

    const key = artistKeyFromUrl(url);
    const artistName = String(document.getElementById('name')?.value || key).trim() || key;
    const purpose = String(requested.purpose || 'vertical_banner').trim().toLowerCase();

    return originalFetch(LEGACY_PRESIGN_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: init.headers || {},
      body: JSON.stringify({
        song_key: `artist-${key}-${purpose}`,
        song_name: `${artistName} ${labelForPurpose(purpose)}`,
        artist: artistName,
        purpose: 'artwork',
        filename: requested.filename,
        content_type: requested.content_type || requested.contentType
      })
    });
  };
})();
