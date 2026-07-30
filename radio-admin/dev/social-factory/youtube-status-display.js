(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const REFRESH_MS = 15000;
  const itemsById = new Map();
  let timer = null;
  let loading = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function normalizedStatus(item = {}) {
    const status = clean(item.publishing_status || 'not_published').toLowerCase();
    if (status === 'published') return 'published';
    if (status === 'publishing') return 'publishing';
    if (status === 'queued') return 'queued';
    if (status === 'retrying') return 'retrying';
    if (status === 'scheduled') return 'scheduled';
    if (status === 'publish_failed' || status === 'failed') return 'publish_failed';
    return 'not_published';
  }

  function labelFor(status) {
    return {
      published: 'YouTube Published',
      publishing: 'YouTube Publishing',
      queued: 'YouTube Queued',
      retrying: 'YouTube Retrying',
      scheduled: 'YouTube Scheduled',
      publish_failed: 'YouTube Failed',
      not_published: 'Not on YouTube'
    }[status] || 'Not on YouTube';
  }

  function detailFor(item = {}) {
    const status = normalizedStatus(item);
    const youtube = item.platform_results?.youtube || {};
    if (status === 'published') {
      return [youtube.privacy_status || item.publish_settings?.actual_visibility || 'unlisted', item.published_at || youtube.published_at]
        .filter(Boolean)
        .join(' · ');
    }
    if (status === 'scheduled') return item.publish_settings?.scheduled_at || item.schedule?.scheduled_at || '';
    if (status === 'publish_failed') {
      return clean(youtube.error || youtube.last_error || item.publish_error || item.schedule?.last_error || 'YouTube upload failed.');
    }
    return '';
  }

  function youtubeUrl(item = {}) {
    return clean(item.platform_results?.youtube?.url);
  }

  function selectedReviewId() {
    return clean(document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId);
  }

  function decorateQueue() {
    document.querySelectorAll('.sf-queue-item[data-review-id]').forEach((button) => {
      const item = itemsById.get(clean(button.dataset.reviewId));
      if (!item) return;
      const meta = button.querySelector('.sf-queue-meta');
      if (!meta) return;

      let pill = meta.querySelector('.sf-youtube-status');
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'sf-mini-pill sf-youtube-status';
        meta.appendChild(pill);
      }

      const status = normalizedStatus(item);
      pill.dataset.status = status;
      pill.textContent = labelFor(status);
      pill.title = detailFor(item);
    });
  }

  function decorateSelected() {
    const reviewId = selectedReviewId();
    const item = itemsById.get(reviewId);
    if (!item) return;

    const status = normalizedStatus(item);
    const pill = byId('publishStatusPill');
    if (pill) {
      pill.textContent = labelFor(status);
      pill.dataset.status = status;
      pill.title = detailFor(item);
    }

    const statuses = document.querySelector('.sf-editor-statuses');
    if (!statuses) return;

    let link = byId('youtubePublishedStatusLink');
    const url = youtubeUrl(item);
    if (url) {
      if (!link) {
        link = document.createElement('a');
        link.id = 'youtubePublishedStatusLink';
        link.className = 'sf-pill sf-pill-muted';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        statuses.appendChild(link);
      }
      link.href = url;
      link.textContent = 'Open YouTube';
      link.hidden = false;
    } else if (link) {
      link.hidden = true;
      link.removeAttribute('href');
    }
  }

  function decorate() {
    decorateQueue();
    decorateSelected();
  }

  async function loadStatuses() {
    const token = getToken();
    if (!token || loading) return;
    loading = true;
    try {
      const response = await fetch(`${API_BASE}/social/review-items?limit=100`, {
        headers: { 'x-admin-token': token },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.items)) return;
      itemsById.clear();
      payload.items.forEach((item) => {
        if (item?.id) itemsById.set(clean(item.id), item);
      });
      decorate();
    } catch (error) {
      console.warn('[Social Factory] YouTube status display refresh failed', error);
    } finally {
      loading = false;
    }
  }

  function install() {
    const queue = byId('queueList');
    if (queue) {
      const observer = new MutationObserver(() => window.setTimeout(decorate, 0));
      observer.observe(queue, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    }

    byId('refreshQueue')?.addEventListener('click', () => window.setTimeout(loadStatuses, 1000));
    byId('saveToken')?.addEventListener('click', () => window.setTimeout(loadStatuses, 500));
    window.addEventListener('focus', loadStatuses);

    loadStatuses();
    timer = window.setInterval(loadStatuses, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
