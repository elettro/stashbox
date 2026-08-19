(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopPlayStatUi) return;

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v7H5a1 1 0 0 1-1-1v-6Zm16 0h-3v7h2a1 1 0 0 0 1-1v-6Z"/></svg>';
  let timer = 0;
  let attempts = 0;

  function installStyles() {
    if (document.getElementById('desktopPlayStatUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'desktopPlayStatUiStyles';
    style.textContent = `
      @media (min-width: 900px) {
        #v2App .v2-player-controls:has(> [data-play-stat-desktop]) {
          grid-template-columns: 52px 52px 76px 52px 52px 64px !important;
        }
        #v2App .v2-player-controls > [data-like] { order: 1 !important; }
        #v2App .v2-player-controls > [data-prev] { order: 2 !important; }
        #v2App .v2-player-controls > [data-play] { order: 3 !important; }
        #v2App .v2-player-controls > [data-next] { order: 4 !important; }
        #v2App .v2-player-controls > [data-share] { order: 5 !important; }
        #v2App .v2-player-controls > [data-play-stat-desktop] { order: 6 !important; }
        #v2App [data-play-stat-desktop] {
          width: 64px;
          min-width: 64px;
          height: 52px;
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #fff;
          pointer-events: none;
        }
        #v2App [data-play-stat-desktop] svg {
          width: 22px;
          height: 22px;
          flex: 0 0 auto;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        #v2App [data-play-stat-desktop] [data-plays] {
          display: inline-block;
          min-width: 1ch;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          text-align: left;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function mount() {
    installStyles();
    const player = document.querySelector('#v2App [data-player]');
    const controls = player?.querySelector('.v2-player-controls');
    const share = controls?.querySelector('[data-share]');
    if (!player || !controls || !share) return false;

    let stat = controls.querySelector('[data-play-stat-desktop]');
    if (!stat) {
      stat = document.createElement('span');
      stat.setAttribute('data-play-stat-desktop', '');
      stat.setAttribute('aria-label', 'Song plays');
      stat.innerHTML = `${ICON}<span data-plays>0</span>`;
    }
    if (stat.previousElementSibling !== share) {
      share.insertAdjacentElement('afterend', stat);
    }

    const api = window.StashboxV2PlayTracker;
    if (api?.refreshUi) {
      try { api.refreshUi(); } catch (_) {}
    }
    return true;
  }

  function startRetryWindow() {
    clearInterval(timer);
    attempts = 0;
    mount();
    timer = window.setInterval(() => {
      attempts += 1;
      mount();
      if (attempts >= 40) {
        clearInterval(timer);
        timer = 0;
      }
    }, 250);
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) startRetryWindow();
  }, true);
  document.addEventListener('timeupdate', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) mount();
  }, true);

  startRetryWindow();
  window.StashboxDesktopPlayStatUi = Object.freeze({ refresh: mount });
})();
