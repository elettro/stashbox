(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(max-width: 899px)').matches) return;
  if (window.StashboxMobileVecFlickerGuard) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const CACHE_KEY = 'stashbox_mobile_exact_9x16_v1';
  const artworkRequests = new Map();
  const imageLoads = new Map();

  const state = {
    player: null,
    stage: null,
    songKey: '',
    artworkUrl: '',
    artworkToken: 0,
    artworkState: 'idle',
    frame: 0,
    timer: 0,
    retryTimer: 0,
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
    const audio = [...app.querySelectorAll('audio')].find(item => !item.paused && !item.ended);
    const audioPlayer = audio?.closest?.('[data-player]');
    if (visible(audioPlayer)) return audioPlayer;
    return [...app.querySelectorAll('[data-player]')].find(visible) || null;
  }

  function songIdentity(player) {
    return clean(
      player?.dataset?.mobileVecMotionSongKey ||
      player?.dataset?.songKey ||
      player?.dataset?.currentSongKey
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
    return fixUrl(
      images['9x16'] ||
      media?.song_artwork_9x16_url ||
      data?.song_artwork_9x16_url
    );
  }

  async function fetchExact9x16(songKey, { force = false } = {}) {
    const key = clean(songKey);
    if (!key) return '';
    if (!force) {
      const cached = cachedUrl(key);
      if (cached) return cached;
    }
    if (artworkRequests.has(key)) return artworkRequests.get(key);

    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 16000);
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
    })().finally(() => artworkRequests.delete(key));

    artworkRequests.set(key, request);
    return request;
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
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > image.naturalWidth);
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.src = source;
      if (image.complete) finish(image.naturalWidth > 0 && image.naturalHeight > image.naturalWidth);
    });
    imageLoads.set(source, promise);
    return promise;
  }

  function installCss() {
    if (document.getElementById('v2-mobile-vec-flicker-guard-css')) return;
    const style = document.createElement('style');
    style.id = 'v2-mobile-vec-flicker-guard-css';
    style.textContent = `
      @media (max-width: 899px) {
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage],
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage]::before,
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage]::after {
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-artwork [data-mobile-vec-stage] .v2-mobile-vec-media,
        #v2App [data-player].vec-stable-artwork [data-mobile-vec-stage] img,
        #v2App [data-player].vec-stable-artwork .mobile-vec-motion-video {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-video [data-mobile-vec-stage] .v2-mobile-vec-media,
        #v2App [data-player].vec-stable-video [data-mobile-vec-stage] img {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-video .mobile-vec-motion-video.is-moving {
          visibility: visible !important;
          opacity: 1 !important;
          transition: none !important;
          animation: none !important;
          background: #050607 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyExactArtwork(stage, url) {
    const source = fixUrl(url);
    if (!stage || !source) return false;
    const encoded = source.replaceAll('"', '%22');
    const next = `url("${encoded}")`;

    if (stage.style.backgroundImage !== next) stage.style.backgroundImage = next;
    stage.style.backgroundPosition = 'center center';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundColor = '#050607';
    stage.dataset.mobileVecArtworkRatio = '9x16';
    stage.dataset.mobileVecArtworkState = 'ready';
    stage.dataset.mobileVecArtworkUrl = source;

    state.player.dataset.mobileVecArtworkRatio = '9x16';
    state.player.dataset.mobileVecArtworkState = 'ready';
    state.player.dataset.mobileVecArtworkUrl = source;
    return true;
  }

  function holdForExactArtwork(stage) {
    if (!stage || state.artworkUrl) return;
    stage.style.backgroundImage = 'none';
    stage.style.backgroundColor = '#050607';
    stage.dataset.mobileVecArtworkState = 'loading-9x16';
  }

  function scheduleRetry(songKey, token) {
    clearTimeout(state.retryTimer);
    state.retryTimer = window.setTimeout(() => {
      if (token !== state.artworkToken || songKey !== state.songKey) return;
      resolveExactArtwork(songKey, true);
    }, 1600);
  }

  async function resolveExactArtwork(songKey, force = false) {
    const key = clean(songKey);
    if (!key) return;
    const token = ++state.artworkToken;
    state.artworkState = 'loading';

    let url = !force ? cachedUrl(key) : '';
    if (!url) {
      try { url = await fetchExact9x16(key, { force }); }
      catch (_) { url = ''; }
    }

    if (token !== state.artworkToken || key !== state.songKey) return;

    if (!url) {
      state.artworkState = 'missing';
      state.player.dataset.mobileVecArtworkState = 'missing-9x16';
      scheduleRetry(key, token);
      return;
    }

    const loaded = await preload(url);
    if (token !== state.artworkToken || key !== state.songKey) return;
    if (!loaded) {
      state.artworkState = 'load-failed';
      state.player.dataset.mobileVecArtworkState = 'retrying-9x16';
      scheduleRetry(key, token);
      return;
    }

    state.artworkUrl = url;
    state.artworkState = 'ready';
    applyExactArtwork(state.stage, url);
    schedule();
  }

  function stabilize() {
    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    if (!player || !stage) return;

    state.player = player;
    state.stage = stage;
    player.classList.add('vec-presentation-stable');

    const key = songIdentity(player);
    if (key && key !== state.songKey) {
      state.songKey = key;
      state.artworkUrl = '';
      state.artworkState = 'loading';
      state.artworkToken += 1;
      holdForExactArtwork(stage);
      resolveExactArtwork(key);
    }

    const customVideo = stage.querySelector('.mobile-vec-motion-video');
    const moving = Boolean(
      customVideo &&
      customVideo.classList.contains('is-moving') &&
      !customVideo.paused &&
      !customVideo.ended &&
      Number(customVideo.currentTime || 0) > 0.04
    );

    if (moving) {
      player.classList.add('vec-stable-video');
      player.classList.remove('vec-stable-artwork');
      return;
    }

    player.classList.add('vec-stable-artwork');
    player.classList.remove('vec-stable-video');

    if (state.artworkUrl) applyExactArtwork(stage, state.artworkUrl);
    else holdForExactArtwork(stage);
  }

  function schedule() {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(stabilize);
  }

  function prefetchFromTarget(target) {
    const song = target?.closest?.('#v2App [data-song]');
    const key = clean(song?.dataset?.song);
    if (!key) return;
    const url = cachedUrl(key);
    if (url) preload(url);
    else fetchExact9x16(key).then(preload).catch(() => {});
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'data-song-key', 'data-mobile-vec-motion-song-key'],
  });

  document.addEventListener('pointerdown', event => prefetchFromTarget(event.target), true);
  document.addEventListener('touchstart', event => prefetchFromTarget(event.target), { capture: true, passive: true });
  document.addEventListener('play', schedule, true);
  document.addEventListener('pause', schedule, true);
  window.addEventListener('stashbox:vec-asset-change', schedule, true);
  window.addEventListener('stashbox:player-view-mode-change', schedule, true);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 120), { passive: true });
  window.addEventListener('online', () => {
    if (state.songKey) resolveExactArtwork(state.songKey, true);
  });

  installCss();
  state.timer = window.setInterval(stabilize, 250);
  stabilize();

  window.StashboxMobileVecFlickerGuard = Object.freeze({
    refresh: () => {
      if (state.songKey) resolveExactArtwork(state.songKey, true);
      schedule();
    },
    prefetchSong: fetchExact9x16,
    cachedUrl,
    state: () => ({
      songKey: state.songKey,
      artworkUrl: state.artworkUrl,
      artworkState: state.artworkState,
      mode: state.player?.classList.contains('vec-stable-video') ? 'video' : 'artwork',
    }),
    stop: () => {
      clearInterval(state.timer);
      clearTimeout(state.retryTimer);
      observer.disconnect();
      state.player?.classList.remove('vec-presentation-stable', 'vec-stable-artwork', 'vec-stable-video');
    },
  });
})();