(() => {
  'use strict';

  const path = window.location.pathname;
  const isMain = path.includes('/radio/attempt2/') && !path.includes('/radio/attempt2/artist/');
  const isArtist = path.includes('/radio/attempt2/artist/');
  if (!isMain && !isArtist) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const ARTWORK_CACHE_KEY = 'stashbox_v2_responsive_artwork_cache_v3';
  const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const PORTRAIT_ORDER = Object.freeze(['9x16', '3x4', '4x5', '1x1']);
  const LANDSCAPE_ORDER = Object.freeze(['16x9', '21x9', '1x1']);
  const ULTRAWIDE_ORDER = Object.freeze(['21x9', '16x9', '1x1']);
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const imageLoads = new Map();
  const artworkRequests = new Map();
  const retryTimers = new Map();
  let catalogPromise = null;
  let applyTimer = 0;
  let applySequence = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function emptyCache() {
    return { saved_at: 0, catalog: [], artwork: {} };
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ARTWORK_CACHE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return emptyCache();
      return {
        saved_at: Number(parsed.saved_at || 0),
        catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
        artwork: parsed.artwork && typeof parsed.artwork === 'object' && !Array.isArray(parsed.artwork)
          ? parsed.artwork
          : {}
      };
    } catch (_) {
      return emptyCache();
    }
  }

  function writeCache(mutator) {
    try {
      const cache = readCache();
      const next = mutator(cache) || cache;
      next.saved_at = Date.now();
      localStorage.setItem(ARTWORK_CACHE_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return null;
    }
  }

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

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function getJson(url, { attempts = 2, timeout = 14000 } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          cache: 'default',
          credentials: 'omit',
          signal: controller.signal
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
        body = unwrap(body);
        if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
        return body;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await delay(500 * attempt);
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError || new Error('Request failed.');
  }

  function assetImages(song) {
    const images = {};
    const direct = song?.images && typeof song.images === 'object'
      ? song.images
      : (song?.artwork_images && typeof song.artwork_images === 'object' ? song.artwork_images : {});
    const prepared = song?.prepared_artwork_images && typeof song.prepared_artwork_images === 'object'
      ? song.prepared_artwork_images
      : {};

    images['1x1'] = fixUrl(
      direct['1x1'] ||
      prepared['1x1'] ||
      song?.song_artwork_1x1_url ||
      song?.resolved_artwork_url ||
      song?.song_artwork_url ||
      song?.artwork_url ||
      song?.cover_art_url ||
      song?.image_url
    );
    images['16x9'] = fixUrl(direct['16x9'] || prepared['16x9'] || song?.song_artwork_16x9_url);
    images['9x16'] = fixUrl(direct['9x16'] || prepared['9x16'] || song?.song_artwork_9x16_url);
    images['3x4'] = fixUrl(direct['3x4'] || prepared['3x4'] || song?.song_artwork_3x4_url);
    images['4x5'] = fixUrl(direct['4x5'] || prepared['4x5'] || song?.song_artwork_4x5_url);
    images['21x9'] = fixUrl(direct['21x9'] || prepared['21x9'] || song?.song_artwork_21x9_url);

    const visualAssets = Array.isArray(song?.visual_assets) ? song.visual_assets : [];
    for (const asset of visualAssets) {
      const source = clean(asset?.source).toLowerCase();
      if (!source.startsWith('song_profile_image:')) continue;
      const ratio = source.slice('song_profile_image:'.length);
      const url = fixUrl(asset?.url || asset?.src);
      if (url && Object.prototype.hasOwnProperty.call(images, ratio) && !images[ratio]) images[ratio] = url;
    }
    return images;
  }

  function normalizeSong(row, index = 0) {
    const images = assetImages(row);
    return {
      key: clean(row?.song_key || row?.songKey || row?.id || `song-${index}`),
      title: clean(row?.display_title || row?.song_name || row?.title),
      artist: clean(row?.artist || row?.artist_name || 'Stashbox'),
      images
    };
  }

  function cachedCatalog() {
    return readCache().catalog.map((song, index) => normalizeSong(song, index)).filter(song => song.key && song.title);
  }

  async function refreshCatalog() {
    const data = await getJson(SONGS_URL, { attempts: 2, timeout: 16000 });
    const songs = rows(data).map(normalizeSong).filter(song => song.key && song.title);
    writeCache(cache => ({ ...cache, catalog: songs }));
    return songs;
  }

  function catalog() {
    if (catalogPromise) return catalogPromise;
    const cached = cachedCatalog();
    if (cached.length) {
      catalogPromise = Promise.resolve(cached);
      refreshCatalog().then(songs => {
        catalogPromise = Promise.resolve(songs);
        scheduleApply(0);
      }).catch(() => {});
      return catalogPromise;
    }
    catalogPromise = refreshCatalog().catch(error => {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }

  function cachedArtwork(song) {
    const cached = readCache().artwork[song.key];
    const images = {
      ...song.images,
      ...(cached?.images && typeof cached.images === 'object' ? cached.images : {})
    };
    return {
      images: Object.fromEntries(Object.entries(images).map(([ratio, url]) => [ratio, fixUrl(url)])),
      fetched_at: Number(cached?.fetched_at || 0)
    };
  }

  function artworkFromPayload(data, song) {
    data = unwrap(data) || {};
    const media = data.media || data.data?.media || data;
    const images = media?.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : {};
    return {
      ...song.images,
      '1x1': fixUrl(images['1x1'] || media?.song_artwork_1x1_url || media?.song_artwork_url || song.images['1x1']),
      '16x9': fixUrl(images['16x9'] || media?.song_artwork_16x9_url || song.images['16x9']),
      '9x16': fixUrl(images['9x16'] || media?.song_artwork_9x16_url || song.images['9x16']),
      '3x4': fixUrl(images['3x4'] || media?.song_artwork_3x4_url || song.images['3x4']),
      '4x5': fixUrl(images['4x5'] || media?.song_artwork_4x5_url || song.images['4x5']),
      '21x9': fixUrl(images['21x9'] || media?.song_artwork_21x9_url || song.images['21x9'])
    };
  }

  async function refreshArtwork(song) {
    const url = `${API}/radio/songs/${encodeURIComponent(song.key)}/artwork-images`;
    const data = await getJson(url, { attempts: 2, timeout: 16000 });
    const images = artworkFromPayload(data, song);
    writeCache(cache => ({
      ...cache,
      artwork: {
        ...cache.artwork,
        [song.key]: { images, fetched_at: Date.now() }
      }
    }));
    return images;
  }

  async function artworkForSong(song, { force = false } = {}) {
    const cached = cachedArtwork(song);
    const freshEnough = cached.fetched_at && Date.now() - cached.fetched_at < CACHE_MAX_AGE_MS;
    if (!force && Object.values(cached.images).some(Boolean)) {
      if (!freshEnough && !artworkRequests.has(song.key)) {
        artworkRequests.set(song.key, refreshArtwork(song)
          .then(images => { scheduleApply(0); return images; })
          .catch(() => cached.images)
          .finally(() => artworkRequests.delete(song.key)));
      }
      return cached.images;
    }
    if (!artworkRequests.has(song.key)) {
      artworkRequests.set(song.key, refreshArtwork(song)
        .catch(error => {
          if (Object.values(cached.images).some(Boolean)) return cached.images;
          throw error;
        })
        .finally(() => artworkRequests.delete(song.key)));
    }
    return artworkRequests.get(song.key);
  }

  function slowConnection() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return Boolean(connection?.saveData || /(^|-)2g$|slow-2g/i.test(clean(connection?.effectiveType)));
  }

  function preload(url, { preferred = false } = {}) {
    const source = fixUrl(url);
    if (!source) return Promise.resolve(false);
    if (imageLoads.has(source)) return imageLoads.get(source);

    const timeout = preferred ? (slowConnection() ? 24000 : 16000) : (slowConnection() ? 12000 : 8000);
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
      const timer = window.setTimeout(() => finish(false), timeout);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });
    imageLoads.set(source, promise);
    return promise;
  }

  function surfaceSize(surface) {
    const rect = surface?.getBoundingClientRect?.();
    if (rect?.width >= 100 && rect?.height >= 100) return { width: rect.width, height: rect.height };
    return {
      width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
      height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
    };
  }

  function requestedRatio(surface) {
    const { width, height } = surfaceSize(surface);
    const aspect = width / Math.max(1, height);
    if (width <= 820 && height >= width * 1.15) return '9x16';
    if (width >= 1440 && aspect >= 1.9) return '21x9';
    return '16x9';
  }

  function ratioOrder(requested) {
    if (requested === '9x16') return PORTRAIT_ORDER;
    if (requested === '21x9') return ULTRAWIDE_ORDER;
    return LANDSCAPE_ORDER;
  }

  async function selectLoadable(images, requested) {
    const order = ratioOrder(requested);
    const available = order.filter(ratio => fixUrl(images[ratio]));
    if (!available.length) {
      return { requested, source: '', url: FALLBACK_ART, exact: false, awaitingExact: false };
    }

    const preferredRatio = available[0] === requested ? requested : '';
    const preloadTasks = new Map(available.map(ratio => [
      ratio,
      preload(images[ratio], { preferred: ratio === requested })
    ]));

    if (preferredRatio && await preloadTasks.get(preferredRatio)) {
      return { requested, source: preferredRatio, url: images[preferredRatio], exact: true, awaitingExact: false };
    }

    const results = await Promise.all(available
      .filter(ratio => ratio !== preferredRatio)
      .map(async ratio => [ratio, await preloadTasks.get(ratio)]));
    const source = order.find(ratio => results.some(([candidate, loaded]) => candidate === ratio && loaded)) || '';
    if (source) {
      return {
        requested,
        source,
        url: images[source],
        exact: source === requested,
        awaitingExact: Boolean(requested === '9x16' && images['9x16'] && source !== '9x16')
      };
    }

    return {
      requested,
      source: 'placeholder',
      url: FALLBACK_ART,
      exact: false,
      awaitingExact: Boolean(requested === '9x16' && images['9x16'])
    };
  }

  function findSong(songs, title, artist) {
    const titleKey = normalize(title);
    const artistKey = normalize(artist);
    return songs.find(song => normalize(song.title) === titleKey && (!artistKey || normalize(song.artist) === artistKey))
      || songs.find(song => normalize(song.title) === titleKey)
      || null;
  }

  function canonicalUrl(value) {
    const fixed = fixUrl(value);
    if (!fixed) return '';
    try { return new URL(fixed, window.location.href).href; } catch (_) { return fixed; }
  }

  function setSurfaceBackground(surface, selected) {
    if (!surface || !selected?.url) return;
    const safeUrl = selected.url.replaceAll('"', '%22');
    const backgroundImage = `url("${safeUrl}")`;
    if (surface.style.backgroundImage !== backgroundImage) surface.style.backgroundImage = backgroundImage;
    if (surface.style.backgroundPosition !== 'center center') surface.style.backgroundPosition = 'center center';
    if (surface.style.backgroundRepeat !== 'no-repeat') surface.style.backgroundRepeat = 'no-repeat';
    if (surface.style.backgroundSize !== 'contain') surface.style.backgroundSize = 'contain';
    if (surface.style.backgroundColor !== 'rgb(5, 6, 7)' && surface.style.backgroundColor !== '#050607') {
      surface.style.backgroundColor = '#050607';
    }
    if (surface.dataset.portraitRuleArtworkUrl !== selected.url) surface.dataset.portraitRuleArtworkUrl = selected.url;
    if (surface.dataset.songArtworkRequestedRatio !== selected.requested) surface.dataset.songArtworkRequestedRatio = selected.requested;
    if (surface.dataset.songArtworkSourceRatio !== selected.source) surface.dataset.songArtworkSourceRatio = selected.source;
    surface.classList.add('responsive-artwork-surface-ready');
  }

  function officialUrlSet(images) {
    return new Set([FALLBACK_ART, ...Object.values(images || {})].map(canonicalUrl).filter(Boolean));
  }

  function applyImage(image, selected, images) {
    if (!image || image.tagName !== 'IMG') return;
    const current = canonicalUrl(image.currentSrc || image.src);
    const prior = canonicalUrl(image.dataset.responsiveArtworkUrl || image.dataset.portraitRuleArtworkUrl);
    const official = officialUrlSet(images);
    const knownOfficial = image.dataset.responsiveOfficialArtwork === 'true'
      || image.dataset.portraitRuleOfficialArtwork === 'true'
      || official.has(current)
      || Boolean(prior && current === prior);
    if (!knownOfficial) return;

    if (image.style.display !== 'block') image.style.display = 'block';
    if (image.style.width !== '100%') image.style.width = '100%';
    if (image.style.height !== '100%') image.style.height = '100%';
    if (image.style.maxWidth !== 'none') image.style.maxWidth = 'none';
    if (image.style.maxHeight !== 'none') image.style.maxHeight = 'none';
    if (image.style.objectFit !== 'contain') image.style.objectFit = 'contain';
    if (image.style.objectPosition !== 'center center') image.style.objectPosition = 'center center';
    image.dataset.responsiveOfficialArtwork = 'true';
    image.dataset.portraitRuleOfficialArtwork = 'true';
    image.dataset.responsiveArtworkUrl = selected.url;
    image.dataset.portraitRuleArtworkUrl = selected.url;
    image.dataset.responsiveArtworkRatio = selected.source;
    image.dataset.responsiveArtworkRequestedRatio = selected.requested;

    if (current !== canonicalUrl(selected.url)) image.src = selected.url;
    image.addEventListener('error', () => {
      image.style.display = 'none';
    }, { once: true });
    image.addEventListener('load', () => {
      image.style.display = 'block';
    }, { once: true });
  }

  function markReady(player, selected) {
    if (!player) return;
    player.classList.remove('responsive-artwork-pending');
    player.classList.add('responsive-artwork-ready');
    player.classList.toggle('has-exact-responsive-artwork', selected.exact);
    player.dataset.songArtworkRequestedRatio = selected.requested;
    player.dataset.songArtworkSourceRatio = selected.source;
    player.dataset.responsiveArtworkUrl = selected.url;
    player.dataset.portraitArtworkAwaitingExact = selected.awaitingExact ? 'true' : 'false';
    player.setAttribute('aria-busy', 'false');
  }

  function scheduleExactRetry(songKey, callback) {
    const existing = retryTimers.get(songKey);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      retryTimers.delete(songKey);
      callback();
    }, slowConnection() ? 18000 : 10000);
    retryTimers.set(songKey, timer);
  }

  async function applyMain() {
    const player = [...document.querySelectorAll('[data-player]')].find(candidate => (
      !candidate.hidden && getComputedStyle(candidate).display !== 'none' && getComputedStyle(candidate).visibility !== 'hidden'
    ));
    if (!player) return;
    const title = clean(player.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(player.querySelector('[data-partist]')?.textContent);
    if (!title) return;

    const sequence = ++applySequence;
    const songs = await catalog();
    const song = findSong(songs, title, artist);
    if (!song || sequence !== applySequence) return;

    const images = await artworkForSong(song);
    if (sequence !== applySequence) return;
    const stage = player.querySelector('[data-mobile-vec-stage]');
    const backdrop = player.querySelector('[data-backdrop]');
    const surface = stage || backdrop || player;
    const selected = await selectLoadable(images, requestedRatio(surface));
    if (sequence !== applySequence) return;

    if (stage) {
      setSurfaceBackground(stage, selected);
      const activeImage = stage.querySelector('img.v2-mobile-vec-media.is-active')
        || [...stage.querySelectorAll('img.v2-mobile-vec-media')].at(-1)
        || null;
      applyImage(activeImage, selected, images);
      if (backdrop) {
        if (backdrop.style.backgroundImage !== 'none') backdrop.style.backgroundImage = 'none';
        backdrop.classList.remove('responsive-artwork-surface-ready');
      }
    } else {
      setSurfaceBackground(backdrop, selected);
    }
    markReady(player, selected);

    if (selected.awaitingExact) {
      scheduleExactRetry(song.key, () => {
        imageLoads.delete(fixUrl(images['9x16']));
        scheduleApply(0);
      });
    }
  }

  async function applyArtist() {
    const realm = document.querySelector('.artist-realm-player:not([hidden])');
    if (!realm || getComputedStyle(realm).display === 'none') return;
    const stage = realm.querySelector('[data-realm-stage]');
    const title = clean(realm.querySelector('[data-realm-title]')?.textContent);
    const artist = clean(realm.querySelector('[data-realm-artist]')?.textContent);
    if (!stage || !title) return;

    const sequence = ++applySequence;
    const songs = await catalog();
    const song = findSong(songs, title, artist);
    if (!song || sequence !== applySequence) return;

    const images = await artworkForSong(song);
    if (sequence !== applySequence) return;
    const selected = await selectLoadable(images, requestedRatio(stage));
    if (sequence !== applySequence) return;

    setSurfaceBackground(stage, selected);
    const activeImage = stage.querySelector('img.artist-realm-media.is-active')
      || [...stage.querySelectorAll('img.artist-realm-media')].at(-1)
      || null;
    applyImage(activeImage, selected, images);
    stage.dataset.songArtworkRequestedRatio = selected.requested;
    stage.dataset.songArtworkSourceRatio = selected.source;
    stage.dataset.portraitArtworkAwaitingExact = selected.awaitingExact ? 'true' : 'false';

    if (selected.awaitingExact) {
      scheduleExactRetry(song.key, () => {
        imageLoads.delete(fixUrl(images['9x16']));
        scheduleApply(0);
      });
    }
  }

  async function applyRule() {
    try {
      if (isArtist) await applyArtist();
      else await applyMain();
    } catch (error) {
      console.warn('[Stashbox portrait artwork rule] Artwork refresh deferred.', error?.message || error);
      window.setTimeout(() => scheduleApply(0), slowConnection() ? 12000 : 6000);
    }
  }

  function scheduleApply(delayMs = 45) {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyRule, delayMs);
  }

  async function prefetchSong(songKey) {
    const key = clean(songKey);
    if (!key) return;
    try {
      const songs = await catalog();
      const song = songs.find(item => item.key === key);
      if (!song) return;
      const images = await artworkForSong(song);
      const surface = isArtist
        ? document.querySelector('.artist-realm-player:not([hidden]) [data-realm-stage]')
        : document.querySelector('[data-player] [data-mobile-vec-stage], [data-player] [data-backdrop]');
      const requested = requestedRatio(surface);
      const exact = fixUrl(images[requested]);
      if (exact) preload(exact, { preferred: true });
    } catch (_) {}
  }

  function retryImage(image) {
    if (!image || image.tagName !== 'IMG') return;
    const current = clean(image.currentSrc || image.src);
    if (!current || current.endsWith(FALLBACK_ART)) return;
    if (!image.dataset.stashboxOriginalSrc) image.dataset.stashboxOriginalSrc = current;
    const attempts = Number(image.dataset.stashboxImageRetry || 0);
    if (attempts >= 2) {
      image.src = FALLBACK_ART;
      image.dataset.stashboxImageFallback = 'true';
      return;
    }
    image.dataset.stashboxImageRetry = String(attempts + 1);
    window.setTimeout(() => {
      const original = clean(image.dataset.stashboxOriginalSrc);
      if (!original || !image.isConnected) return;
      try {
        const url = new URL(original, window.location.href);
        url.searchParams.set('stashbox_retry', String(attempts + 1));
        image.src = url.href;
      } catch (_) {
        image.src = original;
      }
    }, attempts === 0 ? 1800 : 6500);
  }

  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName === 'IMG') retryImage(image);
  }, true);

  function retryFallbackImages() {
    document.querySelectorAll('img[data-stashbox-image-fallback="true"]').forEach(image => {
      const original = clean(image.dataset.stashboxOriginalSrc);
      if (!original) return;
      image.dataset.stashboxImageRetry = '0';
      image.dataset.stashboxImageFallback = 'false';
      image.src = original;
    });
  }

  document.addEventListener('pointerdown', event => {
    const songElement = event.target.closest?.('[data-song]');
    if (songElement?.dataset.song) prefetchSong(songElement.dataset.song);
  }, true);

  window.addEventListener('stashbox:vec-asset-change', () => scheduleApply(20));
  window.addEventListener('resize', () => scheduleApply(0), { passive: true });
  window.addEventListener('orientationchange', () => scheduleApply(0), { passive: true });
  window.addEventListener('online', () => {
    retryFallbackImages();
    scheduleApply(0);
  });

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => {
      if (mutation.type === 'characterData') return true;
      const target = mutation.target?.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
      return Boolean(target?.closest?.(
        '[data-player], [data-mobile-vec-stage], [data-ptitle], [data-partist], .artist-realm-player, [data-realm-stage], [data-realm-title], [data-realm-artist]'
      ));
    });
    if (relevant) scheduleApply(30);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'src', 'style']
  });

  window.StashboxPortraitArtworkRule = Object.freeze({
    portraitOrder: [...PORTRAIT_ORDER],
    refresh: () => scheduleApply(0),
    prefetchSong
  });

  document.addEventListener('DOMContentLoaded', () => scheduleApply(0), { once: true });
  scheduleApply(0);
})();
