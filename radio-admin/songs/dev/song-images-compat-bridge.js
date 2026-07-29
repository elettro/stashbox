(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagesCompatBridgeInstalled) return;
  window.__stashboxSongImagesCompatBridgeInstalled = true;

  const API_ORIGIN = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const LEGACY_PRESIGN_PATH = '/dev/admin/uploads/presign';
  const SONG_API_PATH = '/dev/admin/songs';
  const VEC_RECIPE_PATH = '/dev/admin/vec/recipe';
  const PREPARED_RECIPE_FIELD = 'prepared_artwork_images';
  const PROFILE_SOURCE_PREFIX = 'song_profile_image:';

  const FIELD_TO_RATIO = Object.freeze({
    song_artwork_url: '1x1',
    song_artwork_9x16_url: '9x16',
    song_artwork_16x9_url: '16x9',
    song_artwork_3x4_url: '3x4',
    song_artwork_4x5_url: '4x5',
    song_artwork_21x9_url: '21x9'
  });

  const OPTIONAL_FIELDS = new Set([
    'song_artwork_9x16_url',
    'song_artwork_16x9_url',
    'song_artwork_3x4_url',
    'song_artwork_4x5_url',
    'song_artwork_21x9_url'
  ]);

  const previousFetch = window.fetch.bind(window);

  function clean(value) {
    return String(value ?? '').trim();
  }

  function requestUrl(input) {
    try {
      return new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function requestMethod(input, init) {
    return clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  }

  async function requestBody(input, init) {
    if (typeof init?.body === 'string') return init.body;
    if (init?.body instanceof Blob) return init.body.text();
    if (typeof input !== 'string' && input instanceof Request) {
      try { return await input.clone().text(); } catch (_) { return ''; }
    }
    return '';
  }

  function parseJson(text) {
    if (!clean(text)) return {};
    try { return JSON.parse(text); } catch (_) { return {}; }
  }

  function headerEntries(input, init) {
    const headers = new Headers(typeof input !== 'string' && input?.headers ? input.headers : undefined);
    new Headers(init?.headers || undefined).forEach((value, key) => headers.set(key, value));
    return Array.from(headers.entries());
  }

  function jsonHeaders(headers = []) {
    const next = new Headers(headers);
    next.set('Content-Type', 'application/json');
    return Array.from(next.entries());
  }

  function xhrResponse(url, { method = 'GET', headers = [], body = null } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      headers.forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.onload = () => {
        const responseHeaders = new Headers();
        clean(xhr.getAllResponseHeaders()).split(/\r?\n/).forEach((line) => {
          const separator = line.indexOf(':');
          if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
        });
        resolve(new Response(xhr.responseText || '', {
          status: xhr.status || 500,
          statusText: xhr.statusText || '',
          headers: responseHeaders
        }));
      };
      xhr.onerror = () => reject(new TypeError('Network request failed.'));
      xhr.ontimeout = () => reject(new TypeError('Network request timed out.'));
      xhr.timeout = 60000;
      xhr.send(body);
    });
  }

  async function responseJson(response) {
    const text = await response.text();
    const data = parseJson(text);
    if (!response.ok) {
      throw new Error(clean(data?.detail || data?.error || data?.message || text || response.statusText || `Request failed with status ${response.status}.`));
    }
    return data;
  }

  function selectedSongRecord(songKey = '') {
    try {
      if (selectedSong && (!songKey || clean(selectedSong.song_key).toLowerCase() === clean(songKey).toLowerCase())) return selectedSong;
    } catch (_) {}
    try {
      const direct = songsByKey?.[songKey];
      if (direct) return direct;
      const found = Object.values(songsByKey || {}).find((song) => clean(song?.song_key).toLowerCase() === clean(songKey).toLowerCase());
      if (found) return found;
    } catch (_) {}
    return {};
  }

  function normalizeAssets(value) {
    let assets = value;
    if (typeof assets === 'string') {
      try { assets = JSON.parse(assets); } catch (_) { assets = []; }
    }
    return (Array.isArray(assets) ? assets : [])
      .map((asset) => ({
        type: asset?.type === 'clip' || asset?.type === 'video' ? 'clip' : 'image',
        url: clean(asset?.url || asset?.src),
        source: clean(asset?.source || 'song') || 'song'
      }))
      .filter((asset) => asset.url);
  }

  function legacyPreparedImages(song) {
    const images = {};
    normalizeAssets(song?.visual_assets).forEach((asset) => {
      if (!asset.source.startsWith(PROFILE_SOURCE_PREFIX)) return;
      const ratio = asset.source.slice(PROFILE_SOURCE_PREFIX.length);
      if (Object.values(FIELD_TO_RATIO).includes(ratio)) images[ratio] = asset.url;
    });
    return images;
  }

  function preparedImages(recipe, song) {
    const stored = recipe?.[PREPARED_RECIPE_FIELD];
    const images = { ...legacyPreparedImages(song) };
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      Object.values(FIELD_TO_RATIO).forEach((ratio) => {
        if (ratio === '1x1') return;
        const url = clean(stored[ratio]);
        if (url) images[ratio] = url;
        else if (Object.prototype.hasOwnProperty.call(stored, ratio)) delete images[ratio];
      });
    }
    return images;
  }

  function mediaPayload(songKey, song, recipe = {}) {
    const squareInput = document.getElementById('field_song_artwork_url');
    const square = clean(squareInput?.value || song?.song_artwork_url);
    const prepared = preparedImages(recipe, song);
    const images = {
      '1x1': square,
      '9x16': clean(prepared['9x16']),
      '16x9': clean(prepared['16x9']),
      '3x4': clean(prepared['3x4']),
      '4x5': clean(prepared['4x5']),
      '21x9': clean(prepared['21x9'])
    };
    const ready = Object.values(images).filter(Boolean).length;
    return {
      song_key: songKey,
      song_name: clean(song?.song_name),
      display_title: clean(song?.display_title || song?.song_name),
      artist: clean(song?.artist),
      song_artwork_url: images['1x1'],
      song_artwork_1x1_url: images['1x1'],
      song_artwork_9x16_url: images['9x16'],
      song_artwork_16x9_url: images['16x9'],
      song_artwork_3x4_url: images['3x4'],
      song_artwork_4x5_url: images['4x5'],
      song_artwork_21x9_url: images['21x9'],
      artwork_images: images,
      completion: {
        ready,
        total: 6,
        complete: ready === 6,
        label: ready === 6 ? 'Complete Image Set' : `${ready} of 6 Images Ready`
      }
    };
  }

  function updateLocalState(songKey, patch, recipe) {
    const directArtwork = {};
    Object.entries(FIELD_TO_RATIO).forEach(([field, ratio]) => {
      if (field === 'song_artwork_url') {
        if (Object.prototype.hasOwnProperty.call(patch, field)) directArtwork[field] = clean(patch[field]);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(patch, field)) directArtwork[field] = clean(patch[field]);
      else directArtwork[field] = clean(recipe?.[PREPARED_RECIPE_FIELD]?.[ratio]);
    });

    try { selectedSong = { ...(selectedSong || {}), song_key: songKey, ...directArtwork }; } catch (_) {}
    try {
      if (songsByKey?.[songKey]) songsByKey[songKey] = { ...songsByKey[songKey], ...directArtwork };
    } catch (_) {}

    if (Object.prototype.hasOwnProperty.call(directArtwork, 'song_artwork_url')) {
      const input = document.getElementById('field_song_artwork_url');
      if (input) {
        input.value = directArtwork.song_artwork_url;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  async function loadRecipe(songKey, headers) {
    const response = await xhrResponse(`${API_ORIGIN}${VEC_RECIPE_PATH}?song_key=${encodeURIComponent(songKey)}`, {
      method: 'GET',
      headers
    });
    const data = await responseJson(response);
    return data?.recipe && typeof data.recipe === 'object' && !Array.isArray(data.recipe) ? data.recipe : {};
  }

  async function saveRecipe(songKey, recipe, headers) {
    const response = await xhrResponse(`${API_ORIGIN}${VEC_RECIPE_PATH}`, {
      method: 'PUT',
      headers: jsonHeaders(headers),
      body: JSON.stringify({ song_key: songKey, recipe })
    });
    const data = await responseJson(response);
    return data?.recipe && typeof data.recipe === 'object' && !Array.isArray(data.recipe) ? data.recipe : recipe;
  }

  async function saveSquareArtwork(songKey, squareUrl, headers) {
    const response = await xhrResponse(`${API_ORIGIN}${SONG_API_PATH}/${encodeURIComponent(songKey)}`, {
      method: 'PUT',
      headers: jsonHeaders(headers),
      body: JSON.stringify({ song_artwork_url: clean(squareUrl) })
    });
    await responseJson(response);
  }

  async function handleLegacyPresign(input, init, url, bodyText) {
    return xhrResponse(url.toString(), {
      method: requestMethod(input, init),
      headers: headerEntries(input, init),
      body: bodyText
    });
  }

  async function handleDedicatedPresign(input, init, match, bodyText) {
    const body = parseJson(bodyText);
    const songKey = decodeURIComponent(match[1]);
    const ratio = clean(body.ratio).toLowerCase();
    const legacyBody = JSON.stringify({
      song_key: songKey,
      song_name: clean(body.song_name || body.songName || songKey),
      artist: clean(body.artist),
      purpose: 'artwork',
      filename: `${ratio || 'image'}-${clean(body.filename || 'image.png')}`,
      content_type: clean(body.content_type || body.contentType || 'application/octet-stream')
    });
    return xhrResponse(`${API_ORIGIN}${LEGACY_PRESIGN_PATH}`, {
      method: 'POST',
      headers: jsonHeaders(headerEntries(input, init)),
      body: legacyBody
    });
  }

  async function handleArtworkMedia(input, init, match, bodyText) {
    const songKey = decodeURIComponent(match[1]);
    const method = requestMethod(input, init);
    const headers = headerEntries(input, init);
    const song = selectedSongRecord(songKey);

    if (method === 'GET') {
      const recipe = await loadRecipe(songKey, headers);
      return new Response(JSON.stringify({ success: true, media: mediaPayload(songKey, song, recipe) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method !== 'PATCH') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const patch = parseJson(bodyText);
    const suppliedFields = Object.keys(patch).filter((field) => Object.prototype.hasOwnProperty.call(FIELD_TO_RATIO, field));
    if (!suppliedFields.length) {
      return new Response(JSON.stringify({ success: false, error: 'No artwork fields supplied.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'song_artwork_url')) {
      await saveSquareArtwork(songKey, patch.song_artwork_url, headers);
    }

    let recipe = await loadRecipe(songKey, headers);
    const optionalPatch = suppliedFields.filter((field) => OPTIONAL_FIELDS.has(field));
    if (optionalPatch.length) {
      const currentImages = preparedImages(recipe, song);
      optionalPatch.forEach((field) => {
        const ratio = FIELD_TO_RATIO[field];
        const nextUrl = clean(patch[field]);
        if (nextUrl) currentImages[ratio] = nextUrl;
        else delete currentImages[ratio];
      });
      recipe = await saveRecipe(songKey, {
        ...recipe,
        [PREPARED_RECIPE_FIELD]: currentImages,
        prepared_artwork_updated_at: new Date().toISOString()
      }, headers);
    }

    updateLocalState(songKey, patch, recipe);
    const updatedSong = { ...song, ...patch };
    return new Response(JSON.stringify({
      success: true,
      persisted: true,
      storage: 'song_visual_recipe',
      media: mediaPayload(songKey, updatedSong, recipe)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  window.fetch = async function stashboxSongImagesCompatFetch(input, init = {}) {
    const url = requestUrl(input);
    if (!url || url.origin !== API_ORIGIN) return previousFetch(input, init);

    const method = requestMethod(input, init);
    const bodyText = await requestBody(input, init);

    if (url.pathname === LEGACY_PRESIGN_PATH && method === 'POST') {
      return handleLegacyPresign(input, init, url, bodyText);
    }

    const presignMatch = url.pathname.match(/^\/dev\/radio\/admin\/songs\/([^/]+)\/artwork-images\/presign$/);
    if (presignMatch && method === 'POST') {
      return handleDedicatedPresign(input, init, presignMatch, bodyText);
    }

    const mediaMatch = url.pathname.match(/^\/dev\/radio\/admin\/songs\/([^/]+)\/artwork-images$/);
    if (mediaMatch && (method === 'GET' || method === 'PATCH')) {
      return handleArtworkMedia(input, init, mediaMatch, bodyText);
    }

    return previousFetch(input, init);
  };
})();