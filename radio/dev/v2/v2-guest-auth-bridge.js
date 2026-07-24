(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function openAuth(view = 'login') {
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.hidden = true;
    proxy.dataset.v2AuthOpen = view;
    document.body.appendChild(proxy);
    proxy.click();
    proxy.remove();
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
