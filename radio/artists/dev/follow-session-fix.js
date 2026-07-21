(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_KEY = 'stashbox_radio_dev_pending_artist_follow';
  const FOLLOW_CACHE_KEY = 'stashbox_radio_dev_followed_artists';
  const params = new URLSearchParams(window.location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  let refreshPromise = null;
  let artistKeyPromise = null;
  let busy = false;
  let hydrationPromise = null;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function saveTokens(next) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(next)); }
    catch (_) {}
  }

  function readFollowCache() {
    try {
      const value = JSON.parse(localStorage.getItem(FOLLOW_CACHE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function saveFollowCache(follows) {
    const normalized = (Array.isArray(follows) ? follows : []).map(artist => ({
      artist_key: String(artist?.artist_key || ''),
      follower_count: Math.max(0, Number(artist?.follower_count || 0))
    })).filter(artist => artist.artist_key);
    try { localStorage.setItem(FOLLOW_CACHE_KEY, JSON.stringify(normalized)); }
    catch (_) {}
    window.dispatchEvent(new CustomEvent('stashbox:artist-follows-loaded', {
      detail: { follows: normalized, count: normalized.length }
    }));
    return normalized;
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
      error.code = body.code || '';
      throw error;
    }
    return body;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const existing = readTokens();
      if (!existing.refreshToken) throw new Error('Your session has expired. Log in again.');

      const configResponse = await fetch(`${API_ROOT}/radio/auth/config`, {
        cache: 'no-store',
        credentials: 'omit'
      });
      const configBody = await parseResponse(configResponse);
      const config = configBody.auth || {};
      if (!config.enabled || !config.region || !config.app_client_id) {
        throw new Error('Account authentication is unavailable.');
      }

      await parseResponse(await fetch(`${API_ROOT}/radio/auth/guard`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      }));

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
      const body = await parseResponse(response);
      const result = body.AuthenticationResult || {};
      const next = {
        accessToken: result.AccessToken || '',
        idToken: result.IdToken || '',
        refreshToken: existing.refreshToken,
        expiresAt: Date.now() + Math.max(60, Number(result.ExpiresIn || 3600)) * 1000
      };
      if (!next.accessToken) throw new Error('Your session has expired. Log in again.');
      saveTokens(next);
      return next;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function validTokens(required = false) {
    let token = readTokens();
    if (!token.accessToken) {
      if (required) throw new Error('Log in to follow this artist.');
      return {};
    }
    if (tokenExpiresSoon(token.accessToken)) token = await refreshSession();
    return token;
  }

  async function protectedApi(url, options = {}, retry = true) {
    const token = await validTokens(true);
    const headers = options.body ? { 'Content-Type': 'application/json' } : {};
    headers.Authorization = `Bearer ${token.accessToken}`;
    if (token.idToken) headers['X-Cognito-Id-Token'] = token.idToken;
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (response.status === 401 && retry && readTokens().refreshToken) {
      await refreshSession();
      return protectedApi(url, options, false);
    }
    return parseResponse(response);
  }

  async function resolveArtistKey() {
    if (!artistKeyPromise) {
      artistKeyPromise = fetch(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`, {
        cache: 'no-store',
        credentials: 'omit'
      }).then(parseResponse).then(data => data.artist?.artist_key || identifier);
    }
    return artistKeyPromise;
  }

  function followerCount() {
    const node = document.getElementById('followerCount');
    const parsed = Number(String(node?.textContent || '0').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function setFollowerCount(value) {
    const node = document.getElementById('followerCount');
    if (node) node.textContent = Math.max(0, Number(value || 0)).toLocaleString();
  }

  function setButton(button, isFollowing, text = '') {
    if (!button) return;
    button.textContent = text || (isFollowing ? 'Following' : 'Follow');
    button.classList.toggle('primary', !isFollowing);
    button.classList.toggle('secondary', isFollowing);
    button.dataset.isFollowing = isFollowing ? '1' : '0';
    button.setAttribute('aria-pressed', String(isFollowing));
  }

  function openLogin(artistKey) {
    sessionStorage.setItem(PENDING_KEY, artistKey);
    window.location.href = `/radio/dev/?follow_artist=${encodeURIComponent(artistKey)}`;
  }

  async function loadSavedFollows(force = false) {
    if (!readTokens().accessToken) return readFollowCache();
    if (hydrationPromise && !force) return hydrationPromise;
    hydrationPromise = protectedApi(`${API_ROOT}/radio/me/follows`)
      .then(data => saveFollowCache(data.follows || []))
      .finally(() => { hydrationPromise = null; });
    return hydrationPromise;
  }

  async function hydrateCurrentArtist(button, force = false) {
    if (!button || busy) return;
    const artistKey = await resolveArtistKey();
    const cached = readFollowCache();
    const cachedFollow = cached.find(item => item.artist_key === artistKey);
    if (cachedFollow) setButton(button, true);

    if (!readTokens().accessToken) return;
    try {
      const follows = await loadSavedFollows(force);
      const saved = follows.find(item => item.artist_key === artistKey);
      setButton(button, Boolean(saved));
      if (saved && Number.isFinite(Number(saved.follower_count))) {
        setFollowerCount(saved.follower_count);
      }
    } catch (error) {
      console.warn('[artist profile follow] saved state could not be loaded', error);
    }
  }

  async function handleFollow(button) {
    if (busy) return;
    busy = true;
    let artistKey = '';
    try {
      artistKey = await resolveArtistKey();
      const token = readTokens();
      if (!token.accessToken || !token.refreshToken) {
        openLogin(artistKey);
        return;
      }

      await hydrateCurrentArtist(button, true);
      const currentlyFollowing = button.dataset.isFollowing === '1';
      const shouldFollow = !currentlyFollowing;
      const previousCount = followerCount();

      setButton(button, shouldFollow, 'Saving…');
      setFollowerCount(previousCount + (shouldFollow ? 1 : -1));
      button.disabled = true;
      button.removeAttribute('title');

      try {
        const data = await protectedApi(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artistKey)}`, {
          method: shouldFollow ? 'POST' : 'DELETE',
          body: shouldFollow ? JSON.stringify({ notifications_enabled: true }) : undefined
        });
        if (!data.artist) throw new Error('The follow response did not include artist status.');
        setButton(button, Boolean(data.artist.is_following));
        setFollowerCount(data.artist.follower_count);
        sessionStorage.removeItem(PENDING_KEY);
        await loadSavedFollows(true);
        window.dispatchEvent(new CustomEvent('stashbox:artist-follow-changed', {
          detail: data.artist
        }));
      } catch (error) {
        setButton(button, currentlyFollowing, error.status === 401 ? 'Log in again' : 'Follow failed');
        setFollowerCount(previousCount);
        button.title = error.message;
        if (error.status === 401 || /expired|log in/i.test(error.message)) {
          sessionStorage.setItem(PENDING_KEY, artistKey);
          window.setTimeout(() => openLogin(artistKey), 500);
        }
        console.warn('[artist profile follow] action failed', error);
      } finally {
        button.disabled = false;
      }
    } finally {
      busy = false;
    }
  }

  function initializeButton(button) {
    if (!button || button.dataset.followSessionReady === '1') return;
    button.dataset.followSessionReady = '1';
    button.dataset.isFollowing = /^following$/i.test(String(button.textContent || '').trim()) ? '1' : '0';
    hydrateCurrentArtist(button).catch(error => console.warn('[artist profile follow] hydration failed', error));
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#followButton');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleFollow(button).catch(error => {
      busy = false;
      button.disabled = false;
      button.textContent = 'Follow failed';
      button.title = error.message;
      console.warn('[artist profile follow] controller failed', error);
    });
  }, true);

  initializeButton(document.getElementById('followButton'));
  new MutationObserver(() => initializeButton(document.getElementById('followButton')))
    .observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('storage', event => {
    if (event.key !== TOKEN_KEY && event.key !== FOLLOW_CACHE_KEY) return;
    hydrateCurrentArtist(document.getElementById('followButton'), true).catch(() => {});
  });
})();
