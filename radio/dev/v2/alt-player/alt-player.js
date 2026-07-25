(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const ALT_HOME = '/radio/dev/v2/alt-player/';
  const MAIN_HOME = '/radio/dev/v2/';

  document.body.classList.add('v2-alt-player');

  function syncLinks() {
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
  }

  const observer = new MutationObserver(syncLinks);
  observer.observe(app, { childList: true, subtree: true });
  syncLinks();
})();