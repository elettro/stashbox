const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/admin/notifications';
const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';

const state = {
  notifications: [],
  editingId: null,
  loading: false
};

const elements = {
  message: document.getElementById('message'),
  tokenStatus: document.getElementById('tokenStatus'),
  adminToken: document.getElementById('adminToken'),
  saveTokenButton: document.getElementById('saveTokenButton'),
  clearTokenButton: document.getElementById('clearTokenButton'),
  newNotificationButton: document.getElementById('newNotificationButton'),
  statsGrid: document.getElementById('statsGrid'),
  editorCard: document.getElementById('editorCard'),
  editorHeading: document.getElementById('editorHeading'),
  form: document.getElementById('notificationForm'),
  internalTitle: document.getElementById('internalTitle'),
  category: document.getElementById('category'),
  headline: document.getElementById('headline'),
  notificationMessage: document.getElementById('notificationMessage'),
  imageUrl: document.getElementById('imageUrl'),
  actionLabel: document.getElementById('actionLabel'),
  actionUrl: document.getElementById('actionUrl'),
  status: document.getElementById('status'),
  priority: document.getElementById('priority'),
  publishAt: document.getElementById('publishAt'),
  expiresAt: document.getElementById('expiresAt'),
  pinned: document.getElementById('pinned'),
  dismissible: document.getElementById('dismissible'),
  audienceType: document.getElementById('audienceType'),
  deliveryChannels: document.getElementById('deliveryChannels'),
  artistKeys: document.getElementById('artistKeys'),
  targetUserIds: document.getElementById('targetUserIds'),
  saveButton: document.getElementById('saveButton'),
  savePublishButton: document.getElementById('savePublishButton'),
  cancelButton: document.getElementById('cancelButton'),
  archiveButton: document.getElementById('archiveButton'),
  refreshButton: document.getElementById('refreshButton'),
  statusFilter: document.getElementById('statusFilter'),
  audienceFilter: document.getElementById('audienceFilter'),
  searchInput: document.getElementById('searchInput'),
  tableBody: document.getElementById('notificationTableBody'),
  emptyState: document.getElementById('emptyState')
};

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function updateTokenStatus() {
  const token = getToken();
  elements.adminToken.value = token;
  elements.tokenStatus.textContent = token
    ? 'Admin token saved in this browser.'
    : 'No admin token saved. Add the dev token before loading notifications.';
}

function showMessage(text, type = '') {
  elements.message.textContent = text;
  elements.message.className = `message${type ? ` ${type}` : ''}`;
  elements.message.classList.remove('hidden');
}

