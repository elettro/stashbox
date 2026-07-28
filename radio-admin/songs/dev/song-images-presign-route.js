(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  const nativeFetch = window.fetch.bind(window);
  const LEGACY_PRESIGN_PATH = '/dev/admin/uploads/presign';
  const RATIOS = new Set(['1x1', '16x9', '9x16', '3x4', '4x5', '21x9']);

  function requestUrl(input) {
    try {
      return new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function requestBody(init) {
    if (!init?.body || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch (_) { return null; }
  }

  window.fetch = function stashboxSongImagesFetch(input, init = {}) {
    const url = requestUrl(input);
    const body = requestBody(init);
    const method = String(init.method || 'GET').toUpperCase();
    const filename = String(body?.filename || '');
    const ratio = filename.split('-', 1)[0].toLowerCase();
    const songKey = String(body?.song_key || body?.songKey || '').trim();

    const isPreparedSongImage = Boolean(
      url &&
      url.pathname === LEGACY_PRESIGN_PATH &&
      method === 'POST' &&
      body?.purpose === 'artwork' &&
      RATIOS.has(ratio) &&
      songKey
    );

    if (!isPreparedSongImage) return nativeFetch(input, init);

    const dedicatedUrl = new URL(
      `/dev/radio/admin/songs/${encodeURIComponent(songKey)}/artwork-images/presign`,
      url.origin
    );
    const nextBody = {
      ratio,
      filename: filename.slice(ratio.length + 1) || filename,
      content_type: body.content_type || body.contentType,
      size_bytes: body.size_bytes || body.sizeBytes || 0
    };

    return nativeFetch(dedicatedUrl.toString(), {
      ...init,
      body: JSON.stringify(nextBody)
    });
  };
})();
