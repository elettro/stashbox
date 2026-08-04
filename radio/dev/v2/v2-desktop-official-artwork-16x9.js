(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/dev/v2/') || path.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxDesktopOfficialArtwork16x9) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const DESKTOP_MIN_WIDTH = 900;
  const requestCache = new Map();
  const artworkCache = new Map();
  const imageLoads = new Map();

  let catalogPromise = null;
  let activeSongKey = '';
  let activeAssetSource = '';
  let operation = 0;
  let scheduled = 0;

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

  function activeMedia(currentStage = stage()) {
    return currentStage?.querySelector('.v2-mobile-vec-media.is-active')
      || [...(currentStage?.querySelectorAll('.v2-mobile-vec-media') || [])].at(-1)
      || null;
  }

  function desktopSurface(currentPlayer = player()) {
    const currentStage = stage(currentPlayer);
    const rect = currentStage?.getBoundingClientRect?.() || currentPlayer?.getBoundingClientRect?.();
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

  async function catalog() {
    if (!catalogPromise) {
      catalogPromise = getJson(SONGS_URL).then(data => rows(data).map((row, index) => ({
        key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
        title: clean(row.display_title || row.song_name || row.title),
        artist: clean(row.artist || row.artist_name || 'Stashbox'),
        square: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url)
      })).filter(song => song.key && song.title));
    }
    return catalogPromise;
  }

  function identity(currentPlayer = player()) {
    return {
      title: clean(currentPlayer?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(currentPlayer?.querySelector('[data-partist]')?.textContent)
    };
  }

  function findSong(songs, currentIdentity) {
    const title = normalize(currentIdentity?.title);
    const artist = normalize(currentIdentity?.artist);
    return songs.find(song => normalize(song.title) === title && (!artist || normalize(song.artist) === artist))
      || songs.find(song => normalize(song.title) === title)
      || null;
  }

  function artworkFromPayload(payload) {
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

  async function artworkForSong(songKey) {
    const key = clean(songKey);
    if (!key) return {};
    if (artworkCache.has(key)) return artworkCache.get(key);
    if (requestCache.has(key)) return requestCache.get(key);

    const promise = getJson(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`)
      .then(artworkFromPayload)
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
    if (imageLoads.has(source)) return imageLoads.get(source);

    const promise = new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (!loaded) imageLoads.delete(source);
        resolve(Boolean(loaded));
      };
      const timer = window.setTimeout(() => finish(false), 16000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageLoads.set(source, promise);
    return promise;
  }

  function isOfficialImage(media, song) {
    if (!media || media.tagName !== 'IMG') return false;
    if (
      media.dataset.desktopOfficialArtwork === 'true' ||
      media.dataset.responsiveOfficialArtwork === 'true' ||
      media.dataset.vecAssetSource === 'official-artwork' ||
      activeAssetSource === 'official-artwork'
    ) return true;

    const current = canonicalUrl(media.currentSrc || media.src);
    return Boolean(current && song?.square && current === canonicalUrl(song.square));
  }

  function chooseHorizontal(images, song) {
    const horizontal = fixUrl(images?.['16x9'] || images?.['21x9']);
    if (horizontal) {
      return {
        url: horizontal,
        sourceRatio: images?.['16x9'] ? '16x9' : '21x9',
        exactHorizontal: true
      };
    }
    return {
      url: fixUrl(images?.['1x1'] || song?.square),
      sourceRatio: '1x1',
      exactHorizontal: false
    };
  }

  function setPending(currentPlayer, currentStage, image) {
    if (!currentPlayer || !currentStage || !image) return;
    currentPlayer.dataset.desktopArtworkState = 'loading-horizontal';
    currentStage.dataset.desktopArtworkState = 'loading-horizontal';
    if (image.naturalWidth && image.naturalHeight && image.naturalWidth / image.naturalHeight < 1.5) {
      image.style.setProperty('opacity', '0', 'important');
      image.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function applyArtwork(currentPlayer, currentStage, image, selected, songKey) {
    if (!currentPlayer || !currentStage || !image || !selected.url) return false;

    const safeUrl = selected.url.replaceAll('"', '%22');
    const fit = 'contain';

    currentStage.style.backgroundImage = `url("${safeUrl}")`;
    currentStage.style.backgroundPosition = 'center center';
    currentStage.style.backgroundRepeat = 'no-repeat';
    currentStage.style.backgroundSize = fit;
    currentStage.style.backgroundColor = '#050607';
    currentStage.dataset.desktopArtworkState = selected.exactHorizontal ? 'ready-horizontal' : 'missing-horizontal';
    currentStage.dataset.songArtworkRequestedRatio = '16x9';
    currentStage.dataset.songArtworkSourceRatio = selected.sourceRatio;
    currentStage.dataset.responsiveArtworkUrl = selected.url;
    currentStage.classList.add('responsive-artwork-surface-ready');

    image.dataset.desktopOfficialArtwork = 'true';
    image.dataset.responsiveOfficialArtwork = 'true';
    image.dataset.vecAssetSource = 'official-artwork';
    image.dataset.desktopArtworkState = selected.exactHorizontal ? 'ready-horizontal' : 'missing-horizontal';
    image.dataset.responsiveArtworkRequestedRatio = '16x9';
    image.dataset.responsiveArtworkRatio = selected.sourceRatio;
    image.dataset.responsiveArtworkUrl = selected.url;
    image.style.display = 'block';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    image.style.objectFit = fit;
    image.style.objectPosition = 'center center';
    image.style.removeProperty('visibility');
    image.style.setProperty('opacity', '1', 'important');

    if (canonicalUrl(image.currentSrc || image.src) !== canonicalUrl(selected.url)) image.src = selected.url;

    const backdrop = currentPlayer.querySelector('[data-backdrop]');
    if (backdrop) {
      backdrop.style.backgroundImage = 'none';
      backdrop.style.backgroundColor = '#050607';
      backdrop.classList.remove('responsive-artwork-surface-ready');
    }

    currentPlayer.dataset.desktopArtworkState = selected.exactHorizontal ? 'ready-horizontal' : 'missing-horizontal';
    currentPlayer.dataset.desktopArtworkSongKey = songKey;
    currentPlayer.dataset.songArtworkRequestedRatio = '16x9';
    currentPlayer.dataset.songArtworkSourceRatio = selected.sourceRatio;
    currentPlayer.dataset.responsiveArtworkUrl = selected.url;
    currentPlayer.classList.add('responsive-artwork-ready');
    currentPlayer.classList.remove('responsive-artwork-pending');
    currentPlayer.classList.toggle('has-exact-responsive-artwork', selected.exactHorizontal);
    currentPlayer.setAttribute('aria-busy', 'false');

    return true;
  }

  async function applyForSong(song, { force = false } = {}) {
    if (!song?.key || !desktopSurface()) return false;
    const token = ++operation;
    activeSongKey = song.key;

    const currentPlayer = player();
    const currentStage = stage(currentPlayer);
    const image = activeMedia(currentStage);
    if (!currentPlayer || !currentStage || !isOfficialImage(image, song)) return false;

    setPending(currentPlayer, currentStage, image);
    if (force) artworkCache.delete(song.key);

    let images = {};
    try { images = await artworkForSong(song.key); } catch (error) {
      console.warn('[V2 desktop artwork] Canonical artwork request failed.', error?.message || error);
    }
    if (token !== operation || !desktopSurface()) return false;

    const selected = chooseHorizontal(images, song);
    if (!selected.url) return false;
    await preload(selected.url);
    if (token !== operation || !desktopSurface()) return false;

    const latestPlayer = player();
    const latestStage = stage(latestPlayer);
    const latestImage = activeMedia(latestStage);
    if (!latestPlayer || !latestStage || !isOfficialImage(latestImage, song)) return false;

    const applied = applyArtwork(latestPlayer, latestStage, latestImage, selected, song.key);
    if (!selected.exactHorizontal) {
      console.warn('[V2 desktop artwork] No 16x9 or 21x9 artwork exists. Showing the square image without cropping.', {
        song_key: song.key
      });
    }
    return applied;
  }

  async function applyCurrent(options = {}) {
    if (!desktopSurface()) return false;
    const currentPlayer = player();
    const currentIdentity = identity(currentPlayer);
    if (!currentPlayer || !currentIdentity.title) return false;
    const songs = await catalog();
    const song = findSong(songs, currentIdentity);
    if (!song) return false;
    return applyForSong(song, options);
  }

  function scheduleApply(delay = 80, options = {}) {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      applyCurrent(options).catch(error => {
        console.warn('[V2 desktop artwork] Horizontal artwork application failed.', error?.message || error);
      });
    }, delay);
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    activeSongKey = clean(detail.songKey);
    activeAssetSource = clean(detail?.asset?.source).toLowerCase();
    if (activeAssetSource !== 'official-artwork' || !desktopSurface()) return;
    scheduleApply(0);
  });

  document.addEventListener('pointerdown', event => {
    const songElement = event.target.closest?.('#v2App [data-song]');
    if (!songElement) return;
    const key = clean(songElement.dataset.song);
    if (key) artworkForSong(key).catch(() => {});
  }, true);

  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      if (record.type === 'childList') relevant = true;
      if (record.type === 'attributes' && record.target?.matches?.('[data-player]')) relevant = true;
      if (relevant) break;
    }
    if (relevant && activeAssetSource === 'official-artwork') scheduleApply(120);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });

  window.addEventListener('resize', () => {
    if (desktopSurface() && activeAssetSource === 'official-artwork') scheduleApply(140);
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    if (desktopSurface() && activeAssetSource === 'official-artwork') scheduleApply(180);
  }, { passive: true });

  window.StashboxDesktopOfficialArtwork16x9 = Object.freeze({
    refresh: () => scheduleApply(0, { force: true }),
    applyCurrent,
    desktopSurface
  });

  scheduleApply(200);
})();