(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/') || window.location.pathname.includes('/radio/artist/')) return;
  if (window.StashboxLoggedInPortraitArtworkLock) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const CACHE_KEY = 'stashbox_v2_logged_in_portrait_artwork_v1';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const PORTRAIT_ORDER = Object.freeze(['9x16', '3x4', '4x5', '1x1']);
  const requestCache = new Map();
  const imageCache = new Map();
  const retryTimers = new Map();

  let activeSongKey = '';
  let officialArtworkActive = false;
  let operation = 0;
  let mutationTimer = 0;

  const clean = value => String(value ?? '').trim();
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function loggedIn() {
    try {
      return Boolean(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken);
    } catch (_) {
      return false;
    }
  }

  function portraitSurface() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    return width <= 820 && height >= width * 1.15;
  }

  function activePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(player => (
      !player.hidden && getComputedStyle(player).display !== 'none' && getComputedStyle(player).visibility !== 'hidden'
    )) || null;
  }

  function stageFor(player) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function activeArtworkImage(stage) {
    return stage?.querySelector('img.v2-mobile-vec-media.is-active')
      || [...(stage?.querySelectorAll('img.v2-mobile-vec-media') || [])].at(-1)
      || null;
  }

  function canonicalUrl(value) {
    const fixed = fixUrl(value);
    if (!fixed) return '';
    try { return new URL(fixed, window.location.href).href; } catch (_) { return fixed; }
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeCache(songKey, images) {
    try {
      const cache = readCache();
      cache[songKey] = { images, saved_at: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function cachedImages(songKey) {
    const item = readCache()[songKey];
    return item?.images && typeof item.images === 'object' && !Array.isArray(item.images)
      ? item.images
      : {};
  }

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  function imagesFromPayload(data) {
    data = unwrap(data) || {};
    const media = data.media || data.data?.media || data;
    const images = media?.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : {};
    return {
      '1x1': fixUrl(images['1x1'] || media?.song_artwork_1x1_url || media?.song_artwork_url),
      '16x9': fixUrl(images['16x9'] || media?.song_artwork_16x9_url),
      '9x16': fixUrl(images['9x16'] || media?.song_artwork_9x16_url),
      '3x4': fixUrl(images['3x4'] || media?.song_artwork_3x4_url),
      '4x5': fixUrl(images['4x5'] || media?.song_artwork_4x5_url),
      '21x9': fixUrl(images['21x9'] || media?.song_artwork_21x9_url)
    };
  }

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function fetchArtwork(songKey) {
    if (requestCache.has(songKey)) return requestCache.get(songKey);
    const promise = (async () => {
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 18000);
        try {
          const response = await fetch(`${API}/radio/songs/${encodeURIComponent(songKey)}/artwork-images`, {
            cache: 'default',
            credentials: 'omit',
            signal: controller.signal
          });
          const text = await response.text();
          let body = {};
          try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
          if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
          const images = imagesFromPayload(body);
          writeCache(songKey, images);
          return images;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await delay(700 * attempt);
        } finally {
          window.clearTimeout(timer);
        }
      }
      throw lastError || new Error('Artwork lookup failed.');
    })().finally(() => requestCache.delete(songKey));
    requestCache.set(songKey, promise);
    return promise;
  }

  function preloadImage(url) {
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
      const timer = window.setTimeout(() => finish(false), 30000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });
    imageCache.set(source, promise);
    return promise;
  }

  function selectArtwork(images) {
    const source = PORTRAIT_ORDER.find(ratio => fixUrl(images?.[ratio])) || '';
    return {
      source,
      url: source ? fixUrl(images[source]) : FALLBACK,
      exact: source === '9x16'
    };
  }

  function installStyles() {
    if (document.getElementById('stashboxLoggedInPortraitArtworkStyles')) return;
    const style = document.createElement('style');
    style.id = 'stashboxLoggedInPortraitArtworkStyles';
    style.textContent = `
      #v2App [data-player].logged-in-portrait-artwork-lock [data-mobile-vec-stage] {
        background-position: center center !important;
        background-repeat: no-repeat !important;
        background-size: contain !important;
        background-color: #050607 !important;
      }
      #v2App [data-player].logged-in-portrait-artwork-lock [data-mobile-vec-stage] img.v2-mobile-vec-media {
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        object-position: center center !important;
      }
    `;
    document.head.appendChild(style);
  }

  function markLookupPending(player, stage) {
    if (!player || !stage) return;
    player.classList.add('logged-in-portrait-artwork-lock');
    player.dataset.loggedInPortraitArtworkState = 'lookup';
    stage.dataset.loggedInPortraitArtworkState = 'lookup';
  }

  function scheduleRetry(songKey) {
    const prior = retryTimers.get(songKey);
    if (prior) window.clearTimeout(prior);
    const timer = window.setTimeout(() => {
      retryTimers.delete(songKey);
      imageCache.delete(fixUrl(cachedImages(songKey)['9x16']));
      lockOfficialArtwork(songKey, { forceRefresh: true });
    }, 10000);
    retryTimers.set(songKey, timer);
  }

  function stillCurrent(songKey, token) {
    return token === operation
      && songKey === activeSongKey
      && officialArtworkActive
      && loggedIn()
      && portraitSurface();
  }

  async function applySelection(songKey, images, token) {
    if (!stillCurrent(songKey, token)) return;
    const player = activePlayer();
    const stage = stageFor(player);
    if (!player || !stage) return;

    const selected = selectArtwork(images);
    const image = activeArtworkImage(stage);
    player.classList.add('logged-in-portrait-artwork-lock');
    player.dataset.loggedInPortraitArtworkRatio = selected.source || 'placeholder';
    player.dataset.loggedInPortraitArtworkState = selected.exact ? 'loading-9x16' : 'loading-fallback';
    stage.dataset.loggedInPortraitArtworkRatio = selected.source || 'placeholder';
    stage.dataset.loggedInPortraitArtworkUrl = selected.url;
    stage.style.backgroundImage = `url("${selected.url.replaceAll('"', '%22')}")`;
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'contain';
    stage.style.backgroundColor = '#050607';

    if (image) {
      image.dataset.loggedInPortraitOfficialArtwork = 'true';
      image.dataset.responsiveOfficialArtwork = 'true';
      image.dataset.loggedInPortraitArtworkRatio = selected.source || 'placeholder';
      image.dataset.loggedInPortraitArtworkUrl = selected.url;
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.maxWidth = 'none';
      image.style.maxHeight = 'none';
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center center';
      if (canonicalUrl(image.currentSrc || image.src) !== canonicalUrl(selected.url)) image.src = selected.url;
    }

    const loaded = await preloadImage(selected.url);
    if (!stillCurrent(songKey, token)) return;
    const currentPlayer = activePlayer();
    const currentStage = stageFor(currentPlayer);
    const currentImage = activeArtworkImage(currentStage);
    if (!currentPlayer || !currentStage) return;

    if (loaded) {
      currentPlayer.dataset.loggedInPortraitArtworkState = selected.exact ? 'ready-9x16' : 'ready-fallback';
      currentStage.dataset.loggedInPortraitArtworkState = 'ready';
      currentStage.classList.add('responsive-artwork-surface-ready');
      if (currentImage) {
        currentImage.style.display = 'block';
        currentImage.style.opacity = '1';
      }
      return;
    }

    currentPlayer.dataset.loggedInPortraitArtworkState = selected.exact ? 'retrying-9x16' : 'fallback-load-failed';
    if (selected.exact) scheduleRetry(songKey);
  }

  async function lockOfficialArtwork(songKey, { forceRefresh = false } = {}) {
    const key = clean(songKey);
    if (!key || !loggedIn() || !portraitSurface()) return;
    activeSongKey = key;
    officialArtworkActive = true;
    const token = ++operation;
    const player = activePlayer();
    const stage = stageFor(player);
    markLookupPending(player, stage);

    const cached = cachedImages(key);
    if (cached['9x16'] && !forceRefresh) {
      applySelection(key, cached, token);
      fetchArtwork(key).then(images => {
        if (stillCurrent(key, token) && canonicalUrl(images['9x16']) !== canonicalUrl(cached['9x16'])) {
          applySelection(key, images, token);
        }
      }).catch(() => {});
      return;
    }

    try {
      const images = await fetchArtwork(key);
      await applySelection(key, images, token);
    } catch (error) {
      if (!stillCurrent(key, token)) return;
      const fallback = selectArtwork(cached);
      if (fallback.source) await applySelection(key, cached, token);
      else {
        const currentPlayer = activePlayer();
        if (currentPlayer) currentPlayer.dataset.loggedInPortraitArtworkState = 'lookup-retry';
        scheduleRetry(key);
      }
      console.warn('[Logged-in portrait artwork] Canonical artwork lookup deferred.', error?.message || error);
    }
  }

  function releaseLock() {
    officialArtworkActive = false;
    activeSongKey = '';
    operation += 1;
    const player = activePlayer();
    player?.classList.remove('logged-in-portrait-artwork-lock');
  }

  function enforceCurrentLock() {
    if (!officialArtworkActive || !activeSongKey || !loggedIn() || !portraitSurface()) return;
    const images = cachedImages(activeSongKey);
    const selected = selectArtwork(images);
    if (!selected.source) return;
    const player = activePlayer();
    const stage = stageFor(player);
    const image = activeArtworkImage(stage);
    if (!player || !stage) return;
    const stageUrl = canonicalUrl(stage.dataset.loggedInPortraitArtworkUrl);
    const imageUrl = canonicalUrl(image?.currentSrc || image?.src);
    if (stageUrl !== canonicalUrl(selected.url) || (image && imageUrl !== canonicalUrl(selected.url))) {
      applySelection(activeSongKey, images, operation);
    }
  }

  installStyles();

  window.addEventListener('stashbox:vec-asset-change', event => {
    if (!loggedIn() || !portraitSurface()) return;
    const asset = event?.detail?.asset || {};
    const songKey = clean(event?.detail?.songKey);
    const source = clean(asset.source).toLowerCase();
    if (source !== 'official-artwork') {
      releaseLock();
      return;
    }
    lockOfficialArtwork(songKey);
  });

  const observer = new MutationObserver(() => {
    if (!officialArtworkActive) return;
    window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(enforceCurrentLock, 40);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'style', 'class', 'hidden']
  });

  window.addEventListener('resize', () => {
    if (!portraitSurface()) releaseLock();
    else if (activeSongKey && officialArtworkActive) lockOfficialArtwork(activeSongKey);
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    if (!portraitSurface()) releaseLock();
    else if (activeSongKey && officialArtworkActive) lockOfficialArtwork(activeSongKey);
  }, { passive: true });
  window.addEventListener('online', () => {
    if (activeSongKey && officialArtworkActive) lockOfficialArtwork(activeSongKey, { forceRefresh: true });
  });
  window.addEventListener('stashbox:v2-auth-changed', event => {
    if (event?.detail?.loggedIn === false) releaseLock();
  });

  window.StashboxLoggedInPortraitArtworkLock = Object.freeze({
    portraitOrder: [...PORTRAIT_ORDER],
    refresh: () => activeSongKey && lockOfficialArtwork(activeSongKey, { forceRefresh: true })
  });
})();
