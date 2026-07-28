(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
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

  function selectedStatus() {
    return String(byId('reviewStatusPill')?.dataset?.status || '').toLowerCase();
  }

  function selectedTitle() {
    return String(byId('selectedTitle')?.value || byId('editorTitle')?.textContent || 'this video').trim();
  }

  function scheduledInFuture() {
    const value = byId('scheduledAt')?.value;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > Date.now() + 60_000;
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
      return 'Approve this item before validating or publishing it.';
    }
    if (error?.message === 'scheduled_publish_queue_required') {
      return 'This item has a future schedule. Scheduled publishing stays locked until the queue is active.';
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

  function updateControls() {
    const validateButton = byId('validateYoutubePublish');
    const publishButton = byId('publishYoutubeUnlisted');
    const result = byId('youtubePublishResult');
    if (!validateButton || !publishButton) return;

    const reviewId = selectedReviewId();
    const approved = selectedStatus() === 'approved';
    const published = String(byId('publishStatusPill')?.textContent || '').toLowerCase().includes('published') &&
      !String(byId('publishStatusPill')?.textContent || '').toLowerCase().includes('not published');

    validateButton.disabled = state.busy || !reviewId || !approved || published;
    publishButton.disabled = state.busy || !reviewId || !approved || published || scheduledInFuture();
    publishButton.hidden = published;
    validateButton.hidden = published;
    if (!published && result) result.hidden = true;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    updateControls();
  }

  async function validateUpload() {
    const reviewId = selectedReviewId();
    if (!reviewId || state.busy) return;
    setBusy(true);
    showMessage('Validating the approved video and YouTube connection…');
    try {
      const payload = await api(
        `/social/review-items/${encodeURIComponent(reviewId)}/publish`,
        { confirm_upload: false }
      );
      showMessage(
        `Validation passed. ${payload.title || selectedTitle()} is ready for an unlisted YouTube upload. Nothing was published.`,
        'success'
      );
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
      showMessage('Future scheduled publishing stays locked until the publishing queue is active.', 'error');
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
        result.href = payload.youtube_url;
        result.textContent = 'Open unlisted YouTube video';
        result.hidden = false;
      }
      showMessage('YouTube upload completed and the Social Factory review record was updated.', 'success');
      byId('refreshQueue')?.click();
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function installControls() {
    const actions = document.querySelector('.sf-form-actions');
    const lock = document.querySelector('.sf-publish-lock');
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

    actions.append(validateButton, publishButton);

    const result = document.createElement('a');
    result.id = 'youtubePublishResult';
    result.className = 'sf-button sf-button-secondary';
    result.target = '_blank';
    result.rel = 'noopener noreferrer';
    result.hidden = true;
    actions.appendChild(result);

    if (lock) {
      const title = lock.querySelector('strong');
      const copy = lock.querySelector('span');
      if (title) title.textContent = 'Controlled YouTube publishing';
      if (copy) copy.textContent = 'Approve the item, validate the upload, then use the separate confirmed control to publish it as unlisted.';
    }

    validateButton.addEventListener('click', validateUpload);
    publishButton.addEventListener('click', publishUnlisted);

    const observer = new MutationObserver(updateControls);
    const editor = byId('editorContent');
    const queue = byId('queueList');
    const status = byId('reviewStatusPill');
    const publishStatus = byId('publishStatusPill');
    [editor, queue, status, publishStatus].filter(Boolean).forEach((target) => {
      observer.observe(target, { attributes: true, childList: true, subtree: true, characterData: true });
    });
    byId('scheduledAt')?.addEventListener('change', updateControls);
    updateControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installControls, { once: true });
  } else {
    installControls();
  }
})();
