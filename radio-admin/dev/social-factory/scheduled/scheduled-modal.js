(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const DEFAULT_TIME_ZONE = 'America/New_York';
  const state = { items: [], selected: null, observer: null };
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  async function request(path, body) {
    const current = token();
    if (!current) throw new Error('Save the Social Factory DEV token first.');
    const response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-admin-token': current, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
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

  function easternParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  }

  function toEasternInput(date) {
    const p = easternParts(date);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  function easternWallTimeToDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const wallUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let guess = new Date(wallUtc);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const p = easternParts(guess);
      const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
      const delta = wallUtc - represented;
      if (!delta) break;
      guess = new Date(guess.getTime() + delta);
    }
    const check = easternParts(guess);
    if (Number(check.year) !== year || Number(check.month) !== month || Number(check.day) !== day || Number(check.hour) !== hour || Number(check.minute) !== minute) return null;
    return guess;
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIME_ZONE,
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(date);
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
          <label class="sf-modal-label">New date and time <span class="sf-timezone-note">Eastern Time (America/New_York)</span><input id="scheduledModalDate" type="datetime-local" /></label>
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
    document.getElementById('scheduledModalDate').value = toEasternInput(item.scheduledAt);
    setStatus('');
    document.getElementById('scheduledPostModal').hidden = false;
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
      const item = state.items.find((candidate) => candidate.title === title);
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
    if (!window.confirm(`Delete the scheduled post “${item.title}”?\n\nThis removes its active publishing schedule. The video remains in Content Review.`)) return;
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
    const nextDate = easternWallTimeToDate(input);
    if (!nextDate) {
      setStatus('Choose a valid Eastern Time date and time.', 'error');
      return;
    }
    if (nextDate.getTime() < Date.now() + 120000) {
      setStatus('Choose a time at least two minutes in the future.', 'error');
      return;
    }
    if (!window.confirm(`Move “${item.title}” from ${formatDate(item.scheduledAt)} to ${formatDate(nextDate)}?`)) return;

    const schedulePath = `/social/review-items/${encodeURIComponent(item.id)}/schedule`;
    const nextIso = nextDate.toISOString();
    const oldIso = item.scheduledAt.toISOString();
    setBusy(true);
    setStatus('Validating the replacement schedule…');
    try {
      await request(schedulePath, { scheduled_at: nextIso, timezone: DEFAULT_TIME_ZONE, confirm_schedule: false });
      setStatus('Cancelling the old schedule…');
      await cancelConfirmed(item);
      setStatus('Creating the replacement schedule…');
      try {
        const replacement = await request(schedulePath, { scheduled_at: nextIso, timezone: DEFAULT_TIME_ZONE, confirm_schedule: true });
        if (!replacement.scheduled_at) throw new Error('Replacement schedule response was incomplete.');
      } catch (replacementError) {
        setStatus('Replacement failed. Attempting to restore the original schedule…', 'error');
        try {
          await request(schedulePath, { scheduled_at: oldIso, timezone: DEFAULT_TIME_ZONE, confirm_schedule: true });
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
