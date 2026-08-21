(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoFitToggle) return;

  const STORAGE_KEY = 'stashbox_desktop_video_fit_v4';
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
    const button = player.querySelector('[data-desktop-video-fit-toggle] button[data-fit-toggle]');
    if (button) {
      button.textContent = next === 'full' ? 'FULL' : 'FIT';
      button.dataset.fitMode = next;
      button.setAttribute('aria-pressed', next === 'full' ? 'true' : 'false');
      button.setAttribute('aria-label', next === 'full'
        ? 'Video view is FULL. Click to switch to FIT.'
        : 'Video view is FIT. Click to switch to FULL.');
      button.title = next === 'full' ? 'Switch video view to FIT' : 'Switch video view to FULL';
    }
    return true;
  }

  function install() {
    const player = getPlayer();
    const row = player?.querySelector('.v2-artist-row');
    if (!player || !row) return false;

    let control = row.querySelector('[data-desktop-video-fit-toggle]');
    if (!control) {
      control = document.createElement('span');
      control.className = 'v2-desktop-video-fit-toggle';
      control.dataset.desktopVideoFitToggle = 'true';
      control.innerHTML = '<button type="button" data-fit-toggle data-fit-mode="fit" aria-pressed="false">FIT</button>';
      control.addEventListener('click', event => {
        const button = event.target.closest('button[data-fit-toggle]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const current = readMode();
        const next = current === 'full' ? 'fit' : 'full';
        saveMode(next);
        apply(next);
      });
      const more = row.querySelector('.v2-li-song-more');
      if (more) row.insertBefore(control, more);
      else row.appendChild(control);
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
