(() => {
  'use strict';

  if (window.StashboxV2Session) return;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const CONFIG_URL = `${API_ROOT}/radio/auth/config`;
  const ME_URL = `${API_ROOT}/radio/me`;
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const REFRESH_LEEWAY_MS = 2 * 60 * 1000;
  const BACKGROUND_CHECK_MS = 4 * 60 * 1000;
  const TOKEN_WATCH_MS = 2000;
  const nativeFetch = window.fetch.bind(window);

  let configPromise = null;
  let refreshPromise = null;
  let accountPromise = null;
  let account = null;
  let refreshTimer = 0;
  let lastFingerprint = '';

  function readTokens() {
    try {
      const value = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function tokenExpiry(token) {
    try {
      const encoded = String(token || '').split('.')[1];
      if (!encoded) return 0;
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return Number(payload.exp || 0) * 1000;
    } catch (_) {
      return 0;
    }
  }

  function accessExpiry(tokens = readTokens()) {
    return tokenExpiry(tokens.accessToken) || Number(tokens.expiresAt || 0) || 0;
  }

  function accessIsUsable(tokens = readTokens(), leewayMs = 0) {
    if (!tokens.accessToken) return false;
    const expiry = accessExpiry(tokens);
    return !expiry || expiry > Date.now() + Math.max(0, leewayMs);
  }

  function hasSession(tokens = readTokens()) {
    return Boolean(tokens.refreshToken || accessIsUsable(tokens));
  }

  function fingerprint(tokens = readTokens()) {
    return [tokens.accessToken, tokens.idToken, tokens.refreshToken, tokens.expiresAt].map(value => String(value || '')).join('|');
  }

  function dispatchSessionEvent(reason, extra = {}) {
    const detail = {
      reason,
      loggedIn: hasSession(),
      refreshedAt: Date.now(),
      ...extra
    };
    window.dispatchEvent(new CustomEvent('stashbox:v2-session-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-ready', { detail }));
  }

  function writeTokens(authenticationResult, previous = readTokens(), reason = 'refresh') {
    if (!authenticationResult) return previous;
    const next = {
      accessToken: authenticationResult.AccessToken || authenticationResult.accessToken || previous.accessToken || '',
      idToken: authenticationResult.IdToken || authenticationResult.idToken || previous.idToken || '',
      refreshToken: authenticationResult.RefreshToken || authenticationResult.refreshToken || previous.refreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(authenticationResult.ExpiresIn || authenticationResult.expiresIn || 3600)) * 1000
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    lastFingerprint = fingerprint(next);
    scheduleRefresh(next);
    syncAccountUi();
    dispatchSessionEvent(reason);
    return next;
  }

  function clearInvalidSession(reason = 'invalid-refresh-token') {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    account = null;
    lastFingerprint = '';
    clearTimeout(refreshTimer);
    syncAccountUi();
    dispatchSessionEvent(reason, { loggedIn: false });
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { message: text }; }
    if (!response.ok) {
      const error = new Error(body.message || body.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = String(body.__type || body.code || '').split('#').pop();
      throw error;
    }
    return body;
  }

  function isInvalidRefreshError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return /NotAuthorizedException|InvalidParameterException|UserNotFoundException/i.test(code)
      || /refresh token.*(expired|invalid)|invalid refresh token/i.test(message);
  }

  async function loadConfig() {
    if (!configPromise) {
      configPromise = nativeFetch(CONFIG_URL, { cache: 'no-store' })
        .then(parseResponse)
        .then(body => {
          const config = body.auth || {};
          if (!config.enabled || !config.region || !config.app_client_id) {
            throw new Error('Listener login is not configured in DEV.');
          }
          return config;
        })
        .catch(error => {
          configPromise = null;
          throw error;
        });
    }
    return configPromise;
  }

  async function refreshSession({ force = false, reason = 'automatic-refresh' } = {}) {
    const current = readTokens();
    if (!current.refreshToken) {
      if (accessIsUsable(current)) return current;
      const error = new Error('No renewable listener session is stored.');
      error.code = 'NO_REFRESH_TOKEN';
      throw error;
    }
    if (!force && accessIsUsable(current, REFRESH_LEEWAY_MS)) {
      scheduleRefresh(current);
      return current;
    }
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const config = await loadConfig();
        const body = await nativeFetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
          },
          body: JSON.stringify({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: config.app_client_id,
            AuthParameters: { REFRESH_TOKEN: current.refreshToken }
          })
        }).then(parseResponse);
        const result = body.AuthenticationResult || {};
        if (!result.AccessToken) throw new Error('Cognito did not return a refreshed access token.');
        account = null;
        accountPromise = null;
        return writeTokens(result, current, reason);
      } catch (error) {
        if (isInvalidRefreshError(error)) clearInvalidSession('refresh-token-expired');
        else {
          scheduleRetry();
          dispatchSessionEvent('refresh-deferred', { transient: true, message: error.message || '' });
        }
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  async function ensureFresh(options = {}) {
    const tokens = readTokens();
    if (accessIsUsable(tokens, REFRESH_LEEWAY_MS) && !options.force) {
      scheduleRefresh(tokens);
      return tokens;
    }
    return refreshSession(options);
  }

  function scheduleRetry() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      ensureFresh({ reason: 'retry-refresh' }).catch(() => {});
    }, 60 * 1000);
  }

  function scheduleRefresh(tokens = readTokens()) {
    clearTimeout(refreshTimer);
    if (!tokens.refreshToken) return;
    const expiry = accessExpiry(tokens);
    const delay = expiry
      ? Math.max(30 * 1000, Math.min(BACKGROUND_CHECK_MS, expiry - Date.now() - REFRESH_LEEWAY_MS))
      : BACKGROUND_CHECK_MS;
    refreshTimer = window.setTimeout(() => {
      ensureFresh({ reason: 'scheduled-refresh' }).catch(() => {});
    }, delay);
  }

  function mergedHeaders(input, init = {}) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  function fetchTarget(input, init, headers) {
    if (input instanceof Request) return [new Request(input.clone(), { ...init, headers }), undefined];
    return [input, { ...init, headers }];
  }

  async function sessionFetch(input, init = {}) {
    const headers = mergedHeaders(input, init);
    const protectedRequest = /^Bearer\s+/i.test(headers.get('Authorization') || '') || headers.has('X-Cognito-Id-Token');
    if (!protectedRequest) return nativeFetch(input, init);

    try {
      const tokens = await ensureFresh({ reason: 'request-refresh' });
      if (tokens.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      if (tokens.idToken) headers.set('X-Cognito-Id-Token', tokens.idToken);
    } catch (_) {
      // Keep the stored session on transient failures and allow the original request to report its own result.
    }

    let [target, targetInit] = fetchTarget(input, init, headers);
    let response = await nativeFetch(target, targetInit);
    if (response.status !== 401 || !readTokens().refreshToken) return response;

    try {
      const tokens = await refreshSession({ force: true, reason: '401-refresh' });
      if (tokens.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      if (tokens.idToken) headers.set('X-Cognito-Id-Token', tokens.idToken);
      [target, targetInit] = fetchTarget(input, init, headers);
      response = await nativeFetch(target, targetInit);
    } catch (_) {}
    return response;
  }

  async function loadAccount() {
    if (!hasSession()) return null;
    if (account) return account;
    if (accountPromise) return accountPromise;
    accountPromise = (async () => {
      try {
        const tokens = await ensureFresh({ reason: 'account-refresh' });
        const response = await nativeFetch(ME_URL, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
          }
        });
        if (response.status === 401 && tokens.refreshToken) {
          await refreshSession({ force: true, reason: 'account-401-refresh' });
          accountPromise = null;
          return loadAccount();
        }
        if (!response.ok) return null;
        const body = await response.json();
        account = body.user || null;
        syncAccountUi();
        return account;
      } catch (_) {
        return null;
      } finally {
        accountPromise = null;
      }
    })();
    return accountPromise;
  }

  function syncAccountUi() {
    const active = hasSession();
    document.querySelectorAll('#v2App .v2-header-login').forEach(button => {
      button.classList.toggle('is-profile-entry', active);
      button.setAttribute('aria-label', active ? 'Open your Stashbox Radio profile' : 'Log in to Stashbox Radio');
      if (active) {
        button.dataset.v2ProfileEntry = 'true';
        const firstName = String(account?.display_name || '').trim().split(/\s+/)[0];
        if (!firstName && /^(log in|login)$/i.test(button.textContent.trim())) button.textContent = 'Account';
        else if (firstName) button.textContent = firstName.slice(0, 14);
      } else {
        delete button.dataset.v2ProfileEntry;
        button.textContent = 'Log In';
      }
    });
  }

  async function resumeSession(reason) {
    if (!hasSession()) {
      syncAccountUi();
      return null;
    }
    try { await ensureFresh({ reason }); }
    catch (error) {
      if (isInvalidRefreshError(error)) return null;
    }
    syncAccountUi();
    return loadAccount();
  }

  window.fetch = sessionFetch;
  window.StashboxV2Session = {
    tokenKey: TOKEN_KEY,
    readTokens,
    hasSession,
    accessIsUsable,
    ensureFresh,
    refresh: options => refreshSession({ force: true, ...(options || {}) }),
    loadAccount,
    syncUi: syncAccountUi,
    fetch: sessionFetch,
    logout: () => clearInvalidSession('manual-logout')
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('#v2App .v2-header-login');
    if (!button || !hasSession()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ensureFresh({ reason: 'profile-entry' })
      .then(() => { location.href = '/radio/dev/v2/profile/'; })
      .catch(error => {
        if (isInvalidRefreshError(error)) syncAccountUi();
      });
  }, true);

  const observer = new MutationObserver(syncAccountUi);
  const app = document.getElementById('v2App');
  if (app) observer.observe(app, { childList: true, subtree: true });

  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) resumeSession('storage-resume');
  });
  window.addEventListener('pageshow', () => resumeSession('pageshow-resume'));
  window.addEventListener('focus', () => resumeSession('focus-resume'));
  window.addEventListener('online', () => resumeSession('online-resume'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeSession('visibility-resume');
  });

  window.setInterval(() => {
    const current = fingerprint();
    if (current !== lastFingerprint) {
      lastFingerprint = current;
      account = null;
      accountPromise = null;
      resumeSession('token-change');
    }
  }, TOKEN_WATCH_MS);

  window.setInterval(() => {
    if (hasSession()) ensureFresh({ reason: 'background-refresh' }).catch(() => {});
  }, BACKGROUND_CHECK_MS);

  lastFingerprint = fingerprint();
  syncAccountUi();
  window.StashboxV2Session.ready = resumeSession('initial-resume');
})();