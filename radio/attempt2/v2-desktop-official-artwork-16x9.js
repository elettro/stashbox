(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/attempt2/') || path.includes('/radio/attempt2/artist/')) return;
  if (window.StashboxDesktopOfficialArtwork16x9) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const DESKTOP_MIN_WIDTH = 900;
  const ULTRAWIDE_THRESHOLD = 1.82;
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const artworkCache = new Map();
  const requestCache = new Map();
  const imageCache = new Map();

  let songsPromise = null;
  let currentSongKey = '';
  let currentSelection = null;
  let operation = 0;
  let scheduled = 0;
  let resizeTimer = 0;
  let installTimer = 0;
  let titleObserver = null;
  let observedTitle = null;
  let stageObserver = null;
  let observedStage = null;

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

  function activePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function activeStage(player = activePlayer()) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function surfaceRatio(player = activePlayer()) {
    const surface = activeStage(player) || player;
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    const height = Math.max(1, rect?.height || window.innerHeight || 1);
    return width / height;
  }

  function desktopSurface(player = activePlayer()) {
    const surface = activeStage(player) || player;
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    return width >= DESKTOP_MIN_WIDTH && surfaceRatio(player) >= 1.2;
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
        square: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK_ART
      })).filter(item => item.key && item.title));
    }
    return songsPromise;
  }

  function playerIdentity(player = activePlayer()) {
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent)
    };
  }

  function findSong(list, identity) {
    const title = normalize(identity?.title);
    const artist = normalize(identity?.artist);
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
      const timer = window.setTimeout(() => finish(false), 10000);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageCache.set(source, promise);
    return promise;
  }

  function choose(images, song, player = activePlayer()) {
    const ratio = surfaceRatio(player);
    if (ratio >= ULTRAWIDE_THRESHOLD && images?.['21x9']) {
      return { url: images['21x9'], ratio: '21x9', exact: true };
    }
    if (images?.['16x9']) return { url: images['16x9'], ratio: '16x9', exact: true };
    if (images?.['21x9']) return { url: images['21x9'], ratio: '21x9', exact: true };
    return { url: images?.['1x1'] || song?.square || FALLBACK_ART, ratio: '1x1', exact: false };
  }

  function clearOldOfficialPlaceholders(stage = activeStage()) {
    stage?.querySelectorAll('[data-desktop-official-placeholder="true"]').forEach(image => {
      image.style.removeProperty('opacity');
      image.style.removeProperty('visibility');
      image.style.removeProperty('pointer-events');
      delete image.dataset.desktopOfficialPlaceholder;
    });
  }

  function markOfficialPlaceholder(stage = activeStage()) {
    if (!stage || !desktopSurface()) return false;
    const image = [...stage.querySelectorAll('img.v2-mobile-vec-media')].at(-1);
    if (!image) return false;
    image.dataset.desktopOfficialPlaceholder = 'true';
    image.dataset.vecAssetSource = 'official-artwork';
    image.style.setProperty('opacity', '0', 'important');
    image.style.setProperty('visibility', 'hidden', 'important');
    image.style.setProperty('pointer-events', 'none', 'important');
    return true;
  }

  function applyStage(player, stage, selected, song) {
    if (!player || !stage || !selected?.url || !song?.key) return false;
    const signature = `${song.key}|${selected.ratio}|${canonicalUrl(selected.url)}`;
    if (stage.dataset.desktopArtworkSignature === signature) return true;

    const safeUrl = selected.url.replaceAll('"', '%22');
    stage.style.setProperty('background-image', `url("${safeUrl}")`, 'important');
    stage.style.setProperty('background-size', 'contain', 'important');
    stage.style.setProperty('background-position', 'center center', 'important');
    stage.style.setProperty('background-repeat', 'no-repeat', 'important');
    stage.style.setProperty('background-color', '#050607', 'important');
    stage.dataset.desktopArtworkSignature = signature;
    stage.dataset.songArtworkRequestedRatio = surfaceRatio(player) >= ULTRAWIDE_THRESHOLD ? '21x9' : '16x9';
    stage.dataset.songArtworkSourceRatio = selected.ratio;
    stage.classList.add('responsive-artwork-surface-ready');

    player.classList.add('responsive-artwork-ready');
    player.classList.remove('responsive-artwork-pending');
    player.classList.toggle('has-exact-responsive-artwork', selected.exact);
    player.dataset.desktopArtworkSignature = signature;
    player.dataset.desktopArtworkSongKey = song.key;
    player.dataset.songArtworkRequestedRatio = stage.dataset.songArtworkRequestedRatio;
    player.dataset.songArtworkSourceRatio = selected.ratio;
    player.setAttribute('aria-busy', 'false');
    return true;
  }

  async function applySong(song, { force = false } = {}) {
    if (!song?.key || !desktopSurface()) return false;
    const token = ++operation;
    currentSongKey = song.key;

    const images = await artwork(song.key, { force }).catch(error => {
      console.warn('[V2 desktop artwork] Canonical artwork request failed.', error?.message || error);
      return {};
    });
    if (token !== operation || !desktopSurface()) return false;

    const player = activePlayer();
    const stage = activeStage(player);
    const identity = playerIdentity(player);
    if (!player || !stage || normalize(identity.title) !== normalize(song.title)) return false;

    const selected = choose(images, song, player);
    if (!selected.url) return false;
    const loaded = await preload(selected.url);
    if (!loaded || token !== operation || !desktopSurface(player)) return false;

    currentSelection = { ...selected, songKey: song.key, song };
    return applyStage(player, stage, selected, song);
  }

  async function applySongKey(songKey, options = {}) {
    const key = clean(songKey);
    if (!key || !desktopSurface()) return false;
    const list = await songs();
    const song = list.find(item => item.key === key);
    return song ? applySong(song, options) : false;
  }

  async function applyCurrent(options = {}) {
    if (!desktopSurface()) return false;
    const player = activePlayer();
    const identity = playerIdentity(player);
    if (!player || !identity.title) return false;
    const list = await songs();
    const song = findSong(list, identity);
    return song ? applySong(song, options) : false;
  }

  function observeStage() {
    const stage = activeStage();
    if (!stage) return false;
    if (stage === observedStage) return true;

    stageObserver?.disconnect();
    observedStage = stage;
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches?.('video.v2-mobile-vec-media')) {
            node.style.objectFit = 'contain';
            node.style.objectPosition = 'center center';
          }
        });
      });
    });
    stageObserver.observe(stage, { childList: true });
    return true;
  }

  function scheduleApply(delay = 20, options = {}) {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      applyCurrent(options).catch(error => {
        console.warn('[V2 desktop artwork] Horizontal artwork application failed.', error?.message || error);
      });
    }, delay);
  }

  function installTitleObserver() {
    const title = activePlayer()?.querySelector('[data-ptitle]') || null;
    if (!title) return false;
    observeStage();
    if (title === observedTitle) return true;

    titleObserver?.disconnect();
    observedTitle = title;
    titleObserver = new MutationObserver(() => {
      operation += 1;
      currentSelection = null;
      clearOldOfficialPlaceholders();
      const stage = activeStage();
      if (stage) delete stage.dataset.desktopArtworkSignature;
      scheduleApply(0);
    });
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    return true;
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const key = clean(detail.songKey);
    const source = clean(detail.asset?.source).toLowerCase();
    currentSongKey = key || currentSongKey;
    installTitleObserver();
    observeStage();

    if (source === 'official-artwork') {
      window.requestAnimationFrame(() => {
        markOfficialPlaceholder();
        if (key) applySongKey(key).catch(() => scheduleApply(0));
      });
    }
  });

  ['pointerenter', 'pointerdown', 'focusin'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      if (!desktopSurface()) return;
      const key = clean(event.target.closest?.('#v2App [data-song]')?.dataset?.song);
      if (!key) return;
      songs().then(list => {
        const song = list.find(item => item.key === key);
        if (!song) return;
        artwork(key).then(images => preload(choose(images, song).url)).catch(() => {});
      }).catch(() => {});
    }, { capture: true, passive: true });
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!desktopSurface()) return;
      const stage = activeStage();
      if (stage) delete stage.dataset.desktopArtworkSignature;
      scheduleApply(0);
    }, 120);
  }, { passive: true });

  window.addEventListener('orientationchange', () => window.setTimeout(() => {
    const stage = activeStage();
    if (stage) delete stage.dataset.desktopArtworkSignature;
    scheduleApply(0);
  }, 150), { passive: true });

  installTimer = window.setInterval(() => {
    const installed = installTitleObserver();
    observeStage();
    if (installed && activeStage()) {
      window.clearInterval(installTimer);
      scheduleApply(0);
    }
  }, 60);

  window.StashboxDesktopOfficialArtwork16x9 = Object.freeze({
    refresh: () => {
      const stage = activeStage();
      if (stage) delete stage.dataset.desktopArtworkSignature;
      scheduleApply(0, { force: true });
    },
    applyCurrent,
    applySong: applySongKey,
    desktopSurface,
    state: () => ({ currentSongKey, currentSelection })
  });
})();