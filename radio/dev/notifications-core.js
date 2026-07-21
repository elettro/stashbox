(() => {
  const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/notifications';
  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const READ_STORAGE_KEY = 'stashbox_notification_read_ids_dev';
  const DISMISSED_STORAGE_KEY = 'stashbox_notification_dismissed_ids_dev';
  const VISITOR_STORAGE_KEY = 'stashbox_notification_visitor_id_dev';
  const SESSION_VIEW_KEY = 'stashbox_notification_viewed_ids_dev';
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const RELATIVE_TIME_REFRESH_MS = 60 * 1000;

  const state = {
    notifications: [],
    open: false,
    loading: false,
    personalized: false
  };

  function readJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function authHeaders(extra = {}) {
    const token = readJson(TOKEN_STORAGE_KEY, {}) || {};
    return {
      ...extra,
      ...(token.accessToken ? { Authorization: `Bearer ${token.accessToken}` } : {}),
      ...(token.idToken ? { 'X-Cognito-Id-Token': token.idToken } : {})
    };
  }

  function parseStoredSet(key, storage = localStorage) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveSet(key, value, storage = localStorage) {
    try {
      storage.setItem(key, JSON.stringify([...value]));
    } catch {
      // Browser privacy settings may block storage. The feed still works for the current page view.
    }
  }

  function createVisitorId() {
    const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    const generated = globalThis.crypto?.randomUUID?.()
      || `anonymous-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(VISITOR_STORAGE_KEY, generated);
    } catch {
      // Use the in-memory value when storage is unavailable.
    }
    return generated;
  }

  const visitorId = createVisitorId();
  const readIds = parseStoredSet(READ_STORAGE_KEY);
  const dismissedIds = parseStoredSet(DISMISSED_STORAGE_KEY);
  const viewedIds = parseStoredSet(SESSION_VIEW_KEY, sessionStorage);

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
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRelativeTime(value) {
    const date = parseDate(value);
    if (!date) return '';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (elapsedSeconds < 60 * 60) return `${Math.max(1, Math.floor(elapsedSeconds / 60))}m`;
    if (elapsedSeconds < 24 * 60 * 60) return `${Math.floor(elapsedSeconds / (60 * 60))}h`;
    if (elapsedSeconds < 7 * 24 * 60 * 60) return `${Math.floor(elapsedSeconds / (24 * 60 * 60))}d`;
    if (elapsedSeconds < 30 * 24 * 60 * 60) return `${Math.floor(elapsedSeconds / (7 * 24 * 60 * 60))}w`;
    if (elapsedSeconds < 365 * 24 * 60 * 60) return `${Math.floor(elapsedSeconds / (30 * 24 * 60 * 60))}mo`;
    return `${Math.floor(elapsedSeconds / (365 * 24 * 60 * 60))}y`;
  }

  function formatExactDate(value) {
    const date = parseDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  function createShell() {
    const root = document.createElement('div');
    root.className = 'sbr-notification-root';
    root.innerHTML = `
      <button class="sbr-notification-bell" type="button" aria-expanded="false" aria-controls="sbrNotificationDrawer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 24a2.997 2.997 0 0 0 2.816-2h-5.632A2.997 2.997 0 0 0 12 24Zm8-6v-1l-2-2v-5a6 6 0 0 0-5-5.917V3a1 1 0 1 0-2 0v1.083A6 6 0 0 0 6 10v5l-2 2v1h16Z"/></svg>
        <span class="sbr-notification-bell-label">Alerts</span>
        <span class="sbr-notification-count" hidden>0</span>
      </button>
      <section id="sbrNotificationDrawer" class="sbr-notification-drawer" hidden aria-label="Stashbox Radio notifications">
        <header class="sbr-notification-header">
          <div>
            <p class="sbr-notification-kicker">Stashbox Radio</p>
            <h2 class="sbr-notification-heading">Notifications</h2>
          </div>
          <div class="sbr-notification-header-actions">
            <button class="sbr-notification-text-button" type="button" data-notification-action="mark-all-read">Mark all read</button>
            <button class="sbr-notification-close" type="button" aria-label="Close notifications">×</button>
          </div>
        </header>
        <div class="sbr-notification-list" aria-live="polite">
          <div class="sbr-notification-loading">Loading notifications…</div>
        </div>
      </section>
    `;
    document.body.appendChild(root);
    return {
      root,
      bell: root.querySelector('.sbr-notification-bell'),
      count: root.querySelector('.sbr-notification-count'),
      drawer: root.querySelector('.sbr-notification-drawer'),
      close: root.querySelector('.sbr-notification-close'),
      list: root.querySelector('.sbr-notification-list'),
      markAllRead: root.querySelector('[data-notification-action="mark-all-read"]')
    };
  }

  const ui = createShell();

  function activeNotifications() {
    return state.notifications.filter((notification) => !dismissedIds.has(String(notification.id)));
  }

  function unreadNotifications() {
    return activeNotifications().filter((notification) => !readIds.has(String(notification.id)));
  }

  function renderCount() {
    const count = unreadNotifications().length;
    ui.count.textContent = count > 99 ? '99+' : String(count);
    ui.count.hidden = count === 0;
    ui.bell.setAttribute('aria-label', count
      ? `${count} unread Stashbox Radio notification${count === 1 ? '' : 's'}`
      : 'Stashbox Radio notifications');
  }

  function notificationMarkup(notification) {
    const id = String(notification.id);
    const isUnread = !readIds.has(id);
    const publishedAt = notification.publish_at || notification.created_at || '';
    const exactDate = formatExactDate(publishedAt);
    const image = notification.image_url
      ? `<img class="sbr-notification-image" src="${escapeHtml(notification.image_url)}" alt="" loading="lazy" />`
      : '';
    const action = notification.action_url
      ? `<button class="sbr-notification-action" type="button" data-notification-action="open-link" data-id="${escapeHtml(id)}">${escapeHtml(notification.action_label || 'Open')}</button>`
      : '';
    const dismiss = notification.dismissible !== false
      ? `<button class="sbr-notification-dismiss" type="button" data-notification-action="dismiss" data-id="${escapeHtml(id)}">Dismiss</button>`
      : '';
    return `
      <article class="sbr-notification-item${isUnread ? ' is-unread' : ''}${image ? '' : ' no-image'}" data-notification-id="${escapeHtml(id)}">
        ${image}
        <div>
          <div class="sbr-notification-meta">
            <span class="sbr-notification-category">${escapeHtml(categoryLabel(notification.category))}</span>
            <time class="sbr-notification-age" datetime="${escapeHtml(publishedAt)}" title="${escapeHtml(exactDate)}" aria-label="Posted ${escapeHtml(exactDate)}">${escapeHtml(formatRelativeTime(publishedAt))}</time>
            ${notification.pinned ? '<span>• Pinned</span>' : ''}
          </div>
          <h3>${escapeHtml(notification.headline)}</h3>
          <p>${escapeHtml(notification.message)}</p>
          ${(action || dismiss) ? `<div class="sbr-notification-item-actions">${action}${dismiss}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderList({ error = '' } = {}) {
    if (error) {
      ui.list.innerHTML = `<div class="sbr-notification-error">${escapeHtml(error)}</div>`;
      return;
    }
    const notifications = activeNotifications();
    ui.list.innerHTML = notifications.length
      ? notifications.map(notificationMarkup).join('')
      : '<div class="sbr-notification-empty">No active notifications right now.</div>';
    renderCount();
  }

  function postEvent(notificationId, eventType, metadata = {}) {
    fetch(`${API_URL}/${encodeURIComponent(notificationId)}/events`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        event_type: eventType,
        anonymous_visitor_id: visitorId,
        metadata
      }),
      keepalive: true
    }).catch(() => {});
  }

  function recordViews() {
    activeNotifications().forEach((notification) => {
      const id = String(notification.id);
      if (viewedIds.has(id)) return;
      viewedIds.add(id);
      postEvent(id, 'view', { placement: 'notification_drawer' });
    });
    saveSet(SESSION_VIEW_KEY, viewedIds, sessionStorage);
  }

  function markRead(ids) {
    let changed = false;
    ids.forEach((id) => {
      const normalizedId = String(id);
      if (readIds.has(normalizedId)) return;
      readIds.add(normalizedId);
      changed = true;
      postEvent(normalizedId, 'open', { placement: 'notification_drawer' });
    });
    if (changed) saveSet(READ_STORAGE_KEY, readIds);
    renderList();
  }

  function applyAccountState(detail = {}) {
    const accountReadIds = Array.isArray(detail.readIds) ? detail.readIds : [];
    const accountDismissedIds = Array.isArray(detail.dismissedIds) ? detail.dismissedIds : [];
    accountReadIds.forEach((id) => readIds.add(String(id)));
    accountDismissedIds.forEach((id) => dismissedIds.add(String(id)));
    saveSet(READ_STORAGE_KEY, readIds);
    saveSet(DISMISSED_STORAGE_KEY, dismissedIds);
    renderList();
  }

  function setDrawerOpen(open) {
    state.open = open;
    ui.drawer.hidden = !open;
    ui.bell.setAttribute('aria-expanded', String(open));
    if (open) {
      loadNotifications(true);
      recordViews();
      markRead(activeNotifications().map((notification) => notification.id));
      ui.close.focus({ preventScroll: true });
    } else {
      ui.bell.focus({ preventScroll: true });
    }
  }

  async function requestNotifications(useAuthentication = true) {
    const headers = useAuthentication
      ? authHeaders({ Accept: 'application/json' })
      : { Accept: 'application/json' };
    const response = await fetch(`${API_URL}?limit=100`, { headers, cache: 'no-store', credentials: 'omit' });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && useAuthentication && headers.Authorization) {
      return requestNotifications(false);
    }
    if (!response.ok) throw new Error(payload.error || 'Notifications are unavailable.');
    return payload;
  }

  async function loadNotifications(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    try {
      const payload = await requestNotifications(true);
      state.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      state.personalized = Boolean(payload.personalized);
      renderList();
      recordViews();
    } catch (error) {
      renderList({ error: error.message || 'Notifications are unavailable.' });
    } finally {
      state.loading = false;
    }
  }

  window.addEventListener('stashbox-notification-account-state', (event) => {
    applyAccountState(event.detail);
    loadNotifications(true);
  });
  window.addEventListener('stashbox:artist-follow-changed', () => loadNotifications(true));
  window.addEventListener('storage', event => {
    if (event.key === TOKEN_STORAGE_KEY) loadNotifications(true);
  });
  ui.bell.addEventListener('click', () => setDrawerOpen(!state.open));
  ui.close.addEventListener('click', () => setDrawerOpen(false));
  ui.markAllRead.addEventListener('click', () => markRead(activeNotifications().map((notification) => notification.id)));

  ui.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-notification-action]');
    if (!button) return;
    const id = String(button.dataset.id || '');
    const notification = state.notifications.find((item) => String(item.id) === id);
    if (!notification) return;

    if (button.dataset.notificationAction === 'dismiss') {
      dismissedIds.add(id);
      saveSet(DISMISSED_STORAGE_KEY, dismissedIds);
      postEvent(id, 'dismiss', { placement: 'notification_drawer' });
      renderList();
      return;
    }

    if (button.dataset.notificationAction === 'open-link' && notification.action_url) {
      readIds.add(id);
      saveSet(READ_STORAGE_KEY, readIds);
      postEvent(id, 'click', { placement: 'notification_drawer', action_url: notification.action_url });
      const url = new URL(notification.action_url, window.location.href);
      const isSameSite = url.hostname === window.location.hostname || url.hostname.endsWith('.stashbox.com') || url.hostname === 'stashbox.com';
      if (isSameSite) window.location.href = url.href;
      else window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  });

  document.addEventListener('click', (event) => {
    if (!state.open || ui.root.contains(event.target)) return;
    setDrawerOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) setDrawerOpen(false);
  });

  loadNotifications();
  window.setInterval(loadNotifications, REFRESH_INTERVAL_MS);
  window.setInterval(() => {
    if (state.open && state.notifications.length) renderList();
  }, RELATIVE_TIME_REFRESH_MS);
})();
