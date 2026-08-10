(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';

  const readAccessToken = () => {
    try {
      return String(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken || '');
    } catch (_) {
      return '';
    }
  };

  const finishSuccessfulLogin = () => {
    const overlay = document.querySelector('.v2-auth-overlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      window.setTimeout(() => { overlay.hidden = true; }, 430);
    }
    document.body.classList.remove('v2-auth-open');

    const loginButton = document.querySelector('.v2-header-login');
    if (loginButton) loginButton.textContent = 'Account';

    const detail = { reason: 'login-complete', loggedIn: true, refreshedAt: Date.now() };
    window.dispatchEvent(new CustomEvent('stashbox:v2-session-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-ready', { detail }));
  };

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-v2-auth-form="login"]');
    if (!form) return;

    const previousToken = readAccessToken();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const currentToken = readAccessToken();
      if (currentToken && currentToken !== previousToken) {
        window.clearInterval(timer);
        finishSuccessfulLogin();
        return;
      }
      if (attempts >= 120) window.clearInterval(timer);
    }, 100);
  }, true);

  const install = () => {
    const actions = document.querySelector('#v2App .v2-header-actions');
    if (!actions) return false;

    actions.querySelectorAll('.v2-header-login').forEach(element => element.remove());
    actions.querySelectorAll('.stashbox-action-row').forEach(row => {
      if (!row.children.length) row.remove();
    });

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v2-header-login';
    button.dataset.v2AuthOpen = 'login';
    button.textContent = readAccessToken() ? 'Account' : 'Log In';
    button.setAttribute('aria-label', 'Log in to Stashbox Radio');
    actions.appendChild(button);
    return true;
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
