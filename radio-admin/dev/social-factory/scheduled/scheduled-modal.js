(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const state = { items: [], selected: null, observer: null };

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  async function request(path, body) {
    const current = token();
    if (!current) throw new Error('Save the Social Factory DEV token first.');
    const response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-admin-token': current,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
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

  function scheduleValue(item) {
    return item?.publishing?.scheduled_at || item?.schedule?.scheduled_at || item?.scheduled_at || item?.metadata?.scheduled_at || '';
  }

  function scheduleName(item) {
    return item?.publishing?.schedule_name || item?.schedule?.name || item?.schedule_name || '';
  }

  function normalize(item) {
    const scheduledAt = new Date(scheduleValue(item));
    return {
      raw: item,
      id: item.id || item.review_id || '',
      title: item.song?.title || item.metadata?.selected_title || item.title || 'Untitled content',
      artist: item.song?.artist || item.artist || 'Unknown artist',
      aspectRatio: item.video?.aspect_ratio || item.aspect_ratio || 'Video',
      visibility: item.visibility || item.publishing?.visibility || item.metadata?.visibility || 'unlisted',
      publishingStatus: item.publishing_status || item.publishing?.status || 'scheduled',
      reviewStatus: item.status || item.review_status || 'approved',
      scheduleName: scheduleName(item),
      scheduledAt: Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt
    };
  }

  function platformLabel(item) {
    return item.aspectRatio === '9:16' ? 'YT · Short' : 'YT · Video';
  }

  function toLocalInput(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDate(date) {
    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  function createModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'scheduledPostModal';
    backdrop.className = 'sf-modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="sf-modal" role="dialog" aria-modal="true" aria-labelledby="scheduledModalTitle">
        <header class="sf-modal-head">
          <div><p class="eyebrow">Scheduled Post</p><h2 id="scheduledModalTitle">Post Details</h2></div>
          <button id="scheduledModalClose" class="sf-modal-close" type="button" aria-label="Close">×</button>
        </header>
        <div class="sf-modal-body">
          <div><span id="scheduledModalPlatform" class="sf-platform-badge">YT · Video</span></div>
          <div class="sf-modal-facts">
            <div class="sf-modal-fact"><span>Artist</span><strong id="scheduledModalArtist"></strong></div>
            <div class="sf-modal-fact"><span>Current schedule</span><strong id="scheduledModalCurrent"></strong></div>
            <div class="sf-modal-fact"><span>Visibility</span><strong id="scheduledModalVisibility"></strong></div>
            <div class="sf-modal-fact"><span>Review ID</span><strong id="scheduledModalId"></strong></div>
            <div class="sf-modal-fact"><span>Review status</span><strong id="scheduledModalReviewStatus"></strong></div>
            <div class="sf-modal-fact"><span>Schedule name</span><strong id="scheduledModalScheduleName"></strong></div>
          </div>
          <label class="sf-modal-label">New date and time<input id="scheduledModalDate" type="datetime-local" /></label>
          <div class="sf-modal-note"><strong>Delete Scheduled Post</strong> removes the active publishing schedule and the item disappears from this calendar. The rendered video and Content Review record are preserved.</div>
          <div id="scheduledModalStatus" class="sf-modal-status" hidden></div>
          <div class="sf-modal-actions">
            <button id="scheduledModalCancel" class="button" type="button">Close</button>
            <button id="scheduledModalDelete" class="button sf-danger" type="button">Delete Scheduled Post</button>
            <button id="scheduledModalReschedule" class="button primary" type="button">Save New Schedule</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
    document.getElementById('scheduledModalClose').addEventListener('click', closeModal);
    document.getElementById('scheduledModalCancel').addEventListener('click', closeModal);
    document.getElementById('scheduledModalDelete').addEventListener('click', deleteSchedule);
    document.getElementById('scheduledModalReschedule').addEventListener('click', reschedule);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  }

  function setStatus(text, type = 'info') {
    const el = document.getElementById('scheduledModalStatus');
    el.hidden = !text;
    el.textContent = text || '';
    el.dataset.type = type;
  }

  function setBusy(value) {
    ['scheduledModalDelete', 'scheduledModalReschedule', 'scheduledModalCancel', 'scheduledModalClose'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = Boolean(value);
    });
  }

  function openModal(item) {
    state.selected = item;
    document.getElementById('scheduledModalTitle').textContent = item.title;
    document.getElementById('scheduledModalArtist').textContent = item.artist;
    document.getElementById('scheduledModalCurrent').textContent = formatDate(item.scheduledAt);
    document.getElementById('scheduledModalVisibility').textContent = item.visibility;
    document.getElementById('scheduledModalId').textContent = item.id;
    document.getElementById('scheduledModalReviewStatus').textContent = item.reviewStatus;
    document.getElementById('scheduledModalScheduleName').textContent = item.scheduleName || 'Active schedule';
    document.getElementById('scheduledModalPlatform').textContent = platformLabel(item);
    document.getElementById('scheduledModalDate').value = toLocalInput(item.scheduledAt);
    setStatus('');
    const modal = document.getElementById('scheduledPostModal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('scheduledPostModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
    state.selected = null;
  }

  async function loadItems() {
    if (!token()) return;
    try {
      const payload = await request('/social/review-items?limit=250');
      state.items = (Array.isArray(payload.items) ? payload.items : []).map(normalize).filter((item) => item.id && item.scheduledAt);
      decorate();
    } catch (error) {
      console.error('Scheduled modal load failed:', error);
    }
  }

  function badge(label) {
    const el = document.createElement('span');
    el.className = 'sf-platform-badge';
    el.textContent = label;
    return el;
  }

  function decorateCards() {
    document.querySelectorAll('.card').forEach((card) => {
      if (card.dataset.modalReady === 'true') return;
      const id = [...card.querySelectorAll('.muted')].map((el) => el.textContent.trim()).find((value) => value.startsWith('render-'));
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item) return;
      card.dataset.modalReady = 'true';
      card.tabIndex = 0;
      const chips = card.querySelector('.chips');
      if (chips) chips.prepend(badge(platformLabel(item)));
      card.addEventListener('click', () => openModal(item));
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openModal(item); });
    });
  }

  function decorateEvents() {
    document.querySelectorAll('.event').forEach((event) => {
      if (event.dataset.modalReady === 'true') return;
      const title = event.querySelector('.event-title')?.textContent.trim();
      const time = event.querySelector('.event-time')?.textContent.trim();
      const item = state.items.find((candidate) => candidate.title === title && candidate.scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) === time);
      if (!item) return;
      event.dataset.modalReady = 'true';
      event.tabIndex = 0;
      event.appendChild(badge(platformLabel(item)));
      event.addEventListener('click', () => openModal(item));
      event.addEventListener('keydown', (keyEvent) => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') openModal(item); });
    });
  }

  function decorate() {
    decorateCards();
    decorateEvents();
  }

  async function cancelConfirmed(item) {
    const path = `/social/review-items/${encodeURIComponent(item.id)}/schedule/cancel`;
    const validation = await request(path, { confirm_cancel_schedule: false });
    if (validation.mode === 'not_scheduled') return { cancelled: true, alreadyMissing: true };
    const result = await request(path, { confirm_cancel_schedule: true });
    if (!result.cancelled) throw new Error('The schedule was not cancelled. No replacement was created.');
    return result;
  }

  async function deleteSchedule() {
    const item = state.selected;
    if (!item) return;
    const confirmed = window.confirm(`Delete the scheduled post “${item.title}”?\n\nThis removes its active publishing schedule. The video remains in Content Review.`);
    if (!confirmed) return;
    setBusy(true);
    setStatus('Cancelling and verifying the active schedule…');
    try {
      await cancelConfirmed(item);
      setStatus('Scheduled post deleted. The video remains available in Content Review.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setStatus(error.message || String(error), 'error');
      setBusy(false);
    }
  }

  async function reschedule() {
    const item = state.selected;
    if (!item) return;
    const input = document.getElementById('scheduledModalDate').value;
    const nextDate = new Date(input);
    if (!input || Number.isNaN(nextDate.getTime())) {
      setStatus('Choose a valid date and time.', 'error');
      return;
    }
    if (nextDate.getTime() < Date.now() + 120000) {
      setStatus('Choose a time at least two minutes in the future.', 'error');
      return;
    }
    const confirmed = window.confirm(`Move “${item.title}” from ${formatDate(item.scheduledAt)} to ${formatDate(nextDate)}?`);
    if (!confirmed) return;

    const schedulePath = `/social/review-items/${encodeURIComponent(item.id)}/schedule`;
    const nextIso = nextDate.toISOString();
    const oldIso = item.scheduledAt.toISOString();
    setBusy(true);
    setStatus('Validating the replacement schedule…');
    try {
      await request(schedulePath, { scheduled_at: nextIso, confirm_schedule: false });
      setStatus('Cancelling the old schedule…');
      await cancelConfirmed(item);
      setStatus('Creating the replacement schedule…');
      try {
        const replacement = await request(schedulePath, { scheduled_at: nextIso, confirm_schedule: true });
        if (!replacement.scheduled_at) throw new Error('Replacement schedule response was incomplete.');
      } catch (replacementError) {
        setStatus('Replacement failed. Attempting to restore the original schedule…', 'error');
        try {
          await request(schedulePath, { scheduled_at: oldIso, confirm_schedule: true });
          throw new Error(`Replacement failed; the original schedule was restored. ${replacementError.message || replacementError}`);
        } catch (restoreError) {
          if (String(restoreError.message || restoreError).startsWith('Replacement failed;')) throw restoreError;
          throw new Error(`Replacement failed and automatic restoration also failed. Check Content Review immediately. ${replacementError.message || replacementError}`);
        }
      }
      setStatus('Schedule updated successfully.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setStatus(error.message || String(error), 'error');
      setBusy(false);
    }
  }

  function init() {
    createModal();
    loadItems();
    state.observer = new MutationObserver(decorate);
    state.observer.observe(document.body, { childList: true, subtree: true });
    document.getElementById('refresh')?.addEventListener('click', () => setTimeout(loadItems, 300));
    document.getElementById('saveToken')?.addEventListener('click', () => setTimeout(loadItems, 300));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
