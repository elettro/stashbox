(() => {
  'use strict';

  if (window.StashboxV2Session) return;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const CONFIG_URL = `${API_ROOT}/radio/auth/config`;
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const REFRESH_LEEWAY_MS = 2 * 60 * 1000;
  const BACKGROUND_CHECK_MS = 4 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  let configPromise = null;
  let refreshPromise = null;
  let refreshTimer = 0;

  function readTokens() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : {};
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
      return Number(JSON.parse(atob(padded)).exp || 0) * 1000;
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
    return Boolean(tokens.refreshToken || tokens.accessToken);
  }

  function emit(reason, extra = {}) {
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

  function writeTokens(authenticationResult, previous = readTokens(), reason = 'session-refresh') {
    const result = authenticationResult || {};
    const next = {
      accessToken: result.AccessToken || result.accessToken || previous.accessToken || '',
      idToken: result.IdToken || result.idToken || previous.idToken || '',
      refreshToken: result.RefreshToken || result.refreshToken || previous.refreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(result.ExpiresIn || result.expiresIn || 3600)) * 1000
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    schedule(next);
    emit(reason);
    return next;
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

  function invalidRefresh(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return /NotAuthorizedException|InvalidParameterException|UserNotFoundException/i.test(code)
      || /refresh token.*(?:expired|invalid)|invalid refresh token/i.test(message);
  }

  function isNetworkFetchError(error) {
    const message = String(error?.message || '');
    return error instanceof TypeError
      || /load failed|failed to fetch|network(?:error| request failed)|internet connection appears to be offline/i.test(message);
  }

  function requestUrl(input) {
    return input instanceof Request ? input.url : String(input || '');
  }

  function requestMethod(input, init = {}) {
    return String(init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  }

  function clearInvalidSession(reason = 'refresh-token-expired') {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    clearTimeout(refreshTimer);
    emit(reason, { loggedIn: false });
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

  async function refresh({ force = false, reason = 'automatic-refresh' } = {}) {
    const current = readTokens();
    if (!current.refreshToken) {
      if (accessIsUsable(current)) return current;
      const error = new Error('No renewable listener session is stored.');
      error.code = 'NO_REFRESH_TOKEN';
      throw error;
    }
    if (!force && accessIsUsable(current, REFRESH_LEEWAY_MS)) {
      schedule(current);
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
        return writeTokens(result, current, reason);
      } catch (error) {
        if (invalidRefresh(error)) clearInvalidSession('refresh-token-expired');
        else {
          scheduleRetry();
          emit('refresh-deferred', { transient: true, message: error.message || '' });
        }
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  function ensureFresh(options = {}) {
    const current = readTokens();
    if (!options.force && accessIsUsable(current, REFRESH_LEEWAY_MS)) {
      schedule(current);
      return Promise.resolve(current);
    }
    return refresh(options);
  }

  function scheduleRetry() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (hasSession()) ensureFresh({ reason: 'retry-refresh' }).catch(() => {});
    }, 60 * 1000);
  }

  function schedule(tokens = readTokens()) {
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

  function requestHeaders(input, init = {}) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  function requestTarget(input, init, headers) {
    if (input instanceof Request) return [new Request(input.clone(), { ...init, headers }), undefined];
    return [input, { ...init, headers }];
  }

  async function protectedFetch(input, init, headers) {
    let [target, targetInit] = requestTarget(input, init, headers);
    try {
      return await nativeFetch(target, targetInit);
    } catch (error) {
      const eligibleSafariRecovery = requestMethod(input, init) === 'GET'
        && requestUrl(input).startsWith(API_ROOT)
        && headers.has('X-Cognito-Id-Token')
        && isNetworkFetchError(error);
      if (!eligibleSafariRecovery) throw error;

      headers.delete('X-Cognito-Id-Token');
      [target, targetInit] = requestTarget(input, init, headers);
      const response = await nativeFetch(target, targetInit);
      emit('safari-profile-network-recovery', { transient: true });
      return response;
    }
  }

  async function sessionFetch(input, init = {}) {
    const headers = requestHeaders(input, init);
    const protectedRequest = /^Bearer\s+/i.test(headers.get('Authorization') || '') || headers.has('X-Cognito-Id-Token');
    if (!protectedRequest) return nativeFetch(input, init);

    try {
      const current = await ensureFresh({ reason: 'request-refresh' });
      if (current.accessToken) headers.set('Authorization', `Bearer ${current.accessToken}`);
      if (current.idToken) headers.set('X-Cognito-Id-Token', current.idToken);
    } catch (_) {
      // A temporary network error does not erase the renewable session.
    }

    let response = await protectedFetch(input, init, headers);
    if (response.status !== 401 || !readTokens().refreshToken) return response;

    try {
      const current = await refresh({ force: true, reason: '401-refresh' });
      if (current.accessToken) headers.set('Authorization', `Bearer ${current.accessToken}`);
      if (current.idToken) headers.set('X-Cognito-Id-Token', current.idToken);
      response = await protectedFetch(input, init, headers);
    } catch (_) {}
    return response;
  }

  function resume(reason) {
    if (!hasSession()) {
      emit(reason, { loggedIn: false });
      return Promise.resolve(null);
    }
    return ensureFresh({ reason }).catch(error => {
      if (!invalidRefresh(error)) emit('refresh-deferred', { transient: true });
      return null;
    });
  }

  window.fetch = sessionFetch;
  window.StashboxV2Session = {
    tokenKey: TOKEN_KEY,
    readTokens,
    hasSession,
    accessIsUsable,
    ensureFresh,
    refresh: options => refresh({ force: true, ...(options || {}) }),
    fetch: sessionFetch,
    logout: () => clearInvalidSession('manual-logout')
  };

  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) resume('storage-resume');
  });
  window.addEventListener('pageshow', () => resume('pageshow-resume'));
  window.addEventListener('focus', () => resume('focus-resume'));
  window.addEventListener('online', () => resume('online-resume'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume('visibility-resume');
  });

  window.setInterval(() => {
    if (hasSession()) ensureFresh({ reason: 'background-refresh' }).catch(() => {});
  }, BACKGROUND_CHECK_MS);

  schedule();
  window.StashboxV2Session.ready = resume('initial-resume');
})();