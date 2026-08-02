(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/dev/v2/') || path.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxMobileOfficialArtwork9x16) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const requestCache = new Map();
  const urlCache = new Map();
  const retryTimers = new Map();

  let activeSongKey = '';
  let activeAssetSource = '';
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

  function exact9x16FromPayload(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    const images = media?.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : {};
    return fixUrl(
      images['9x16'] ||
      media?.song_artwork_9x16_url ||
      data?.song_artwork_9x16_url
    );
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
        return url;
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
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(Boolean(loaded));
      };
      const timer = window.setTimeout(() => finish(false), 18000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });
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
    if (!player || !stage || !image) return false;

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
      if (activeSongKey === key && activeAssetSource === 'official-artwork') {
        enforceExact9x16(key, { force: true });
      }
    }, 5000);
    retryTimers.set(key, timer);
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
      const url = await fetchExact9x16(key, { force });
      if (!stillOfficial(key, token)) return;
      if (!url) {
        if (player) player.dataset.mobileOfficialArtworkState = 'missing-9x16';
        if (stage) stage.dataset.mobileOfficialArtworkState = 'missing-9x16';
        return;
      }
      const loaded = await preload(url);
      if (!stillOfficial(key, token)) return;
      if (!loaded || !applyExactArtwork(key, url, token)) {
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

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const asset = detail.asset || {};
    activeSongKey = clean(detail.songKey);
    activeAssetSource = clean(asset.source).toLowerCase();
    operation += 1;
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      enforceExact9x16(activeSongKey);
    }
  });

  window.addEventListener('stashbox:player-view-mode-change', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      window.setTimeout(() => enforceExact9x16(activeSongKey), 0);
    }
  });

  window.addEventListener('resize', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      enforceExact9x16(activeSongKey);
    }
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
        enforceExact9x16(activeSongKey);
      }
    }, 120);
  }, { passive: true });

  window.addEventListener('online', () => {
    if (activeSongKey && activeAssetSource === 'official-artwork' && mobilePortrait()) {
      enforceExact9x16(activeSongKey, { force: true });
    }
  });

  window.StashboxMobileOfficialArtwork9x16 = Object.freeze({
    refresh: () => activeSongKey && enforceExact9x16(activeSongKey, { force: true }),
    state: () => ({ songKey: activeSongKey, source: activeAssetSource, mobilePortrait: mobilePortrait() })
  });
})();
