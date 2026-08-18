(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const root = document.querySelector('[data-desktop-persistent-controls]');
  const app = document.getElementById('v2App');
  if (!root || !app) return;

  const login = root.querySelector('[data-desktop-login]');
  const bell = root.querySelector('[data-desktop-notifications]');
  let positionFrame = 0;

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

  const positionBesideSearch = () => {
    window.cancelAnimationFrame(positionFrame);
    positionFrame = window.requestAnimationFrame(() => {
      const search = app.querySelector('.v2-header [data-search]');
      if (!search) {
        root.removeAttribute('data-anchored');
        return;
      }

      const searchRect = search.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const gap = 10;
      const maxLeft = Math.max(18, window.innerWidth - rootRect.width - 18);
      const left = Math.min(maxLeft, Math.round(searchRect.right + gap));
      const top = Math.max(8, Math.round(searchRect.top + (searchRect.height - rootRect.height) / 2));

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.right = 'auto';
      root.setAttribute('data-anchored', 'true');
    });
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

  const appObserver = new MutationObserver(positionBesideSearch);
  appObserver.observe(app, { childList: true });

  window.addEventListener('resize', positionBesideSearch, { passive: true });
  window.addEventListener('pageshow', positionBesideSearch);
  window.addEventListener('focus', positionBesideSearch);
  window.addEventListener('stashbox:v2-auth-changed', syncLogin);
  window.addEventListener('stashbox:v2-session-changed', syncLogin);
  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) syncLogin();
  });

  [0, 50, 150, 350, 750, 1500, 3000].forEach(delay => window.setTimeout(positionBesideSearch, delay));
  syncLogin();

  window.StashboxDesktopPersistentControls = Object.freeze({
    refresh: () => {
      syncLogin();
      positionBesideSearch();
    }
  });
})();
