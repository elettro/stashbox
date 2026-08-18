(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const root = document.querySelector('[data-desktop-persistent-controls]');
  if (!root) return;

  const login = root.querySelector('[data-desktop-login]');
  const bell = root.querySelector('[data-desktop-notifications]');

  const hasSession = () => {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  };

  const syncLogin = () => {
    if (!login) return;
    const active = hasSession();
    login.textContent = active ? 'Account' : 'Log In';
    login.setAttribute('aria-label', active ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
  };

  login?.addEventListener('click', event => {
    if (!hasSession()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = '/radio/dev/v2/profile/';
  }, true);

  bell?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const app = document.getElementById('v2App');
    if (!app) return;
    let proxy = app.querySelector('.v2-notifications-trigger');
    if (!proxy) {
      const actions = app.querySelector('.v2-header-actions') || app.querySelector('.v2-header');
      if (!actions) return;
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'v2-notifications-trigger';
      proxy.setAttribute('aria-label', 'Notifications');
      proxy.hidden = true;
      actions.appendChild(proxy);
    }
    proxy.click();
  }, true);

  window.addEventListener('stashbox:v2-auth-changed', syncLogin);
  window.addEventListener('stashbox:v2-session-changed', syncLogin);
  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) syncLogin();
  });
  window.addEventListener('pageshow', syncLogin);
  window.addEventListener('focus', syncLogin);

  syncLogin();
  window.StashboxDesktopPersistentControls = Object.freeze({ refresh: syncLogin });
})();
