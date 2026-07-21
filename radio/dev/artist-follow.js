(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_KEY = 'stashbox_radio_dev_pending_artist_follow';
  const STYLE_ID = 'stashbox-artist-follow-style';
  let catalogPromise = null;
  let currentArtistKey = '';
  let processingPending = false;
  let refreshPromise = null;

  function clean(value) { return String(value ?? '').trim(); }
  function tokens() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; } catch (_) { return {}; } }
  function saveTokens(next) { try { localStorage.setItem(TOKEN_KEY, JSON.stringify(next)); } catch (_) {} }
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
  function isLoggedIn() { const token = tokens(); return Boolean(token.accessToken && token.refreshToken); }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
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
      const existing = tokens();
      if (!existing.refreshToken) throw new Error('Your session has expired. Log in again.');
      const configResponse = await fetch(`${API_ROOT}/radio/auth/config`, { cache: 'no-store' });
      const configBody = await parseResponse(configResponse);
      const config = configBody.auth || {};
      if (!config.enabled || !config.region || !config.app_client_id) throw new Error('Account authentication is unavailable.');
      await parseResponse(await fetch(`${API_ROOT}/radio/auth/guard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      }));
      const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
        method: 'POST',
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
    let token = tokens();
    if (!token.accessToken) {
      if (required) throw new Error('Log in to follow this artist.');
      return {};
    }
    if (tokenExpiresSoon(token.accessToken)) token = await refreshSession();
    return token;
  }

  async function api(url, options = {}, retry = true) {
    const protectedRequest = options.auth === true || /\/radio\/me\//.test(url);
    const token = await validTokens(protectedRequest);
    const headers = options.body ? { 'Content-Type': 'application/json' } : {};
    if (token.accessToken) headers.Authorization = `Bearer ${token.accessToken}`;
    if (token.idToken) headers['X-Cognito-Id-Token'] = token.idToken;
    const { auth: _auth, ...fetchOptions } = options;
    const response = await fetch(url, { cache: 'no-store', ...fetchOptions, headers: { ...headers, ...(options.headers || {}) } });
    if (response.status === 401 && retry && tokens().refreshToken) {
      await refreshSession();
      return api(url, options, false);
    }
    return parseResponse(response);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .artist-follow-control{display:inline-flex;align-items:center;gap:7px;margin-left:9px;vertical-align:middle;white-space:nowrap}
      .artist-profile-link{color:#ffd064;text-decoration:none;font-weight:800;border-bottom:1px solid transparent}
      .artist-profile-link:hover{border-bottom-color:#ffd064}
      .artist-follow-button{height:29px;min-height:29px;padding:0 11px;border:1px solid #f0a500;border-radius:999px;background:#f0a500;color:#171008;font:900 11px/1 Karla,Arial,sans-serif;cursor:pointer}
      .artist-follow-button.following{background:transparent;color:#ffd064}
      .artist-follow-button:disabled{opacity:.7;cursor:wait}
      .artist-follower-count{color:#aeb5bd;font:700 11px/1 Karla,Arial,sans-serif}
      .artist-follower-count.error{color:#ff8f8f}
      @media(max-width:700px){.artist-follow-control{display:flex;margin:7px 0 0;flex-wrap:wrap}.artist-follower-count{font-size:10px}}
    `;
    document.head.appendChild(style);
  }

  async function catalog(force = false) {
    if (force) catalogPromise = null;
    if (!catalogPromise) catalogPromise = api(`${API_ROOT}/radio/artists?limit=500`).then(data => data.artists || []).catch(error => { console.warn('[artist follow] catalog unavailable', error); return []; });
    return catalogPromise;
  }
  function normalizeName(value) { return clean(value).toLowerCase().replace(/\s+/g, ' '); }
  async function findArtist(name) {
    const artists = await catalog();
    const target = normalizeName(name);
    return artists.find(artist => normalizeName(artist.name) === target)
      || artists.find(artist => target.startsWith(`${normalizeName(artist.name)} `))
      || null;
  }
  function countLabel(count) { const value = Math.max(0, Number(count || 0)); return `${value.toLocaleString()} follower${value === 1 ? '' : 's'}`; }
  function renderControl(meta, artist) {
    let control = meta.querySelector('.artist-follow-control');
    if (!control) {
      control = document.createElement('span');
      control.className = 'artist-follow-control';
      meta.appendChild(control);
    }
    control.dataset.artistKey = artist.artist_key;
    control.innerHTML = `
      <a class="artist-profile-link" href="/radio/artists/dev/?artist=${encodeURIComponent(artist.slug || artist.artist_key)}" title="Open ${clean(artist.name)} artist profile">Artist Profile</a>
      <button class="artist-follow-button ${artist.is_following ? 'following' : ''}" type="button">${artist.is_following ? 'Following' : 'Follow'}</button>
      <span class="artist-follower-count">${countLabel(artist.follower_count)}</span>`;
    const button = control.querySelector('.artist-follow-button');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleFollow(control, artist).catch(error => console.warn('[artist follow] action failed', error));
    });
    return control;
  }
  function showControlError(control, message) {
    const count = control.querySelector('.artist-follower-count');
    if (!count) return;
    count.textContent = message;
    count.classList.add('error');
  }
  async function loadArtistDetail(artist) {
    try {
      const data = await api(`${API_ROOT}/radio/artists/${encodeURIComponent(artist.artist_key)}`);
      return data.artist || artist;
    } catch (_) {
      return artist;
    }
  }

  async function toggleFollow(control, artist, forceFollow = false) {
    if (!isLoggedIn()) {
      sessionStorage.setItem(PENDING_KEY, artist.artist_key);
      window.StashboxRadioAccount?.open?.('login');
      return;
    }
    const meta = control.closest('.meta');
    if (!meta) return;
    const shouldFollow = forceFollow || !artist.is_following;
    const previous = { ...artist, follower_count: Math.max(0, Number(artist.follower_count || 0)) };
    const optimistic = {
      ...previous,
      is_following: shouldFollow,
      follower_count: Math.max(0, previous.follower_count + (shouldFollow ? 1 : -1))
    };
    const optimisticControl = renderControl(meta, optimistic);
    const optimisticButton = optimisticControl.querySelector('.artist-follow-button');
    optimisticButton.disabled = true;
    optimisticButton.textContent = 'Saving…';
    try {
      const data = await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artist.artist_key)}`, {
        method: shouldFollow ? 'POST' : 'DELETE',
        body: shouldFollow ? JSON.stringify({ notifications_enabled: true }) : undefined,
        auth: true
      });
      if (!data.artist) throw new Error('The follow response did not include the artist status.');
      catalogPromise = null;
      const confirmed = await loadArtistDetail(data.artist);
      renderControl(meta, confirmed);
      currentArtistKey = confirmed.artist_key;
      sessionStorage.removeItem(PENDING_KEY);
      window.dispatchEvent(new CustomEvent('stashbox:artist-follow-changed', { detail: confirmed }));
    } catch (error) {
      renderControl(meta, previous);
      showControlError(meta.querySelector('.artist-follow-control'), error.status === 401 ? 'Log in again' : 'Follow failed');
      if (error.status === 401) {
        sessionStorage.setItem(PENDING_KEY, artist.artist_key);
        window.StashboxRadioAccount?.open?.('login');
      }
      throw error;
    }
  }

  async function scan() {
    injectStyle();
    const meta = document.querySelector('.player-info .meta');
    const artistNode = meta?.querySelector(':scope > strong');
    const artistName = clean(artistNode?.textContent);
    if (!meta || !artistName) return;
    const artist = await findArtist(artistName);
    if (!artist) { meta.querySelector('.artist-follow-control')?.remove(); currentArtistKey = ''; return; }
    if (currentArtistKey === artist.artist_key && meta.querySelector(`.artist-follow-control[data-artist-key="${CSS.escape(artist.artist_key)}"]`)) return;
    currentArtistKey = artist.artist_key;
    renderControl(meta, await loadArtistDetail(artist));
  }
  async function processPending() {
    if (processingPending || !isLoggedIn()) return;
    const pending = clean(sessionStorage.getItem(PENDING_KEY));
    if (!pending) return;
    processingPending = true;
    try {
      const data = await api(`${API_ROOT}/radio/artists/${encodeURIComponent(pending)}`);
      const artist = data.artist;
      if (!artist.is_following) await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(pending)}`, { method: 'POST', body: JSON.stringify({ notifications_enabled: true }), auth: true });
      sessionStorage.removeItem(PENDING_KEY);
      catalogPromise = null;
      currentArtistKey = '';
      await scan();
    } catch (error) {
      console.warn('[artist follow] pending follow failed', error);
    } finally {
      processingPending = false;
    }
  }
  let queued = false;
  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan().catch(error => console.warn('[artist follow] scan failed', error)); processPending(); });
  }
  injectStyle();
  queueScan();
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(processPending, 1500);
})();
