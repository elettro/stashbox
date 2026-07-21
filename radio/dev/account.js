(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const AUTH_CONFIG_URL = `${API_ROOT}/radio/auth/config`;
  const AUTH_GUARD_URL = `${API_ROOT}/radio/auth/guard`;
  const ME_URL = `${API_ROOT}/radio/me`;
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_EMAIL_KEY = 'stashbox_radio_dev_pending_email';
  const ANON_FAVORITES_KEY = 'stashbox_radio_dev_anonymous_favorites';
  const ANON_HISTORY_KEY = 'stashbox_radio_dev_anonymous_history';
  const NOTIFICATION_READ_KEY = 'stashbox_notification_read_ids_dev';
  const NOTIFICATION_DISMISSED_KEY = 'stashbox_notification_dismissed_ids_dev';
  const NOTIFICATION_VISITOR_KEY = 'stashbox_notification_visitor_id_dev';
  const ACCOUNT_CSS_URL = './account.css';
  const PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';
  const PLAYLIST_FALLBACK_ARTWORK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const nativeFetch = window.fetch.bind(window);

  const state = {
    config: null,
    tokens: readJson(TOKEN_STORAGE_KEY, null),
    account: null,
    summary: null,
    favorites: [],
    playlists: [],
    history: [],
    preferences: null,
    songs: [],
    view: 'login',
    busy: false,
    message: '',
    error: '',
    menuOpen: false,
    currentPlaylistSong: null,
    playlistDetails: {}
  };

  let ui = null;
  let refreshPromise = null;
  const attachedAudio = new WeakSet();
  const historyTimers = new WeakMap();

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function readStringArray(key) {
    const value = readJson(key, []);
    return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function randomId(prefix = 'event') {
    return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function decodeJwtPayload(token) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return {};
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    } catch (_) {
      return {};
    }
  }

  function tokenExpiresSoon(token, seconds = 90) {
    const exp = Number(decodeJwtPayload(token).exp || 0);
    return !exp || exp * 1000 <= Date.now() + seconds * 1000;
  }

  function saveTokens(authenticationResult, existingRefreshToken = '') {
    if (!authenticationResult) return;
    const next = {
      accessToken: authenticationResult.AccessToken || '',
      idToken: authenticationResult.IdToken || '',
      refreshToken: authenticationResult.RefreshToken || existingRefreshToken || state.tokens?.refreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(authenticationResult.ExpiresIn || 3600)) * 1000
    };
    state.tokens = next;
    writeJson(TOKEN_STORAGE_KEY, next);
  }

  function clearTokens() {
    state.tokens = null;
    state.account = null;
    state.summary = null;
    state.favorites = [];
    state.playlists = [];
    state.history = [];
    state.preferences = null;
    state.playlistDetails = {};
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
  }

  function isLoggedIn() {
    return Boolean(state.tokens?.accessToken && state.tokens?.refreshToken);
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = { error: text }; }
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = body?.code || '';
      error.body = body;
      throw error;
    }
    return body || {};
  }

  async function authGuard(action) {
    const response = await nativeFetch(AUTH_GUARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    return parseResponse(response);
  }

  async function cognitoCall(operation, payload) {
    if (!state.config?.enabled) throw new Error('Listener accounts are not configured in DEV yet.');
    const response = await nativeFetch(`https://cognito-idp.${state.config.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(body.message || body.Message || 'Authentication request failed.');
      error.code = String(body.__type || body.code || '').split('#').pop();
      throw error;
    }
    return body;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    if (!state.tokens?.refreshToken || !state.config?.enabled) {
      clearTokens();
      throw new Error('Your session has expired. Log in again.');
    }
    refreshPromise = (async () => {
      try {
        await authGuard('refresh');
        const result = await cognitoCall('InitiateAuth', {
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: state.config.app_client_id,
          AuthParameters: { REFRESH_TOKEN: state.tokens.refreshToken }
        });
        saveTokens(result.AuthenticationResult, state.tokens.refreshToken);
        return state.tokens;
      } catch (error) {
        clearTokens();
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function getValidTokens() {
    if (!state.tokens?.accessToken) throw new Error('Log in to continue.');
    if (tokenExpiresSoon(state.tokens.accessToken)) await refreshSession();
    return state.tokens;
  }

  async function apiFetch(url, options = {}, retry = true) {
    const tokens = await getValidTokens();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    if (tokens.idToken) headers.set('X-Cognito-Id-Token', tokens.idToken);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await nativeFetch(url, { ...options, headers });
    if (response.status === 401 && retry && state.tokens?.refreshToken) {
      await refreshSession();
      return apiFetch(url, options, false);
    }
    return parseResponse(response);
  }

  function patchNotificationFetch() {
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!/\/radio\/notifications\/[^/]+\/events(?:\?|$)/.test(url) || !state.tokens?.accessToken) {
        return nativeFetch(input, init);
      }
      try {
        const tokens = await getValidTokens();
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        if (tokens.idToken) headers.set('X-Cognito-Id-Token', tokens.idToken);
        return nativeFetch(input, { ...init, headers });
      } catch (_) {
        return nativeFetch(input, init);
      }
    };
  }

  function injectCss() {
    if (document.querySelector('link[data-stashbox-account-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ACCOUNT_CSS_URL;
    link.dataset.stashboxAccountCss = 'true';
    document.head.appendChild(link);
  }

  function createUi() {
    if (ui) return ui;
    const overlay = document.createElement('div');
    overlay.className = 'radio-account-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="radio-account-modal" role="dialog" aria-modal="true" aria-labelledby="radioAccountTitle">
        <header class="radio-account-modal-header">
          <h2 id="radioAccountTitle">Stashbox Radio Account</h2>
          <button class="radio-account-close" type="button" aria-label="Close account window">×</button>
        </header>
        <div class="radio-account-body">
          <nav class="radio-account-tabs" aria-label="Account sections"></nav>
          <div class="radio-account-content"></div>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    ui = {
      overlay,
      modal: overlay.querySelector('.radio-account-modal'),
      close: overlay.querySelector('.radio-account-close'),
      tabs: overlay.querySelector('.radio-account-tabs'),
      content: overlay.querySelector('.radio-account-content'),
      header: null,
      menu: null
    };
    ui.close.addEventListener('click', closeModal);
    overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closeModal(); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) closeModal(); });
    ui.content.addEventListener('submit', handleFormSubmit);
    ui.content.addEventListener('click', handleContentClick);
    ui.tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-account-view]');
      if (button) openModal(button.dataset.accountView);
    });
    return ui;
  }

  function headerAnchor() {
    return document.querySelector('.stashbox-action-row') || document.querySelector('.stashbox-right-stack') || document.querySelector('.stashbox-radio-header');
  }

  function injectHeader() {
    const anchor = headerAnchor();
    if (!anchor) return false;
    let shell = document.querySelector('.radio-account-actions');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'radio-account-actions';
      anchor.appendChild(shell);
      shell.addEventListener('click', handleHeaderClick);
    }
    ui.header = shell;
    renderHeader();
    return true;
  }

  function renderHeader() {
    if (!ui?.header) return;
    if (!isLoggedIn() || !state.account) {
      ui.header.innerHTML = `
        <button class="radio-account-button" type="button" data-account-open="login">Log In</button>
        <button class="radio-account-button primary" type="button" data-account-open="signup">Create Account</button>
      `;
      return;
    }
    const displayName = escapeHtml(state.account.display_name || 'Listener');
    ui.header.innerHTML = `
      <button class="radio-account-button radio-account-user-button" type="button" data-account-menu-toggle aria-expanded="${state.menuOpen}">${displayName}</button>
      <div class="radio-account-menu" ${state.menuOpen ? '' : 'hidden'}>
        <button type="button" data-account-open="account">My Account</button>
        <button type="button" data-account-open="favorites">Favorites</button>
        <button type="button" data-account-open="playlists">Playlists</button>
        <button type="button" data-account-open="history">Listening History</button>
        <button type="button" data-account-notifications>Notifications</button>
        <button type="button" data-account-logout>Log Out</button>
      </div>
    `;
  }

  function handleHeaderClick(event) {
    const openButton = event.target.closest('[data-account-open]');
    if (openButton) {
      state.menuOpen = false;
      renderHeader();
      openModal(openButton.dataset.accountOpen);
      return;
    }
    if (event.target.closest('[data-account-menu-toggle]')) {
      state.menuOpen = !state.menuOpen;
      renderHeader();
      return;
    }
    if (event.target.closest('[data-account-notifications]')) {
      state.menuOpen = false;
      renderHeader();
      document.querySelector('.sbr-notification-bell')?.click();
      return;
    }
    if (event.target.closest('[data-account-logout]')) logout();
  }

  function setFeedback(message = '', error = '') {
    state.message = message;
    state.error = error;
    const target = ui?.content?.querySelector('.radio-account-message');
    if (target) {
      target.textContent = error || message;
      target.classList.toggle('error', Boolean(error));
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    ui?.content?.querySelectorAll('button, input, textarea, select').forEach(element => {
      if (element.dataset.allowBusy !== 'true') element.disabled = busy;
    });
  }

  function openModal(view = '') {
    createUi();
    state.view = view || (isLoggedIn() ? 'account' : 'login');
    state.menuOpen = false;
    renderHeader();
    ui.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    renderModal();
    window.requestAnimationFrame(() => ui.modal.querySelector('input, button')?.focus?.());
  }

  function closeModal() {
    if (!ui) return;
    ui.overlay.hidden = true;
    document.body.style.overflow = '';
    setFeedback();
  }

  function authTabs() {
    return [
      ['login', 'Log In'],
      ['signup', 'Create Account'],
      ['verify', 'Verify Email'],
      ['forgot', 'Forgot Password']
    ];
  }

  function accountTabs() {
    return [
      ['account', 'My Account'],
      ['favorites', 'Favorites'],
      ['playlists', 'Playlists'],
      ['history', 'Listening History'],
      ['preferences', 'Preferences']
    ];
  }

  function renderTabs() {
    const tabs = isLoggedIn() && state.account ? accountTabs() : authTabs();
    ui.tabs.innerHTML = tabs.map(([view, label]) => `<button type="button" class="${state.view === view ? 'active' : ''}" data-account-view="${view}">${label}</button>`).join('');
  }

  function renderModal() {
    renderTabs();
    state.message = '';
    state.error = '';
    if (!state.config?.enabled) {
      ui.content.innerHTML = `
        <section class="radio-account-panel">
          <p class="radio-account-dev-note">The DEV account interface is installed. Cognito resource IDs still need to be added to the DEV Lambda before sign-up and login become active.</p>
          <p class="radio-account-message"></p>
        </section>
      `;
      return;
    }
    if (!isLoggedIn() || !state.account) renderAuthView();
    else renderAccountView();
  }

  function renderAuthView() {
    const pendingEmail = escapeHtml(localStorage.getItem(PENDING_EMAIL_KEY) || '');
    const message = '<p class="radio-account-message"></p>';
    if (state.view === 'signup') {
      ui.content.innerHTML = `
        <section class="radio-account-panel">
          <form class="radio-account-form" data-form="signup">
            <label>Display name<input name="display_name" maxlength="120" autocomplete="nickname" required></label>
            <label>Email<input name="email" type="email" maxlength="320" autocomplete="email" required></label>
            <label>Password<input name="password" type="password" minlength="12" autocomplete="new-password" required></label>
            <p class="radio-account-dev-note">Use at least 12 characters with uppercase, lowercase, number, and symbol.</p>
            <div class="radio-account-form-actions"><button class="primary" type="submit">Create Account</button></div>
            ${message}
          </form>
        </section>`;
      return;
    }
    if (state.view === 'verify') {
      ui.content.innerHTML = `
        <section class="radio-account-panel">
          <form class="radio-account-form" data-form="verify">
            <label>Email<input name="email" type="email" value="${pendingEmail}" autocomplete="email" required></label>
            <label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
            <div class="radio-account-form-actions"><button class="primary" type="submit">Verify Email</button><button type="button" data-action="resend-code">Resend Code</button></div>
            ${message}
          </form>
        </section>`;
      return;
    }
    if (state.view === 'forgot') {
      ui.content.innerHTML = `
        <section class="radio-account-panel">
          <form class="radio-account-form" data-form="forgot">
            <label>Email<input name="email" type="email" value="${pendingEmail}" autocomplete="email" required></label>
            <div class="radio-account-form-actions"><button class="primary" type="submit">Send Reset Code</button></div>
            ${message}
          </form>
        </section>`;
      return;
    }
    if (state.view === 'reset') {
      ui.content.innerHTML = `
        <section class="radio-account-panel">
          <form class="radio-account-form" data-form="reset">
            <label>Email<input name="email" type="email" value="${pendingEmail}" autocomplete="email" required></label>
            <label>Reset code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
            <label>New password<input name="password" type="password" minlength="12" autocomplete="new-password" required></label>
            <div class="radio-account-form-actions"><button class="primary" type="submit">Reset Password</button></div>
            ${message}
          </form>
        </section>`;
      return;
    }
    state.view = 'login';
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        <form class="radio-account-form" data-form="login">
          <label>Email<input name="email" type="email" value="${pendingEmail}" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <div class="radio-account-form-actions"><button class="primary" type="submit">Log In</button><button type="button" data-action="open-forgot">Forgot Password</button></div>
          ${message}
        </form>
      </section>`;
  }

  function renderAccountView() {
    if (state.view === 'favorites') return renderFavorites();
    if (state.view === 'playlists') return renderPlaylists();
    if (state.view === 'history') return renderHistory();
    if (state.view === 'preferences') return renderPreferences();
    state.view = 'account';
    const roles = Array.isArray(state.account.roles) ? state.account.roles.join(', ') : 'listener';
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        <div class="radio-account-card-grid">
          <div class="radio-account-stat">Favorites<strong>${Number(state.summary?.favorites || 0)}</strong></div>
          <div class="radio-account-stat">Playlists<strong>${Number(state.summary?.playlists || 0)}</strong></div>
          <div class="radio-account-stat">History Events<strong>${Number(state.summary?.history_events || 0)}</strong></div>
          <div class="radio-account-stat">Unread Alerts<strong>${Number(state.summary?.unread_notifications || 0)}</strong></div>
        </div>
        <form class="radio-account-form" data-form="profile">
          <label>Display name<input name="display_name" maxlength="120" value="${escapeHtml(state.account.display_name || '')}" required></label>
          <label>Email<input value="${escapeHtml(state.account.email || '')}" disabled></label>
          <p class="radio-account-dev-note">Role: ${escapeHtml(roles)}. Elevated roles require administrator approval.</p>
          <div class="radio-account-form-actions"><button class="primary" type="submit">Save Display Name</button><button type="button" data-action="logout">Log Out</button></div>
          <p class="radio-account-message"></p>
        </form>
      </section>`;
  }

  function listMarkup(items, emptyText, formatter) {
    return items.length ? `<div class="radio-account-list">${items.map(formatter).join('')}</div>` : `<p class="radio-account-empty">${escapeHtml(emptyText)}</p>`;
  }

  function renderFavorites() {
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        <h3 class="radio-account-section-title">Persistent Favorites</h3>
        ${listMarkup(state.favorites, 'No saved favorites yet.', favorite => `
          <article class="radio-account-list-item">
            <div class="radio-account-list-copy"><strong>${escapeHtml(favorite.display_title || favorite.song_key)}</strong><span>${escapeHtml(favorite.artist || '')}</span></div>
            <div class="radio-account-list-actions"><button type="button" data-remove-favorite="${escapeHtml(favorite.song_key)}">Remove</button></div>
          </article>`)}
        <p class="radio-account-message"></p>
      </section>`;
  }

  function renderPlaylists() {
    const selectedSong = state.currentPlaylistSong;
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        ${selectedSong ? `<p class="radio-account-dev-note">Add “${escapeHtml(selectedSong.display_title || selectedSong.song_key)}” to a playlist below.</p>` : ''}
        <form class="radio-account-form" data-form="playlist-create">
          <label>New playlist name<input name="name" maxlength="160" placeholder="My Playlist" required></label>
          <div class="radio-account-form-actions"><button class="primary" type="submit">Create Playlist</button></div>
        </form>
        <h3 class="radio-account-section-title">Your Playlists</h3>
        ${listMarkup(state.playlists, 'No playlists yet.', playlist => `
          <article class="radio-account-list-item">
            <div class="radio-account-list-copy"><strong>${escapeHtml(playlist.name)}</strong><span>${Number(playlist.item_count || 0)} song${Number(playlist.item_count || 0) === 1 ? '' : 's'}</span></div>
            <div class="radio-account-list-actions">
              ${selectedSong ? `<button class="primary" type="button" data-add-to-playlist="${escapeHtml(playlist.id)}">Add Song</button>` : ''}
              <button type="button" data-open-playlist="${escapeHtml(playlist.id)}">View</button>
              <button type="button" data-delete-playlist="${escapeHtml(playlist.id)}">Delete</button>
            </div>
          </article>`)}
        <div data-playlist-detail></div>
        <p class="radio-account-message"></p>
      </section>`;
  }

  function renderHistory() {
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        <h3 class="radio-account-section-title">Listening History</h3>
        ${listMarkup(state.history, 'Listening history will appear after you play songs while logged in.', item => `
          <article class="radio-account-list-item">
            <div class="radio-account-list-copy"><strong>${escapeHtml(item.display_title || item.song_key)}</strong><span>${escapeHtml(item.artist || '')} · ${escapeHtml(item.event_type || 'play_start')} · ${escapeHtml(formatDate(item.listened_at))}</span></div>
          </article>`)}
        <p class="radio-account-message"></p>
      </section>`;
  }

  function renderPreferences() {
    const preferences = state.preferences || {};
    ui.content.innerHTML = `
      <section class="radio-account-panel">
        <form class="radio-account-form" data-form="preferences">
          <label>Default song view<select name="default_view_mode"><option value="visual" ${preferences.default_view_mode === 'visual' ? 'selected' : ''}>Visual</option><option value="list" ${preferences.default_view_mode === 'list' ? 'selected' : ''}>List</option></select></label>
          <label><span><input name="autoplay_enabled" type="checkbox" ${preferences.autoplay_enabled !== false ? 'checked' : ''}> Autoplay the next song</span></label>
          <label><span><input name="explicit_content_enabled" type="checkbox" ${preferences.explicit_content_enabled !== false ? 'checked' : ''}> Allow explicit content</span></label>
          <label>Preferred genres<input name="preferred_genres" value="${escapeHtml((preferences.preferred_genres || []).join(', '))}" placeholder="Reggae, Rock"></label>
          <label>Preferred artists<input name="preferred_artists" value="${escapeHtml((preferences.preferred_artists || []).join(', '))}" placeholder="Stashbox"></label>
          <label><span><input name="in_app_enabled" type="checkbox" ${preferences.in_app_enabled !== false ? 'checked' : ''}> In-app notifications</span></label>
          <div class="radio-account-form-actions"><button class="primary" type="submit">Save Preferences</button></div>
          <p class="radio-account-message"></p>
        </form>
      </section>`;
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function handleFormSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const values = formValues(form);
    setBusy(true);
    setFeedback();
    try {
      if (form.dataset.form === 'signup') await signup(values);
      if (form.dataset.form === 'verify') await verifyEmail(values);
      if (form.dataset.form === 'login') await login(values);
      if (form.dataset.form === 'forgot') await forgotPassword(values);
      if (form.dataset.form === 'reset') await resetPassword(values);
      if (form.dataset.form === 'profile') await saveProfile(values);
      if (form.dataset.form === 'playlist-create') await createPlaylist(values);
      if (form.dataset.form === 'preferences') await savePreferences(form, values);
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleContentClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'open-forgot') return openModal('forgot');
    if (action === 'logout') return logout();
    if (action === 'resend-code') return resendCode();
    const favoriteKey = event.target.closest('[data-remove-favorite]')?.dataset.removeFavorite;
    if (favoriteKey) return removeFavorite(favoriteKey);
    const addPlaylistId = event.target.closest('[data-add-to-playlist]')?.dataset.addToPlaylist;
    if (addPlaylistId) return addCurrentSongToPlaylist(addPlaylistId);
    const playPlaylistId = event.target.closest('[data-play-playlist]')?.dataset.playPlaylist;
    if (playPlaylistId) return startPlaylistPlayback(playPlaylistId, 'ordered');
    const shufflePlaylistId = event.target.closest('[data-shuffle-playlist]')?.dataset.shufflePlaylist;
    if (shufflePlaylistId) return startPlaylistPlayback(shufflePlaylistId, 'shuffle');
    const openPlaylistId = event.target.closest('[data-open-playlist]')?.dataset.openPlaylist;
    if (openPlaylistId) return showPlaylist(openPlaylistId);
    const deletePlaylistId = event.target.closest('[data-delete-playlist]')?.dataset.deletePlaylist;
    if (deletePlaylistId) return deletePlaylist(deletePlaylistId);
  }

  function friendlyError(error) {
    const code = String(error?.code || '');
    if (code.includes('NotAuthorized')) return 'Incorrect email or password.';
    if (code.includes('UserNotConfirmed')) return 'Verify your email before logging in.';
    if (code.includes('CodeMismatch')) return 'The confirmation code is incorrect.';
    if (code.includes('ExpiredCode')) return 'The confirmation code expired. Request a new code.';
    if (code.includes('UsernameExists')) return 'An account with this email already exists.';
    if (code.includes('InvalidPassword')) return 'Use at least 12 characters with uppercase, lowercase, number, and symbol.';
    if (error?.status === 429 || code === 'RATE_LIMITED') return 'Too many attempts. Wait and try again.';
    return error?.message || 'The request failed.';
  }

  async function signup(values) {
    const email = String(values.email || '').trim().toLowerCase();
    const displayName = String(values.display_name || '').trim();
    await authGuard('signup');
    await cognitoCall('SignUp', {
      ClientId: state.config.app_client_id,
      Username: email,
      Password: String(values.password || ''),
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'preferred_username', Value: displayName }
      ]
    });
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    state.view = 'verify';
    renderModal();
    setFeedback('Account created. Enter the verification code sent to your email.');
  }

  async function verifyEmail(values) {
    const email = String(values.email || '').trim().toLowerCase();
    await authGuard('verify');
    await cognitoCall('ConfirmSignUp', {
      ClientId: state.config.app_client_id,
      Username: email,
      ConfirmationCode: String(values.code || '').trim()
    });
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    state.view = 'login';
    renderModal();
    setFeedback('Email verified. Log in to continue.');
  }

  async function resendCode() {
    const email = String(ui.content.querySelector('input[name="email"]')?.value || '').trim().toLowerCase();
    if (!email) return setFeedback('', 'Enter your email first.');
    setBusy(true);
    try {
      await authGuard('verify');
      await cognitoCall('ResendConfirmationCode', { ClientId: state.config.app_client_id, Username: email });
      setFeedback('A new verification code was sent.');
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function login(values) {
    const email = String(values.email || '').trim().toLowerCase();
    await authGuard('login');
    const result = await cognitoCall('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: state.config.app_client_id,
      AuthParameters: { USERNAME: email, PASSWORD: String(values.password || '') }
    });
    saveTokens(result.AuthenticationResult);
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    await loadAccount();
    await mergeAnonymousActivity();
    state.view = 'account';
    renderHeader();
    renderModal();
    setFeedback('Logged in. Your saved activity now follows your account.');
  }

  async function forgotPassword(values) {
    const email = String(values.email || '').trim().toLowerCase();
    await authGuard('forgot_password');
    await cognitoCall('ForgotPassword', { ClientId: state.config.app_client_id, Username: email });
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    state.view = 'reset';
    renderModal();
    setFeedback('Enter the reset code sent to your email.');
  }

  async function resetPassword(values) {
    const email = String(values.email || '').trim().toLowerCase();
    await authGuard('reset_password');
    await cognitoCall('ConfirmForgotPassword', {
      ClientId: state.config.app_client_id,
      Username: email,
      ConfirmationCode: String(values.code || '').trim(),
      Password: String(values.password || '')
    });
    state.view = 'login';
    renderModal();
    setFeedback('Password reset. Log in with your new password.');
  }

  async function logout() {
    const accessToken = state.tokens?.accessToken;
    try {
      if (accessToken && state.config?.enabled) await cognitoCall('GlobalSignOut', { AccessToken: accessToken });
    } catch (_) {}
    clearTokens();
    state.menuOpen = false;
    renderHeader();
    if (ui && !ui.overlay.hidden) {
      state.view = 'login';
      renderModal();
      setFeedback('Logged out. Radio playback was not interrupted.');
    }
  }

  async function loadAccount() {
    const [accountData, favoritesData, playlistsData, historyData, preferencesData] = await Promise.all([
      apiFetch(ME_URL),
      apiFetch(`${ME_URL}/favorites`),
      apiFetch(`${ME_URL}/playlists`),
      apiFetch(`${ME_URL}/history?limit=100`),
      apiFetch(`${ME_URL}/preferences`)
    ]);
    state.account = accountData.user;
    state.summary = accountData.summary;
    state.favorites = favoritesData.favorites || [];
    state.playlists = playlistsData.playlists || [];
    state.history = historyData.history || [];
    state.preferences = preferencesData.preferences || {};
    renderHeader();
  }

  async function saveProfile(values) {
    const result = await apiFetch(ME_URL, {
      method: 'PUT',
      body: JSON.stringify({ display_name: String(values.display_name || '').trim() })
    });
    state.account = result.user;
    renderHeader();
    renderAccountView();
    setFeedback('Display name saved.');
  }

  async function loadSongs() {
    try {
      const response = await nativeFetch(SONGS_URL, { cache: 'no-store' });
      const body = await parseResponse(response);
      state.songs = Array.isArray(body.songs) ? body.songs : [];
    } catch (_) {
      state.songs = [];
    }
  }

  function normalizeArtworkUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function normalizeSong(row) {
    return {
      song_key: String(row?.song_key || row?.songKey || row?.id || '').trim(),
      song_id: String(row?.song_id || row?.songId || row?.id || '').trim(),
      display_title: String(row?.display_title || row?.title || row?.song_name || '').trim(),
      artist: String(row?.artist || row?.artist_name || 'Stashbox').trim(),
      genre: String(row?.genre || row?.primary_genre || '').trim(),
      artwork_url: normalizeArtworkUrl(row?.resolved_artwork_url || row?.song_artwork_url || row?.artwork_url || row?.cover_art_url || row?.image_url || '')
    };
  }

  function currentSongFromDom(origin = null) {
    const card = origin?.closest?.('.song-card');
    const title = String(card?.querySelector('h4')?.textContent || document.querySelector('.player-info h2')?.textContent || '').trim();
    const artist = String(card?.querySelector('.song-meta span')?.textContent || document.querySelector('.player-info .meta strong')?.textContent || '').trim();
    const exact = state.songs.map(normalizeSong).find(song => song.display_title.toLowerCase() === title.toLowerCase() && (!artist || song.artist.toLowerCase() === artist.toLowerCase()));
    return exact || state.songs.map(normalizeSong).find(song => song.display_title.toLowerCase() === title.toLowerCase()) || (title ? { song_key: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), song_id: '', display_title: title, artist } : null);
  }

  async function persistFavorite(song) {
    if (!song?.song_key) return;
    if (!isLoggedIn()) {
      const current = readJson(ANON_FAVORITES_KEY, []);
      const merged = [...current.filter(item => item.song_key !== song.song_key), song];
      writeJson(ANON_FAVORITES_KEY, merged.slice(-200));
      openModal('login');
      setFeedback('Create an account or log in to save this favorite across devices. The song keeps playing.');
      return;
    }
    try {
      await apiFetch(`${ME_URL}/favorites`, { method: 'POST', body: JSON.stringify(song) });
      if (!state.favorites.some(item => item.song_key === song.song_key)) state.favorites.unshift(song);
      if (state.summary) state.summary.favorites = state.favorites.length;
    } catch (error) {
      console.warn('[accounts] favorite save failed', error);
    }
  }

  async function removeFavorite(songKey) {
    setBusy(true);
    try {
      await apiFetch(`${ME_URL}/favorites/${encodeURIComponent(songKey)}`, { method: 'DELETE' });
      state.favorites = state.favorites.filter(item => item.song_key !== songKey);
      if (state.summary) state.summary.favorites = state.favorites.length;
      renderFavorites();
      setFeedback('Favorite removed.');
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function createPlaylist(values) {
    const result = await apiFetch(`${ME_URL}/playlists`, {
      method: 'POST',
      body: JSON.stringify({ name: String(values.name || '').trim() })
    });
    state.playlists.unshift({ ...result.playlist, item_count: 0 });
    if (state.summary) state.summary.playlists = state.playlists.length;
    renderPlaylists();
    setFeedback('Playlist created.');
  }

  async function addCurrentSongToPlaylist(playlistId) {
    if (!state.currentPlaylistSong) return;
    setBusy(true);
    try {
      await apiFetch(`${ME_URL}/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: 'POST',
        body: JSON.stringify(state.currentPlaylistSong)
      });
      state.playlists = state.playlists.map(playlist => playlist.id === playlistId ? { ...playlist, item_count: Number(playlist.item_count || 0) + 1 } : playlist);
      renderPlaylists();
      setFeedback('Song added to playlist.');
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  function resolvePlaylistSong(item) {
    const normalizedSongs = state.songs.map(normalizeSong);
    const itemKeys = [item?.song_key, item?.songKey, item?.song_id, item?.songId, item?.id]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const keyMatch = normalizedSongs.find(song => [song.song_key, song.song_id]
      .map(value => String(value || '').trim().toLowerCase())
      .some(value => value && itemKeys.includes(value)));
    if (keyMatch) return keyMatch;
    const title = String(item?.display_title || item?.title || item?.song_name || '').trim().toLowerCase();
    const artist = String(item?.artist || item?.artist_name || '').trim().toLowerCase();
    return normalizedSongs.find(song => song.display_title.toLowerCase() === title && (!artist || song.artist.toLowerCase() === artist)) || null;
  }

  function renderPlaylistDetail(playlist, target) {
    if (!target || !playlist) return;
    const items = Array.isArray(playlist.items) ? playlist.items : [];
    const playlistId = escapeHtml(playlist.id || '');
    const tracksMarkup = items.length ? `
      <div class="radio-playlist-track-list">
        ${items.map((item, index) => {
          const song = resolvePlaylistSong(item);
          const title = item.display_title || item.title || item.song_name || item.song_key || 'Untitled song';
          const artist = item.artist || item.artist_name || song?.artist || 'Stashbox';
          const artwork = song?.artwork_url || PLAYLIST_FALLBACK_ARTWORK;
          return `
            <article class="radio-playlist-track" data-playlist-song-key="${escapeHtml(item.song_key || song?.song_key || '')}">
              <div class="radio-playlist-track-artwork">
                <img src="${escapeHtml(artwork)}" alt="${escapeHtml(title)} artwork" loading="lazy">
                <span aria-hidden="true">${index + 1}</span>
              </div>
              <div class="radio-playlist-track-copy">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(artist)}</span>
              </div>
            </article>`;
        }).join('')}
      </div>` : '<p class="radio-account-empty">This playlist is empty.</p>';

    target.innerHTML = `
      <section class="radio-playlist-detail" data-playlist-detail-id="${playlistId}">
        <header class="radio-playlist-detail-header">
          <div>
            <p class="radio-playlist-detail-kicker">Personal Playlist</p>
            <h3 class="radio-account-section-title">${escapeHtml(playlist.name || 'Playlist')}</h3>
            <span class="radio-playlist-detail-count">${items.length} song${items.length === 1 ? '' : 's'}</span>
          </div>
          <div class="radio-playlist-playback-actions" aria-label="Playlist playback controls">
            <button class="primary radio-playlist-start-button" type="button" data-play-playlist="${playlistId}" ${items.length ? '' : 'disabled'}>
              <span aria-hidden="true">▶</span> Play
            </button>
            <button class="radio-playlist-shuffle-button" type="button" data-shuffle-playlist="${playlistId}" ${items.length ? '' : 'disabled'}>
              <span aria-hidden="true">⇄</span> Shuffle
            </button>
          </div>
        </header>
        ${tracksMarkup}
      </section>`;
  }

  function startPlaylistPlayback(playlistId, mode = 'ordered') {
    const playlist = state.playlistDetails?.[playlistId];
    if (!playlist) return setFeedback('', 'Open the playlist before starting playback.');
    const items = (Array.isArray(playlist.items) ? playlist.items : []).map(item => {
      const song = resolvePlaylistSong(item);
      return {
        song_key: item.song_key || item.songKey || song?.song_key || '',
        song_id: item.song_id || item.songId || song?.song_id || '',
        display_title: item.display_title || item.title || item.song_name || song?.display_title || '',
        artist: item.artist || item.artist_name || song?.artist || ''
      };
    }).filter(item => item.song_key || item.display_title);
    if (!items.length) return setFeedback('', 'This playlist does not contain any playable songs.');

    closeModal();
    window.dispatchEvent(new CustomEvent(PLAYLIST_PLAY_EVENT, {
      detail: {
        playlistId,
        playlistName: playlist.name || 'Playlist',
        mode: mode === 'shuffle' ? 'shuffle' : 'ordered',
        items
      }
    }));
  }

  async function showPlaylist(playlistId) {
    setBusy(true);
    try {
      const result = await apiFetch(`${ME_URL}/playlists/${encodeURIComponent(playlistId)}`);
      const playlist = result.playlist || null;
      if (playlist) state.playlistDetails[playlistId] = playlist;
      const target = ui.content.querySelector('[data-playlist-detail]');
      renderPlaylistDetail(playlist, target);
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deletePlaylist(playlistId) {
    setBusy(true);
    try {
      await apiFetch(`${ME_URL}/playlists/${encodeURIComponent(playlistId)}`, { method: 'DELETE' });
      state.playlists = state.playlists.filter(playlist => playlist.id !== playlistId);
      if (state.summary) state.summary.playlists = state.playlists.length;
      renderPlaylists();
      setFeedback('Playlist deleted.');
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(form, values) {
    const csv = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
    const payload = {
      default_view_mode: values.default_view_mode,
      autoplay_enabled: Boolean(form.elements.autoplay_enabled?.checked),
      explicit_content_enabled: Boolean(form.elements.explicit_content_enabled?.checked),
      preferred_genres: csv(values.preferred_genres),
      preferred_artists: csv(values.preferred_artists),
      in_app_enabled: Boolean(form.elements.in_app_enabled?.checked)
    };
    const result = await apiFetch(`${ME_URL}/preferences`, { method: 'PUT', body: JSON.stringify(payload) });
    state.preferences = result.preferences;
    renderPreferences();
    setFeedback('Preferences saved.');
  }

  function queueAnonymousHistory(item) {
    const current = readJson(ANON_HISTORY_KEY, []);
    current.push(item);
    writeJson(ANON_HISTORY_KEY, current.slice(-200));
  }

  async function saveHistory(item) {
    if (!item?.song_key) return;
    if (!isLoggedIn()) return queueAnonymousHistory(item);
    try {
      await apiFetch(`${ME_URL}/history`, { method: 'POST', body: JSON.stringify(item) });
    } catch (error) {
      console.warn('[accounts] history save failed', error);
    }
  }

  function attachAudioHistory(audio) {
    if (!audio || attachedAudio.has(audio)) return;
    attachedAudio.add(audio);
    audio.addEventListener('play', () => {
      const previous = historyTimers.get(audio);
      if (previous) window.clearTimeout(previous);
      const timer = window.setTimeout(() => {
        const song = currentSongFromDom(audio);
        if (!song || audio.paused || audio.ended) return;
        saveHistory({ ...song, event_type: 'play_start', seconds_played: Math.floor(audio.currentTime || 0), client_event_id: randomId('play'), source: 'public_player' });
      }, 10000);
      historyTimers.set(audio, timer);
    });
    audio.addEventListener('ended', () => {
      const song = currentSongFromDom(audio);
      if (!song) return;
      saveHistory({ ...song, event_type: 'play_full', seconds_played: Math.floor(audio.duration || audio.currentTime || 0), completed: true, client_event_id: randomId('full'), source: 'public_player' });
    });
  }

  function injectPlaylistButton() {
    const actionAreas = document.querySelectorAll('.player-controls-actions');
    actionAreas.forEach(area => {
      if (area.querySelector('.radio-playlist-inject')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'radio-playlist-inject';
      button.textContent = 'Add to Playlist';
      button.addEventListener('click', event => {
        event.stopPropagation();
        state.currentPlaylistSong = currentSongFromDom(button);
        if (!isLoggedIn()) {
          openModal('login');
          setFeedback('Log in to add this song to a personal playlist. The song keeps playing.');
          return;
        }
        openModal('playlists');
      });
      area.appendChild(button);
    });
  }

  function watchPlayer() {
    const scan = () => {
      injectHeader();
      injectPlaylistButton();
      document.querySelectorAll('audio.native-audio').forEach(attachAudioHistory);
    };
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const likeButton = event.target.closest('.like-button');
      if (!likeButton || likeButton.disabled) return;
      const song = currentSongFromDom(likeButton);
      window.setTimeout(() => persistFavorite(song), 0);
    }, true);
    document.addEventListener('pointerdown', event => {
      if (!state.menuOpen || event.target.closest('.radio-account-actions')) return;
      state.menuOpen = false;
      renderHeader();
    });
  }

  async function mergeAnonymousActivity() {
    if (!isLoggedIn()) return;
    const favorites = readJson(ANON_FAVORITES_KEY, []);
    const history = readJson(ANON_HISTORY_KEY, []);
    const readIds = readStringArray(NOTIFICATION_READ_KEY);
    const dismissedIds = readStringArray(NOTIFICATION_DISMISSED_KEY);
    const notificationIds = [...new Set([...readIds, ...dismissedIds])];
    const notificationState = notificationIds.map(id => ({ id, read: readIds.includes(id), dismissed: dismissedIds.includes(id), delivered: true }));
    const visitorId = localStorage.getItem(NOTIFICATION_VISITOR_KEY) || randomId('anonymous');
    try { localStorage.setItem(NOTIFICATION_VISITOR_KEY, visitorId); } catch (_) {}
    if (!favorites.length && !history.length && !notificationState.length) return;
    try {
      await apiFetch(`${ME_URL}/anonymous/merge`, {
        method: 'POST',
        body: JSON.stringify({ anonymous_visitor_id: visitorId, favorites, history, notification_state: notificationState })
      });
      localStorage.removeItem(ANON_FAVORITES_KEY);
      localStorage.removeItem(ANON_HISTORY_KEY);
      await loadAccount();
    } catch (error) {
      console.warn('[accounts] anonymous activity merge failed', error);
    }
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  async function loadConfig() {
    const response = await nativeFetch(AUTH_CONFIG_URL, { cache: 'no-store' });
    const body = await parseResponse(response);
    state.config = body.auth || {};
  }

  async function initialize() {
    injectCss();
    createUi();
    patchNotificationFetch();
    watchPlayer();
    await Promise.all([loadConfig().catch(error => { state.config = { enabled: false }; console.warn('[accounts] auth config unavailable', error); }), loadSongs()]);
    if (state.config?.enabled && state.tokens?.accessToken && state.tokens?.refreshToken) {
      try {
        if (tokenExpiresSoon(state.tokens.accessToken)) await refreshSession();
        await loadAccount();
        await mergeAnonymousActivity();
      } catch (error) {
        console.warn('[accounts] saved session could not be restored', error);
        clearTokens();
      }
    }
    renderHeader();
    window.StashboxRadioAccount = {
      open: openModal,
      logout,
      isLoggedIn,
      getAccount: () => state.account
    };
  }

  initialize().catch(error => console.error('[accounts] initialization failed', error));
})();
