(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(max-width: 899px)').matches) return;
  if (window.StashboxMobileExactArtworkAuthority) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const CACHE_KEY = 'stashbox_mobile_exact_9x16_v2';
  const requests = new Map();
  const imageLoads = new Map();

  const state = {
    player: null,
    stage: null,
    songKey: '',
    pendingSongKey: '',
    artworkUrl: '',
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

  function cachedUrl(songKey) {
    return fixUrl(readCache()[songKey]?.url);
  }

  function writeCache(songKey, url) {
    try {
      const cache = readCache();
      cache[songKey] = { url: fixUrl(url), savedAt: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function exact9x16FromPayload(payload) {
    const data = unwrap(payload) || {};
    const media = data.media || data.data?.media || data.data || data;
    const images = media?.artwork_images && typeof media.artwork_images === 'object'
      ? media.artwork_images
      : (media?.images && typeof media.images === 'object' ? media.images : {});
    const resolved = media?.resolved_artwork?.['9x16'] || data?.resolved_artwork?.['9x16'] || {};
    const resolvedExact = clean(resolved?.source_ratio) === '9x16' ? resolved?.url : '';

    return fixUrl(
      images['9x16'] ||
      media?.song_artwork_9x16_url ||
      data?.song_artwork_9x16_url ||
      resolvedExact
    );
  }

  async function fetchExact9x16(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return '';
    if (!force) {
      const cached = cachedUrl(key);
      if (cached) return cached;
    }
    if (requests.has(key)) return requests.get(key);

    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 18000);
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
        const url = exact9x16FromPayload(body);
        if (url) writeCache(key, url);
        return url;
      } finally {
        window.clearTimeout(timeout);
      }
    })().finally(() => requests.delete(key));

    requests.set(key, request);
    return request;
  }

  function preloadExactPortrait(url) {
    const source = fixUrl(url);
    if (!source) return Promise.resolve(false);
    if (imageLoads.has(source)) return imageLoads.get(source);

    const promise = new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!loaded) imageLoads.delete(source);
        resolve(Boolean(loaded));
      };
      const timer = window.setTimeout(() => finish(false), 18000);
      image.onload = () => {
        const portraitRatio = image.naturalHeight / Math.max(1, image.naturalWidth);
        finish(image.naturalWidth > 0 && portraitRatio >= 1.45);
      };
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) {
        const portraitRatio = image.naturalHeight / Math.max(1, image.naturalWidth);
        finish(image.naturalWidth > 0 && portraitRatio >= 1.45);
      }
    });

    imageLoads.set(source, promise);
    return promise;
  }

  function installCss() {
    if (document.getElementById('v2-mobile-exact-9x16-css')) return;
    const style = document.createElement('style');
    style.id = 'v2-mobile-exact-9x16-css';
    style.textContent = `
      @media (max-width: 899px) {
        #v2App [data-player].mobile-exact-artwork-authority [data-mobile-vec-stage] {
          background-color: #050607 !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-size: contain !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].mobile-exact-artwork-loading [data-mobile-vec-stage] {
          background-image: none !important;
        }

        #v2App [data-player].mobile-exact-artwork-authority [data-mobile-vec-stage] .v2-mobile-vec-media,
        #v2App [data-player].mobile-exact-artwork-authority [data-mobile-vec-stage] img {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].mobile-exact-artwork-authority .mobile-vec-motion-video.is-moving {
          visibility: visible !important;
          opacity: 1 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function markLoading(player, stage, songKey) {
    if (!player || !stage) return;
    player.classList.add('mobile-exact-artwork-authority', 'mobile-exact-artwork-loading');
    player.classList.remove('mobile-exact-artwork-ready');
    player.dataset.mobileVecArtworkState = 'loading-9x16';
    player.dataset.mobileVecArtworkRatio = '';
    player.dataset.mobileVecArtworkSongKey = songKey;
    stage.dataset.mobileVecArtworkState = 'loading-9x16';
    stage.dataset.mobileVecArtworkRatio = '';
    stage.dataset.mobileVecArtworkSongKey = songKey;
    stage.style.backgroundImage = 'none';
    stage.style.backgroundColor = '#050607';
  }

  function applyExactArtwork(player, stage, songKey, url) {
    const source = fixUrl(url);
    if (!player || !stage || !songKey || !source) return false;
    const safe = source.replaceAll('"', '%22');

    player.classList.add('mobile-exact-artwork-authority', 'mobile-exact-artwork-ready');
    player.classList.remove('mobile-exact-artwork-loading');
    player.dataset.mobileVecArtworkState = 'ready-9x16';
    player.dataset.mobileVecArtworkRatio = '9x16';
    player.dataset.mobileVecArtworkSongKey = songKey;
    player.dataset.mobileVecArtworkUrl = source;

    stage.style.backgroundImage = `url("${safe}")`;
    stage.style.backgroundColor = '#050607';
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'contain';
    stage.dataset.mobileVecArtworkState = 'ready-9x16';
    stage.dataset.mobileVecArtworkRatio = '9x16';
    stage.dataset.mobileVecArtworkSongKey = songKey;
    stage.dataset.mobileVecArtworkUrl = source;
    return true;
  }

  function scheduleRetry(songKey, token) {
    clearTimeout(state.retryTimer);
    const delay = Math.min(8000, 1500 + state.retryCount * 1000);
    state.retryTimer = window.setTimeout(() => {
      if (token !== state.token || songKey !== state.songKey) return;
      state.retryCount += 1;
      resolveExactArtwork(songKey, true);
    }, delay);
  }

  async function resolveExactArtwork(songKey, force = false) {
    const key = clean(songKey);
    if (!key) return;
    const token = ++state.token;
    state.retryCount = force ? state.retryCount : 0;

    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    state.player = player;
    state.stage = stage;
    if (player && stage) markLoading(player, stage, key);

    let url = !force ? cachedUrl(key) : '';
    if (!url) {
      try { url = await fetchExact9x16(key, { force }); }
      catch (_) { url = ''; }
    }

    if (token !== state.token || key !== state.songKey) return;
    if (!url) {
      if (state.player) state.player.dataset.mobileVecArtworkState = 'missing-9x16';
      if (state.stage) state.stage.dataset.mobileVecArtworkState = 'missing-9x16';
      scheduleRetry(key, token);
      return;
    }

    const loaded = await preloadExactPortrait(url);
    if (token !== state.token || key !== state.songKey) return;
    if (!loaded) {
      if (state.player) state.player.dataset.mobileVecArtworkState = 'invalid-or-unloaded-9x16';
      if (state.stage) state.stage.dataset.mobileVecArtworkState = 'invalid-or-unloaded-9x16';
      imageLoads.delete(url);
      scheduleRetry(key, token);
      return;
    }

    state.artworkUrl = url;
    state.retryCount = 0;
    applyExactArtwork(state.player, state.stage, key, url);
  }

  function beginSong(songKey) {
    const key = clean(songKey);
    if (!key) return;
    if (key === state.songKey && state.artworkUrl) return;

    state.songKey = key;
    state.pendingSongKey = key;
    state.artworkUrl = '';
    state.retryCount = 0;
    clearTimeout(state.retryTimer);
    state.token += 1;

    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    state.player = player;
    state.stage = stage;
    if (player && stage) markLoading(player, stage, key);
    resolveExactArtwork(key);
  }

  function stabilize() {
    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    if (!player || !stage) return;

    state.player = player;
    state.stage = stage;
    player.classList.add('mobile-exact-artwork-authority');

    const key = runtimeSongKey(player);
    if (key && key !== state.songKey) beginSong(key);

    if (!state.songKey) return;
    if (!state.artworkUrl) {
      markLoading(player, stage, state.songKey);
      return;
    }

    applyExactArtwork(player, stage, state.songKey, state.artworkUrl);
  }

  function schedule() {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(stabilize);
  }

  function prefetchFromTarget(target, activate = false) {
    const song = target?.closest?.('#v2App [data-song]');
    const key = clean(song?.dataset?.song);
    if (!key) return;
    state.pendingSongKey = key;
    const cached = cachedUrl(key);
    if (cached) preloadExactPortrait(cached);
    else fetchExact9x16(key).then(preloadExactPortrait).catch(() => {});
    if (activate) window.setTimeout(() => beginSong(key), 0);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-song-key', 'data-mobile-vec-motion-song-key'],
  });

  document.addEventListener('pointerdown', event => prefetchFromTarget(event.target, false), true);
  document.addEventListener('touchstart', event => prefetchFromTarget(event.target, false), { capture: true, passive: true });
  document.addEventListener('click', event => prefetchFromTarget(event.target, true), true);
  document.addEventListener('play', schedule, true);
  document.addEventListener('pause', schedule, true);
  window.addEventListener('orientationchange', () => window.setTimeout(schedule, 120), { passive: true });
  window.addEventListener('online', () => {
    if (state.songKey) resolveExactArtwork(state.songKey, true);
  });

  installCss();
  state.timer = window.setInterval(stabilize, 200);
  stabilize();

  const api = Object.freeze({
    refresh: () => {
      if (state.songKey) resolveExactArtwork(state.songKey, true);
      schedule();
    },
    prefetchSong: fetchExact9x16,
    cachedUrl,
    state: () => ({
      songKey: state.songKey,
      artworkUrl: state.artworkUrl,
      artworkState: state.player?.dataset?.mobileVecArtworkState || 'idle',
      artworkRatio: state.player?.dataset?.mobileVecArtworkRatio || '',
    }),
    stop: () => {
      clearInterval(state.timer);
      clearTimeout(state.retryTimer);
      observer.disconnect();
      state.player?.classList.remove(
        'mobile-exact-artwork-authority',
        'mobile-exact-artwork-loading',
        'mobile-exact-artwork-ready'
      );
    },
  });

  window.StashboxMobileExactArtworkAuthority = api;
  window.StashboxMobileVecFlickerGuard = api;
})();