(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const PROFILE_URL = '/radio/profile/?desktop_profile_fix=20260822-1';

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function hasSession() {
    const value = readTokens();
    return Boolean(value.accessToken || value.refreshToken);
  }

  async function openProfile() {
    try {
      if (window.StashboxV2Session?.ensureFresh) {
        await window.StashboxV2Session.ensureFresh({ reason: 'desktop-profile-open' });
      }
    } catch (_) {}

    const value = readTokens();
    if (!value.accessToken) {
      location.href = '/radio/?auth=login';
      return;
    }
    location.href = PROFILE_URL;
  }

  window.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest('[data-desktop-login], [data-li-profile]');
    if (!trigger || !hasSession()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openProfile().catch(() => { location.href = '/radio/?auth=login'; });
  }, true);
})();
