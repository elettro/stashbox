(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  let catalog = [];
  let catalogPromise = null;
  let pointerState = null;
  let titleObserver = null;

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    return Boolean(tokens().accessToken);
  }

  function authHeaders(json = false) {
    const value = tokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(value.accessToken ? { Authorization: `Bearer ${value.accessToken}` } : {}),
      ...(value.idToken ? { 'X-Cognito-Id-Token': value.idToken } : {})
    };
  }

  function rows(body) {
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch (_) {}
    }
    return Array.isArray(body) ? body : body?.songs || body?.items || body?.data || [];
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || ''),
      artist: clean(row.artist || row.artist_name || ''),
      genre: clean(row.genre || row.primary_genre || ''),
      art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.image_url || '')
    };
  }

  async function loadCatalog() {
    if (catalog.length) return catalog;
    if (!catalogPromise) {
      catalogPromise = fetch(`${API}/radio/songs`, { cache: 'no-store', credentials: 'omit' })
        .then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          catalog = rows(body).map(normalizeSong).filter(song => song.key && song.title);
          return catalog;
        })
        .catch(() => []);
    }
    return catalogPromise;
  }

  function player() {
    const node = app.querySelector('[data-player]');
    return node && !node.hidden && node.classList.contains('is-logged-in-player') ? node : null;
  }

  function currentDisplay() {
    const node = player();
    return {
      title: clean(node?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(node?.querySelector('[data-partist]')?.textContent)
    };
  }

  function resolveSong() {
    const node = player();
    if (!node) return null;
    const explicit = clean(node.dataset.currentSongKey);
    if (explicit) {
      const exactKey = catalog.find(song => song.key === explicit);
      if (exactKey) return exactKey;
    }

    const display = currentDisplay();
    if (!display.title) return null;
    return catalog.find(song => normalize(song.title) === normalize(display.title) && (!display.artist || normalize(song.artist) === normalize(display.artist)))
      || catalog.find(song => normalize(song.title) === normalize(display.title))
      || null;
  }

  function publishSongKey(song) {
    const node = player();
    if (!node || !song?.key) return;
    node.dataset.currentSongKey = song.key;
    const like = node.querySelector('[data-like]');
    if (like) {
      like.dataset.currentSongKey = song.key;
      like.dataset.likeSongKey = song.key;
    }
    window.dispatchEvent(new CustomEvent('stashbox:v2-current-song', { detail: { songKey: song.key } }));
  }

  async function synchronizeCurrentSong() {
    if (!loggedIn() || !player()) return;
    await loadCatalog();
    const song = resolveSong();
    if (song) publishSongKey(song);
  }

  function toast(message) {
    let node = document.querySelector('.v2-li-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'v2-toast v2-li-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(node.__favoriteRepairTimer);
    node.__favoriteRepairTimer = window.setTimeout(() => node.classList.remove('is-visible'), 2400);
  }

  async function saveFavorite(song) {
    const response = await fetch(`${API}/radio/me/favorites`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({
        song_key: song.key,
        display_title: song.title,
        artist: song.artist,
        metadata: { artwork_url: song.art, genre: song.genre }
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  async function repairFavoriteClick(rail, preFavorite) {
    await loadCatalog();
    const song = resolveSong();
    if (!song) {
      toast('This song could not be matched to the live catalog.');
      return;
    }

    publishSongKey(song);
    const node = player();
    const baseLike = node?.querySelector('[data-like]');
    const stableHandled = !preFavorite && rail.classList.contains('is-favorite');

    if (!preFavorite && !baseLike?.classList.contains('is-liked')) baseLike?.click();

    rail.classList.add('is-favorite');
    rail.setAttribute('aria-pressed', 'true');

    if (!preFavorite && !stableHandled) {
      try {
        await saveFavorite(song);
        toast('Added to Favorites');
      } catch (error) {
        toast(error.message || 'Favorite could not be saved.');
      }
    }
  }

  document.addEventListener('pointerdown', event => {
    const rail = event.target.closest('#v2App [data-li-favorite]');
    if (!rail) return;
    pointerState = { rail, wasFavorite: rail.classList.contains('is-favorite') };
  }, true);

  document.addEventListener('click', event => {
    const rail = event.target.closest('#v2App [data-li-favorite]');
    if (!rail || !loggedIn()) return;
    const preFavorite = pointerState?.rail === rail ? pointerState.wasFavorite : rail.classList.contains('is-favorite');
    pointerState = null;
    window.setTimeout(() => repairFavoriteClick(rail, preFavorite), 0);
  }, true);

  function installObserver() {
    const node = app.querySelector('[data-player]');
    const title = node?.querySelector('[data-ptitle]');
    if (!node || !title) return false;
    titleObserver?.disconnect();
    titleObserver = new MutationObserver(() => window.setTimeout(synchronizeCurrentSong, 0));
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    titleObserver.observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] });
    synchronizeCurrentSong();
    return true;
  }

  if (!installObserver()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (installObserver() || attempts >= 200) window.clearInterval(timer);
    }, 50);
  }
})();
