(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';

  const state = {
    items: [],
    filteredItems: [],
    selectedId: '',
    selectedItem: null,
    busy: false
  };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      'adminToken', 'saveToken', 'clearToken', 'tokenStatus', 'message',
      'refreshQueue', 'queueSearch', 'queueStatus', 'queueCount', 'queueList', 'queueEmpty',
      'editorBlank', 'editorContent', 'editorTitle', 'editorSubtitle',
      'reviewStatusPill', 'publishStatusPill', 'videoPreview', 'previewLoading',
      'previewVideoButton', 'refreshPreviewButton', 'openPreviewPage',
      'videoRatio', 'videoDuration', 'videoSize', 'reviewForm', 'titleOptions',
      'selectedTitle', 'titleCount', 'description', 'descriptionCount', 'tags',
      'hashtags', 'collaborators', 'visibility', 'scheduledAt', 'madeForKids',
      'notifySubscribers', 'reviewNote', 'saveReview', 'approveReview',
      'holdReview', 'reopenReview'
    ].forEach((id) => { elements[id] = byId(id); });
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    const token = String(value || '').trim();
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
    updateTokenStatus();
  }

  function updateTokenStatus() {
    const hasToken = Boolean(getToken());
    elements.tokenStatus.textContent = hasToken
      ? 'Saved privately in this browser'
      : 'Not saved in this browser';
    elements.adminToken.value = '';
  }

  function showMessage(text, type = 'info') {
    elements.message.hidden = !text;
    elements.message.textContent = text || '';
    elements.message.dataset.type = type;
  }

  function formatError(error) {
    if (!error) return 'An unknown error occurred.';
    if (error.status === 401 || error.message === 'unauthorized') {
      return 'The Social Factory token is missing or incorrect. Save the current DEV token and try again.';
    }
    const details = error.details?.downstream_error || error.details?.status;
    return details ? `${error.message}: ${details}` : String(error.message || error);
  }

  async function api(path, options = {}) {
    const token = getToken();
    if (!token) {
      const error = new Error('unauthorized');
      error.status = 401;
      throw error;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'x-admin-token': token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.details = payload.details || null;
      throw error;
    }
    return payload;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    [
      elements.refreshQueue,
      elements.saveReview,
      elements.approveReview,
      elements.holdReview,
      elements.reopenReview
    ].forEach((button) => {
      if (button) button.disabled = state.busy;
    });
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!size) return 'Size pending';
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) return 'No date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No date';
    return date.toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function statusLabel(value) {
    return String(value || 'in_review')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function safeImage(value) {
    const url = String(value || '').trim();
    return /^https:\/\//i.test(url) ? url : '';
  }

  function createQueueItem(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sf-queue-item';
    button.dataset.reviewId = item.id;
    button.setAttribute('aria-current', String(item.id === state.selectedId));

    const art = document.createElement('img');
    art.className = 'sf-queue-art';
    art.alt = '';
    art.loading = 'lazy';
    art.src = safeImage(item.song?.artwork_url) || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#1b272b"/><path d="M33 25v50l43-25z" fill="#4de39a"/></svg>'
    );

    const copy = document.createElement('div');
    copy.className = 'sf-queue-copy';
    const title = document.createElement('strong');
    title.textContent = item.song?.title || item.metadata?.selected_title || 'Untitled Content';
    const artist = document.createElement('span');
    artist.textContent = item.song?.artist || 'Unknown artist';
    const date = document.createElement('span');
    date.textContent = formatDate(item.created_at);

    const meta = document.createElement('div');
    meta.className = 'sf-queue-meta';
    const status = document.createElement('span');
    status.className = 'sf-mini-pill';
    status.dataset.status = item.status || 'in_review';
    status.textContent = statusLabel(item.status);
    const ratio = document.createElement('span');
    ratio.className = 'sf-mini-pill';
    ratio.textContent = item.video?.aspect_ratio || 'Video';
    meta.append(status, ratio);

    copy.append(title, artist, date, meta);
    button.append(art, copy);
    button.addEventListener('click', () => selectItem(item.id));
    return button;
  }

  function applyFilters() {
    const search = String(elements.queueSearch.value || '').trim().toLowerCase();
    const status = elements.queueStatus.value;
    state.filteredItems = state.items.filter((item) => {
      const haystack = [
        item.song?.title,
        item.song?.artist,
        item.song?.genre,
        item.metadata?.selected_title,
        item.id
      ].join(' ').toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus = status === 'all' || item.status === status;
      return matchesSearch && matchesStatus;
    });
    renderQueue();
  }

  function renderQueue() {
    elements.queueList.replaceChildren();
    state.filteredItems.forEach((item) => elements.queueList.appendChild(createQueueItem(item)));
    elements.queueEmpty.hidden = state.filteredItems.length > 0;
    elements.queueCount.textContent = `${state.filteredItems.length} item${state.filteredItems.length === 1 ? '' : 's'}`;
  }

  async function loadQueue({ preserveSelection = true } = {}) {
    setBusy(true);
    showMessage('Loading Social Factory review items…');
    try {
      const payload = await api('/social/review-items?limit=100');
      state.items = Array.isArray(payload.items) ? payload.items : [];
      state.filteredItems = [...state.items];
      applyFilters();
      showMessage(state.items.length ? '' : 'No Social Factory review items exist yet.');

      const selectedStillExists = preserveSelection && state.items.some((item) => item.id === state.selectedId);
      if (selectedStillExists) {
        await selectItem(state.selectedId, { refresh: true });
      } else if (state.items.length) {
        await selectItem(state.items[0].id);
      } else {
        clearEditor();
      }
    } catch (error) {
      showMessage(formatError(error), 'error');
      state.items = [];
      state.filteredItems = [];
      renderQueue();
      clearEditor();
    } finally {
      setBusy(false);
    }
  }

  function clearEditor() {
    state.selectedId = '';
    state.selectedItem = null;
    elements.editorBlank.hidden = false;
    elements.editorContent.hidden = true;
    elements.videoPreview.removeAttribute('src');
    elements.videoPreview.load();
  }

  function setCharacterCounts() {
    elements.titleCount.textContent = String(elements.selectedTitle.value.length);
    elements.descriptionCount.textContent = String(elements.description.value.length);
  }

  function toLocalDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function renderTitleOptions(options = [], selectedTitle = '') {
    elements.titleOptions.replaceChildren();
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sf-title-option';
      button.textContent = option;
      button.setAttribute('aria-pressed', String(option === selectedTitle));
      button.addEventListener('click', () => {
        elements.selectedTitle.value = option;
        renderTitleOptions(options, option);
        setCharacterCounts();
      });
      elements.titleOptions.appendChild(button);
    });
    if (!options.length) {
      const note = document.createElement('span');
      note.className = 'sf-field-help';
      note.textContent = 'No alternate title options were generated.';
      elements.titleOptions.appendChild(note);
    }
  }

  function collaboratorsToText(value) {
    if (!Array.isArray(value)) return '';
    return value.map((item) => [
      item.name || '',
      item.youtube_handle || '',
      item.credit || ''
    ].join(' | ').replace(/\s+\|\s+\|\s*$/, '').replace(/\s+\|\s*$/, '')).join('\n');
  }

  function parseCollaborators(value) {
    return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name = '', youtubeHandle = '', credit = ''] = line.split('|').map((part) => part.trim());
      return { name, youtube_handle: youtubeHandle, credit };
    });
  }

  function populateEditor(item) {
    state.selectedItem = item;
    state.selectedId = item.id;
    elements.editorBlank.hidden = true;
    elements.editorContent.hidden = false;
    elements.editorTitle.textContent = item.song?.title || 'Content Review';
    elements.editorSubtitle.textContent = [item.song?.artist, item.song?.genre].filter(Boolean).join(' · ');
    elements.reviewStatusPill.textContent = statusLabel(item.status);
    elements.reviewStatusPill.dataset.status = item.status || 'in_review';
    elements.publishStatusPill.textContent = statusLabel(item.publishing_status || 'not_published');

    const metadata = item.metadata || {};
    const settings = item.publish_settings || {};
    elements.selectedTitle.value = metadata.selected_title || '';
    elements.description.value = metadata.description || '';
    elements.tags.value = Array.isArray(metadata.tags) ? metadata.tags.join('\n') : '';
    elements.hashtags.value = Array.isArray(metadata.hashtags) ? metadata.hashtags.join(' ') : '';
    elements.collaborators.value = collaboratorsToText(metadata.collaborators);
    elements.visibility.value = settings.visibility || 'unlisted';
    elements.scheduledAt.value = toLocalDateTime(settings.scheduled_at);
    elements.madeForKids.checked = Boolean(settings.made_for_kids);
    elements.notifySubscribers.checked = Boolean(settings.notify_subscribers);
    elements.reviewNote.value = item.review_decision?.note || '';
    renderTitleOptions(metadata.title_options || [], metadata.selected_title || '');
    setCharacterCounts();

    elements.videoRatio.textContent = item.video?.aspect_ratio || 'Video';
    elements.videoDuration.textContent = item.video?.duration_seconds
      ? `${Number(item.video.duration_seconds).toFixed(0)} sec`
      : 'Duration pending';
    elements.videoSize.textContent = formatBytes(item.video?.size_bytes);

    const status = item.status || 'in_review';
    elements.approveReview.hidden = status === 'approved';
    elements.holdReview.hidden = status === 'held';
    elements.reopenReview.hidden = status === 'in_review';

    elements.videoPreview.pause();
    elements.videoPreview.removeAttribute('src');
    elements.videoPreview.load();
    elements.previewLoading.hidden = false;
    elements.previewLoading.textContent = 'Select Preview Video to create a secure 15-minute preview.';
    elements.refreshPreviewButton.hidden = true;
    elements.openPreviewPage.href = `https://stashbox.com/radio-admin/dev/social-factory/content-review/preview/?review_id=${encodeURIComponent(item.id)}`;
    renderQueue();
  }

  async function selectItem(id, { refresh = false } = {}) {
    if (!id || state.busy) return;
    state.selectedId = id;
    renderQueue();
    setBusy(true);
    try {
      let item = state.items.find((candidate) => candidate.id === id);
      if (refresh || !item) {
        const payload = await api(`/social/review-items/${encodeURIComponent(id)}`);
        item = payload.item;
        const index = state.items.findIndex((candidate) => candidate.id === id);
        if (index >= 0) state.items[index] = item;
      }
      populateEditor(item);
      showMessage('');
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(id) {
    elements.previewLoading.hidden = false;
    elements.previewLoading.textContent = 'Loading secure preview…';
    elements.videoPreview.removeAttribute('src');
    elements.videoPreview.load();
    try {
      const payload = await api(`/social/review-items/${encodeURIComponent(id)}/preview`, {
        method: 'POST',
        body: '{}'
      });
      if (state.selectedId !== id) return;
      elements.videoPreview.src = payload.preview_url;
      elements.videoPreview.load();
      elements.previewLoading.hidden = true;
      elements.refreshPreviewButton.hidden = false;
      window.setTimeout(() => {
        if (state.selectedId !== id) return;
        elements.videoPreview.pause();
        elements.videoPreview.removeAttribute('src');
        elements.videoPreview.load();
        elements.previewLoading.hidden = false;
        elements.previewLoading.textContent = 'This secure preview expired. Select Refresh Preview to create a new 15-minute preview.';
      }, Number(payload.expires_in_seconds || 900) * 1000);
    } catch (error) {
      elements.previewLoading.hidden = false;
      elements.previewLoading.textContent = `Preview unavailable: ${formatError(error)}`;
    }
  }

  function formPayload() {
    const scheduled = elements.scheduledAt.value
      ? new Date(elements.scheduledAt.value).toISOString()
      : null;
    const tags = elements.tags.value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    const hashtags = elements.hashtags.value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
    return {
      selected_title: elements.selectedTitle.value.trim(),
      description: elements.description.value.trim(),
      tags,
      hashtags,
      collaborators: parseCollaborators(elements.collaborators.value),
      visibility: elements.visibility.value,
      scheduled_at: scheduled,
      made_for_kids: elements.madeForKids.checked,
      notify_subscribers: elements.notifySubscribers.checked
    };
  }

  async function saveReview(event) {
    event?.preventDefault();
    if (!state.selectedId || state.busy) return;
    setBusy(true);
    showMessage('Saving Content Review changes…');
    try {
      const payload = await api(`/social/review-items/${encodeURIComponent(state.selectedId)}/save`, {
        method: 'POST',
        body: JSON.stringify(formPayload())
      });
      updateItem(payload.item);
      populateEditor(payload.item);
      showMessage('Content Review changes saved. Nothing was published.', 'success');
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function updateItem(item) {
    const index = state.items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) state.items[index] = item;
    else state.items.unshift(item);
    applyFilters();
  }

  async function applyDecision(decision) {
    if (!state.selectedId || state.busy) return;
    setBusy(true);
    const labels = { approve: 'Approving', hold: 'Holding', reopen: 'Reopening' };
    showMessage(`${labels[decision] || 'Updating'} content item…`);
    try {
      const payload = await api(`/social/review-items/${encodeURIComponent(state.selectedId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: elements.reviewNote.value.trim() })
      });
      updateItem(payload.item);
      populateEditor(payload.item);
      const outcome = decision === 'approve'
        ? 'Approved for a later publishing step.'
        : decision === 'hold'
          ? 'Content placed on hold.'
          : 'Content returned to review.';
      showMessage(`${outcome} Nothing was published.`, 'success');
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    elements.saveToken.addEventListener('click', () => {
      const token = elements.adminToken.value.trim();
      if (!token) {
        showMessage('Paste the current Social Factory DEV token first.', 'error');
        return;
      }
      setToken(token);
      showMessage('Token saved privately in this browser.', 'success');
      loadQueue({ preserveSelection: false });
    });

    elements.clearToken.addEventListener('click', () => {
      setToken('');
      state.items = [];
      state.filteredItems = [];
      renderQueue();
      clearEditor();
      showMessage('Saved Social Factory token cleared.');
    });

    elements.adminToken.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') elements.saveToken.click();
    });
    elements.refreshQueue.addEventListener('click', () => loadQueue());
    elements.queueSearch.addEventListener('input', applyFilters);
    elements.queueStatus.addEventListener('change', applyFilters);
    elements.reviewForm.addEventListener('submit', saveReview);
    elements.approveReview.addEventListener('click', () => applyDecision('approve'));
    elements.holdReview.addEventListener('click', () => applyDecision('hold'));
    elements.reopenReview.addEventListener('click', () => applyDecision('reopen'));
    elements.selectedTitle.addEventListener('input', setCharacterCounts);
    elements.description.addEventListener('input', setCharacterCounts);
    elements.previewVideoButton.addEventListener('click', () => state.selectedId && loadPreview(state.selectedId));
    elements.refreshPreviewButton.addEventListener('click', () => state.selectedId && loadPreview(state.selectedId));
    elements.videoPreview.addEventListener('error', () => {
      elements.previewLoading.hidden = false;
      elements.previewLoading.textContent = 'The secure preview expired. Select the item again to refresh it.';
    });
  }

  async function init() {
    cacheElements();
    bindEvents();
    updateTokenStatus();
    renderQueue();
    if (getToken()) await loadQueue({ preserveSelection: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
