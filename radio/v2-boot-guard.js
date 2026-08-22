(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const nativeFetch = window.fetch.bind(window);
  const DEV_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const PROD_HOST = 'je3zud66nb.execute-api.us-east-1.amazonaws.com';
  const DEV_SONGS = `https://${DEV_HOST}/dev/radio/songs`;
  const PROD_SONGS = `https://${PROD_HOST}/prod-v2/radio/songs`;
  const LOCAL_SONGS = '/radio/catalog-fallback.json';
  const CATALOG_CACHE_KEY = 'stashbox_radio_v2_catalog_cache';
  const guardedHosts = new Set([DEV_HOST, PROD_HOST, 'stashbox.ai']);
  const AUTH_API_TIMEOUT_MS = 6500;
  const COGNITO_TIMEOUT_MS = 9000;
  const CATALOG_TIMEOUT_MS = 9000;

  function timeoutFetch(input, init = {}, timeoutMs = 20000) {
    if (init.signal) return nativeFetch(input, init);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .finally(() => window.clearTimeout(timer));
  }

  function parsedUrl(rawUrl) {
    try { return new URL(rawUrl, location.href); }
    catch (_) { return null; }
  }

  function isSongsRequest(rawUrl) {
    const url = parsedUrl(rawUrl);
    return Boolean(
      url &&
      (url.hostname === DEV_HOST || url.hostname === PROD_HOST) &&
      /\/radio\/songs\/?$/.test(url.pathname)
    );
  }

  function isAuthApiRequest(url) {
    return Boolean(url && url.hostname === DEV_HOST && (
      url.pathname.includes('/radio/auth/') || url.pathname.endsWith('/radio/me')
    ));
  }

  function isCognitoRequest(url) {
    return Boolean(url && /^cognito-idp\.[^.]+\.amazonaws\.com$/i.test(url.hostname));
  }

  function preferStreamSong(song) {
    if (!song || typeof song !== 'object') return song;
    const master = String(song.audio_master_url || song.audio_url || song.audioUrl || '').trim();
    const stream = String(song.audio_stream_url || song.stream_url || song.mp3_url || '').trim();
    const status = String(song.audio_transcode_status || '').trim().toLowerCase();
    if (!stream || (status && status !== 'ready')) return song;
    return {
      ...song,
      audio_master_url: master || song.audio_master_url || '',
      audio_url: stream,
      audioUrl: stream,
      stream_url: stream,
      mp3_url: stream,
      preferred_audio_url: stream
    };
  }

  function preferStreamPayload(payload) {
    if (Array.isArray(payload)) return payload.map(preferStreamSong);
    if (!payload || typeof payload !== 'object') return payload;
    const clone = { ...payload };
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(clone[key])) clone[key] = clone[key].map(preferStreamSong);
    }
    return clone;
  }

  async function preferStreamResponse(response) {
    if (!response?.ok) return response;
    try {
      const text = await response.clone().text();
      const parsed = text ? JSON.parse(text) : {};
      const rewritten = preferStreamPayload(parsed);
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      headers.set('x-stashbox-audio-preference', 'mp3-stream-first');
      return new Response(JSON.stringify(rewritten), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  }

  async function rememberCatalog(response) {
    if (!response?.ok) return response;
    try {
      const text = await response.clone().text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed?.songs || parsed?.items || parsed?.data || [];
      if (Array.isArray(list) && list.length) {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), body: text }));
      }
    } catch (_) {}
    return response;
  }

  function cachedCatalogResponse() {
    try {
      const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
      if (!cached?.body) return null;
      return new Response(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Stashbox-Catalog-Source': 'browser-cache'
        }
      });
    } catch (_) {
      return null;
    }
  }

  async function tryCatalog(url, init = {}, source = '') {
    try {
      const response = await timeoutFetch(url, {
        ...init,
        method: 'GET',
        body: undefined,
        headers: { Accept: 'application/json' }
      }, CATALOG_TIMEOUT_MS);
      if (!response.ok) return null;
      const prepared = await preferStreamResponse(response);
      const headers = new Headers(prepared.headers);
      headers.set('x-stashbox-catalog-source', source || url);
      const body = await prepared.clone().text();
      return rememberCatalog(new Response(body, {
        status: prepared.status,
        statusText: prepared.statusText,
        headers
      }));
    } catch (_) {
      return null;
    }
  }

  async function fetchSongsWithFallback(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    const requested = parsedUrl(rawUrl);
    const isProdRequest = requested?.hostname === PROD_HOST;
    const primary = await tryCatalog(rawUrl, init, isProdRequest ? 'prod-api' : 'dev-api');
    if (primary) return primary;

    if (isProdRequest) {
      const local = await tryCatalog(LOCAL_SONGS, init, 'prod-snapshot');
      if (local) return local;
      const dev = await tryCatalog(DEV_SONGS + (requested?.search || ''), init, 'dev-api-fallback');
      if (dev) return dev;
    } else {
      const prod = await tryCatalog(PROD_SONGS + (requested?.search || ''), init, 'prod-api-fallback');
      if (prod) return prod;
      const local = await tryCatalog(LOCAL_SONGS, init, 'prod-snapshot');
      if (local) return local;
    }

    const cached = cachedCatalogResponse();
    if (cached) return preferStreamResponse(cached);
    throw new Error('No Stashbox Radio catalog source is currently available.');
  }

  window.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    if (isSongsRequest(rawUrl)) return fetchSongsWithFallback(input, init);

    const url = parsedUrl(rawUrl);
    if (isCognitoRequest(url)) return timeoutFetch(input, init, COGNITO_TIMEOUT_MS);
    if (isAuthApiRequest(url)) return timeoutFetch(input, init, AUTH_API_TIMEOUT_MS);

    const host = url?.hostname || '';
    if (!guardedHosts.has(host)) return nativeFetch(input, init);
    return timeoutFetch(input, init, host === 'stashbox.ai' ? 10000 : 20000);
  };

  const showFailure = message => {
    if (app.querySelector('[data-song], .v2-load-error')) return;
    const meter = app.querySelector('[data-v2-boot-status]');
    if (!meter) return;
    meter.classList.add('v2-load-error');
    meter.innerHTML = `
      <strong>Live catalog did not finish loading</strong>
      <p>${String(message || 'The request timed out.').replace(/[<>]/g, '')}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" data-v2-retry style="border:0;border-radius:999px;padding:10px 16px;background:#ff9f0a;color:#111;font-weight:900">Retry</button>
        <a href="/radio/" style="border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:10px 16px;color:#fff;text-decoration:none;font-weight:800">Reload Radio</a>
      </div>`;
    meter.querySelector('[data-v2-retry]')?.addEventListener('click', () => location.reload());
  };

  window.addEventListener('error', event => {
    if (!app.querySelector('[data-song]')) showFailure(event.message || 'A startup script failed.');
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    showFailure(reason?.message || String(reason || 'A startup request failed.'));
  });

  window.setTimeout(() => {
    if (!app.querySelector('[data-song]')) showFailure('No catalog source responded within 22 seconds.');
  }, 24000);

  // Share-count is loaded explicitly by the mobile entry page and by a separate
  // observer-free controller on clean desktop. Do not inject a second copy here.
})();
