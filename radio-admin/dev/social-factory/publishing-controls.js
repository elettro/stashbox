(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000;
  const state = { busy: false, resultReviewId: '' };

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function selectedReviewId() {
    return document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId || '';
  }

  function selectedStatus() {
    return String(byId('reviewStatusPill')?.dataset?.status || '').toLowerCase();
  }

  function selectedTitle() {
    return String(byId('selectedTitle')?.value || byId('editorTitle')?.textContent || 'this video').trim();
  }

  function scheduledDate() {
    const value = byId('scheduledAt')?.value;
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function scheduledInFuture() {
    const date = scheduledDate();
    return Boolean(date && date.getTime() > Date.now() + 60_000);
  }

  function scheduleHasEnoughLeadTime() {
    const date = scheduledDate();
    return Boolean(date && date.getTime() >= Date.now() + MIN_SCHEDULE_LEAD_MS);
  }

  function localScheduleLabel(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return 'the selected time';
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
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
      return 'Approve this item before validating, scheduling, or publishing it.';
    }
    if (error?.message === 'review_item_already_published') {
      return 'This review item has already been published.';
    }
    if (error?.message === 'scheduled_at_required') {
      return 'Choose a future schedule date and time first.';
    }
    if (error?.message === 'scheduled_at_too_soon') {
      return 'Choose a schedule time at least two minutes in the future.';
    }
    if (error?.message === 'scheduled_at_too_far') {
      return 'Choose a schedule time within the next 366 days.';
    }
    if (error?.message === 'scheduled_publish_queue_required') {
      return 'Use Queue Scheduled Upload for items with a future date.';
    }
    const detail = error?.details?.next_step || error?.details?.scheduled_at;
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

  function publishState() {
    return String(byId('publishStatusPill')?.textContent || '').trim().toLowerCase();
  }

  function updateGuidance({ future, scheduled, published }) {
    const lock = document.querySelector('.sf-publish-lock');
    if (!lock) return;
    const title = lock.querySelector('strong');
    const copy = lock.querySelector('span');

    if (published) {
      if (title) title.textContent = 'YouTube upload completed';
      if (copy) copy.textContent = 'The review record contains the unlisted YouTube result.';
      return;
    }
    if (scheduled) {
      if (title) title.textContent = 'Scheduled publishing queued';
      if (copy) copy.textContent = 'The isolated queue will recheck approval and upload this video as unlisted at the saved time.';
      return;
    }
    if (future) {
      if (title) title.textContent = 'Controlled scheduled publishing';
      if (copy) copy.textContent = 'Validate the future time, then queue one approved unlisted YouTube upload.';
      return;
    }
    if (title) title.textContent = 'Controlled YouTube publishing';
    if (copy) copy.textContent = 'Approve the item, validate the upload, then use the separate confirmed control to publish it as unlisted.';
  }

  function updateControls() {
    const validateButton = byId('validateYoutubePublish');
    const publishButton = byId('publishYoutubeUnlisted');
    const scheduleButton = byId('queueScheduledYoutubePublish');
    const result = byId('youtubePublishResult');
    if (!validateButton || !publishButton || !scheduleButton) return;

    const reviewId = selectedReviewId();
    const approved = selectedStatus() === 'approved';
    const stateLabel = publishState();
    const published = stateLabel === 'published';
    const scheduled = stateLabel === 'scheduled';
    const processing = stateLabel === 'publishing' || stateLabel === 'retrying';
    const future = scheduledInFuture();
    const hasLeadTime = scheduleHasEnoughLeadTime();
    const locked = state.busy || !reviewId || !approved || published || processing;

    validateButton.textContent = future ? 'Validate Scheduled Upload' : 'Validate YouTube Upload';
    validateButton.disabled = locked;
    validateButton.hidden = published;

    publishButton.disabled = locked || future || scheduled;
    publishButton.hidden = published || future || scheduled;

    scheduleButton.textContent = scheduled ? 'Update Scheduled Upload' : 'Queue Scheduled Upload';
    scheduleButton.disabled = locked || !future || !hasLeadTime;
    scheduleButton.hidden = published || !future;

    if (result) result.hidden = !published || state.resultReviewId !== reviewId;
    updateGuidance({ future, scheduled, published });
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    updateControls();
  }

  async function validateUpload() {
    const reviewId = selectedReviewId();
    if (!reviewId || state.busy) return;
    setBusy(true);

    try {
      if (scheduledInFuture()) {
        const date = scheduledDate();
        showMessage('Validating the approved video and future queue time…');
        const payload = await api(
          `/social/review-items/${encodeURIComponent(reviewId)}/schedule`,
          {
            confirm_schedule: false,
            scheduled_at: date.toISOString()
          }
        );
        showMessage(
          `Validation passed. ${selectedTitle()} is ready to enter the unlisted publishing queue for ${localScheduleLabel(payload.scheduled_at)}. Nothing was scheduled or published.`,
          'success'
        );
      } else {
        showMessage('Validating the approved video and YouTube connection…');
        const payload = await api(
          `/social/review-items/${encodeURIComponent(reviewId)}/publish`,
          { confirm_upload: false }
        );
        showMessage(
          `Validation passed. ${payload.title || selectedTitle()} is ready for an unlisted YouTube upload. Nothing was published.`,
          'success'
        );
      }
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function publishUnlisted() {
    const reviewId = selectedReviewId();
    if (!reviewId || state.busy) return;
    if (selectedStatus() !== 'approved') {
      showMessage('Approve this item before publishing it.', 'error');
      return;
    }
    if (scheduledInFuture()) {
      showMessage('Use Queue Scheduled Upload for a future publishing time.', 'error');
      return;
    }

    const title = selectedTitle();
    const confirmed = window.confirm(
      `Publish “${title}” to the connected YouTube channel as UNLISTED now?\n\nThis uploads the video. It does not make it public.`
    );
    if (!confirmed) return;

    setBusy(true);
    showMessage('Publishing the approved video to YouTube as unlisted…');
    try {
      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/publish`,
        { confirm_upload: true }
      );
      const result = byId('youtubePublishResult');
      if (result && payload.youtube_url) {
        state.resultReviewId = reviewId;
        result.href = payload.youtube_url;
        result.textContent = 'Open unlisted YouTube video';
        result.hidden = false;
      }
      const publishStatus = byId('publishStatusPill');
      if (publishStatus) {
        publishStatus.textContent = 'Published';
        publishStatus.dataset.status = 'published';
      }
      showMessage('YouTube upload completed and the Social Factory review record was updated.', 'success');
      byId('refreshQueue')?.click();
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function queueScheduledUpload() {
    const reviewId = selectedReviewId();
    const date = scheduledDate();
    if (!reviewId || !date || state.busy) return;
    if (selectedStatus() !== 'approved') {
      showMessage('Approve this item before scheduling it.', 'error');
      return;
    }
    if (!scheduleHasEnoughLeadTime()) {
      showMessage('Choose a schedule time at least two minutes in the future.', 'error');
      return;
    }

    setBusy(true);
    showMessage('Validating the approved video and future queue time…');
    try {
      const validation = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule`,
        {
          confirm_schedule: false,
          scheduled_at: date.toISOString()
        }
      );
      const scheduleLabel = localScheduleLabel(validation.scheduled_at);
      const confirmed = window.confirm(
        `Queue “${selectedTitle()}” for an UNLISTED YouTube upload on ${scheduleLabel}?\n\nThe queue will recheck approval before uploading. You can place the item on hold before the scheduled time to stop publication.`
      );
      if (!confirmed) {
        showMessage('Scheduled upload was not queued. Nothing was published.');
        return;
      }

      showMessage('Creating the isolated scheduled publishing job…');
      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/schedule`,
        {
          confirm_schedule: true,
          scheduled_at: date.toISOString()
        }
      );
      const publishStatus = byId('publishStatusPill');
      if (publishStatus) {
        publishStatus.textContent = 'Scheduled';
        publishStatus.dataset.status = 'scheduled';
      }
      showMessage(
        `Scheduled upload queued for ${localScheduleLabel(payload.scheduled_at)}. Nothing was uploaded yet.`,
        'success'
      );
      byId('refreshQueue')?.click();
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function installControls() {
    const actions = document.querySelector('.sf-form-actions');
    if (!actions || byId('validateYoutubePublish')) return;

    const validateButton = document.createElement('button');
    validateButton.id = 'validateYoutubePublish';
    validateButton.className = 'sf-button sf-button-secondary';
    validateButton.type = 'button';
    validateButton.textContent = 'Validate YouTube Upload';

    const publishButton = document.createElement('button');
    publishButton.id = 'publishYoutubeUnlisted';
    publishButton.className = 'sf-button sf-button-warning';
    publishButton.type = 'button';
    publishButton.textContent = 'Publish Unlisted';

    const scheduleButton = document.createElement('button');
    scheduleButton.id = 'queueScheduledYoutubePublish';
    scheduleButton.className = 'sf-button sf-button-success';
    scheduleButton.type = 'button';
    scheduleButton.textContent = 'Queue Scheduled Upload';
    scheduleButton.hidden = true;

    actions.append(validateButton, publishButton, scheduleButton);

    const result = document.createElement('a');
    result.id = 'youtubePublishResult';
    result.className = 'sf-button sf-button-secondary';
    result.target = '_blank';
    result.rel = 'noopener noreferrer';
    result.hidden = true;
    actions.appendChild(result);

    validateButton.addEventListener('click', validateUpload);
    publishButton.addEventListener('click', publishUnlisted);
    scheduleButton.addEventListener('click', queueScheduledUpload);

    const observer = new MutationObserver(updateControls);
    const queue = byId('queueList');
    const status = byId('reviewStatusPill');
    const publishStatus = byId('publishStatusPill');
    [queue, status, publishStatus].filter(Boolean).forEach((target) => {
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
