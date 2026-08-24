(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const root = document.querySelector('[data-desktop-persistent-controls]');
  const app = document.getElementById('v2App');
  if (!root || !app) return;

  const login = root.querySelector('[data-desktop-login]');
  const bell = root.querySelector('[data-desktop-notifications]');
  let positionFrame = 0;
  let positionedSearch = null;

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

  const clearSearchPosition = () => {
    if (!positionedSearch) return;
    positionedSearch.style.removeProperty('position');
    positionedSearch.style.removeProperty('left');
    positionedSearch.style.removeProperty('right');
    positionedSearch.style.removeProperty('top');
    positionedSearch.style.removeProperty('z-index');
    positionedSearch = null;
  };

  const positionAtContentBoundary = () => {
    window.cancelAnimationFrame(positionFrame);
    positionFrame = window.requestAnimationFrame(() => {
      const search = app.querySelector('.v2-header [data-search]');
      const content = app.querySelector('.v2-home') || app.querySelector('.v2-section');
      if (!search || !content) {
        root.removeAttribute('data-anchored');
        clearSearchPosition();
        return;
      }

      if (positionedSearch && positionedSearch !== search) clearSearchPosition();
      positionedSearch = search;

      const contentRect = content.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const gap = 10;
      const viewportPad = 18;

      // The right edge of the DEAN/account pill defines the same visual boundary
      // as the right edge of the main content column.
      const boundaryRight = Math.min(
        window.innerWidth - viewportPad,
        Math.max(viewportPad + rootRect.width, Math.round(contentRect.right))
      );
      const rootLeft = Math.max(viewportPad, Math.round(boundaryRight - rootRect.width));
      const top = Math.max(8, Math.round(searchRect.top + (searchRect.height - rootRect.height) / 2));

      root.style.left = `${rootLeft}px`;
      root.style.top = `${top}px`;
      root.style.right = 'auto';
      root.setAttribute('data-anchored', 'true');

      // Keep the header sequence literal: Search -> Bell -> Account -> boundary.
      const searchLeft = Math.max(viewportPad, Math.round(rootLeft - gap - searchRect.width));
      const searchTop = Math.max(8, Math.round(top + (rootRect.height - searchRect.height) / 2));
      search.style.setProperty('position', 'fixed', 'important');
      search.style.setProperty('left', `${searchLeft}px`, 'important');
      search.style.setProperty('right', 'auto', 'important');
      search.style.setProperty('top', `${searchTop}px`, 'important');
      search.style.setProperty('z-index', '10050', 'important');
    });
  };

  login?.addEventListener('click', event => {
    if (!hasSession()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = '/radio/profile/';
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

  const appObserver = new MutationObserver(positionAtContentBoundary);
  appObserver.observe(app, { childList: true });

  window.addEventListener('resize', positionAtContentBoundary, { passive: true });
  window.addEventListener('pageshow', positionAtContentBoundary);
  window.addEventListener('focus', positionAtContentBoundary);
  window.addEventListener('stashbox:v2-auth-changed', syncLogin);
  window.addEventListener('stashbox:v2-session-changed', syncLogin);
  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) syncLogin();
  });

  [0, 50, 150, 350, 750, 1500, 3000].forEach(delay => window.setTimeout(positionAtContentBoundary, delay));
  syncLogin();

  if (!document.querySelector('script[data-desktop-add-playlist-loader]')) {
    const playlistScript = document.createElement('script');
    playlistScript.src = '/radio/desktop/desktop-add-playlist.js?v=20260824-playlist1';
    playlistScript.dataset.desktopAddPlaylistLoader = 'true';
    document.body.appendChild(playlistScript);
  }

  window.StashboxDesktopPersistentControls = Object.freeze({
    refresh: () => {
      syncLogin();
      positionAtContentBoundary();
    }
  });
})();
