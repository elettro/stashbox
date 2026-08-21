(() => {
  'use strict';

  if (!document.body.classList.contains('desktop-clean-runtime')) return;

  const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/notifications';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const nativeFetch = window.fetch.bind(window);
  const app = document.getElementById('v2App');

  function readTokens() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url || '';
  }

  function withAuth(init = {}) {
    const tokens = readTokens();
    if (!tokens.accessToken && !tokens.idToken) return { init, injected: false };

    const headers = new Headers(init.headers || {});
    let injected = false;
    if (tokens.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      injected = true;
    }
    if (tokens.idToken && !headers.has('X-Cognito-Id-Token')) {
      headers.set('X-Cognito-Id-Token', tokens.idToken);
      injected = true;
    }
    return { init: { ...init, headers }, injected };
  }

  if (!window.__stashboxDesktopNotificationsFetchPatched) {
    window.__stashboxDesktopNotificationsFetchPatched = true;
    window.fetch = async (input, init = {}) => {
      const url = requestUrl(input);
      if (!url.startsWith(API_URL)) return nativeFetch(input, init);

      const authenticated = withAuth(init);
      const response = await nativeFetch(input, authenticated.init);
      if (response.status !== 401 || !authenticated.injected) return response;

      return nativeFetch(input, init);
    };
  }

  function syncVisibleBadge() {
    const source = document.querySelector('#v2App .v2-notifications-trigger');
    const target = document.querySelector('[data-desktop-notifications]');
    if (!target) return;

    const sourceBadge = source?.querySelector('.v2-notification-count');
    const count = sourceBadge && !sourceBadge.hidden ? String(sourceBadge.textContent || '').trim() : '';
    let badge = target.querySelector('.desktop-notification-count');

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'desktop-notification-count';
      badge.hidden = true;
      target.appendChild(badge);
    }

    if (badge.textContent !== count) badge.textContent = count;
    const shouldHide = !count;
    if (badge.hidden !== shouldHide) badge.hidden = shouldHide;

    const label = count ? `${count} unread notifications` : 'Notifications';
    if (target.getAttribute('aria-label') !== label) target.setAttribute('aria-label', label);
  }

  function installBadgeStyles() {
    if (document.getElementById('desktopNotificationBadgeStyles')) return;
    const style = document.createElement('style');
    style.id = 'desktopNotificationBadgeStyles';
    style.textContent = `
      .desktop-persistent-notifications { position: relative; }
      .desktop-persistent-notifications .desktop-notification-count {
        position: absolute;
        top: -4px;
        right: -5px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: #ff9f1a;
        color: #090909;
        font: 800 10px/18px Karla, Arial, sans-serif;
        box-shadow: 0 0 0 2px #050607;
        pointer-events: none;
      }
      .desktop-persistent-notifications .desktop-notification-count[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  installBadgeStyles();
  syncVisibleBadge();

  // Observe only the app. The visible desktop bell sits outside #v2App,
  // so badge mirroring cannot recursively trigger this observer.
  if (app) {
    const observer = new MutationObserver(syncVisibleBadge);
    observer.observe(app, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  window.addEventListener('stashbox:v2-auth-changed', syncVisibleBadge);
  window.addEventListener('stashbox:v2-session-changed', syncVisibleBadge);
  window.addEventListener('pageshow', syncVisibleBadge);
})();