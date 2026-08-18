(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  const hasSession = () => {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  };

  const ensureLogin = () => {
    const header = app.querySelector('.v2-header');
    if (!header) return false;

    let actions = header.querySelector('.v2-header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'v2-header-actions';
      actions.setAttribute('aria-label', 'Account actions');
      header.appendChild(actions);
    }

    let login = actions.querySelector('.v2-header-login');
    if (!login) {
      login = document.createElement('a');
      login.className = 'v2-header-login';
      login.href = '/radio/dev/v2/?auth=login';
      login.dataset.v2AuthOpen = 'login';
      actions.appendChild(login);
    }

    const active = hasSession();
    login.textContent = active ? 'Account' : 'Log In';
    login.setAttribute('aria-label', active ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
    return true;
  };

  ensureLogin();

  const observer = new MutationObserver(() => ensureLogin());
  observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('stashbox:v2-auth-changed', ensureLogin);
  window.addEventListener('stashbox:v2-session-changed', ensureLogin);
  window.addEventListener('pageshow', ensureLogin);
  window.addEventListener('focus', ensureLogin);
})();
