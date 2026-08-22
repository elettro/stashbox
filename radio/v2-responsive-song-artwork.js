(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/') || path.includes('/radio/artist/')) return;
  if (window.StashboxResponsiveArtwork) return;

  const DESKTOP_MIN_WIDTH = 900;
  let resizeTimer = 0;

  const clean = value => String(value ?? '').trim();

  function desktopOwned() {
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    return width >= DESKTOP_MIN_WIDTH;
  }

  function mobileResolver() {
    return window.StashboxMobileOfficialArtwork9x16 || null;
  }

  function refresh() {
    if (desktopOwned()) return false;
    const resolver = mobileResolver();
    resolver?.refresh?.();
    return Boolean(resolver);
  }

  function prefetchSong(songKey) {
    const key = clean(songKey);
    if (!key || desktopOwned()) return Promise.resolve('');
    const resolver = mobileResolver();
    if (!resolver?.prefetchSong) return Promise.resolve('');
    try {
      return Promise.resolve(resolver.prefetchSong(key));
    } catch (_) {
      return Promise.resolve('');
    }
  }

  document.addEventListener('pointerdown', event => {
    if (desktopOwned()) return;
    const songElement = event.target.closest?.('#v2App [data-song]');
    const songKey = clean(songElement?.dataset?.song);
    if (songKey) prefetchSong(songKey);
  }, true);

  window.addEventListener('stashbox:vec-asset-change', event => {
    if (desktopOwned()) return;
    const source = clean(event?.detail?.asset?.source).toLowerCase();
    if (source === 'official-artwork') window.setTimeout(refresh, 0);
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!desktopOwned()) refresh();
    }, 140);
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      if (!desktopOwned()) refresh();
    }, 160);
  }, { passive: true });

  window.StashboxResponsiveArtwork = Object.freeze({
    refresh,
    prefetchSong,
    desktopOwned
  });
})();