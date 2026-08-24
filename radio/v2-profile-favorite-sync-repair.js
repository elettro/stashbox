(() => {
  'use strict';

  if (window.StashboxV2ProfileFavoriteSyncRepair) return;

  const isDev = location.pathname.includes('/radio/dev/v2');
  const API_ROOT = isDev
    ? 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev'
    : 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = isDev ? 'stashbox_radio_dev_cognito_tokens' : 'stashbox_radio_prod_cognito_tokens';
  const FAVORITES_URL = `${API_ROOT}/radio/me/favorites`;
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const savedKeys = new Set();
  const inFlight = new Map();
  let catalogPromise = null;

  function clean(value) {
    return String(value ?? '').trim();
  }

  function normalize(value) {
    return clean(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  async function freshTokens(reason = 'favorite-sync') {
    if (window.StashboxV2Session?.ensureFresh) {
      try {
        const refreshed = await window.StashboxV2Session.ensureFresh({ reason });
        if (refreshed?.accessToken) return refreshed;
      } catch (_) {}
    }
    return readTokens();
  }

  function catalogRows(body) {
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch (_) {}
    }
    return Array.isArray(body) ? body : body?.songs || body?.items || body?.data || [];
  }

  function normalizeSong(row) {
    return {
      key: clean(row?.song_key || row?.songKey || row?.id),
      title: clean(row?.display_title || row?.song_name || row?.title),
      artist: clean(row?.artist || row?.artist_name)
    };
  }

  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(SONGS_URL, { cache: 'no-store', credentials: 'omit' })
        .then(async response => {
          const text = await response.text();
          let body = {};
          try { body = text ? JSON.parse(text) : {}; } catch (_) {}
          if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
          return catalogRows(body).map(normalizeSong).filter(song => song.key && song.title);
        })
        .catch(error => {
          catalogPromise = null;
          console.warn('[Profile Favorite Repair] Catalog lookup failed', error);
          return [];
        });
    }
    return catalogPromise;
  }

  function playerIdentity() {
    const player = document.querySelector('#v2App [data-player]');
    const like = player?.querySelector('[data-like]');
    return {
      key: clean(player?.dataset.currentSongKey || like?.dataset.currentSongKey || like?.dataset.likeSongKey),
      title: clean(player?.querySelector('[data-ptitle]')?.textContent || document.querySelector('#v2App [data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent || document.querySelector('#v2App [data-partist]')?.textContent)
    };
  }

  async function resolveSong(hintedKey = '') {
    const visible = playerIdentity();
    const candidate = clean(hintedKey) || visible.key;
    const catalog = await loadCatalog();

    if (candidate && !candidate.startsWith('ui:')) {
      const byKey = catalog.find(song => song.key === candidate);
      if (byKey) return byKey;
    }

    if (visible.title) {
      const exact = catalog.find(song => normalize(song.title) === normalize(visible.title)
        && (!visible.artist || normalize(song.artist) === normalize(visible.artist)));
      if (exact) return exact;
      const byTitle = catalog.find(song => normalize(song.title) === normalize(visible.title));
      if (byTitle) return byTitle;
    }

    if (candidate && !candidate.startsWith('ui:')) {
      return { key: candidate, title: visible.title, artist: visible.artist };
    }
    return null;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok || body?.success === false) {
      const error = new Error(body?.error || body?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function saveFavorite(song, source = 'like') {
    const songKey = clean(song?.key);
    if (!songKey || songKey.startsWith('ui:')) return false;
    if (savedKeys.has(songKey)) return true;
    if (inFlight.has(songKey)) return inFlight.get(songKey);

    const request = (async () => {
      let tokens = await freshTokens('favorite-save');
      if (!tokens.accessToken) return false;

      const post = currentTokens => fetch(FAVORITES_URL, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentTokens.accessToken}`
        },
        body: JSON.stringify({
          song_key: songKey,
          display_title: clean(song.title),
          artist: clean(song.artist),
          metadata: { source: `like-repair:${source}` }
        })
      });

      let response = await post(tokens);
      if (response.status === 401 && window.StashboxV2Session?.refresh) {
        try {
          tokens = await window.StashboxV2Session.refresh({ reason: 'favorite-save-401' });
          if (tokens?.accessToken) response = await post(tokens);
        } catch (_) {}
      }

      await parseResponse(response);
      savedKeys.add(songKey);
      window.dispatchEvent(new CustomEvent('stashbox:profile-favorite-saved', { detail: { songKey } }));
      return true;
    })().finally(() => inFlight.delete(songKey));

    inFlight.set(songKey, request);
    return request;
  }

  async function syncFavorite(detail = {}) {
    if (detail.liked !== true) return false;
    const tokens = readTokens();
    if (!tokens.accessToken && !tokens.refreshToken && !window.StashboxV2Session?.hasSession?.()) return false;
    const song = await resolveSong(detail.songKey);
    if (!song?.key) return false;
    return saveFavorite(song, clean(detail.source) || 'like-event');
  }

  function syncCurrentLiked(source = 'current-liked') {
    const player = document.querySelector('#v2App [data-player]');
    const like = player?.querySelector('[data-like]');
    if (!like || (!like.classList.contains('is-liked') && like.getAttribute('aria-pressed') !== 'true')) return;
    syncFavorite({ liked: true, songKey: playerIdentity().key, source }).catch(error => {
      console.warn('[Profile Favorite Repair] Current favorite sync failed', error);
    });
  }

  window.addEventListener('stashbox:like-count-updated', event => {
    syncFavorite(event.detail || {}).catch(error => {
      console.warn('[Profile Favorite Repair] Like-to-profile sync failed', error);
    });
  });

  window.addEventListener('stashbox:v2-current-song', () => window.setTimeout(() => syncCurrentLiked('song-change'), 60));
  window.addEventListener('stashbox:v2-auth-changed', () => window.setTimeout(() => syncCurrentLiked('auth-change'), 100));
  window.addEventListener('stashbox:v2-session-changed', () => window.setTimeout(() => syncCurrentLiked('session-change'), 100));
  window.addEventListener('pageshow', () => window.setTimeout(() => syncCurrentLiked('pageshow'), 100));
  window.addEventListener('focus', () => window.setTimeout(() => syncCurrentLiked('focus'), 100));

  window.StashboxV2ProfileFavoriteSyncRepair = {
    syncCurrent: () => syncCurrentLiked('manual'),
    syncFavorite
  };

  window.setTimeout(() => syncCurrentLiked('initial'), 300);
  window.setTimeout(() => syncCurrentLiked('initial-late'), 1600);
})();
