(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const YOUTUBE_RATIOS = new Set(['9:16', '16:9']);
  const state = { busy: false, resultReviewId: '' };

  function installHiddenReviewFilter() {
    if (window.__stashboxHiddenReviewFilterInstalled) return;
    window.__stashboxHiddenReviewFilterInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function filteredReviewFetch(input, init = {}) {
      const response = await nativeFetch(input, init);
      try {
        const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
        const url = new URL(requestUrl, window.location.href);
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        if (method !== 'GET' || !url.pathname.endsWith('/social/review-items')) return response;
        const payload = await response.clone().json();
        if (!Array.isArray(payload?.items)) return response;
        const items = payload.items.filter(item => String(item?.status || '').toLowerCase() !== 'hidden');
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return new Response(JSON.stringify({ ...payload, count: items.length, items }), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (_) {
        return response;
      }
    };
  }

  function loadActionTooltipResources() {
    if (!document.querySelector('link[data-sf-action-tooltips]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = './action-tooltips.css?v=20260729-actiontips1';
      stylesheet.dataset.sfActionTooltips = 'true';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-sf-action-tooltips]')) {
      const script = document.createElement('script');
      script.src = './action-tooltips.js?v=20260729-actiontips1';
      script.async = false;
      script.dataset.sfActionTooltips = 'true';
      document.head.appendChild(script);
    }
  }

  function loadReviewQueueResources() {
    if (!document.querySelector('link[data-sf-review-queue-controls]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = './review-queue-controls.css?v=20260729-reviewhide1';
      stylesheet.dataset.sfReviewQueueControls = 'true';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-sf-review-queue-controls]')) {
      const script = document.createElement('script');
      script.src = './review-queue-controls.js?v=20260729-reviewhide1';
      script.async = false;
      script.dataset.sfReviewQueueControls = 'true';
      document.head.appendChild(script);
    }
  }

  installHiddenReviewFilter();
  loadActionTooltipResources();
  loadReviewQueueResources();

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

  function selectedAspectRatio() {
    return String(byId('videoRatio')?.textContent || '').trim();
  }

  function youtubeRatioAllowed() {
    return YOUTUBE_RATIOS.has(selectedAspectRatio());
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
    if (error?.message === 'youtube_aspect_ratio_not_supported') {
      return 'YouTube content must be 9x16 or 16x9. Hide this item and create the correct version.';
    }
    if (error?.message === 'scheduled_publish_queue_required') {
      return 'This item has a future schedule. Scheduled publishing stays locked until the queue is active.';
    }
    const detail = error?.details?.next_step || error?.details?.scheduled_at || error?.details?.aspect_ratio;
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
    const validRatio = youtubeRatioAllowed();
    const publishLabel = String(byId('publishStatusPill')?.textContent || '').toLowerCase();
    const published = publishLabel.includes('published') && !publishLabel.includes('not published');

    validateButton.disabled = state.busy || !reviewId || !approved || published || !validRatio;
    publishButton.disabled = state.busy || !reviewId || !approved || published || scheduledInFuture() || !validRatio;
    validateButton.dataset.ratioBlocked = String(!validRatio);
    publishButton.dataset.ratioBlocked = String(!validRatio);
    publishButton.hidden = published;
    validateButton.hidden = published;
    if (result) result.hidden = !published || state.resultReviewId !== reviewId;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    updateControls();
  }

  async function validateUpload() {
    const reviewId = selectedReviewId();
    if (!reviewId || state.busy) return;
    if (!youtubeRatioAllowed()) {
      showMessage(`YouTube content must be 9x16 or 16x9. This item is ${selectedAspectRatio() || 'an unsupported ratio'}.`, 'error');
      return;
    }
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
    if (!youtubeRatioAllowed()) {
      showMessage(`YouTube content must be 9x16 or 16x9. This item is ${selectedAspectRatio() || 'an unsupported ratio'}.`, 'error');
      return;
    }
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
      if (copy) copy.textContent = 'YouTube items must be 9x16 or 16x9. Approve the item, validate the upload, then use the separate confirmed control to publish it as unlisted.';
    }

    validateButton.addEventListener('click', validateUpload);
    publishButton.addEventListener('click', publishUnlisted);

    const observer = new MutationObserver(updateControls);
    const queue = byId('queueList');
    const status = byId('reviewStatusPill');
    const publishStatus = byId('publishStatusPill');
    const ratio = byId('videoRatio');
    [queue, status, publishStatus, ratio].filter(Boolean).forEach(target => {
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