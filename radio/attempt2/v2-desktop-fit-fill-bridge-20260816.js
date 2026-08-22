(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopFitFillBridge20260816) return;

  const STORAGE_KEY = 'stashbox_desktop_video_fit';
  const ROOT_ATTR = 'data-stashbox-desktop-video-fit';

  const readMode = () => {
    try { return localStorage.getItem(STORAGE_KEY) === 'fill' ? 'fill' : 'fit'; }
    catch (_) { return 'fit'; }
  };

  const saveMode = mode => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
  };

  const ensureStyle = () => {
    if (document.getElementById('stashbox-desktop-fit-fill-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'stashbox-desktop-fit-fill-bridge-style';
    style.textContent = `
      @media (min-width: 900px) {
        html[${ROOT_ATTR}="fit"] #v2App [data-mobile-vec-stage] video,
        html[${ROOT_ATTR}="fit"] #v2App video[data-desktop-minimal-rescue="true"],
        html[${ROOT_ATTR}="fit"] #v2App video[data-main-vec-watchdog="true"] {
          object-fit: contain !important;
          object-position: center center !important;
        }
        html[${ROOT_ATTR}="fill"] #v2App [data-mobile-vec-stage] video,
        html[${ROOT_ATTR}="fill"] #v2App video[data-desktop-minimal-rescue="true"],
        html[${ROOT_ATTR}="fill"] #v2App video[data-main-vec-watchdog="true"] {
          object-fit: cover !important;
          object-position: center center !important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const syncButtons = mode => {
    document.querySelectorAll('#v2App [data-desktop-rescue-fit-toggle]').forEach(button => {
      button.textContent = mode === 'fit' ? 'FIT' : 'FILL';
      button.dataset.mode = mode;
      button.setAttribute('aria-pressed', mode === 'fit' ? 'true' : 'false');
      button.title = mode === 'fit'
        ? 'FIT: shows the entire video with no cropping. Click for FILL.'
        : 'FILL: fills the player and may crop the video. Click for FIT.';
      button.setAttribute('aria-label', button.title);
    });
  };

  const apply = (mode, { persist = false } = {}) => {
    const next = mode === 'fill' ? 'fill' : 'fit';
    document.documentElement.setAttribute(ROOT_ATTR, next);
    if (persist) saveMode(next);

    document.querySelectorAll('#v2App [data-player]').forEach(player => {
      player.dataset.desktopVideoFit = next;
    });

    const objectFit = next === 'fit' ? 'contain' : 'cover';
    document.querySelectorAll('#v2App [data-mobile-vec-stage] video, #v2App video[data-desktop-minimal-rescue="true"], #v2App video[data-main-vec-watchdog="true"]').forEach(video => {
      video.style.setProperty('object-fit', objectFit, 'important');
      video.style.setProperty('object-position', 'center center', 'important');
    });

    syncButtons(next);

    const runtime = window.StashboxDesktopVideoRuntime20260816;
    if (runtime?.fitMode?.() !== next && typeof runtime?.setFitMode === 'function') {
      runtime.setFitMode(next);
    }
    return next;
  };

  ensureStyle();
  apply(readMode());

  // Capture at window level so the toggle always controls the actual active desktop
  // presentation mode before any player-level click handler can consume the event.
  window.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-desktop-rescue-fit-toggle]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = document.documentElement.getAttribute(ROOT_ATTR) === 'fill' ? 'fill' : 'fit';
    apply(current === 'fit' ? 'fill' : 'fit', { persist: true });
  }, true);

  // Keep dynamically created VEC videos and rebuilt player controls synchronized.
  const timer = window.setInterval(() => apply(readMode()), 500);

  window.StashboxDesktopFitFillBridge20260816 = Object.freeze({
    get: () => document.documentElement.getAttribute(ROOT_ATTR) === 'fill' ? 'fill' : 'fit',
    set: mode => apply(mode, { persist: true }),
    stop: () => window.clearInterval(timer)
  });
})();
