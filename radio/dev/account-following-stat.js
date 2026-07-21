(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FOLLOW_CACHE_KEY = 'stashbox_radio_dev_followed_artists';
  const STYLE_ID = 'stashbox-account-following-stat-style';
  const FALLBACK_ARTWORK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  let refreshPromise = null;
  let requestPromise = null;
  let queued = false;
  let followingViewOpen = false;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
      error.code = body.code || '';
      error.detail = body.detail || '';
      throw error;
    }
    return body;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const existing = tokens();
      if (!existing.refreshToken) throw new Error('Session expired. Log in again.');
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
      if (!next.accessToken) throw new Error('Session expired. Log in again.');
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

  async function authenticatedRequest(url, options = {}, retry = true) {
    const token = await validTokens();
    if (!token) throw new Error('Log in to manage followed artists.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token.accessToken}`);
    if (token.idToken) headers.set('X-Cognito-Id-Token', token.idToken);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      ...options,
      headers
    });
    if (response.status === 401 && retry && tokens().refreshToken) {
      await refreshSession();
      return authenticatedRequest(url, options, false);
    }
    return parseResponse(response);
  }

  function normalizeFollows(follows) {
    return (Array.isArray(follows) ? follows : []).map(artist => ({
      artist_key: String(artist?.artist_key || ''),
      slug: String(artist?.slug || artist?.artist_key || ''),
      name: String(artist?.name || artist?.artist_key || 'Artist'),
      profile_image_url: String(artist?.profile_image_url || ''),
      follower_count: Math.max(0, Number(artist?.follower_count || 0)),
      verified: Boolean(artist?.verified)
    })).filter(artist => artist.artist_key);
  }

  function cacheFollows(follows) {
    const normalized = normalizeFollows(follows);
    try { localStorage.setItem(FOLLOW_CACHE_KEY, JSON.stringify(normalized)); }
    catch (_) {}
    window.dispatchEvent(new CustomEvent('stashbox:artist-follows-loaded', {
      detail: { follows: normalized, count: normalized.length }
    }));
    return normalized;
  }

  async function loadFollows(force = false) {
    if (requestPromise && !force) return requestPromise;
    requestPromise = (async () => {
      const token = await validTokens();
      if (!token) return normalizeFollows(readJson(FOLLOW_CACHE_KEY, []));
      const body = await authenticatedRequest(`${API_ROOT}/radio/me/follows`);
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
        position: relative;
        cursor: pointer;
        border-color: rgba(240, 165, 0, .34);
        transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
      }
      .radio-account-stat.radio-account-following-stat::after {
        content: '›';
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: #f0a500;
        font-size: 25px;
        font-weight: 900;
        line-height: 1;
      }
      .radio-account-stat.radio-account-following-stat:hover,
      .radio-account-stat.radio-account-following-stat:focus-visible {
        transform: translateY(-2px);
        border-color: rgba(240, 165, 0, .7);
        background: linear-gradient(135deg, rgba(240, 165, 0, .11), rgba(255, 255, 255, .035));
        box-shadow: 0 12px 28px rgba(0, 0, 0, .22);
        outline: none;
      }
      .radio-account-following-stat small {
        display: block;
        margin-top: 4px;
        color: #9fa6af;
        font-size: 10px;
        font-weight: 700;
      }
      .radio-following-artists-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .radio-following-artists-header h3 {
        margin: 0;
      }
      .radio-following-artists-header p {
        margin: 5px 0 0;
        color: #aeb5bd;
        font-size: 12px;
      }
      .radio-following-artists-list {
        display: grid;
        gap: 10px;
      }
      .radio-following-artist-row {
        display: grid;
        grid-template-columns: 58px minmax(0, 1fr) auto;
        align-items: center;
        gap: 13px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, .12);
        border-radius: 12px;
        background: rgba(255, 255, 255, .025);
      }
      .radio-following-artist-link {
        display: contents;
        color: inherit;
        text-decoration: none;
      }
      .radio-following-artist-thumb {
        width: 58px;
        height: 58px;
        border-radius: 11px;
        object-fit: cover;
        background: #090b0d;
        border: 1px solid rgba(255, 255, 255, .12);
      }
      .radio-following-artist-copy {
        min-width: 0;
      }
      .radio-following-artist-copy strong {
        display: block;
        color: #fff;
        font-size: 15px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .radio-following-artist-copy span {
        display: block;
        margin-top: 4px;
        color: #aeb5bd;
        font-size: 11px;
      }
      .radio-following-artist-unfollow {
        min-width: 92px;
        border-color: rgba(255, 76, 76, .62) !important;
        color: #ff8f8f !important;
        background: rgba(255, 54, 54, .06) !important;
      }
      .radio-following-artist-unfollow:hover,
      .radio-following-artist-unfollow:focus-visible {
        border-color: #ff5d5d !important;
        color: #fff !important;
        background: rgba(255, 54, 54, .2) !important;
      }
      .radio-following-artists-message {
        min-height: 18px;
        margin: 13px 0 0;
        color: #aeb5bd;
        font-size: 12px;
      }
      .radio-following-artists-message.error {
        color: #ff8f8f;
      }
      @media (max-width: 560px) {
        .radio-following-artists-header {
          align-items: stretch;
          flex-direction: column;
        }
        .radio-following-artist-row {
          grid-template-columns: 50px minmax(0, 1fr);
        }
        .radio-following-artist-thumb {
          width: 50px;
          height: 50px;
        }
        .radio-following-artist-unfollow {
          grid-column: 1 / -1;
          width: 100%;
        }
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
      card.dataset.followingArtistsOpen = 'true';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'Open followed artists');
      card.innerHTML = 'Following Artists<strong>0</strong><small>Saved artist follows</small>';
      grid.appendChild(card);
    }
    const strong = card.querySelector('strong');
    if (strong) strong.textContent = Math.max(0, Number(count || 0)).toLocaleString();
  }

  function followingRows(follows) {
    if (!follows.length) {
      return '<p class="radio-account-empty">You are not following any artists yet.</p>';
    }
    return `<div class="radio-following-artists-list">${follows.map(artist => {
      const profileUrl = `/radio/artists/dev/?artist=${encodeURIComponent(artist.slug || artist.artist_key)}`;
      const followerLabel = `${artist.follower_count.toLocaleString()} follower${artist.follower_count === 1 ? '' : 's'}`;
      return `
        <article class="radio-following-artist-row" data-following-artist="${escapeHtml(artist.artist_key)}">
          <a class="radio-following-artist-link" href="${profileUrl}">
            <img class="radio-following-artist-thumb" src="${escapeHtml(artist.profile_image_url || FALLBACK_ARTWORK)}" alt="${escapeHtml(artist.name)}" loading="lazy" onerror="this.src='${FALLBACK_ARTWORK}'">
            <div class="radio-following-artist-copy">
              <strong>${escapeHtml(artist.name)}${artist.verified ? ' ✓' : ''}</strong>
              <span>${escapeHtml(followerLabel)}</span>
            </div>
          </a>
          <button class="radio-following-artist-unfollow" type="button" data-unfollow-artist="${escapeHtml(artist.artist_key)}">Unfollow</button>
        </article>`;
    }).join('')}</div>`;
  }

  function renderFollowingView(follows, message = '', error = false) {
    const content = document.querySelector('.radio-account-content');
    if (!content) return;
    followingViewOpen = true;
    content.innerHTML = `
      <section class="radio-account-panel" data-following-artists-panel>
        <header class="radio-following-artists-header">
          <div>
            <h3 class="radio-account-section-title">Following Artists</h3>
            <p>${follows.length} artist${follows.length === 1 ? '' : 's'} followed</p>
          </div>
          <button type="button" data-following-artists-back>Back to My Account</button>
        </header>
        ${followingRows(follows)}
        <p class="radio-following-artists-message ${error ? 'error' : ''}" aria-live="polite">${escapeHtml(message)}</p>
      </section>`;
  }

  function renderFollowingLoading() {
    const content = document.querySelector('.radio-account-content');
    if (!content) return;
    followingViewOpen = true;
    content.innerHTML = `
      <section class="radio-account-panel" data-following-artists-panel>
        <header class="radio-following-artists-header">
          <div><h3 class="radio-account-section-title">Following Artists</h3><p>Loading saved artist follows…</p></div>
          <button type="button" data-following-artists-back>Back to My Account</button>
        </header>
        <p class="radio-account-empty">Loading followed artists…</p>
      </section>`;
  }

  async function openFollowingView() {
    renderFollowingLoading();
    try {
      const follows = await loadFollows(true);
      renderFollowingView(follows);
    } catch (error) {
      renderFollowingView(normalizeFollows(readJson(FOLLOW_CACHE_KEY, [])), error.message, true);
    }
  }

  async function unfollowArtist(artistKey, button) {
    const followsBefore = normalizeFollows(readJson(FOLLOW_CACHE_KEY, []));
    if (button) {
      button.disabled = true;
      button.textContent = 'Removing…';
    }
    try {
      const data = await authenticatedRequest(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artistKey)}`, {
        method: 'DELETE'
      });
      const follows = cacheFollows(followsBefore.filter(artist => artist.artist_key !== artistKey));
      renderFollowingView(follows, 'Artist unfollowed.');
      renderCount(follows.length);
      window.dispatchEvent(new CustomEvent('stashbox:artist-follow-changed', {
        detail: data.artist || { artist_key: artistKey, is_following: false }
      }));
    } catch (error) {
      renderFollowingView(followsBefore, error.message, true);
    }
  }

  async function enhance(force = false) {
    injectStyle();
    if (followingViewOpen && document.querySelector('[data-following-artists-panel]')) return;
    const grid = document.querySelector('.radio-account-content .radio-account-card-grid');
    if (!grid) return;
    const cached = normalizeFollows(readJson(FOLLOW_CACHE_KEY, []));
    renderCount(cached.length);
    try {
      const follows = await loadFollows(force);
      renderCount(follows.length);
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

  document.addEventListener('click', event => {
    const card = event.target.closest('[data-following-artists-open]');
    if (card) {
      event.preventDefault();
      openFollowingView();
      return;
    }
    const back = event.target.closest('[data-following-artists-back]');
    if (back) {
      event.preventDefault();
      followingViewOpen = false;
      window.StashboxRadioAccount?.open?.('account');
      return;
    }
    const unfollow = event.target.closest('[data-unfollow-artist]');
    if (unfollow) {
      event.preventDefault();
      event.stopPropagation();
      unfollowArtist(unfollow.dataset.unfollowArtist, unfollow);
    }
  });

  document.addEventListener('keydown', event => {
    const card = event.target.closest('[data-following-artists-open]');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openFollowingView();
  });

  injectStyle();
  queueEnhance();
  new MutationObserver(() => {
    if (!document.querySelector('[data-following-artists-panel]')) followingViewOpen = false;
    queueEnhance(false);
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('stashbox:artist-follow-changed', () => queueEnhance(true));
  window.addEventListener('stashbox:artist-follows-loaded', event => renderCount(event.detail?.count || 0));
})();
