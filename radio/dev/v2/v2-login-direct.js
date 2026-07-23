(() => {
  'use strict';

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
    button.textContent = 'Log In';
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
