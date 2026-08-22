(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
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
      login.href = '/radio/attempt2/?auth=login';
      login.dataset.v2AuthOpen = 'login';
      actions.appendChild(login);
    }

    const active = hasSession();
    const label = active ? 'Account' : 'Log In';
    const aria = active ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio';
    if (login.textContent !== label) login.textContent = label;
    if (login.getAttribute('aria-label') !== aria) login.setAttribute('aria-label', aria);
    return true;
  };

  // v2-recovery performs one asynchronous app render after its catalog request.
  // Use a finite set of one-shot repairs around that boot window instead of a
  // subtree MutationObserver. The old observer was triggered by every VEC media
  // append/remove and then mutated the header again, creating a feedback loop.
  const bootDelays = [0, 50, 250, 750, 2000, 5000, 10000, 20000, 26000];
  const bootTimers = bootDelays.map(delay => window.setTimeout(ensureLogin, delay));

  window.addEventListener('stashbox:v2-auth-changed', ensureLogin);
  window.addEventListener('stashbox:v2-session-changed', ensureLogin);
  window.addEventListener('pageshow', ensureLogin);
  window.addEventListener('focus', ensureLogin);

  window.StashboxDesktopAuthPersist = Object.freeze({
    refresh: ensureLogin,
    stopBootRepairs: () => bootTimers.forEach(timer => window.clearTimeout(timer))
  });
})();
