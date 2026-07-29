(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const YOUTUBE_RATIOS = new Set(['9:16', '16:9']);
  const MAX_AUTO_STAGE_JOBS = 20;
  let decorating = false;
  let syncInProgress = false;
  let renderSyncTimer = null;

  const byId = id => document.getElementById(id);

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function showMessage(text, type = 'info') {
    const message = byId('message');
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function selectedRatio() {
    return String(byId('videoRatio')?.textContent || '').trim();
  }

  function ratioAllowed(ratio = selectedRatio()) {
    return YOUTUBE_RATIOS.has(String(ratio || '').trim());
  }

  function selectedTitle() {
    return String(byId('selectedTitle')?.value || byId('editorTitle')?.textContent || 'this content item').trim();
  }

  async function api(path, body) {
    const token = getToken();
    if (!token) throw new Error('The Social Factory token is missing or incorrect.');
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

  async function apiGet(path) {
    const token = getToken();
    if (!token) throw new Error('The Social Factory token is missing or incorrect.');
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { 'x-admin-token': token }
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

  function formatError(error) {
    if (error?.message === 'cancel_schedule_before_hiding') {
      return 'Cancel the active schedule before hiding this item.';
    }
    if (error?.message === 'youtube_aspect_ratio_not_supported') {
      return 'YouTube items must be 9x16 or 16x9. Hide this item and create a supported version.';
    }
    const detail = error?.details?.next_step || error?.details?.aspect_ratio;
    return detail ? `${error.message}: ${detail}` : String(error?.message || error || 'Unknown error');
  }

  function socialFactoryOrigin(job = {}) {
    const project = String(job.project_name || '').trim().toLowerCase();
    const metadata = String(job.metadata_comment || '').trim().toLowerCase();
    const campaign = String(job.campaign_name || '').trim();
    const batch = String(job.batch_name || '').trim();
    return project === 'social factory' || metadata.includes('social factory') || Boolean(campaign && batch);
  }

  function refreshQueueWithoutSync() {
    const button = byId('refreshQueue');
    if (!button) return;
    button.dataset.autoStageBypass = 'true';
    button.click();
  }

  async function syncCompletedSocialFactoryRenders({ announce = false } = {}) {
    if (syncInProgress || !getToken()) return { staged: 0, failed: 0 };
    syncInProgress = true;

    try {
      const [reviewPayload, jobsPayload] = await Promise.all([
        apiGet('/social/review-items?limit=100&include_hidden=1'),
        apiGet('/social/orchestration/render-jobs?limit=250')
      ]);

      const reviews = Array.isArray(reviewPayload.items) ? reviewPayload.items : [];
      const existingRenderIds = new Set(
        reviews.map(item => String(item?.source?.render_job_id || '').trim()).filter(Boolean)
      );
      const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
      const candidates = jobs.filter(job => {
        const jobId = String(job.id || '').trim();
        const status = String(job.status || '').trim().toLowerCase();
        const ratio = String(job.aspect_ratio || '').trim();
        const output = String(job.output_url || job.outputs?.[0]?.output_url || '').trim();
        return jobId &&
          status === 'completed' &&
          output &&
          ratioAllowed(ratio) &&
          socialFactoryOrigin(job) &&
          !existingRenderIds.has(jobId);
      }).slice(0, MAX_AUTO_STAGE_JOBS);

      let staged = 0;
      let failed = 0;
      for (const job of candidates) {
        try {
          const result = await api(
            `/social/orchestration/render-jobs/${encodeURIComponent(job.id)}/stage`,
            { confirm_stage: true }
          );
          if (result.staged === true || result.review_item) {
            staged += 1;
            existingRenderIds.add(String(job.id));
          }
        } catch (error) {
          failed += 1;
          console.warn('Social Factory auto-stage failed', {
            jobId: job.id,
            error: error?.message || error
          });
        }
      }

      if (staged) {
        showMessage(
          `${staged} completed Social Factory render${staged === 1 ? '' : 's'} automatically moved into Content Review. Nothing was published.`,
          failed ? 'error' : 'success'
        );
      } else if (announce && !failed) {
        showMessage('No new completed Social Factory renders are waiting to enter Content Review.');
      } else if (failed) {
        showMessage(`${failed} completed render${failed === 1 ? '' : 's'} could not be moved into Content Review.`, 'error');
      }

      return { staged, failed };
    } catch (error) {
      if (announce) showMessage(formatError(error), 'error');
      return { staged: 0, failed: 1 };
    } finally {
      syncInProgress = false;
    }
  }

  async function handleQueueRefresh(event) {
    const button = byId('refreshQueue');
    if (!button) return;
    if (button.dataset.autoStageBypass === 'true') {
      delete button.dataset.autoStageBypass;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    await syncCompletedSocialFactoryRenders({ announce: true });
    refreshQueueWithoutSync();
  }

  function scheduleRenderSync() {
    if (renderSyncTimer) window.clearTimeout(renderSyncTimer);
    renderSyncTimer = window.setTimeout(async () => {
      renderSyncTimer = null;
      const renderList = byId('renderJobList');
      const hasCompleted = Boolean(
        renderList?.querySelector('[data-status="completed"]') ||
        [...(renderList?.querySelectorAll('.sf-render-status') || [])]
          .some(node => String(node.textContent || '').trim().toLowerCase() === 'completed')
      );
      if (!hasCompleted) return;
      const result = await syncCompletedSocialFactoryRenders();
      if (result.staged) refreshQueueWithoutSync();
    }, 500);
  }

  function enforceCampaignRatios() {
    const select = byId('campaignRatio');
    if (!select) return;
    [...select.options].forEach(option => {
      if (!YOUTUBE_RATIOS.has(option.value)) option.remove();
    });
    if (!YOUTUBE_RATIOS.has(select.value)) select.value = '9:16';
    select.setAttribute('aria-description', 'YouTube output is restricted to 9x16 vertical or 16x9 widescreen.');
  }

  function updateYoutubeEligibility() {
    const ratio = selectedRatio();
    const allowed = ratioAllowed(ratio);
    const editor = document.querySelector('.sf-editor');
    editor?.classList.toggle('sf-youtube-ratio-unsupported', Boolean(ratio) && !allowed);
    editor?.setAttribute('data-youtube-ratio', ratio || '');

    const blockedIds = [
      'approveReview',
      'validateYoutubePublish',
      'publishYoutubeUnlisted',
      'validateSchedule',
      'scheduleApprovedItem'
    ];
    blockedIds.forEach(id => {
      const button = byId(id);
      if (!button) return;
      button.dataset.ratioBlocked = allowed ? 'false' : 'true';
      if (!allowed && ratio) {
        button.disabled = true;
        button.title = `YouTube accepts only 9x16 or 16x9. This item is ${ratio}.`;
      }
    });

    let warning = byId('youtubeRatioWarning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'youtubeRatioWarning';
      warning.className = 'sf-youtube-ratio-warning sf-full';
      const actions = document.querySelector('.sf-form-actions');
      actions?.before(warning);
    }
    if (warning) {
      warning.hidden = allowed || !ratio;
      warning.textContent = allowed || !ratio
        ? ''
        : `This ${ratio} video is not eligible for YouTube. YouTube content in Social Factory must be 9x16 or 16x9. Hide this item and create the correct version.`;
    }
  }

  async function hideReviewItem(reviewId, title, wrapper, button) {
    if (!reviewId || button.disabled) return;
    const confirmed = window.confirm(
      `Hide “${title}” from the Content Review list?\n\nThe review record and video will be preserved, but the item will disappear from the normal queue.`
    );
    if (!confirmed) return;

    button.disabled = true;
    showMessage(`Hiding “${title}” from Content Review…`);
    try {
      await api(`/social/review-items/${encodeURIComponent(reviewId)}/decision`, {
        decision: 'hide',
        note: 'Hidden from the normal Content Review queue.'
      });
      wrapper?.remove();
      showMessage(`“${title}” was hidden from the Content Review list. Nothing was deleted or published.`, 'success');
      refreshQueueWithoutSync();
    } catch (error) {
      button.disabled = false;
      showMessage(formatError(error), 'error');
    }
  }

  function decorateQueue() {
    const queue = byId('queueList');
    if (!queue || decorating) return;
    decorating = true;
    try {
      [...queue.children].forEach(child => {
        if (!child.classList?.contains('sf-queue-item')) return;
        const item = child;
        const reviewId = item.dataset.reviewId || '';
        const title = item.querySelector('.sf-queue-copy strong')?.textContent?.trim() || 'this content item';
        const wrapper = document.createElement('div');
        wrapper.className = 'sf-queue-entry';
        item.replaceWith(wrapper);
        wrapper.appendChild(item);

        const hideButton = document.createElement('button');
        hideButton.type = 'button';
        hideButton.className = 'sf-queue-hide';
        hideButton.textContent = 'Hide';
        hideButton.setAttribute('aria-label', `Hide ${title} from Content Review`);
        hideButton.title = 'Hide this item from the normal Content Review list. The record and video are preserved.';
        hideButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          hideReviewItem(reviewId, title, wrapper, hideButton);
        });
        wrapper.appendChild(hideButton);
      });
    } finally {
      decorating = false;
    }
  }

  function install() {
    enforceCampaignRatios();
    decorateQueue();
    updateYoutubeEligibility();

    const queue = byId('queueList');
    if (queue) new MutationObserver(decorateQueue).observe(queue, { childList: true });

    const refreshQueue = byId('refreshQueue');
    refreshQueue?.addEventListener('click', handleQueueRefresh, true);

    const renderList = byId('renderJobList');
    if (renderList) {
      new MutationObserver(scheduleRenderSync).observe(renderList, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-status']
      });
    }

    const ratio = byId('videoRatio');
    if (ratio) {
      new MutationObserver(updateYoutubeEligibility).observe(ratio, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const actions = document.querySelector('.sf-form-actions');
    if (actions) {
      new MutationObserver(updateYoutubeEligibility).observe(actions, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'hidden']
      });
    }

    byId('saveToken')?.addEventListener('click', () => {
      window.setTimeout(async () => {
        const result = await syncCompletedSocialFactoryRenders();
        if (result.staged) refreshQueueWithoutSync();
      }, 250);
    });

    window.addEventListener('socialfactory:drafts-created', enforceCampaignRatios);
    window.setTimeout(async () => {
      const result = await syncCompletedSocialFactoryRenders();
      if (result.staged) refreshQueueWithoutSync();
    }, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();