(() => {
  'use strict';

  const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/notifications';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const READ_KEY = 'stashbox_v2_notification_read_ids';
  const DELETED_KEY = 'stashbox_v2_notification_deleted_ids';
  const VISITOR_KEY = 'stashbox_v2_notification_visitor_id';
  const REFRESH_MS = 5 * 60 * 1000;

  const state = {
    notifications: [],
    loading: false,
    personalized: false,
    current: null,
    overlay: null,
    sheet: null,
    list: null,
    count: null,
    options: null,
    optionsSheet: null,
    toastTimer: null
  };

  const readSet = readStoredSet(READ_KEY);
  const deletedSet = readStoredSet(DELETED_KEY);
  const visitorId = getVisitorId();

  function readJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function readStoredSet(key) {
    const value = readJson(key, []);
    return new Set(Array.isArray(value) ? value.map(String) : []);
  }

  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); }
    catch (_) {}
  }

  function getVisitorId() {
    try {
      const existing = localStorage.getItem(VISITOR_KEY);
      if (existing) return existing;
      const generated = globalThis.crypto?.randomUUID?.() || `v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR_KEY, generated);
      return generated;
    } catch (_) {
      return `v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function tokens() {
    return readJson(TOKEN_KEY, {}) || {};
  }

  function authHeaders(extra = {}) {
    const value = tokens();
    return {
      ...extra,
      ...(value.accessToken ? { Authorization: `Bearer ${value.accessToken}` } : {}),
      ...(value.idToken ? { 'X-Cognito-Id-Token': value.idToken } : {})
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function categoryLabel(value) {
    return String(value || 'stashbox_news')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function relativeTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo`;
    return `${Math.floor(seconds / 31536000)}y`;
  }

  function activeNotifications() {
    return state.notifications.filter(item => !deletedSet.has(String(item.id)));
  }

  function unreadNotifications() {
    return activeNotifications().filter(item => !readSet.has(String(item.id)));
  }

  function notificationDate(item) {
    return item.publish_at || item.created_at || item.updated_at || '';
  }

  function notificationImage(item) {
    if (item.image_url) {
      return `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy">`;
    }
    return '<span class="v2-notification-orb"><i></i><i></i><i></i></span>';
  }

  function notificationSongKey(item) {
    const direct = item.song_key || item.songKey || item.target_song_key || item.metadata?.song_key || item.metadata?.songKey;
    if (direct) return String(direct);
    if (!item.action_url) return '';
    try {
      const url = new URL(item.action_url, window.location.href);
      return url.searchParams.get('song') || url.searchParams.get('song_key') || url.searchParams.get('track') || '';
    } catch (_) {
      return '';
    }
  }

  function rowMarkup(item) {
    const id = String(item.id);
    const unread = !readSet.has(id);
    const age = relativeTime(notificationDate(item));
    return `
      <article class="v2-notification-row${unread ? ' is-unread' : ''}" data-v2-notification-id="${escapeHtml(id)}" tabindex="0">
        <div class="v2-notification-thumb">${notificationImage(item)}${unread ? '<b aria-hidden="true"></b>' : ''}</div>
        <div class="v2-notification-copy">
          <div class="v2-notification-meta"><strong>${escapeHtml(categoryLabel(item.category))}</strong>${age ? `<span>· ${escapeHtml(age)}</span>` : ''}</div>
          <h3>${escapeHtml(item.headline || item.title || 'Stashbox Radio Update')}</h3>
          <p>${escapeHtml(item.message || item.description || '')}</p>
        </div>
        <button class="v2-notification-more" type="button" data-v2-notification-more="${escapeHtml(id)}" aria-label="Notification options">•••</button>
      </article>`;
  }

  function createUi() {
    if (state.overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'v2-notification-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <button class="v2-notification-backdrop" type="button" data-v2-notifications-close aria-label="Close notifications"></button>
      <section class="v2-notification-sheet" role="dialog" aria-modal="true" aria-labelledby="v2NotificationTitle">
        <div class="v2-notification-grabber" data-v2-notification-drag aria-hidden="true"><span></span></div>
        <header class="v2-notification-header">
          <h2 id="v2NotificationTitle">Notifications</h2>
          <button type="button" data-v2-mark-all>Mark all read</button>
        </header>
        <div class="v2-notification-list" data-v2-notification-list aria-live="polite"></div>
      </section>
      <div class="v2-notification-options-layer" data-v2-options-layer hidden>
        <button class="v2-notification-options-backdrop" type="button" data-v2-options-close aria-label="Close notification options"></button>
        <section class="v2-notification-options-sheet" role="dialog" aria-modal="true" aria-label="Notification options">
          <div class="v2-notification-grabber" data-v2-options-drag aria-hidden="true"><span></span></div>
          <div data-v2-options-content></div>
        </section>
      </div>
      <div class="v2-notification-toast" data-v2-notification-toast hidden></div>`;
    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.sheet = overlay.querySelector('.v2-notification-sheet');
    state.list = overlay.querySelector('[data-v2-notification-list]');
    state.options = overlay.querySelector('[data-v2-options-layer]');
    state.optionsSheet = overlay.querySelector('.v2-notification-options-sheet');

    overlay.addEventListener('click', handleOverlayClick);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!state.options.hidden) closeOptions();
        else closeSheet();
      }
    });

    installDrag(overlay.querySelector('[data-v2-notification-drag]'), state.sheet, closeSheet);
    installDrag(overlay.querySelector('[data-v2-options-drag]'), state.optionsSheet, closeOptions);
  }

  function installDrag(handle, sheet, closeAction) {
    if (!handle || !sheet) return;
    let startY = 0;
    let lastY = 0;
    let startTime = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', event => {
      dragging = true;
      startY = event.clientY;
      lastY = startY;
      startTime = performance.now();
      sheet.style.transition = 'none';
      handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
      if (!dragging) return;
      lastY = event.clientY;
      const distance = Math.max(0, lastY - startY);
      sheet.style.transform = `translate(-50%, ${distance}px)`;
    });

    const finish = event => {
      if (!dragging) return;
      dragging = false;
      const distance = Math.max(0, lastY - startY);
      const elapsed = Math.max(1, performance.now() - startTime);
      const velocity = distance / elapsed;
      sheet.style.transition = '';
      sheet.style.transform = '';
      try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
      if (distance > 90 || velocity > 0.55) closeAction();
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function renderList(message = '') {
    createUi();
    if (message) {
      state.list.innerHTML = `<div class="v2-notification-state">${escapeHtml(message)}</div>`;
      updateCount();
      return;
    }
    const items = activeNotifications();
    state.list.innerHTML = items.length
      ? items.map(rowMarkup).join('')
      : '<div class="v2-notification-state">No active notifications right now.</div>';
    updateCount();
  }

  function updateCount() {
    const count = unreadNotifications().length;
    const button = document.querySelector('#v2App .v2-notifications-trigger');
    if (!button) return;
    let badge = button.querySelector('.v2-notification-count');
    const oldDot = button.querySelector('.v2-notification-dot');
    if (oldDot) oldDot.remove();
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'v2-notification-count';
      button.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    button.setAttribute('aria-label', count ? `${count} unread notifications` : 'Notifications');
  }

  async function requestNotifications(useAuthentication = true) {
    const headers = useAuthentication ? authHeaders({ Accept: 'application/json' }) : { Accept: 'application/json' };
    const response = await fetch(`${API_URL}?limit=100`, { headers, cache: 'no-store', credentials: 'omit' });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && useAuthentication && headers.Authorization) return requestNotifications(false);
    if (!response.ok) throw new Error(payload.error || 'Notifications are unavailable.');
    return payload;
  }

  async function loadNotifications(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    if (state.overlay && !state.overlay.hidden && !state.notifications.length) renderList('Loading notifications…');
    try {
      const payload = await requestNotifications(true);
      state.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      state.personalized = Boolean(payload.personalized);
      renderList();
    } catch (error) {
      if (state.overlay && !state.overlay.hidden) renderList(error.message || 'Notifications are unavailable.');
    } finally {
      state.loading = false;
    }
  }

  function postEvent(id, eventType, metadata = {}) {
    fetch(`${API_URL}/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ event_type: eventType, anonymous_visitor_id: visitorId, metadata }),
      keepalive: true
    }).catch(() => {});
  }

  function markRead(item) {
    if (!item) return;
    const id = String(item.id);
    if (readSet.has(id)) return;
    readSet.add(id);
    saveSet(READ_KEY, readSet);
    postEvent(id, 'open', { placement: 'v2_notification_sheet' });
    renderList();
  }

  function markAllRead() {
    activeNotifications().forEach(item => {
      const id = String(item.id);
      if (readSet.has(id)) return;
      readSet.add(id);
      postEvent(id, 'open', { placement: 'v2_notification_sheet', bulk: true });
    });
    saveSet(READ_KEY, readSet);
    renderList();
  }

  function deleteNotification(item) {
    if (!item) return;
    const id = String(item.id);
    deletedSet.add(id);
    saveSet(DELETED_KEY, deletedSet);
    postEvent(id, 'dismiss', { placement: 'v2_notification_options' });
    closeOptions();
    renderList();
  }

  function openSheet() {
    createUi();
    state.overlay.hidden = false;
    document.body.classList.add('v2-notifications-open');
    window.requestAnimationFrame(() => state.overlay.classList.add('is-open'));
    renderList(state.notifications.length ? '' : 'Loading notifications…');
    loadNotifications(true);
  }

  function closeSheet() {
    if (!state.overlay) return;
    closeOptions(true);
    state.overlay.classList.remove('is-open');
    document.body.classList.remove('v2-notifications-open');
    window.setTimeout(() => {
      if (state.overlay && !state.overlay.classList.contains('is-open')) state.overlay.hidden = true;
    }, 380);
  }

  function optionsMarkup(item) {
    const id = String(item.id);
    const age = relativeTime(notificationDate(item));
    const songKey = notificationSongKey(item);
    return `
      <button class="v2-notification-options-hero" type="button" data-v2-options-open-track="${escapeHtml(id)}">
        <span class="v2-notification-options-image">${notificationImage(item)}</span>
        <span class="v2-notification-options-meta"><strong>${escapeHtml(categoryLabel(item.category))}</strong>${age ? ` · ${escapeHtml(age)} ago` : ''}</span>
        <h3>${escapeHtml(item.headline || item.title || 'Stashbox Radio Update')}</h3>
        <p>${escapeHtml(item.message || item.description || '')}</p>
        ${songKey ? '<small>Tap above to open this track in the player ›</small>' : ''}
      </button>
      <div class="v2-notification-option-actions">
        <button type="button" data-v2-option="read"><span>✓</span>Mark as Read</button>
        <button class="is-danger" type="button" data-v2-option="delete"><span>♙</span>Delete Notification</button>
        <button type="button" data-v2-option="settings"><span>☷</span>Notification Settings</button>
      </div>`;
  }

  function openOptions(item) {
    if (!item) return;
    createUi();
    state.current = item;
    state.options.querySelector('[data-v2-options-content]').innerHTML = optionsMarkup(item);
    state.options.hidden = false;
    window.requestAnimationFrame(() => state.options.classList.add('is-open'));
  }

  function closeOptions(immediate = false) {
    if (!state.options || state.options.hidden) return;
    state.options.classList.remove('is-open');
    const finish = () => {
      state.options.hidden = true;
      state.current = null;
    };
    if (immediate) finish();
    else window.setTimeout(finish, 330);
  }

  function showToast(message) {
    const toast = state.overlay?.querySelector('[data-v2-notification-toast]');
    if (!toast) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 220);
    }, 2200);
  }

  function openNotification(item) {
    if (!item) return;
    markRead(item);
    postEvent(String(item.id), 'click', { placement: 'v2_notification_sheet', action_url: item.action_url || '' });
    const songKey = notificationSongKey(item);
    if (songKey) {
      const card = [...document.querySelectorAll('#v2App [data-song]')].find(element => String(element.dataset.song) === songKey);
      closeSheet();
      if (card) {
        window.setTimeout(() => card.click(), 260);
        return;
      }
      const target = new URL('/radio/dev/v2/', window.location.origin);
      target.searchParams.set('song', songKey);
      window.setTimeout(() => { window.location.href = target.toString(); }, 260);
      return;
    }
    if (item.action_url) {
      try {
        const url = new URL(item.action_url, window.location.href);
        if (url.origin === window.location.origin && url.pathname.startsWith('/radio/dev/') && !url.pathname.startsWith('/radio/dev/v2/')) {
          url.pathname = '/radio/dev/v2/';
        }
        closeSheet();
        window.setTimeout(() => {
          if (url.origin === window.location.origin) window.location.href = url.href;
          else window.open(url.href, '_blank', 'noopener,noreferrer');
        }, 260);
      } catch (_) {}
    }
  }

  function handleOverlayClick(event) {
    if (event.target.closest('[data-v2-notifications-close]')) return closeSheet();
    if (event.target.closest('[data-v2-options-close]')) return closeOptions();
    if (event.target.closest('[data-v2-mark-all]')) return markAllRead();

    const more = event.target.closest('[data-v2-notification-more]');
    if (more) {
      event.stopPropagation();
      return openOptions(state.notifications.find(item => String(item.id) === String(more.dataset.v2NotificationMore)));
    }

    const row = event.target.closest('[data-v2-notification-id]');
    if (row) return openNotification(state.notifications.find(item => String(item.id) === String(row.dataset.v2NotificationId)));

    const hero = event.target.closest('[data-v2-options-open-track]');
    if (hero) return openNotification(state.current);

    const option = event.target.closest('[data-v2-option]');
    if (!option) return;
    if (option.dataset.v2Option === 'read') {
      markRead(state.current);
      closeOptions();
      return;
    }
    if (option.dataset.v2Option === 'delete') return deleteNotification(state.current);
    if (option.dataset.v2Option === 'settings') {
      showToast(tokens().accessToken ? 'Notification settings are coming to Profile.' : 'Log in to manage personal notification settings.');
      closeOptions();
    }
  }

  document.addEventListener('click', event => {
    const bell = event.target.closest('#v2App .v2-notifications-trigger');
    if (!bell) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSheet();
  }, true);

  window.addEventListener('storage', event => {
    if (event.key === TOKEN_KEY) loadNotifications(true);
  });

  window.addEventListener('stashbox-notification-account-state', () => loadNotifications(true));

  createUi();
  loadNotifications();
  window.setInterval(loadNotifications, REFRESH_MS);
  window.setInterval(() => {
    if (state.overlay && !state.overlay.hidden) renderList();
  }, 60 * 1000);
})();
