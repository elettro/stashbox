(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';

  const hasSession = () => {
    try { return Boolean(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken); }
    catch (_) { return false; }
  };

  const installLoginButton = () => {
    document.querySelectorAll('.v2-safe-login').forEach(element => element.remove());

    const actions = document.querySelector('#v2App .v2-header-actions');
    if (!actions) return false;

    actions.querySelectorAll('.stashbox-action-row').forEach(row => {
      if (!row.children.length) row.remove();
    });

    let link = actions.querySelector('.v2-header-login');
    if (!link) {
      link = document.createElement('a');
      link.className = 'v2-header-login';
      actions.appendChild(link);
    }

    link.href = '/radio/dev/v2/?auth=login';
    link.dataset.v2AuthOpen = 'login';
    link.textContent = hasSession() ? 'Account' : 'Log In';
    link.setAttribute('aria-label', hasSession() ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
    link.removeAttribute('style');

    if (link.dataset.v2AuthBound !== 'true') {
      link.dataset.v2AuthBound = 'true';
      link.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (window.StashboxV2Auth?.open) {
          window.StashboxV2Auth.open('login');
          return;
        }
        history.replaceState(null, '', '/radio/dev/v2/?auth=login');
        window.dispatchEvent(new CustomEvent('stashbox:v2-auth-open', { detail: { view: 'login' } }));
      });
    }

    return true;
  };

  if (installLoginButton()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installLoginButton() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
