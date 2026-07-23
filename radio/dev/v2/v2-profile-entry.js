(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  let lastAccessToken = '';
  let accountName = '';
  let accountRequest = null;

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    return Boolean(tokens().accessToken);
  }

  async function loadAccount() {
    const current = tokens();
    if (!current.accessToken) return null;
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
        accountName = String(body?.user?.display_name || '').trim().split(/\s+/)[0] || 'Profile';
        return body?.user || null;
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
      button.textContent = accountName || 'Profile';
      loadAccount().then(() => {
        const current = document.querySelector('#v2App .v2-header-login');
        if (current && loggedIn()) current.textContent = accountName || 'Profile';
      });
    } else {
      delete button.dataset.v2ProfileEntry;
      if (button.textContent !== 'Log In') button.textContent = 'Log In';
    }
    return true;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#v2App .v2-header-login');
    if (!button || !loggedIn()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = '/radio/dev/v2/profile/';
  }, true);

  window.addEventListener('storage', event => {
    if (event.key === TOKEN_KEY) updateButton();
  });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    updateButton();
    if (attempts >= 1200) window.clearInterval(timer);
  }, 250);
})();
