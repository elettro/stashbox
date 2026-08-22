(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/attempt2/') || path.includes('/radio/attempt2/artist/')) return;
  if (window.StashboxMobileOfficialArtwork9x16) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const RESPONSIVE_CACHE_KEY = 'stashbox_v2_responsive_artwork_cache_v3';
  const requestCache = new Map();
  const urlCache = new Map();
  const imageLoads = new Map();
  const retryTimers = new Map();

  let activeSongKey = '';
  let activeAssetSource = '';
  let catalogPromise = null;
  let operation = 0;

  const clean = value => String(value ?? '').trim();
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

  function mobilePortrait() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    return width <= 820 && height >= width * 1.15;
  }

  function activePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(player => (
      !player.hidden &&
      getComputedStyle(player).display !== 'none' &&
      getComputedStyle(player).visibility !== 'hidden'
    )) || null;
  }

  function activeStage(player) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function activeImage(stage) {
    return stage?.querySelector('img.v2-mobile-vec-media.is-active')
      || [...(stage?.querySelectorAll('img.v2-mobile-vec-media') || [])].at(-1)
      || null;
  }

  function canonicalUrl(value) {
    const source = fixUrl(value);
    if (!source) return '';
    try { return new URL(source, window.location.href).href; } catch (_) { return source; }
  }

  function songKeyFromRow(row, index = 0) {
    return clean(row?.song_key || row?.songKey || row?.id || `song-${index}`);
  }

  function exact9x16FromRow(row) {
    const direct = row?.images && typeof row.images === 'object'
      ? row.images
      : (row?.artwork_images && typeof row.artwork_images === 'object' ? row.artwork_images : {});
    const prepared = row?.prepared_artwork_images && typeof row.prepared_artwork_images === 'object'
      ? row.prepared_artwork_images
      : {};

    let url = fixUrl(
      direct['9x16'] ||
      prepared['9x16'] ||
      row?.song_artwork_9x16_url
    );

    if (!url && Array.isArray(row?.visual_assets)) {
      const asset = row.visual_assets.find(candidate => (
        clean(candidate?.source).toLowerCase() === 'song_profile_image:9x16'
      ));
      url = fixUrl(asset?.url || asset?.src);
    }
    return url;
  }

  function exact9x16FromPayload(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    return exact9x16FromRow(media) || exact9x16FromRow(data);
  }

  function cacheSongRows(songRows) {
    songRows.forEach((row, index) => {
      const key = songKeyFromRow(row, index);
      const url = exact9x16FromRow(row);
      if (key && url) urlCache.set(key, url);
    });
  }

  function seedFromResponsiveCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(RESPONSIVE_CACHE_KEY) || 'null');
      if (!cached || typeof cached !== 'object') return;
      if (Array.isArray(cached.catalog)) cacheSongRows(cached.catalog);
      if (cached.artwork && typeof cached.artwork === 'object') {
        for (const [songKey, entry] of Object.entries(cached.artwork)) {
          const url = fixUrl(entry?.images?.['9x16']);
          if (songKey && url) urlCache.set(songKey, url);
        }
      }
    } catch (_) {}
  }

  async function warmCatalog({ force = false } = {}) {
    if (catalogPromise && !force) return catalogPromise;
    catalogPromise = (async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 16000);
      try {
        const response = await fetch(SONGS_URL, {
          cache: force ? 'no-store' : 'default',
          credentials: 'omit',
          signal: controller.signal
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
        if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
        cacheSongRows(rows(body));
        return urlCache;
      } finally {
        window.clearTimeout(timer);
      }
    })().catch(error => {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }

  async function fetchExact9x16(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return '';
    if (!force && urlCache.has(key)) return urlCache.get(key);
    if (requestCache.has(key)) return requestCache.get(key);

    const promise = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetch(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`, {
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
        if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
        const url = exact9x16FromPayload(body);
        if (url) urlCache.set(key, url);
        return url || urlCache.get(key) || '';
      } finally {
        window.clearTimeout(timeout);
      }
    })().finally(() => requestCache.delete(key));

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
      const timer = window.setTimeout(() => finish(false), 18000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageLoads.set(source, promise);
    return promise;
  }

  function stillOfficial(songKey, token) {
    return token === operation
      && clean(songKey) === activeSongKey
      && activeAssetSource === 'official-artwork'
      && mobilePortrait();
  }

  function applyExactArtwork(songKey, url, token) {
    if (!stillOfficial(songKey, token)) return false;
    const player = activePlayer();
    const stage = activeStage(player);
    const image = activeImage(stage);
    if (!player || !stage || !image || !url) return false;

    const safeUrl = url.replaceAll('"', '%22');
    stage.style.backgroundImage = `url("${safeUrl}")`;
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'contain';
    stage.style.backgroundColor = '#050607';
    stage.dataset.songArtworkRequestedRatio = '9x16';
    stage.dataset.songArtworkSourceRatio = '9x16';
    stage.dataset.mobileOfficialArtworkState = 'ready-9x16';
    stage.dataset.mobileOfficialArtworkUrl = url;
    stage.classList.add('responsive-artwork-surface-ready');

    image.dataset.responsiveOfficialArtwork = 'true';
    image.dataset.mobileOfficialArtwork = 'true';
    image.dataset.responsiveArtworkRequestedRatio = '9x16';
    image.dataset.responsiveArtworkRatio = '9x16';
    image.dataset.mobileOfficialArtworkUrl = url;
    image.style.display = 'block';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    image.style.objectFit = 'contain';
    image.style.objectPosition = 'center center';
    image.style.opacity = '1';

    if (canonicalUrl(image.currentSrc || image.src) !== canonicalUrl(url)) image.src = url;

    player.dataset.songArtworkRequestedRatio = '9x16';
    player.dataset.songArtworkSourceRatio = '9x16';
    player.dataset.mobileOfficialArtworkState = 'ready-9x16';
    player.dataset.mobileOfficialArtworkUrl = url;
    player.classList.add('responsive-artwork-ready', 'has-exact-responsive-artwork');
    player.classList.remove('responsive-artwork-pending');
    player.setAttribute('aria-busy', 'false');
    return true;
  }

  function scheduleRetry(songKey) {
    const key = clean(songKey);
    if (!key) return;
    const prior = retryTimers.get(key);
    if (prior) window.clearTimeout(prior);
    const timer = window.setTimeout(() => {
      retryTimers.delete(key);
      imageLoads.delete(fixUrl(urlCache.get(key)));
      if (activeSongKey === key && activeAssetSource === 'official-artwork') {
        enforceExact9x16(key, { force: true });
      }
    }, 3500);
    retryTimers.set(key, timer);
  }

  async function warmSong(songKey) {
    const key = clean(songKey);
    if (!key || !mobilePortrait()) return '';
    seedFromResponsiveCache();
    let url = urlCache.get(key) || '';
    if (!url) {
      try {
        await warmCatalog();
        url = urlCache.get(key) || '';
      } catch (_) {}
    }
    if (!url) {
      try { url = await fetchExact9x16(key); } catch (_) { url = ''; }
    }
    if (url) preload(url);
    return url;
  }

  async function enforceExact9x16(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key || !mobilePortrait() || activeAssetSource !== 'official-artwork') return;
    const token = ++operation;
    const player = activePlayer();
    const stage = activeStage(player);
    if (player) player.dataset.mobileOfficialArtworkState = 'loading-9x16';
    if (stage) stage.dataset.mobileOfficialArtworkState = 'loading-9x16';

    try {
      seedFromResponsiveCache();
      let url = !force ? (urlCache.get(key) || '') : '';
      if (!url) {
        try {
          await warmCatalog({ force: false });
          url = urlCache.get(key) || '';
        } catch (_) {}
      }
      if (!url) url = await fetchExact9x16(key, { force });
      if (!stillOfficial(key, token)) return;
      if (!url) {
        if (player) player.dataset.mobileOfficialArtworkState = 'missing-9x16';
        if (stage) stage.dataset.mobileOfficialArtworkState = 'missing-9x16';
        return;
      }

      // Swap immediately. The URL is normally already browser-warmed from pointerdown.
      const applied = applyExactArtwork(key, url, token);
      const loaded = await preload(url);
      if (!stillOfficial(key, token)) return;
      if (!loaded || !applied) {
        if (player) player.dataset.mobileOfficialArtworkState = 'retrying-9x16';
        if (stage) stage.dataset.mobileOfficialArtworkState = 'retrying-9x16';
        scheduleRetry(key);
      }
    } catch (error) {
      if (!stillOfficial(key, token)) return;
      if (player) player.dataset.mobileOfficialArtworkState = 'retrying-9x16';
      if (stage) stage.dataset.mobileOfficialArtworkState = 'retrying-9x16';
      scheduleRetry(key);
      console.warn('[Mobile official artwork 9x16] Canonical artwork lookup deferred.', error?.message || error);
    }
  }

  function applyCachedImmediately(songKey) {
    const key = clean(songKey);
    const url = urlCache.get(key) || '';
    if (!key || !url || !mobilePortrait() || activeAssetSource !== 'official-artwork') return false;
    const token = ++operation;
    const applied = applyExactArtwork(key, url, token);
    preload(url).then(loaded => {
      if (!loaded && stillOfficial(key, token)) scheduleRetry(key);
    });
    return applied;
  }

  function prefetchFromElement(element) {
    const songElement = element?.closest?.('#v2App [data-song]');
    const songKey = clean(songElement?.dataset?.song);
    if (songKey) warmSong(songKey);
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const asset = detail.asset || {};
    activeSongKey = clean(detail.songKey);
    activeAssetSource = clean(asset.source).toLowerCase();
    operation += 1;

    if (!activeSongKey || activeAssetSource !== 'official-artwork' || !mobilePortrait()) return;
    seedFromResponsiveCache();
    if (!applyCachedImmediately(activeSongKey)) enforceExact9x16(activeSongKey);
  });

  document.addEventListener('pointerdown', event => prefetchFromElement(event.target), true);
  document.addEventListener('touchstart', event => prefetchFromElement(event.target), { capture: true, passive: true });
  document.addEventListener('focusin', event => prefetchFromElement(event.target), true);

  window.addEventListener('stashbox:player-view-mode-change', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      window.setTimeout(() => {
        if (!applyCachedImmediately(activeSongKey)) enforceExact9x16(activeSongKey);
      }, 0);
    }
  });

  window.addEventListener('resize', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      if (!applyCachedImmediately(activeSongKey)) enforceExact9x16(activeSongKey);
    }
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
        if (!applyCachedImmediately(activeSongKey)) enforceExact9x16(activeSongKey);
      }
    }, 120);
  }, { passive: true });

  window.addEventListener('online', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      enforceExact9x16(activeSongKey, { force: true });
    }
  });

  seedFromResponsiveCache();
  warmCatalog().catch(() => {});

  window.StashboxMobileOfficialArtwork9x16 = Object.freeze({
    refresh: () => {
      seedFromResponsiveCache();
      if (activeSongKey && activeAssetSource === 'official-artwork') {
        enforceExact9x16(activeSongKey, { force: true });
      }
    },
    prefetchSong: warmSong,
    cachedUrl: songKey => urlCache.get(clean(songKey)) || ''
  });
})();
