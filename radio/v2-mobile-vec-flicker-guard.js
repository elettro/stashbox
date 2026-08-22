(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(max-width: 899px)').matches) return;
  if (window.StashboxMobileArtworkAuthority) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const CACHE_KEY = 'stashbox_mobile_artwork_policy_v3';
  const EXACT_TTL_MS = 24 * 60 * 60 * 1000;
  const FALLBACK_TTL_MS = 5 * 60 * 1000;
  const requests = new Map();
  const imageLoads = new Map();

  const state = {
    player: null,
    stage: null,
    songKey: '',
    pendingSongKey: '',
    selection: null,
    token: 0,
    retryCount: 0,
    retryTimer: 0,
    frame: 0,
    timer: 0,
  };

  const clean = value => String(value ?? '').trim();
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function visible(node) {
    if (!node || !node.isConnected || node.hidden) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function activePlayer() {
    const liveAudio = [...app.querySelectorAll('audio')].find(audio => !audio.paused && !audio.ended);
    const audioPlayer = liveAudio?.closest?.('[data-player]');
    if (visible(audioPlayer)) return audioPlayer;
    return [...app.querySelectorAll('[data-player]')].find(visible) || null;
  }

  function runtimeSongKey(player) {
    let runtimeKey = '';
    try { runtimeKey = clean(window.StashboxMobileVecVideoRuntime?.state?.()?.songKey); }
    catch (_) {}
    return clean(
      runtimeKey ||
      player?.dataset?.mobileVecMotionSongKey ||
      player?.dataset?.songKey ||
      player?.dataset?.currentSongKey ||
      state.pendingSongKey
    );
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function cachedSelection(songKey) {
    const entry = readCache()[songKey];
    if (!entry?.url || !entry?.ratio || !entry?.verifiedAt) return null;
    const age = Date.now() - Number(entry.verifiedAt || 0);
    const ttl = entry.ratio === '9x16' ? EXACT_TTL_MS : FALLBACK_TTL_MS;
    if (!Number.isFinite(age) || age < 0 || age > ttl) return null;
    return {
      url: fixUrl(entry.url),
      ratio: clean(entry.ratio),
      exact: clean(entry.ratio) === '9x16',
      verifiedAt: Number(entry.verifiedAt),
    };
  }

  function writeCache(songKey, selection) {
    if (!songKey || !selection?.url || !selection?.ratio) return;
    try {
      const cache = readCache();
      cache[songKey] = {
        url: fixUrl(selection.url),
        ratio: clean(selection.ratio),
        verifiedAt: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function artworkSelection(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    const images = media?.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : (media?.images && typeof media.images === 'object' ? media.images : {});
    const prepared = media?.prepared_artwork_images && typeof media.prepared_artwork_images === 'object'
      ? media.prepared_artwork_images
      : {};
    const resolved = media?.resolved_artwork || data?.resolved_artwork || {};
    const exactResolved = clean(resolved?.['9x16']?.source_ratio) === '9x16'
      ? resolved?.['9x16']?.url
      : '';

    const exactUrl = fixUrl(
      images['9x16'] ||
      prepared['9x16'] ||
      media?.song_artwork_9x16_url ||
      data?.song_artwork_9x16_url ||
      exactResolved
    );
    if (exactUrl) return { url: exactUrl, ratio: '9x16', exact: true };

    // A fallback is acceptable only after the canonical payload confirms
    // that no exact 9x16 image exists for this song.
    const fallbackOrder = [
      ['4x5', images['4x5'] || prepared['4x5'] || resolved?.['4x5']?.url],
      ['3x4', images['3x4'] || prepared['3x4'] || resolved?.['3x4']?.url],
      ['1x1', images['1x1'] || prepared['1x1'] || resolved?.['1x1']?.url],
      ['1x1', media?.song_artwork_url || media?.artwork_url || data?.song_artwork_url || data?.artwork_url],
    ];
    for (const [ratio, candidate] of fallbackOrder) {
      const url = fixUrl(candidate);
      if (url) return { url, ratio, exact: false };
    }
    return null;
  }

  async function fetchSelection(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return null;
    if (!force) {
      const cached = cachedSelection(key);
      if (cached) return cached;
    }
    if (requests.has(key)) return requests.get(key);

    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetch(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`, {
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
        if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
        const selection = artworkSelection(body);
        if (selection) writeCache(key, selection);
        return selection;
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => requests.delete(key));

    requests.set(key, request);
    return request;
  }

  function preload(selection) {
    const source = fixUrl(selection?.url);
    const ratio = clean(selection?.ratio);
    if (!source || !ratio) return Promise.resolve(false);
    const cacheKey = `${ratio}|${source}`;
    if (imageLoads.has(cacheKey)) return imageLoads.get(cacheKey);

    const promise = new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!loaded) imageLoads.delete(cacheKey);
        resolve(Boolean(loaded));
      };
      const timer = setTimeout(() => finish(false), 18000);
      image.onload = () => {
        const aspect = image.naturalHeight / Math.max(1, image.naturalWidth);
        const valid = ratio === '9x16'
          ? aspect >= 1.55
          : ratio === '1x1'
            ? aspect >= 0.8 && aspect <= 1.25
            : aspect > 1.1;
        finish(image.naturalWidth > 0 && valid);
      };
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) image.onload();
    });

    imageLoads.set(cacheKey, promise);
    return promise;
  }

  function installCss() {
    if (document.getElementById('v2-mobile-artwork-policy-css')) return;
    const style = document.createElement('style');
    style.id = 'v2-mobile-artwork-policy-css';
    style.textContent = `
      @media (max-width: 899px) {
        #v2App [data-player].mobile-artwork-authority [data-mobile-vec-stage] {
          background-color: #050607 !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].mobile-artwork-authority [data-mobile-vec-stage] .v2-mobile-vec-media,
        #v2App [data-player].mobile-artwork-authority [data-mobile-vec-stage] img {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].mobile-artwork-authority .mobile-vec-motion-video.is-moving {
          visibility: visible !important;
          opacity: 1 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function provisionalArtwork(stage) {
    const images = [...(stage?.querySelectorAll('img') || [])].reverse();
    const image = images.find(node => fixUrl(node.currentSrc || node.src));
    return fixUrl(image?.currentSrc || image?.src || stage?.dataset?.mobileVecArtworkUrl || '');
  }

  function markLoading(player, stage, songKey) {
    if (!player || !stage) return;
    player.classList.add('mobile-artwork-authority', 'mobile-artwork-loading');
    player.classList.remove('mobile-artwork-ready', 'mobile-artwork-fallback');
    player.dataset.mobileVecArtworkState = 'loading';
    player.dataset.mobileVecArtworkRatio = '';
    player.dataset.mobileVecArtworkPolicy = 'checking-9x16';
    player.dataset.mobileVecArtworkSongKey = songKey;
    const provisional = provisionalArtwork(stage);
    stage.dataset.mobileVecArtworkState = provisional ? 'loading-with-provisional' : 'loading';
    stage.dataset.mobileVecArtworkRatio = '';
    stage.dataset.mobileVecArtworkPolicy = provisional ? 'checking-9x16-with-provisional' : 'checking-9x16';
    if (provisional) stage.style.backgroundImage = `url("${provisional.replaceAll('"', '%22')}")`;
    stage.style.backgroundColor = '#050607';
  }

  function applySelection(player, stage, songKey, selection) {
    const source = fixUrl(selection?.url);
    const ratio = clean(selection?.ratio);
    if (!player || !stage || !songKey || !source || !ratio) return false;
    const safe = source.replaceAll('"', '%22');
    const exact = ratio === '9x16';

    player.classList.add('mobile-artwork-authority', 'mobile-artwork-ready');
    player.classList.toggle('mobile-artwork-fallback', !exact);
    player.classList.remove('mobile-artwork-loading');
    player.dataset.mobileVecArtworkState = exact ? 'ready-9x16' : `ready-fallback-${ratio}`;
    player.dataset.mobileVecArtworkRatio = ratio;
    player.dataset.mobileVecArtworkPolicy = exact ? 'exact-9x16' : 'fallback-no-9x16';
    player.dataset.mobileVecArtworkSongKey = songKey;
    player.dataset.mobileVecArtworkUrl = source;

    stage.style.backgroundImage = `url("${safe}")`;
    stage.style.backgroundColor = '#050607';
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'cover';
    stage.dataset.mobileVecArtworkState = exact ? 'ready-9x16' : `ready-fallback-${ratio}`;
    stage.dataset.mobileVecArtworkRatio = ratio;
    stage.dataset.mobileVecArtworkPolicy = exact ? 'exact-9x16' : 'fallback-no-9x16';
    stage.dataset.mobileVecArtworkSongKey = songKey;
    stage.dataset.mobileVecArtworkUrl = source;
    return true;
  }

  function scheduleRetry(songKey, token) {
    clearTimeout(state.retryTimer);
    const delay = Math.min(10000, 1500 + state.retryCount * 1200);
    state.retryTimer = setTimeout(() => {
      if (token !== state.token || songKey !== state.songKey) return;
      state.retryCount += 1;
      resolveArtwork(songKey, true);
    }, delay);
  }

  async function resolveArtwork(songKey, force = false) {
    const key = clean(songKey);
    if (!key) return;
    const token = ++state.token;
    if (!force) state.retryCount = 0;

    let selection = null;
    try { selection = await fetchSelection(key, { force }); }
    catch (_) { selection = null; }
    if (token !== state.token || key !== state.songKey) return;

    if (!selection) {
      state.player.dataset.mobileVecArtworkState = 'missing-all-artwork';
      state.stage.dataset.mobileVecArtworkState = 'missing-all-artwork';
      scheduleRetry(key, token);
      return;
    }

    const loaded = await preload(selection);
    if (token !== state.token || key !== state.songKey) return;
    if (!loaded) {
      state.player.dataset.mobileVecArtworkState = selection.exact ? 'retrying-exact-9x16' : `retrying-fallback-${selection.ratio}`;
      state.stage.dataset.mobileVecArtworkState = state.player.dataset.mobileVecArtworkState;
      scheduleRetry(key, token);
      return;
    }

    state.selection = selection;
    applySelection(state.player, state.stage, key, selection);
  }

  function videoMoving(stage) {
    const video = stage?.querySelector('.mobile-vec-motion-video');
    return Boolean(
      video &&
      video.classList.contains('is-moving') &&
      !video.paused &&
      !video.ended &&
      Number(video.currentTime || 0) > 0.04
    );
  }

  function stabilize() {
    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    if (!player || !stage) return;

    state.player = player;
    state.stage = stage;
    player.classList.add('mobile-artwork-authority');

    const key = runtimeSongKey(player);
    if (key && key !== state.songKey) {
      state.songKey = key;
      state.selection = null;
      state.token += 1;

      const cached = cachedSelection(key);
      if (cached) {
        state.selection = cached;
        applySelection(player, stage, key, cached);
        preload(cached);
        if (!cached.exact) resolveArtwork(key, true);
      } else {
        markLoading(player, stage, key);
        resolveArtwork(key);
      }
    }

    if (videoMoving(stage)) return;
    if (state.selection) applySelection(player, stage, state.songKey, state.selection);
    else markLoading(player, stage, state.songKey);
  }

  function schedule() {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(stabilize);
  }

  function prefetchFromTarget(target) {
    const song = target?.closest?.('#v2App [data-song]');
    const key = clean(song?.dataset?.song);
    if (!key) return;
    state.pendingSongKey = key;
    const cached = cachedSelection(key);
    if (cached) preload(cached);
    else fetchSelection(key).then(selection => selection && preload(selection)).catch(() => {});
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-song-key', 'data-mobile-vec-motion-song-key'],
  });

  document.addEventListener('pointerdown', event => prefetchFromTarget(event.target), true);
  document.addEventListener('touchstart', event => prefetchFromTarget(event.target), { capture: true, passive: true });
  document.addEventListener('play', schedule, true);
  document.addEventListener('pause', schedule, true);
  window.addEventListener('stashbox:vec-asset-change', schedule, true);
  window.addEventListener('stashbox:player-view-mode-change', schedule, true);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 120), { passive: true });
  window.addEventListener('online', () => {
    if (state.songKey) resolveArtwork(state.songKey, true);
  });

  installCss();
  state.timer = setInterval(stabilize, 250);
  stabilize();

  window.StashboxMobileArtworkAuthority = Object.freeze({
    refresh: () => {
      if (state.songKey) resolveArtwork(state.songKey, true);
      schedule();
    },
    prefetchSong: fetchSelection,
    state: () => ({
      songKey: state.songKey,
      artworkUrl: state.selection?.url || '',
      artworkRatio: state.selection?.ratio || '',
      artworkPolicy: state.selection?.exact ? 'exact-9x16' : state.selection ? 'fallback-no-9x16' : 'loading',
      videoMoving: videoMoving(state.stage),
    }),
    stop: () => {
      clearInterval(state.timer);
      clearTimeout(state.retryTimer);
      observer.disconnect();
      state.player?.classList.remove('mobile-artwork-authority', 'mobile-artwork-loading', 'mobile-artwork-ready', 'mobile-artwork-fallback');
    },
  });
})();