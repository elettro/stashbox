(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoFitToggle) return;

  const STORAGE_KEY = 'stashbox_desktop_video_fit_v3';
  const app = document.getElementById('v2App');
  if (!app) return;

  const readMode = () => {
    try { return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'fit'; }
    catch (_) { return 'fit'; }
  };

  const saveMode = mode => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
  };

  const getPlayer = () => [...app.querySelectorAll('[data-player]')].find(node => {
    if (!node || node.hidden || !node.isConnected) return false;
    const css = getComputedStyle(node);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }) || app.querySelector('[data-player]');

  function applyVideoMode(player, mode) {
    if (!player) return;
    const fit = mode === 'full' ? 'cover' : 'contain';
    player.querySelectorAll([
      '.desktop-vec2-stage video',
      '.desktop-vec2-layer video',
      '[data-mobile-vec-stage] video',
      'video[data-desktop-minimal-rescue="true"]'
    ].join(',')).forEach(video => {
      if (!(video instanceof HTMLVideoElement)) return;
      video.style.setProperty('object-fit', fit, 'important');
      video.style.setProperty('object-position', 'center center', 'important');
      video.dataset.desktopVideoFitApplied = mode;
    });
  }

  function apply(mode) {
    const player = getPlayer();
    if (!player) return false;
    const next = mode === 'full' ? 'full' : 'fit';
    player.dataset.desktopVideoFit = next;
    applyVideoMode(player, next);

    const button = player.querySelector('[data-desktop-video-fit-toggle]');
    if (button) {
      button.dataset.mode = next;
      button.textContent = next.toUpperCase();
      button.setAttribute('aria-label', next === 'fit' ? 'Video mode FIT. Switch to FULL.' : 'Video mode FULL. Switch to FIT.');
      button.title = next === 'fit' ? 'FIT — click for FULL' : 'FULL — click for FIT';
    }
    return true;
  }

  function install() {
    const player = getPlayer();
    const row = player?.querySelector('.v2-artist-row');
    if (!player || !row) return false;

    let button = row.querySelector('[data-desktop-video-fit-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2-desktop-video-fit-toggle';
      button.dataset.desktopVideoFitToggle = 'true';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const current = getPlayer()?.dataset.desktopVideoFit === 'full' ? 'full' : 'fit';
        const next = current === 'fit' ? 'full' : 'fit';
        saveMode(next);
        apply(next);
      });
      const more = row.querySelector('.v2-li-song-more');
      if (more) row.insertBefore(button, more);
      else row.appendChild(button);
    }

    apply(readMode());
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 60) window.clearInterval(timer);
  }, 250);
  install();

  window.addEventListener('stashbox:desktop-song-change', () => window.setTimeout(() => apply(readMode()), 0));

  // VEC 2 creates/replaces video nodes as assets advance. Apply the selected
  // mode to each real desktop video when the browser begins loading/playing it.
  ['loadedmetadata', 'canplay', 'playing'].forEach(type => {
    document.addEventListener(type, event => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      const player = video.closest('#v2App [data-player]');
      if (!player || !video.closest('.desktop-vec2-stage, [data-mobile-vec-stage]')) return;
      applyVideoMode(player, player.dataset.desktopVideoFit === 'full' ? 'full' : readMode());
    }, true);
  });

  window.StashboxDesktopVideoFitToggle = Object.freeze({
    set: mode => {
      const next = mode === 'full' ? 'full' : 'fit';
      saveMode(next);
      apply(next);
    },
    get: readMode
  });
})();
