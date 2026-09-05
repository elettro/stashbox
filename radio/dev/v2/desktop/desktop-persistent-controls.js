(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const root = document.querySelector('[data-desktop-persistent-controls]');
  const app = document.getElementById('v2App');
  if (!root || !app) return;

  // DEV desktop Shopify fallback repair.
  // v2-boot-guard currently wraps fetch for stashbox.ai. Its cache-control request
  // header causes the storefront JSON request to preflight and fail. Bypass that
  // wrapped path for products.json with a simple XHR GET, then shuffle locally.
  const guardedFetch = window.fetch.bind(window);

  const isShopProductsUrl = raw => {
    try {
      const url = new URL(typeof raw === 'string' ? raw : raw?.url || '', location.href);
      return url.hostname === 'stashbox.ai' && /\/products\.json$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  };

  const shuffleProducts = products => {
    const list = Array.isArray(products) ? products.slice() : [];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  };

  const fetchShopProductsSimple = raw => new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(typeof raw === 'string' ? raw : raw?.url || '', location.href);
    } catch (error) {
      reject(error);
      return;
    }

    url.searchParams.set('limit', '250');
    url.searchParams.set('_stashbox_desktop_random', `${Date.now()}-${Math.random()}`);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url.toString(), true);
    xhr.timeout = 10000;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Shop HTTP ${xhr.status}`));
        return;
      }
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (Array.isArray(payload.products)) payload.products = shuffleProducts(payload.products);
        resolve(new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Stashbox-Shop-Randomized': 'dev-desktop-xhr'
          }
        }));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error('Shop network request failed'));
    xhr.ontimeout = () => reject(new Error('Shop request timed out'));
    xhr.send();
  });

  window.fetch = (input, init) => {
    if (isShopProductsUrl(input)) return fetchShopProductsSimple(input);
    return guardedFetch(input, init);
  };

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
      const boundaryRight = Math.min(window.innerWidth - viewportPad, Math.max(viewportPad + rootRect.width, Math.round(contentRect.right)));
      const rootLeft = Math.max(viewportPad, Math.round(boundaryRight - rootRect.width));
      const top = Math.max(8, Math.round(searchRect.top + (searchRect.height - rootRect.height) / 2));

      root.style.left = `${rootLeft}px`;
      root.style.top = `${top}px`;
      root.style.right = 'auto';
      root.setAttribute('data-anchored', 'true');

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

  new MutationObserver(positionAtContentBoundary).observe(app, { childList: true });
  window.addEventListener('resize', positionAtContentBoundary, { passive: true });
  window.addEventListener('pageshow', positionAtContentBoundary);
  window.addEventListener('focus', positionAtContentBoundary);
  window.addEventListener('stashbox:v2-auth-changed', syncLogin);
  window.addEventListener('stashbox:v2-session-changed', syncLogin);
  window.addEventListener('storage', event => { if (!event.key || event.key === TOKEN_KEY) syncLogin(); });
  [0, 50, 150, 350, 750, 1500, 3000].forEach(delay => window.setTimeout(positionAtContentBoundary, delay));
  syncLogin();

  const loadRuntime = (src, marker) => {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute(marker, 'true');
    document.body.appendChild(script);
  };

  loadRuntime('/radio/desktop/desktop-add-playlist-shared.js?v=20260824-controls2', 'data-desktop-playlist-shared-loader');
  loadRuntime('/radio/desktop/desktop-control-order.js?v=20260824-controls2', 'data-desktop-control-order-loader');

  window.StashboxDesktopPersistentControls = Object.freeze({
    refresh: () => {
      syncLogin();
      positionAtContentBoundary();
    }
  });
})();