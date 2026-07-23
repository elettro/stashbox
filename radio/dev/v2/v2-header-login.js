(() => {
  'use strict';

  const installLoginButton = () => {
    const actions = document.querySelector('#v2App .v2-header-actions');
    if (!actions) return false;
    if (actions.querySelector('.v2-header-login')) return true;

    const link = document.createElement('a');
    link.className = 'v2-header-login';
    link.href = '/radio/dev/';
    link.textContent = 'Log In';
    link.setAttribute('aria-label', 'Log in to Stashbox Radio');
    link.style.cssText = 'height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:999px;background:linear-gradient(135deg,#ffb12b,#ff8f12);box-shadow:0 8px 24px rgba(255,159,10,.2);color:#160d04;font:900 14px/1 Karla,system-ui,sans-serif;text-decoration:none;white-space:nowrap;flex:0 0 auto';
    actions.appendChild(link);
    return true;
  };

  if (installLoginButton()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installLoginButton() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