function hideMessage() {
  elements.message.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitValues(value) {
  return [...new Set(String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function categoryLabel(category) {
  return String(category || 'stashbox_news')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function audienceLabel(audience) {
  const labels = {
    public: 'Public Visitors',
    all_registered_users: 'Registered Users',
    artist_followers: 'Artist Followers',
    specific_users: 'Specific Users',
    premium_members: 'Premium Members'
  };
  return labels[audience] || audience;
}

async function apiRequest(url = API_URL, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Enter and save the dev admin token first.');
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}.`);
  return payload;
}

function resetForm() {
  state.editingId = null;
  elements.form.reset();
  elements.category.value = 'stashbox_news';
  elements.status.value = 'draft';
  elements.priority.value = '50';
  elements.dismissible.checked = true;
  elements.audienceType.value = 'public';
  [...elements.deliveryChannels.options].forEach((option) => {
    option.selected = option.value === 'in_app';
  });
  elements.editorHeading.textContent = 'New Notification';
  elements.saveButton.textContent = 'Save Notification';
  elements.archiveButton.classList.add('hidden');
}

function openEditor(notification = null) {
  resetForm();
  if (notification) {
    state.editingId = notification.id;
    elements.editorHeading.textContent = `Edit: ${notification.headline}`;
    elements.saveButton.textContent = 'Update Notification';
    elements.archiveButton.classList.toggle('hidden', notification.status === 'archived');
    elements.internalTitle.value = notification.internal_title || '';
    elements.category.value = notification.category || 'stashbox_news';
    elements.headline.value = notification.headline || '';
    elements.notificationMessage.value = notification.message || '';
    elements.imageUrl.value = notification.image_url || '';
    elements.actionLabel.value = notification.action_label || '';
    elements.actionUrl.value = notification.action_url || '';
    elements.status.value = notification.status || 'draft';
    elements.priority.value = String(notification.priority ?? 50);
    elements.publishAt.value = toLocalInput(notification.publish_at);
    elements.expiresAt.value = toLocalInput(notification.expires_at);
    elements.pinned.checked = Boolean(notification.pinned);
    elements.dismissible.checked = notification.dismissible !== false;
    elements.audienceType.value = notification.audience_type || 'public';
    const channels = new Set(Array.isArray(notification.delivery_channels) ? notification.delivery_channels : ['in_app']);
    [...elements.deliveryChannels.options].forEach((option) => {
      option.selected = channels.has(option.value);
    });
    elements.artistKeys.value = Array.isArray(notification.artist_keys) ? notification.artist_keys.join(', ') : '';
    elements.targetUserIds.value = Array.isArray(notification.target_user_ids) ? notification.target_user_ids.join('\n') : '';
  }
  elements.editorCard.classList.remove('hidden');
  elements.headline.focus();
  elements.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  resetForm();
  elements.editorCard.classList.add('hidden');
}

function readForm({ forcePublish = false } = {}) {
  const status = forcePublish ? 'published' : elements.status.value;
  let publishAt = toIso(elements.publishAt.value);
  if (status === 'published' && !publishAt) publishAt = new Date().toISOString();
  return {
    internal_title: elements.internalTitle.value.trim(),
    headline: elements.headline.value.trim(),
    message: elements.notificationMessage.value.trim(),
    category: elements.category.value,
    image_url: elements.imageUrl.value.trim() || null,
    action_label: elements.actionLabel.value.trim() || null,
    action_url: elements.actionUrl.value.trim() || null,
    status,
    priority: Number(elements.priority.value || 50),
    publish_at: publishAt,
    expires_at: toIso(elements.expiresAt.value),
    pinned: elements.pinned.checked,
    dismissible: elements.dismissible.checked,
    audience_type: elements.audienceType.value,
    delivery_channels: selectedValues(elements.deliveryChannels),
    artist_keys: splitValues(elements.artistKeys.value),
    target_user_ids: splitValues(elements.targetUserIds.value)
  };
}

async function saveNotification({ forcePublish = false } = {}) {
  hideMessage();
  const payload = readForm({ forcePublish });
  if (!payload.headline || !payload.message) {
    showMessage('Headline and message are required.', 'error');
    return;
  }
  elements.saveButton.disabled = true;
  elements.savePublishButton.disabled = true;
  try {
    const isUpdate = Boolean(state.editingId);
    await apiRequest(isUpdate ? `${API_URL}/${encodeURIComponent(state.editingId)}` : API_URL, {
      method: isUpdate ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showMessage(isUpdate ? 'Notification updated.' : 'Notification created.', 'success');
    closeEditor();
    await loadNotifications({ preserveMessage: true });
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    elements.saveButton.disabled = false;
    elements.savePublishButton.disabled = false;
  }
}

async function archiveNotification(id) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) return;
  const confirmed = window.confirm(`Archive “${notification.headline}”? It will stop appearing in public feeds.`);
  if (!confirmed) return;
  try {
    await apiRequest(`${API_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMessage('Notification archived.', 'success');
    closeEditor();
    await loadNotifications({ preserveMessage: true });
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function renderStats() {
  const now = Date.now();
  const totals = {
    total: state.notifications.length,
    live: 0,
    scheduled: 0,
    draft: 0,
    archived: 0,
    clicks: 0
  };
  state.notifications.forEach((notification) => {
    totals.clicks += Number(notification.click_count || 0);
    if (notification.status === 'draft') totals.draft += 1;
    if (notification.status === 'archived') totals.archived += 1;
    if (notification.status === 'published' && notification.audience_type === 'public') {
      const publishTime = notification.publish_at ? new Date(notification.publish_at).getTime() : 0;
      const expiresTime = notification.expires_at ? new Date(notification.expires_at).getTime() : Infinity;
      if (publishTime > now) totals.scheduled += 1;
      else if (expiresTime > now) totals.live += 1;
    }
  });
  const cards = [
    ['Total', totals.total],
    ['Live Public', totals.live],
    ['Scheduled', totals.scheduled],
    ['Drafts', totals.draft],
    ['Archived', totals.archived],
    ['Total Clicks', totals.clicks]
  ];
  elements.statsGrid.innerHTML = cards.map(([label, value]) => `
    <div class="stat-card">
      <div class="helper">${escapeHtml(label)}</div>
      <div class="stat-value">${Number(value).toLocaleString()}</div>
    </div>
  `).join('');
}

function filteredNotifications() {
  const status = elements.statusFilter.value;
  const audience = elements.audienceFilter.value;
  const search = elements.searchInput.value.trim().toLowerCase();
  return state.notifications.filter((notification) => {
    if (status !== 'all' && notification.status !== status) return false;
    if (audience !== 'all' && notification.audience_type !== audience) return false;
    if (!search) return true;
    const haystack = [
      notification.internal_title,
      notification.headline,
      notification.message,
      notification.category,
      notification.audience_type,
      ...(Array.isArray(notification.artist_keys) ? notification.artist_keys : [])
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}

function renderTable() {
  const notifications = filteredNotifications();
  elements.emptyState.classList.toggle('hidden', notifications.length > 0);
  elements.tableBody.innerHTML = notifications.map((notification) => {
    const schedule = notification.publish_at
      ? `<strong>Publish:</strong> ${escapeHtml(formatDate(notification.publish_at))}<br><strong>Expires:</strong> ${escapeHtml(formatDate(notification.expires_at))}`
      : 'Not scheduled';
    const artists = Array.isArray(notification.artist_keys) && notification.artist_keys.length
      ? `<br><span class="helper">${escapeHtml(notification.artist_keys.join(', '))}</span>`
      : '';
    return `
      <tr>
        <td>
          <div class="notification-title">${escapeHtml(notification.headline)}</div>
          <div class="helper">${escapeHtml(categoryLabel(notification.category))}</div>
          <div class="notification-message">${escapeHtml(notification.message)}</div>
        </td>
        <td><span class="badge ${escapeHtml(notification.status)}">${escapeHtml(notification.status)}</span></td>
        <td>${escapeHtml(audienceLabel(notification.audience_type))}${artists}</td>
        <td>${schedule}</td>
        <td>${Number(notification.priority || 0)}${notification.pinned ? '<br><span class="badge">Pinned</span>' : ''}</td>
        <td>${Number(notification.view_count || 0).toLocaleString()}</td>
        <td>${Number(notification.open_count || 0).toLocaleString()}</td>
        <td>${Number(notification.click_count || 0).toLocaleString()}</td>
        <td>
          <div class="action-row">
            <button class="button-ghost button-small" type="button" data-action="edit" data-id="${escapeHtml(notification.id)}">Edit</button>
            ${notification.status !== 'archived' ? `<button class="button-danger button-small" type="button" data-action="archive" data-id="${escapeHtml(notification.id)}">Archive</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadNotifications({ preserveMessage = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  elements.refreshButton.disabled = true;
  if (!preserveMessage) hideMessage();
  try {
    const payload = await apiRequest();
    state.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    renderStats();
    renderTable();
  } catch (error) {
    state.notifications = [];
    renderStats();
    renderTable();
    showMessage(error.message, 'error');
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
  }
}

elements.saveTokenButton.addEventListener('click', () => {
  const token = elements.adminToken.value.trim();
  if (!token) {
    showMessage('Enter the dev admin token.', 'error');
    return;
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  updateTokenStatus();
  showMessage('Admin token saved.', 'success');
  loadNotifications({ preserveMessage: true });
});

elements.clearTokenButton.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  updateTokenStatus();
  state.notifications = [];
  renderStats();
  renderTable();
  showMessage('Admin token cleared.');
});

elements.newNotificationButton.addEventListener('click', () => openEditor());
elements.cancelButton.addEventListener('click', closeEditor);
elements.refreshButton.addEventListener('click', () => loadNotifications());
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveNotification();
});
elements.savePublishButton.addEventListener('click', () => saveNotification({ forcePublish: true }));
elements.archiveButton.addEventListener('click', () => {
  if (state.editingId) archiveNotification(state.editingId);
});
[elements.statusFilter, elements.audienceFilter].forEach((element) => element.addEventListener('change', renderTable));
elements.searchInput.addEventListener('input', renderTable);
elements.tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const notification = state.notifications.find((item) => item.id === button.dataset.id);
  if (button.dataset.action === 'edit' && notification) openEditor(notification);
  if (button.dataset.action === 'archive') archiveNotification(button.dataset.id);
});

updateTokenStatus();
resetForm();
renderStats();
renderTable();
if (getToken()) loadNotifications();
