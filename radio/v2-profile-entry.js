(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const PROFILE_OVERLAY_SRC = '/radio/v2-profile-overlay.js?v=20260822-profileoverlay2';
  const PROFILE_FALLBACK_URL = '/radio/profile/?profile_fix=20260822-1';
  let lastAccessToken = '';
  let loadedAccessToken = '';
  let accountName = '';
  let accountRequest = null;
  let overlayLoader = null;

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    if (window.StashboxV2Session?.hasSession) return window.StashboxV2Session.hasSession();
    const current = tokens();
    return Boolean(current.accessToken || current.refreshToken);
  }

  async function freshTokens() {
    if (window.StashboxV2Session?.ensureFresh) {
      try { return await window.StashboxV2Session.ensureFresh({ reason: 'profile-entry-account' }); }
      catch (_) {}
    }
    return tokens();
  }

  async function loadAccount() {
    const current = await freshTokens();
    if (!current.accessToken) return null;
    if (current.accessToken === loadedAccessToken && accountName) return { display_name: accountName };
    if (accountRequest && current.accessToken === lastAccessToken) return accountRequest;
    lastAccessToken = current.accessToken;
    accountRequest = fetch(`${API_ROOT}/radio/me`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${current.accessToken}`,
        ...(current.idToken ? { 'X-Cognito-Id-Token': current.idToken } : {})
      }
    }).then(response => response.ok ? response.json() : null)
      .then(body => {
        const user = body?.user || null;
        accountName = String(user?.display_name || '').trim().split(/\s+/)[0] || 'Profile';
        loadedAccessToken = current.accessToken;
        return user;
      })
      .catch(() => null)
      .finally(() => { accountRequest = null; });
    return accountRequest;
  }

  function updateButton() {
    const button = document.querySelector('#v2App .v2-header-login');
    if (!button) return false;
    const active = loggedIn();
    button.classList.toggle('is-profile-entry', active);
    button.setAttribute('aria-label', active ? 'Open your Stashbox Radio profile' : 'Log in to Stashbox Radio');
    if (active) {
      button.dataset.v2ProfileEntry = 'true';
      button.textContent = accountName || 'Account';
      loadAccount().then(() => {
        const current = document.querySelector('#v2App .v2-header-login');
        if (current && loggedIn()) current.textContent = accountName || 'Account';
      });
    } else {
      loadedAccessToken = '';
      accountName = '';
      delete button.dataset.v2ProfileEntry;
      if (button.textContent !== 'Log In') button.textContent = 'Log In';
    }
    return true;
  }

  function ensureProfileOverlay() {
    if (window.StashboxV2ProfileOverlay) return Promise.resolve(window.StashboxV2ProfileOverlay);
    if (overlayLoader) return overlayLoader;

    overlayLoader = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-v2-profile-overlay-loader]');
      if (!script) {
        script = document.createElement('script');
        script.src = PROFILE_OVERLAY_SRC;
        script.async = true;
        script.dataset.v2ProfileOverlayLoader = 'true';
        document.head.appendChild(script);
      }
      const finish = () => window.StashboxV2ProfileOverlay ? resolve(window.StashboxV2ProfileOverlay) : reject(new Error('Profile overlay did not initialize.'));
      if (window.StashboxV2ProfileOverlay) return finish();
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Profile overlay failed to load.')), { once: true });
    }).finally(() => { overlayLoader = null; });

    return overlayLoader;
  }

  function openProfile(button) {
    let completed = false;
    const fallback = () => {
      if (completed) return;
      completed = true;
      location.href = PROFILE_FALLBACK_URL;
    };
    const timeout = window.setTimeout(fallback, 1400);

    ensureProfileOverlay()
      .then(overlay => {
        if (completed) return;
        window.clearTimeout(timeout);
        const opened = overlay?.open?.(button);
        if (opened === false) {
          fallback();
          return;
        }
        completed = true;
      })
      .catch(fallback);
  }

  window.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('#v2App .v2-header-login, [data-desktop-login]');
    if (!button || !loggedIn()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openProfile(button);
  }, true);

  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) updateButton();
  });
  window.addEventListener('stashbox:v2-auth-changed', updateButton);
  window.addEventListener('stashbox:v2-session-changed', updateButton);
  window.addEventListener('focus', updateButton);
  window.addEventListener('pageshow', updateButton);

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    updateButton();
    if (attempts >= 60) window.clearInterval(timer);
  }, 2000);
  updateButton();
})();