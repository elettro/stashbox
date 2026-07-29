(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/dev/v2/artist/')) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const recipeCache = new Map();
  let catalogPromise = null;
  let scheduled = 0;
  let applyToken = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value)
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

  function songTitle(song) {
    return clean(song?.display_title || song?.song_name || song?.title || song?.song_key);
  }

  function songArtist(song) {
    return clean(song?.artist || song?.artist_name || 'Stashbox');
  }

  function songSquare(song) {
    return fixUrl(song?.resolved_artwork_url || song?.song_artwork_url || song?.artwork_url || song?.cover_art_url || song?.image_url) || FALLBACK_ART;
  }

  async function catalog() {
    if (!catalogPromise) {
      catalogPromise = getJson(SONGS_URL).then(data => rows(data).filter(song => clean(song?.song_key) && songTitle(song)));
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

  function activeRealm() {
    const realm = document.querySelector('.artist-realm-player:not([hidden])');
    if (!realm || getComputedStyle(realm).display === 'none') return null;
    const stage = realm.querySelector('[data-realm-stage]');
    if (!stage) return null;
    return {
      realm,
      stage,
      title: clean(realm.querySelector('[data-realm-title]')?.textContent),
      artist: clean(realm.querySelector('[data-realm-artist]')?.textContent)
    };
  }

  function findSong(songs, title, artist) {
    const titleKey = normalize(title);
    const artistKey = normalize(artist);
    return songs.find(song => normalize(songTitle(song)) === titleKey && (!artistKey || normalize(songArtist(song)) === artistKey))
      || songs.find(song => normalize(songTitle(song)) === titleKey)
      || null;
  }

  function surfaceSize(stage) {
    const rect = stage?.getBoundingClientRect?.();
    if (rect?.width >= 100 && rect?.height >= 100) return { width: rect.width, height: rect.height };
    return {
      width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
      height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
    };
  }

  function requestedRatio(stage) {
    const { width, height } = surfaceSize(stage);
    const aspect = width / Math.max(1, height);
    if (width <= 820 && height >= width * 1.15) return '9x16';
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
      '1x1': fixUrl(stored['1x1'] || songSquare(song)),
      '16x9': fixUrl(stored['16x9']),
      '9x16': fixUrl(stored['9x16']),
      '3x4': fixUrl(stored['3x4']),
      '4x5': fixUrl(stored['4x5']),
      '21x9': fixUrl(stored['21x9'])
    };
  }

  function chooseArtwork(stage, song, recipe) {
    const requested = requestedRatio(stage);
    const images = imageMap(song, recipe);
    const source = fallbackOrder(requested).find(ratio => images[ratio]) || '1x1';
    return {
      requested,
      source,
      exact: source === requested,
      url: images[source] || songSquare(song),
      images
    };
  }

  function canonicalUrl(value) {
    const fixed = fixUrl(value);
    if (!fixed) return '';
    try { return new URL(fixed, window.location.href).href; } catch (_) { return fixed; }
  }

  function officialUrlSet(selected) {
    return new Set([
      FALLBACK_ART,
      ...Object.values(selected.images || {}),
      selected.url
    ].map(canonicalUrl).filter(Boolean));
  }

  function activeImage(stage) {
    return stage.querySelector('img.artist-realm-media.is-active')
      || [...stage.querySelectorAll('img.artist-realm-media')].at(-1)
      || null;
  }

  async function applyResponsiveArtwork() {
    const target = activeRealm();
    if (!target?.title) return;
    const token = ++applyToken;
    const identity = `${normalize(target.title)}|${normalize(target.artist)}`;

    try {
      const songs = await catalog();
      const song = findSong(songs, target.title, target.artist);
      if (!song) return;
      const recipe = await recipeForSong(clean(song.song_key)).catch(() => ({}));
      if (token !== applyToken) return;

      const current = activeRealm();
      if (!current || `${normalize(current.title)}|${normalize(current.artist)}` !== identity) return;
      const selected = chooseArtwork(current.stage, song, recipe);
      const image = activeImage(current.stage);
      if (!image) return;

      const officialUrls = officialUrlSet(selected);
      const currentUrl = canonicalUrl(image.currentSrc || image.src);
      const previousResponsiveUrl = canonicalUrl(image.dataset.responsiveArtworkUrl);
      if (!officialUrls.has(currentUrl) && (!previousResponsiveUrl || currentUrl !== previousResponsiveUrl)) return;

      if (currentUrl !== canonicalUrl(selected.url)) image.src = selected.url;
      image.style.objectFit = selected.exact ? 'cover' : 'contain';
      image.style.objectPosition = 'center';
      image.dataset.responsiveArtworkUrl = selected.url;
      image.dataset.responsiveArtworkRatio = selected.source;
      image.dataset.responsiveArtworkRequestedRatio = selected.requested;
      current.stage.dataset.songArtworkRequestedRatio = selected.requested;
      current.stage.dataset.songArtworkSourceRatio = selected.source;
    } catch (error) {
      console.warn('[Artist song artwork] Responsive official artwork unavailable.', error?.message || error);
    }
  }

  function scheduleApply() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(applyResponsiveArtwork, 55);
  }

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