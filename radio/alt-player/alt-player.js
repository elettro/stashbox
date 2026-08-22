(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const ALT_HOME = '/radio/alt-player/';
  const MAIN_HOME = '/radio/';
  const DESKTOP = window.matchMedia('(min-width: 700px)');

  document.body.classList.add('v2-alt-player');

  function syncDesktopVecBadge() {
    if (!DESKTOP.matches) return;

    const player = app.querySelector('[data-player]');
    const header = player?.querySelector('.v2-player-header');
    const back = header?.querySelector('[data-close-player], [data-close]');
    const badge = player?.querySelector('#viewer-vec-status, [data-mobile-vec-status]');

    if (!header || !back || !badge) return;

    badge.classList.add('v2-alt-desktop-vec-badge');
    if (badge.parentElement !== header || badge.previousElementSibling !== back) {
      back.insertAdjacentElement('afterend', badge);
    }
  }

  function syncInterface() {
    app.querySelectorAll('.v2-wordmark, .v2-player-mark').forEach(link => {
      if (link.getAttribute('href') !== ALT_HOME) link.setAttribute('href', ALT_HOME);
    });

    let returnLink = document.querySelector('.v2-alt-return');
    if (!returnLink) {
      returnLink = document.createElement('a');
      returnLink.className = 'v2-alt-return';
      returnLink.href = MAIN_HOME;
      returnLink.textContent = 'MAIN V2';
      returnLink.setAttribute('aria-label', 'Return to the main V2 interface');
      document.body.appendChild(returnLink);
    }

    syncDesktopVecBadge();
  }

  const observer = new MutationObserver(syncInterface);
  observer.observe(app, { childList: true, subtree: true });

  DESKTOP.addEventListener?.('change', syncInterface);
  window.addEventListener('stashbox:vec-asset-change', syncInterface);
  window.addEventListener('resize', syncInterface, { passive: true });

  syncInterface();
})();