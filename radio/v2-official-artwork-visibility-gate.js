(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app || window.StashboxOfficialArtworkVisibilityGate) return;

  let operation = 0;
  let activeSongKey = '';
  let activeSource = '';
  const imageLoads = new Map();

  const clean = value => String(value ?? '').trim();
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function mobilePortrait() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    return width <= 820 && height >= width * 1.15;
  }

  function player() {
    return [...app.querySelectorAll('[data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function stage(currentPlayer = player()) {
    return currentPlayer?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function activeImage(currentStage = stage()) {
    return currentStage?.querySelector('img.v2-mobile-vec-media.is-active')
      || [...(currentStage?.querySelectorAll('img.v2-mobile-vec-media') || [])].at(-1)
      || null;
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

  function hideSquareFrame(songKey, token) {
    if (token !== operation || songKey !== activeSongKey || activeSource !== 'official-artwork') return;
    const currentPlayer = player();
    const currentStage = stage(currentPlayer);
    const image = activeImage(currentStage);

    if (currentPlayer) {
      currentPlayer.dataset.officialArtworkGate = 'waiting-9x16';
      currentPlayer.dataset.officialArtworkSongKey = songKey;
    }
    if (currentStage) {
      currentStage.dataset.officialArtworkGate = 'waiting-9x16';
      currentStage.style.backgroundImage = 'none';
      currentStage.style.backgroundColor = '#050607';
    }
    if (image) {
      image.dataset.officialArtworkGate = 'waiting-9x16';
      image.style.setProperty('opacity', '0', 'important');
      image.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function reveal9x16(songKey, url, token) {
    if (
      token !== operation ||
      songKey !== activeSongKey ||
      activeSource !== 'official-artwork' ||
      !mobilePortrait()
    ) return false;

    const source = fixUrl(url);
    const currentPlayer = player();
    const currentStage = stage(currentPlayer);
    const image = activeImage(currentStage);
    if (!source || !currentPlayer || !currentStage || !image) return false;

    const safeUrl = source.replaceAll('"', '%22');
    currentStage.style.backgroundImage = `url("${safeUrl}")`;
    currentStage.style.backgroundPosition = 'center center';
    currentStage.style.backgroundRepeat = 'no-repeat';
    currentStage.style.backgroundSize = 'contain';
    currentStage.style.backgroundColor = '#050607';
    currentStage.dataset.officialArtworkGate = 'ready-9x16';
    currentStage.dataset.songArtworkRequestedRatio = '9x16';
    currentStage.dataset.songArtworkSourceRatio = '9x16';

    image.src = source;
    image.dataset.officialArtworkGate = 'ready-9x16';
    image.dataset.responsiveOfficialArtwork = 'true';
    image.dataset.responsiveArtworkRequestedRatio = '9x16';
    image.dataset.responsiveArtworkRatio = '9x16';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    image.style.objectFit = 'contain';
    image.style.objectPosition = 'center center';
    image.style.removeProperty('visibility');
    image.style.setProperty('opacity', '1', 'important');

    currentPlayer.dataset.officialArtworkGate = 'ready-9x16';
    currentPlayer.dataset.songArtworkRequestedRatio = '9x16';
    currentPlayer.dataset.songArtworkSourceRatio = '9x16';
    currentPlayer.classList.add('has-exact-responsive-artwork', 'responsive-artwork-ready');
    currentPlayer.classList.remove('responsive-artwork-pending');
    return true;
  }

  function releaseGate() {
    const currentPlayer = player();
    const currentStage = stage(currentPlayer);
    const image = activeImage(currentStage);
    if (image) {
      image.style.removeProperty('visibility');
      image.style.removeProperty('opacity');
      image.dataset.officialArtworkGate = 'released';
    }
    if (currentStage) currentStage.dataset.officialArtworkGate = 'released';
    if (currentPlayer) currentPlayer.dataset.officialArtworkGate = 'released';
  }

  async function resolveOfficialArtwork(songKey) {
    const key = clean(songKey);
    if (!key || !mobilePortrait()) return;
    const token = ++operation;
    activeSongKey = key;
    activeSource = 'official-artwork';
    hideSquareFrame(key, token);

    const resolver = window.StashboxMobileOfficialArtwork9x16;
    let url = fixUrl(resolver?.cachedUrl?.(key));

    if (!url) {
      try { url = fixUrl(await resolver?.prefetchSong?.(key)); } catch (_) { url = ''; }
    }

    if (token !== operation || key !== activeSongKey || activeSource !== 'official-artwork') return;

    if (!url) {
      window.setTimeout(() => {
        if (token !== operation || key !== activeSongKey || activeSource !== 'official-artwork') return;
        const retryUrl = fixUrl(resolver?.cachedUrl?.(key));
        if (retryUrl) {
          preload(retryUrl).then(loaded => {
            if (loaded) reveal9x16(key, retryUrl, token);
          });
        }
      }, 450);
      return;
    }

    const loaded = await preload(url);
    if (loaded) reveal9x16(key, url, token);
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const source = clean(detail?.asset?.source).toLowerCase();
    const songKey = clean(detail.songKey);

    activeSongKey = songKey;
    activeSource = source;

    if (source === 'official-artwork' && mobilePortrait()) {
      resolveOfficialArtwork(songKey);
      return;
    }

    operation += 1;
    releaseGate();
  });

  window.addEventListener('stashbox:player-view-mode-change', () => {
    if (activeSongKey && activeSource === 'official-artwork' && mobilePortrait()) {
      resolveOfficialArtwork(activeSongKey);
    }
  });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      if (activeSongKey && activeSource === 'official-artwork' && mobilePortrait()) {
        resolveOfficialArtwork(activeSongKey);
      } else {
        releaseGate();
      }
    }, 120);
  }, { passive: true });

  window.StashboxOfficialArtworkVisibilityGate = Object.freeze({
    refresh: () => activeSongKey && activeSource === 'official-artwork' && resolveOfficialArtwork(activeSongKey),
    state: () => ({ songKey: activeSongKey, source: activeSource, operation })
  });
})();