(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/dev/v2/') || path.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxDesktopOfficialArtwork16x9) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const DESKTOP_MIN_WIDTH = 900;
  const artworkCache = new Map();
  const requestCache = new Map();
  const imageCache = new Map();

  let songsPromise = null;
  let activeSongKey = '';
  let activeSource = '';
  let operation = 0;
  let scheduled = 0;
  let titleObserver = null;
  let observedTitle = null;

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

  function rows(data) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
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

  function player() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function stage(currentPlayer = player()) {
    return currentPlayer?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function activeImage(currentStage = stage()) {
    return currentStage?.querySelector('img.v2-mobile-vec-media.is-active')
      || [...(currentStage?.querySelectorAll('img.v2-mobile-vec-media') || [])].at(-1)
      || null;
  }

  function desktopSurface(currentPlayer = player()) {
    const surface = stage(currentPlayer) || currentPlayer;
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    const height = Math.max(1, rect?.height || window.innerHeight || 1);
    return width >= DESKTOP_MIN_WIDTH && width / height >= 1.25;
  }

  function canonicalUrl(value) {
    const source = fixUrl(value);
    if (!source) return '';
    try {
      const url = new URL(source, window.location.href);
      url.hash = '';
      return url.href;
    } catch (_) {
      return source.split('#')[0];
    }
  }

  async function songs() {
    if (!songsPromise) {
      songsPromise = getJson(SONGS_URL).then(data => rows(data).map((row, index) => ({
        key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
        title: clean(row.display_title || row.song_name || row.title),
        artist: clean(row.artist || row.artist_name || 'Stashbox'),
        square: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url)
      })).filter(item => item.key && item.title));
    }
    return songsPromise;
  }

  function identity(currentPlayer = player()) {
    return {
      title: clean(currentPlayer?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(currentPlayer?.querySelector('[data-partist]')?.textContent)
    };
  }

  function findSong(list, currentIdentity) {
    const title = normalize(currentIdentity?.title);
    const artist = normalize(currentIdentity?.artist);
    return list.find(item => normalize(item.title) === title && (!artist || normalize(item.artist) === artist))
      || list.find(item => normalize(item.title) === title)
      || null;
  }

  function artworkPayload(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    const images = media.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : {};
    return {
      '1x1': fixUrl(images['1x1'] || media.song_artwork_1x1_url || media.song_artwork_url),
      '16x9': fixUrl(images['16x9'] || media.song_artwork_16x9_url),
      '21x9': fixUrl(images['21x9'] || media.song_artwork_21x9_url)
    };
  }

  async function artwork(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return {};
    if (force) artworkCache.delete(key);
    if (artworkCache.has(key)) return artworkCache.get(key);
    if (requestCache.has(key)) return requestCache.get(key);

    const promise = getJson(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`)
      .then(artworkPayload)
      .then(images => {
        artworkCache.set(key, images);
        return images;
      })
      .finally(() => requestCache.delete(key));

    requestCache.set(key, promise);
    return promise;
  }

  function preload(url) {
    const source = fixUrl(url);
    if (!source) return Promise.resolve(false);
    if (imageCache.has(source)) return imageCache.get(source);

    const promise = new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (!loaded) imageCache.delete(source);
        resolve(Boolean(loaded));
      };
      const timer = window.setTimeout(() => finish(false), 12000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageCache.set(source, promise);
    return promise;
  }

  function choose(images, song) {
    if (images?.['16x9']) return { url: images['16x9'], ratio: '16x9', exact: true };
    if (images?.['21x9']) return { url: images['21x9'], ratio: '21x9', exact: true };
    return { url: images?.['1x1'] || song?.square || '', ratio: '1x1', exact: false };
  }

  function isOfficial(image, song) {
    if (!image || image.tagName !== 'IMG') return false;
    if (
      image.dataset.desktopOfficialArtwork === 'true' ||
      image.dataset.responsiveOfficialArtwork === 'true' ||
      image.dataset.vecAssetSource === 'official-artwork' ||
      activeSource === 'official-artwork'
    ) return true;
    const current = canonicalUrl(image.currentSrc || image.src);
    return Boolean(current && song?.square && current === canonicalUrl(song.square));
  }

  function applySelected(currentPlayer, currentStage, image, selected, songKey) {
    if (!currentPlayer || !currentStage || !image || !selected.url) return false;
    const signature = `${songKey}|${selected.ratio}|${canonicalUrl(selected.url)}`;
    if (
      currentPlayer.dataset.desktopArtworkSignature === signature &&
      image.dataset.desktopArtworkSignature === signature &&
      canonicalUrl(image.currentSrc || image.src) === canonicalUrl(selected.url)
    ) return true;

    image.dataset.desktopOfficialArtwork = 'true';
    image.dataset.responsiveOfficialArtwork = 'true';
    image.dataset.vecAssetSource = 'official-artwork';
    image.dataset.desktopArtworkSignature = signature;
    image.dataset.responsiveArtworkRatio = selected.ratio;
    image.style.display = 'block';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    image.style.objectFit = 'contain';
    image.style.objectPosition = 'center center';
    image.style.transition = 'none';
    image.style.transform = 'none';
    image.style.removeProperty('visibility');
    image.style.setProperty('opacity', '1', 'important');
    if (canonicalUrl(image.currentSrc || image.src) !== canonicalUrl(selected.url)) image.src = selected.url;

    currentStage.style.backgroundImage = 'none';
    currentStage.style.backgroundColor = '#050607';
    currentStage.dataset.desktopArtworkSignature = signature;
    currentStage.dataset.songArtworkRequestedRatio = '16x9';
    currentStage.dataset.songArtworkSourceRatio = selected.ratio;
    currentStage.classList.add('responsive-artwork-surface-ready');

    const backdrop = currentPlayer.querySelector('[data-backdrop]');
    if (backdrop) {
      backdrop.style.backgroundImage = 'none';
      backdrop.style.backgroundColor = '#050607';
      backdrop.classList.remove('responsive-artwork-surface-ready');
    }

    currentPlayer.dataset.desktopArtworkSignature = signature;
    currentPlayer.dataset.desktopArtworkSongKey = songKey;
    currentPlayer.dataset.songArtworkRequestedRatio = '16x9';
    currentPlayer.dataset.songArtworkSourceRatio = selected.ratio;
    currentPlayer.classList.add('responsive-artwork-ready');
    currentPlayer.classList.remove('responsive-artwork-pending');
    currentPlayer.classList.toggle('has-exact-responsive-artwork', selected.exact);
    currentPlayer.setAttribute('aria-busy', 'false');
    return true;
  }

  async function applySong(song, { force = false, trustKey = false } = {}) {
    if (!song?.key || !desktopSurface()) return false;
    const token = ++operation;
    activeSongKey = song.key;

    const images = await artwork(song.key, { force }).catch(error => {
      console.warn('[V2 desktop artwork] Canonical artwork request failed.', error?.message || error);
      return {};
    });
    if (token !== operation || !desktopSurface()) return false;

    const selected = choose(images, song);
    if (!selected.url) return false;
    const loaded = await preload(selected.url);
    if (!loaded || token !== operation || !desktopSurface()) return false;

    const currentPlayer = player();
    const currentStage = stage(currentPlayer);
    const image = activeImage(currentStage);
    const currentIdentity = identity(currentPlayer);
    const sameSong = trustKey
      ? activeSongKey === song.key
      : normalize(currentIdentity.title) === normalize(song.title);

    if (!currentPlayer || !currentStage || !isOfficial(image, song) || !sameSong) return false;
    return applySelected(currentPlayer, currentStage, image, selected, song.key);
  }

  async function applySongKey(songKey, options = {}) {
    const key = clean(songKey);
    if (!key || !desktopSurface()) return false;
    const list = await songs();
    const song = list.find(item => item.key === key);
    if (!song) return false;
    return applySong(song, { ...options, trustKey: true });
  }

  async function applyCurrent(options = {}) {
    if (!desktopSurface()) return false;
    const currentPlayer = player();
    const currentIdentity = identity(currentPlayer);
    if (!currentPlayer || !currentIdentity.title) return false;
    const list = await songs();
    const song = findSong(list, currentIdentity);
    if (!song) return false;
    return applySong(song, options);
  }

  function scheduleApply(delay = 30, options = {}) {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      applyCurrent(options).catch(error => {
        console.warn('[V2 desktop artwork] Horizontal artwork application failed.', error?.message || error);
      });
    }, delay);
  }

  function installTitleObserver() {
    const title = player()?.querySelector('[data-ptitle]') || null;
    if (!title || title === observedTitle) return Boolean(title);
    titleObserver?.disconnect();
    observedTitle = title;
    titleObserver = new MutationObserver(() => {
      operation += 1;
      scheduleApply(20);
    });
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    return true;
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const key = clean(event?.detail?.songKey);
    activeSongKey = key;
    activeSource = clean(event?.detail?.asset?.source).toLowerCase();
    installTitleObserver();
    if (activeSource === 'official-artwork' && key && desktopSurface()) {
      applySongKey(key).catch(() => scheduleApply(20));
    }
  });

  ['pointerenter', 'pointerdown', 'focusin'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      if (!desktopSurface()) return;
      const key = clean(event.target.closest?.('#v2App [data-song]')?.dataset?.song);
      if (!key) return;
      artwork(key).then(images => preload(images['16x9'] || images['21x9'])).catch(() => {});
    }, { capture: true, passive: true });
  });

  window.addEventListener('resize', () => scheduleApply(60), { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(() => scheduleApply(60), 100), { passive: true });

  const installTimer = window.setInterval(() => {
    if (installTitleObserver() && player()) {
      window.clearInterval(installTimer);
      scheduleApply(30);
    }
  }, 80);

  window.StashboxDesktopOfficialArtwork16x9 = Object.freeze({
    refresh: () => scheduleApply(0, { force: true }),
    applyCurrent,
    applySong: applySongKey,
    desktopSurface
  });
})();