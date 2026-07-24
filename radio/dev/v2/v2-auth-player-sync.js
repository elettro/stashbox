(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  let previousLoggedIn = null;
  let retryTimer = 0;

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function nudgeLoggedInPlayer() {
    if (!loggedIn()) return;
    const player = app.querySelector('[data-player]');
    if (!player) {
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(nudgeLoggedInPlayer, 100);
      return;
    }

    // The stable player controller watches the hidden attribute. Toggle it
    // synchronously so the observer re-evaluates authentication without a
    // visible repaint or interrupting the active audio element.
    if (!player.hidden && !player.classList.contains('is-logged-in-player')) {
      player.hidden = true;
      player.hidden = false;
    }

    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-ready', {
      detail: { loggedIn: true }
    }));
  }

  function synchronize(force = false) {
    const current = loggedIn();
    if (!force && current === previousLoggedIn) return;
    previousLoggedIn = current;
    if (current) nudgeLoggedInPlayer();
  }

  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) synchronize(true);
  });
  window.addEventListener('pageshow', () => synchronize(true));
  window.addEventListener('focus', () => synchronize(true));
  window.addEventListener('stashbox:v2-auth-changed', () => synchronize(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) synchronize(true);
  });

  window.setInterval(synchronize, 500);
  synchronize(true);
})();
