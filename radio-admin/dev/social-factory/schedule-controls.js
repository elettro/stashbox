(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const YOUTUBE_RATIOS = new Set(['9:16', '16:9']);
  const state = { busy: false };

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function selectedReviewId() {
    return document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId || '';
  }

  function normalizedPill(id) {
    const pill = byId(id);
    return String(pill?.dataset?.status || pill?.textContent || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function selectedStatus() {
    return normalizedPill('reviewStatusPill');
  }

  function publishingStatus() {
    return normalizedPill('publishStatusPill');
  }

  function selectedTitle() {
    return String(byId('selectedTitle')?.value || byId('editorTitle')?.textContent || 'this video').trim();
  }

  function selectedAspectRatio() {
    return String(byId('videoRatio')?.textContent || '').trim();
  }

  function youtubeRatioAllowed() {
    return YOUTUBE_RATIOS.has(selectedAspectRatio());
  }

  function scheduledAtIso() {
    const value = byId('scheduledAt')?.value;
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }

  function scheduledInFuture() {
    const value = scheduledAtIso();
    return Boolean(value) && new Date(value).getTime() >= Date.now() + 2 * 60_000;
  }

  function showMessage(text, type = 'info') {
    const message = byId('message');
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function formatError(error) {
    if (error?.status === 401 || error?.message === 'unauthorized') {
      return 'The Social Factory token is missing or incorrect.';
    }
    if (error?.message === 'review_item_not_approved') {
      return 'Approve this item before scheduling it.';
    }
    if (error?.message === 'youtube_aspect_ratio_not_supported') {
      return 'YouTube content must be 9x16 or 16x9. Hide this item and create the correct version.';
    }
    if (error?.message === 'scheduled_at_required') {
      return 'Choose a future schedule date and time first.';
    }
    if (error?.message === 'scheduled_at_too_soon') {
      return 'Choose a schedule time at least two minutes in the future.';
    }
    const detail = error?.details?.scheduled_at || error?.details?.minimum_lead_seconds || error?.details?.aspect_ratio;
    return detail ? `${error.message}: ${detail}` : String(error?.message || error || 'Unknown error');
  }

  async function api(path, body) {
    const token = getToken();
    if (!token) {
      const error = new Error('unauthorized');
      error.status = 401;
      throw error;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: JSON.stringify(body)
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

  function setPublishStatus(value, label) {
    const pill = byId('publishStatusPill');
    if (!pill) return;
    pill.dataset.status = value;
    pill.textContent = label;
  }

  function updateControls() {
    const validateButton = byId('validateSchedule');
    const scheduleButton = byId('scheduleApprovedItem');
    const cancelButton = byId('cancelScheduledItem');
    if (!validateButton || !scheduleButton || !cancelButton) return;

    const hasItem = Boolean(selectedReviewId());
    const approved = selectedStatus() === 'approved';
    const published = publishingStatus() === 'published';
    const scheduled = publishingStatus() === 'scheduled';
    const validTime = scheduledInFuture();
    const validRatio = youtubeRatioAllowed();

    validateButton.disabled = state.busy || !hasItem || !approved || published || scheduled || !validTime || !validRatio;
    scheduleButton.disabled = state.busy || !hasItem || !approved || published || scheduled || !validTime || !validRatio;
    cancelButton.disabled = state.busy || !hasItem || !scheduled;
    validateButton.dataset.ratioBlocked = String(!validRatio);
    scheduleButton.dataset.ratioBlocked = String(!validRatio);
    validateButton.hidden = published || scheduled;
    scheduleButton.hidden = published || scheduled;
    cancelButton.hidden = !scheduled;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    updateControls();
  }

  async function validateSchedule() {
    const reviewId = selectedReviewId();
    const scheduledAt = scheduledAtIso();
    if (!reviewId || !scheduledAt || state.busy) return;
    if (!youtubeRatioAllowed()) {
      showMessage(`YouTube content must be 9x16 or 16x9. This item is ${selectedAspectRatio() || 'an unsupported ratio'}.`, 'error');
      return;
    }

    setBusy(true);
    showMessage('Validating the approved item and future schedule…');
    try {
      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule`,
        { scheduled_at: scheduledAt, confirm_schedule: false }
      );
      showMessage(
        `Schedule validation passed for ${new Date(payload.scheduled_at).toLocaleString()}. No schedule was created and nothing was published.`,
        'success'
      );
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleApprovedItem() {
    const reviewId = selectedReviewId();
    const scheduledAt = scheduledAtIso();
    if (!reviewId || !scheduledAt || state.busy) return;
    if (!youtubeRatioAllowed()) {
      showMessage(`YouTube content must be 9x16 or 16x9. This item is ${selectedAspectRatio() || 'an unsupported ratio'}.`, 'error');
      return;
    }

    const title = selectedTitle();
    const confirmed = window.confirm(
      `Schedule “${title}” for ${new Date(scheduledAt).toLocaleString()}?\n\nThis creates a one-time DEV queue schedule. It does not publish now.`
    );
    if (!confirmed) return;

    setBusy(true);
    showMessage('Creating the approved one-time queue schedule…');
    try {
      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule`,
        { scheduled_at: scheduledAt, confirm_schedule: true }
      );
      setPublishStatus('scheduled', 'Scheduled');
      showMessage(
        `Scheduled for ${new Date(payload.scheduled_at).toLocaleString()}. Nothing was published now.`,
        'success'
      );
      byId('refreshQueue')?.click();
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelScheduledItem() {
    const reviewId = selectedReviewId();
    if (!reviewId || state.busy) return;

    setBusy(true);
    showMessage('Validating the current schedule before cancellation…');
    try {
      const validation = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule/cancel`,
        { confirm_cancel_schedule: false }
      );
      if (validation.mode === 'not_scheduled') {
        setPublishStatus('not_published', 'Not Published');
        showMessage('This item no longer has an active schedule.', 'success');
        return;
      }

      const confirmed = window.confirm(
        `Cancel the schedule for “${selectedTitle()}”?\n\nThis removes the one-time queue schedule. It does not publish the video.`
      );
      if (!confirmed) return;

      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule/cancel`,
        { confirm_cancel_schedule: true }
      );
      if (payload.cancelled) {
        setPublishStatus('not_published', 'Not Published');
        const scheduledAt = byId('scheduledAt');
        if (scheduledAt) scheduledAt.value = '';
        showMessage('Schedule cancelled. Nothing was published.', 'success');
        byId('refreshQueue')?.click();
      }
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function installControls() {
    const actions = document.querySelector('.sf-form-actions');
    if (!actions || byId('validateSchedule')) return;

    const validateButton = document.createElement('button');
    validateButton.id = 'validateSchedule';
    validateButton.className = 'sf-button sf-button-secondary';
    validateButton.type = 'button';
    validateButton.textContent = 'Validate Schedule';

    const scheduleButton = document.createElement('button');
    scheduleButton.id = 'scheduleApprovedItem';
    scheduleButton.className = 'sf-button sf-button-success';
    scheduleButton.type = 'button';
    scheduleButton.textContent = 'Schedule';

    const cancelButton = document.createElement('button');
    cancelButton.id = 'cancelScheduledItem';
    cancelButton.className = 'sf-button sf-button-warning';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel Schedule';
    cancelButton.hidden = true;

    actions.append(validateButton, scheduleButton, cancelButton);
    validateButton.addEventListener('click', validateSchedule);
    scheduleButton.addEventListener('click', scheduleApprovedItem);
    cancelButton.addEventListener('click', cancelScheduledItem);

    const observer = new MutationObserver(updateControls);
    ['queueList', 'reviewStatusPill', 'publishStatusPill', 'videoRatio'].map(byId).filter(Boolean).forEach(target => {
      observer.observe(target, { attributes: true, childList: true, subtree: true, characterData: true });
    });
    byId('scheduledAt')?.addEventListener('change', updateControls);
    byId('scheduledAt')?.addEventListener('input', updateControls);
    updateControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installControls, { once: true });
  } else {
    installControls();
  }
})();