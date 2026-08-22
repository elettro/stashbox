(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  const bellIcon = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';

  const hasSession = () => {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  };

  function ensureControls() {
    const header = app.querySelector('.v2-header');
    if (!header) return false;

    let actions = header.querySelector('.v2-header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'v2-header-actions';
      header.appendChild(actions);
    }
    actions.setAttribute('aria-label', 'Account and notification actions');

    let bell = actions.querySelector('.v2-notifications-trigger');
    if (!bell) {
      bell = document.createElement('button');
      bell.type = 'button';
      bell.className = 'v2-icon-button v2-notifications-trigger';
      bell.setAttribute('aria-label', 'Notifications');
      bell.innerHTML = `${bellIcon}<span class="v2-notification-dot"></span>`;
      actions.appendChild(bell);
    }

    let login = actions.querySelector('.v2-header-login');
    if (!login) {
      login = document.createElement('a');
      login.className = 'v2-header-login';
      login.href = '/radio/attempt2/?auth=login';
      login.dataset.v2AuthOpen = 'login';
      actions.appendChild(login);
    }

    const active = hasSession();
    login.textContent = active ? 'Account' : 'Log In';
    login.setAttribute('aria-label', active ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
    return true;
  }

  // Recovery replaces the direct children of #v2App. Observe only that boundary,
  // not the subtree, so restoring header controls cannot create a mutation loop.
  const observer = new MutationObserver(() => {
    queueMicrotask(() => {
      ensureControls();
      window.StashboxV2Notifications?.refresh?.();
    });
  });
  observer.observe(app, { childList: true });

  document.addEventListener('click', event => {
    const login = event.target.closest('#v2App .v2-header-login');
    if (!login || !hasSession()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = '/radio/attempt2/profile/';
  }, true);

  window.addEventListener('stashbox:v2-auth-changed', ensureControls);
  window.addEventListener('stashbox:v2-session-changed', ensureControls);
  window.addEventListener('pageshow', ensureControls);
  window.addEventListener('focus', ensureControls);

  ensureControls();
  window.StashboxDesktopShellControls = Object.freeze({ refresh: ensureControls });
})();
