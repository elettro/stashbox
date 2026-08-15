(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoFitToggle) return;

  const STORAGE_KEY = 'stashbox_desktop_video_fit';
  const app = document.getElementById('v2App');
  if (!app) return;

  const readMode = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'fit' ? 'fit' : 'fill';
    } catch (_) {
      return 'fill';
    }
  };

  const saveMode = mode => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
  };

  const player = () => [...app.querySelectorAll('[data-player]')].find(node => {
    if (!node || node.hidden || !node.isConnected) return false;
    const css = getComputedStyle(node);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }) || app.querySelector('[data-player]');

  const icon = mode => mode === 'fit'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/><path d="M8 8h8v8H8z"/></svg>';

  function apply(mode = readMode()) {
    const p = player();
    if (!p) return;
    const next = mode === 'fit' ? 'fit' : 'fill';
    p.dataset.desktopVideoFit = next;
    const button = p.querySelector('[data-desktop-video-fit-toggle]');
    if (button) {
      button.dataset.mode = next;
      button.innerHTML = icon(next);
      button.setAttribute('aria-pressed', next === 'fit' ? 'true' : 'false');
      button.setAttribute('aria-label', next === 'fit' ? 'Show video full frame with no cropping' : 'Fill video frame');
      button.title = next === 'fit' ? 'FIT: show full video' : 'FILL: fill video frame';
    }
  }

  function install() {
    const p = player();
    if (!p) return false;
    const row = p.querySelector('.v2-artist-row');
    if (!row) return false;

    if (!row.querySelector('[data-desktop-video-fit-toggle]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2-desktop-video-fit-toggle';
      button.dataset.desktopVideoFitToggle = 'true';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const current = p.dataset.desktopVideoFit === 'fit' ? 'fit' : 'fill';
        const next = current === 'fit' ? 'fill' : 'fit';
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

  install();

  const observer = new MutationObserver(() => {
    if (install()) apply(readMode());
  });
  observer.observe(app, { childList: true, subtree: true });

  window.StashboxDesktopVideoFitToggle = Object.freeze({
    set: mode => {
      const next = mode === 'fit' ? 'fit' : 'fill';
      saveMode(next);
      apply(next);
    },
    get: () => readMode()
  });
})();
