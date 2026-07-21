(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FOLLOW_CACHE_KEY = 'stashbox_radio_dev_followed_artists';
  const STYLE_ID = 'stashbox-account-following-stat-style';
  let refreshPromise = null;
  let requestPromise = null;
  let queued = false;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function tokens() {
    return readJson(TOKEN_KEY, {}) || {};
  }

  function saveTokens(next) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(next)); }
    catch (_) {}
  }

  function decodeJwtPayload(token) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return {};
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    } catch (_) {
      return {};
    }
  }

  function tokenExpiresSoon(token, seconds = 90) {
    const exp = Number(decodeJwtPayload(token).exp || 0);
    return !exp || exp * 1000 <= Date.now() + seconds * 1000;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const existing = tokens();
      if (!existing.refreshToken) throw new Error('Session expired.');
      const config = (await parseResponse(await fetch(`${API_ROOT}/radio/auth/config`, {
        cache: 'no-store',
        credentials: 'omit'
      }))).auth || {};
      if (!config.enabled || !config.region || !config.app_client_id) throw new Error('Authentication unavailable.');
      const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: config.app_client_id,
          AuthParameters: { REFRESH_TOKEN: existing.refreshToken }
        })
      });
      const result = (await parseResponse(response)).AuthenticationResult || {};
      const next = {
        accessToken: result.AccessToken || '',
        idToken: result.IdToken || '',
        refreshToken: existing.refreshToken,
        expiresAt: Date.now() + Math.max(60, Number(result.ExpiresIn || 3600)) * 1000
      };
      if (!next.accessToken) throw new Error('Session expired.');
      saveTokens(next);
      return next;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function validTokens() {
    let current = tokens();
    if (!current.accessToken) return null;
    if (tokenExpiresSoon(current.accessToken)) current = await refreshSession();
    return current;
  }

  function cacheFollows(follows) {
    const normalized = (Array.isArray(follows) ? follows : []).map(artist => ({
      artist_key: String(artist?.artist_key || ''),
      follower_count: Math.max(0, Number(artist?.follower_count || 0))
    })).filter(artist => artist.artist_key);
    try { localStorage.setItem(FOLLOW_CACHE_KEY, JSON.stringify(normalized)); }
    catch (_) {}
    return normalized;
  }

  async function loadFollows(force = false) {
    if (requestPromise && !force) return requestPromise;
    requestPromise = (async () => {
      const token = await validTokens();
      if (!token) return readJson(FOLLOW_CACHE_KEY, []);
      const response = await fetch(`${API_ROOT}/radio/me/follows`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          ...(token.idToken ? { 'X-Cognito-Id-Token': token.idToken } : {})
        }
      });
      if (response.status === 401 && tokens().refreshToken) {
        await refreshSession();
        requestPromise = null;
        return loadFollows(true);
      }
      const body = await parseResponse(response);
      return cacheFollows(body.follows || []);
    })().finally(() => { requestPromise = null; });
    return requestPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radio-account-stat.radio-account-following-stat {
        border-color: rgba(240, 165, 0, .24);
      }
      .radio-account-following-stat small {
        display: block;
        margin-top: 4px;
        color: #9fa6af;
        font-size: 10px;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  function renderCount(count) {
    const grid = document.querySelector('.radio-account-content .radio-account-card-grid');
    if (!grid) return;
    let card = grid.querySelector('.radio-account-following-stat');
    if (!card) {
      card = document.createElement('div');
      card.className = 'radio-account-stat radio-account-following-stat';
      card.innerHTML = 'Following Artists<strong>0</strong><small>Saved artist follows</small>';
      grid.appendChild(card);
    }
    const strong = card.querySelector('strong');
    if (strong) strong.textContent = Math.max(0, Number(count || 0)).toLocaleString();
  }

  async function enhance(force = false) {
    injectStyle();
    const grid = document.querySelector('.radio-account-content .radio-account-card-grid');
    if (!grid) return;
    const cached = readJson(FOLLOW_CACHE_KEY, []);
    renderCount(Array.isArray(cached) ? cached.length : 0);
    try {
      const follows = await loadFollows(force);
      renderCount(Array.isArray(follows) ? follows.length : 0);
    } catch (error) {
      console.warn('[accounts] following artist stat unavailable', error);
    }
  }

  function queueEnhance(force = false) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance(force);
    });
  }

  injectStyle();
  queueEnhance();
  new MutationObserver(() => queueEnhance(false)).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('stashbox:artist-follow-changed', () => queueEnhance(true));
  window.addEventListener('stashbox:artist-follows-loaded', event => renderCount(event.detail?.count || 0));
})();
