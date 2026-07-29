(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/dev/v2/')) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const PLACEHOLDER = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const recipeCache = new Map();
  let catalogPromise = null;
  let scheduled = 0;
  let applyToken = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixDropbox = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function rows(data) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  function recipeFrom(data) {
    data = unwrap(data) || {};
    const recipe = data.recipe || data.vec_recipe || data.data?.recipe || data.data || {};
    return recipe && typeof recipe === 'object' && !Array.isArray(recipe) ? recipe : {};
  }

  async function catalog() {
    if (!catalogPromise) {
      catalogPromise = getJson(SONGS_URL).then(data => rows(data).map((row, index) => ({
        key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
        title: clean(row.display_title || row.song_name || row.title),
        artist: clean(row.artist || row.artist_name || 'Stashbox'),
        square: fixDropbox(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url)
      })).filter(song => song.key && song.title));
    }
    return catalogPromise;
  }

  async function recipeForSong(songKey) {
    if (!recipeCache.has(songKey)) {
      recipeCache.set(songKey, getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(songKey)}`)
        .then(recipeFrom)
        .catch(error => {
          recipeCache.delete(songKey);
          throw error;
        }));
    }
    return recipeCache.get(songKey);
  }

  function surfaceSize(player) {
    const candidates = [
      player?.querySelector('[data-mobile-vec-stage]'),
      player?.querySelector('[data-backdrop]'),
      player
    ];
    for (const candidate of candidates) {
      const rect = candidate?.getBoundingClientRect?.();
      if (rect?.width >= 100 && rect?.height >= 100) {
        return { width: rect.width, height: rect.height };
      }
    }
    return {
      width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
      height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
    };
  }

  function requestedRatio(player) {
    const { width, height } = surfaceSize(player);
    const aspect = width / Math.max(1, height);
    const tallMobileSurface = width <= 820 && height >= width * 1.15;
    if (tallMobileSurface) return '9x16';
    if (width >= 1440 && aspect >= 1.9) return '21x9';
    return '16x9';
  }

  function fallbackOrder(ratio) {
    if (ratio === '9x16') return ['9x16', '4x5', '3x4', '1x1'];
    if (ratio === '21x9') return ['21x9', '16x9', '1x1'];
    return ['16x9', '21x9', '1x1'];
  }

  function imageMap(song, recipe) {
    const prepared = recipe?.prepared_artwork_images;
    const stored = prepared && typeof prepared === 'object' && !Array.isArray(prepared) ? prepared : {};
    return {
      '1x1': fixDropbox(stored['1x1'] || song?.square),
      '16x9': fixDropbox(stored['16x9']),
      '9x16': fixDropbox(stored['9x16']),
      '3x4': fixDropbox(stored['3x4']),
      '4x5': fixDropbox(stored['4x5']),
      '21x9': fixDropbox(stored['21x9'])
    };
  }

  function chooseArtwork(player, song, recipe) {
    const requested = requestedRatio(player);
    const images = imageMap(song, recipe);
    const source = fallbackOrder(requested).find(ratio => images[ratio]) || '';
    return {
      requested,
      source,
      exact: Boolean(source && source === requested),
      url: source ? images[source] : (song?.square || PLACEHOLDER)
    };
  }

  function activePlayer() {
    return [...document.querySelectorAll('[data-player]')].find(player => (
      !player.hidden && getComputedStyle(player).display !== 'none' && getComputedStyle(player).visibility !== 'hidden'
    )) || null;
  }

  function currentIdentity(player) {
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent)
    };
  }

  function findSong(songs, title, artist) {
    const titleKey = normalize(title);
    const artistKey = normalize(artist);
    return songs.find(song => normalize(song.title) === titleKey && (!artistKey || normalize(song.artist) === artistKey))
      || songs.find(song => normalize(song.title) === titleKey)
      || null;
  }

  function setBackground(node, selected) {
    if (!node) return;
    const changed = node.dataset.responsiveArtworkUrl !== selected.url
      || node.dataset.songArtworkRequestedRatio !== selected.requested
      || node.dataset.songArtworkSourceRatio !== (selected.source || '');
    if (!changed) return;
    node.style.backgroundImage = `url("${selected.url.replaceAll('"', '%22')}")`;
    node.style.backgroundPosition = 'center';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.backgroundSize = selected.exact ? 'cover' : 'contain';
    node.dataset.songArtworkRequestedRatio = selected.requested;
    node.dataset.songArtworkSourceRatio = selected.source || '';
    node.dataset.responsiveArtworkUrl = selected.url;
  }

  function applyBackdrop(player, selected) {
    setBackground(player?.querySelector('[data-backdrop]'), selected);

    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const activeMedia = stage?.querySelector('.v2-mobile-vec-media.is-active');
    if (stage && !activeMedia) setBackground(stage, selected);

    player.dataset.songArtworkRequestedRatio = selected.requested;
    player.dataset.songArtworkSourceRatio = selected.source || '';
  }

  async function applyForSong(player, song, identityToken = '') {
    const token = ++applyToken;
    const recipe = await recipeForSong(song.key).catch(() => ({}));
    if (token !== applyToken) return null;
    const current = activePlayer();
    if (!current || current !== player) return null;
    if (identityToken) {
      const identity = currentIdentity(current);
      if (`${normalize(identity.title)}|${normalize(identity.artist)}` !== identityToken) return null;
    }
    const selected = chooseArtwork(current, song, recipe);
    applyBackdrop(current, selected);
    return selected;
  }

  async function applyResponsiveArtwork() {
    const player = activePlayer();
    if (!player) return;
    const identity = currentIdentity(player);
    if (!identity.title) return;
    const identityToken = `${normalize(identity.title)}|${normalize(identity.artist)}`;
    try {
      const songs = await catalog();
      const song = findSong(songs, identity.title, identity.artist);
      if (!song) return;
      await applyForSong(player, song, identityToken);
    } catch (error) {
      console.warn('[V2 song artwork] Responsive player artwork unavailable.', error?.message || error);
    }
  }

  function scheduleApply() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(applyResponsiveArtwork, 45);
  }

  window.addEventListener('stashbox:vec-asset-change', async event => {
    const asset = event?.detail?.asset || {};
    const songKey = clean(event?.detail?.songKey);
    if (!songKey || clean(asset.source) !== 'official-artwork') return;
    const player = activePlayer();
    if (!player) return;
    try {
      const songs = await catalog();
      const song = songs.find(item => item.key === songKey);
      if (!song) return;
      const selected = await applyForSong(player, song);
      const officialImage = player.querySelector('[data-mobile-vec-stage] .v2-mobile-vec-media.is-active');
      if (selected?.url && officialImage?.tagName === 'IMG' && officialImage.src !== selected.url) {
        officialImage.src = selected.url;
        officialImage.style.objectFit = selected.exact ? 'cover' : 'contain';
        officialImage.style.objectPosition = 'center';
        officialImage.dataset.responsiveArtworkRatio = selected.source || selected.requested;
      }
    } catch (error) {
      console.warn('[V2 song artwork] Official artwork ratio switch failed.', error?.message || error);
    }
  });

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
  window.addEventListener('resize', scheduleApply, { passive: true });
  window.addEventListener('orientationchange', scheduleApply, { passive: true });
  document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
  scheduleApply();
})();