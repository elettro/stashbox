(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';

  const hasSession = () => {
    try { return Boolean(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken); }
    catch (_) { return false; }
  };

  const install = () => {
    const actions = document.querySelector('#v2App .v2-header-actions');
    if (!actions) return false;

    actions.querySelectorAll('.stashbox-action-row').forEach(row => {
      if (!row.children.length) row.remove();
    });

    const existing = actions.querySelector('.v2-header-login');
    let button = existing;

    if (!existing || existing.tagName !== 'BUTTON') {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2-header-login';
      if (existing) existing.replaceWith(button);
      else actions.appendChild(button);
    }

    button.type = 'button';
    button.removeAttribute('href');
    button.dataset.v2AuthOpen = 'login';
    button.textContent = hasSession() ? 'Account' : 'Log In';
    button.setAttribute('aria-label', hasSession() ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
    button.removeAttribute('style');
    return true;
  };

  if (install()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
