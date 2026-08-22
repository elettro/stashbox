(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/attempt2/artist/')) return;
  if (window.StashboxArtistResponsiveArtwork) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const DESKTOP_MIN_WIDTH = 900;
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const artworkCache = new Map();
  const requestCache = new Map();
  const imageLoads = new Map();

  let catalogPromise = null;
  let realm = null;
  let stage = null;
  let titleNode = null;
  let titleObserver = null;
  let stageObserver = null;
  let realmObserver = null;
  let installTimer = 0;
  let resizeTimer = 0;
  let scheduled = 0;
  let operation = 0;
  let activeSong = null;
  let activeSelection = null;

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
      catalogPromise = getJson(SONGS_URL)
        .then(data => rows(data).filter(song => clean(song?.song_key) && songTitle(song)))
        .catch(error => {
          catalogPromise = null;
          throw error;
        });
    }
    return catalogPromise;
  }

  function currentIdentity() {
    return {
      title: clean(realm?.querySelector('[data-realm-title]')?.textContent),
      artist: clean(realm?.querySelector('[data-realm-artist]')?.textContent)
    };
  }

  function findSong(songs, identity) {
    const title = normalize(identity?.title);
    const artist = normalize(identity?.artist);
    return songs.find(song => normalize(songTitle(song)) === title && (!artist || normalize(songArtist(song)) === artist))
      || songs.find(song => normalize(songTitle(song)) === title)
      || null;
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

  function artworkFromPayload(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    const images = media.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : {};
    return {
      '1x1': fixUrl(images['1x1'] || media.song_artwork_1x1_url || media.song_artwork_url),
      '16x9': fixUrl(images['16x9'] || media.song_artwork_16x9_url),
      '21x9': fixUrl(images['21x9'] || media.song_artwork_21x9_url),
      '9x16': fixUrl(images['9x16'] || media.song_artwork_9x16_url),
      '4x5': fixUrl(images['4x5'] || media.song_artwork_4x5_url),
      '3x4': fixUrl(images['3x4'] || media.song_artwork_3x4_url)
    };
  }

  async function artworkForSong(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return {};
    if (force) artworkCache.delete(key);
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
        if (!loaded) imageLoads.delete(source);
        resolve(Boolean(loaded));
      };
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0);
    });

    imageLoads.set(source, promise);
    return promise;
  }

  function surfaceSize() {
    const rect = stage?.getBoundingClientRect?.();
    if (rect?.width >= 100 && rect?.height >= 100) return { width: rect.width, height: rect.height };
    return {
      width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
      height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
    };
  }

  function desktopSurface() {
    const { width, height } = surfaceSize();
    return width >= DESKTOP_MIN_WIDTH && width / Math.max(1, height) >= 1.25;
  }

  function chooseArtwork(song, images) {
    const square = fixUrl(images?.['1x1'] || songSquare(song));
    const desktop = desktopSurface();
    const ordered = desktop
      ? [['16x9', images?.['16x9']], ['21x9', images?.['21x9']], ['1x1', square]]
      : [['9x16', images?.['9x16']], ['4x5', images?.['4x5']], ['3x4', images?.['3x4']], ['1x1', square]];
    const selected = ordered.find(([, url]) => fixUrl(url)) || ['1x1', square || FALLBACK_ART];
    return {
      url: fixUrl(selected[1]) || square || FALLBACK_ART,
      sourceRatio: selected[0],
      requestedRatio: desktop ? '16x9' : '9x16',
      desktop,
      officialUrls: new Set([
        square,
        FALLBACK_ART,
        ...Object.values(images || {}),
        selected[1]
      ].map(canonicalUrl).filter(Boolean))
    };
  }

  function selectionSignature(song, selected) {
    return `${clean(song?.song_key)}|${selected.requestedRatio}|${selected.sourceRatio}|${canonicalUrl(selected.url)}`;
  }

  function setStageArtwork(song, selected) {
    if (!stage || !selected?.url) return;
    const signature = selectionSignature(song, selected);
    if (stage.dataset.artistArtworkSignature === signature) return;

    const safeUrl = selected.url.replaceAll('"', '%22');
    stage.style.backgroundImage = `url("${safeUrl}")`;
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'contain';
    stage.style.backgroundColor = '#050607';
    stage.dataset.artistArtworkUrl = selected.url;
    stage.dataset.artistArtworkSignature = signature;
    stage.dataset.songArtworkRequestedRatio = selected.requestedRatio;
    stage.dataset.songArtworkSourceRatio = selected.sourceRatio;
  }

  function mediaUrl(media) {
    return canonicalUrl(media?.currentSrc || media?.src || media?.getAttribute?.('src'));
  }

  function isOfficialImage(media) {
    if (!media || media.tagName !== 'IMG' || !activeSelection) return false;
    if (media.dataset.vecAssetSource === 'official-artwork' || media.dataset.artistOfficialArtwork === 'true') return true;
    const source = mediaUrl(media);
    return Boolean(source && activeSelection.officialUrls.has(source));
  }

  function applyOfficialImage(media) {
    if (!isOfficialImage(media) || !activeSelection?.url) return false;
    const selectedUrl = canonicalUrl(activeSelection.url);
    const currentUrl = mediaUrl(media);

    media.dataset.artistOfficialArtwork = 'true';
    media.dataset.vecAssetSource = 'official-artwork';
    media.dataset.responsiveArtworkUrl = activeSelection.url;
    media.dataset.responsiveArtworkRatio = activeSelection.sourceRatio;
    media.dataset.responsiveArtworkRequestedRatio = activeSelection.requestedRatio;
    media.style.objectFit = activeSelection.desktop ? 'contain' : 'cover';
    media.style.objectPosition = 'center center';

    if (currentUrl !== selectedUrl) media.src = activeSelection.url;
    return true;
  }

  function bindMedia(media) {
    if (!media || media.dataset.artistStableArtworkBound === 'true') return;
    media.dataset.artistStableArtworkBound = 'true';

    if (media.tagName === 'IMG') {
      media.addEventListener('load', () => applyOfficialImage(media), { passive: true });
      applyOfficialImage(media);
    }
  }

  function inspectStage() {
    if (!stage) return;
    stage.querySelectorAll('.artist-realm-media').forEach(bindMedia);
    stage.querySelectorAll('img.artist-realm-media').forEach(applyOfficialImage);
  }

  async function applySong(song, { force = false } = {}) {
    if (!song?.song_key || !stage) return false;
    const token = ++operation;
    activeSong = song;

    let images = {};
    try {
      images = await artworkForSong(clean(song.song_key), { force });
    } catch (error) {
      console.warn('[Artist artwork] Canonical artwork request failed.', error?.message || error);
    }
    if (token !== operation || !stage) return false;

    const selected = chooseArtwork(song, images);
    const loaded = await preload(selected.url);
    if (!loaded || token !== operation || !stage) return false;

    activeSelection = selected;
    setStageArtwork(song, selected);
    inspectStage();
    return true;
  }

  async function applyCurrent(options = {}) {
    if (!realm || realm.hidden || !stage) return false;
    const identity = currentIdentity();
    if (!identity.title || identity.title === 'Loading…') return false;
    const songs = await catalog();
    const song = findSong(songs, identity);
    if (!song) return false;
    return applySong(song, options);
  }

  function scheduleApply(delay = 0, options = {}) {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      applyCurrent(options).catch(error => {
        console.warn('[Artist artwork] Responsive artwork application failed.', error?.message || error);
      });
    }, delay);
  }

  function installObservers() {
    const nextRealm = document.querySelector('.artist-realm-player');
    if (!nextRealm) return false;
    const nextStage = nextRealm.querySelector('[data-realm-stage]');
    const nextTitle = nextRealm.querySelector('[data-realm-title]');
    if (!nextStage || !nextTitle) return false;

    realm = nextRealm;
    stage = nextStage;

    if (titleNode !== nextTitle) {
      titleObserver?.disconnect();
      titleNode = nextTitle;
      titleObserver = new MutationObserver(() => {
        operation += 1;
        activeSong = null;
        activeSelection = null;
        scheduleApply(0);
      });
      titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
    }

    stageObserver?.disconnect();
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node instanceof HTMLElement && node.matches?.('.artist-realm-media')) bindMedia(node);
        });
      });
    });
    stageObserver.observe(stage, { childList: true });

    realmObserver?.disconnect();
    realmObserver = new MutationObserver(() => {
      if (!realm.hidden) scheduleApply(0);
    });
    realmObserver.observe(realm, { attributes: true, attributeFilter: ['hidden'] });

    inspectStage();
    if (!realm.hidden) scheduleApply(0);
    return true;
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (activeSong) applySong(activeSong);
      else scheduleApply(0);
    }, 120);
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      if (activeSong) applySong(activeSong);
      else scheduleApply(0);
    }, 140);
  }, { passive: true });

  installTimer = window.setInterval(() => {
    if (installObservers()) window.clearInterval(installTimer);
  }, 60);
  installObservers();

  window.StashboxArtistResponsiveArtwork = Object.freeze({
    refresh: () => activeSong ? applySong(activeSong, { force: true }) : applyCurrent({ force: true }),
    applyCurrent,
    isDesktopSurface: desktopSurface
  });
})();
