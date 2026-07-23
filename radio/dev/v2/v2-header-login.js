(() => {
  'use strict';

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
      link.href = '/radio/dev/';
      link.textContent = 'Log In';
      link.setAttribute('aria-label', 'Log in to Stashbox Radio');
      actions.appendChild(link);
    }

    link.removeAttribute('style');
    return true;
  };

  if (installLoginButton()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installLoginButton() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
