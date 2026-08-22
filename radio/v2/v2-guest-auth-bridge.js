(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  let authOpenQueued = false;

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function openAuth(view = 'login') {
    if (authOpenQueued) return;
    authOpenQueued = true;
    const requestedView = view === 'signup' ? 'signup' : 'login';

    // Run outside the intercepted player click. This prevents player overlay
    // listeners from swallowing the synthetic auth request in Safari/mobile.
    window.setTimeout(() => {
      authOpenQueued = false;
      const proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.hidden = true;
      proxy.tabIndex = -1;
      proxy.dataset.v2AuthOpen = requestedView;
      document.body.appendChild(proxy);
      proxy.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      }));
      proxy.remove();
    }, 0);
  }

  document.addEventListener('click', event => {
    if (loggedIn()) return;

    const headerTrigger = event.target.closest('[data-guest-safe-auth] [data-v2-auth-open]');
    const playlistTrigger = event.target.closest('[data-guest-add-playlist]');
    const trigger = headerTrigger || playlistTrigger;
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openAuth(headerTrigger?.dataset.v2AuthOpen || 'login');
  }, true);
})();
