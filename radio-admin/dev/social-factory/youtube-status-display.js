(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const REFRESH_MS = 15000;
  const itemsById = new Map();
  let timer = null;
  let loading = false;

  function byId(id) { return document.getElementById(id); }
  function getToken() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; }
  function clean(value) { return String(value || '').trim(); }

  function installScheduledCtaStyles() {
    if (document.getElementById('sf-youtube-scheduled-cta-styles')) return;

    const style = document.createElement('style');
    style.id = 'sf-youtube-scheduled-cta-styles';
    style.textContent = `
      #publishStatusPill[data-status="scheduled"] {
        border: 2px solid #83e6ff;
        background: linear-gradient(135deg, #16c7ff 0%, #0877ff 52%, #5138ff 100%);
        color: #ffffff;
        padding: 9px 15px;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: .075em;
        text-shadow: 0 1px 2px rgba(0, 20, 70, .55);
        box-shadow:
          0 0 0 3px rgba(22, 199, 255, .18),
          0 0 24px rgba(22, 199, 255, .55),
          0 10px 28px rgba(8, 119, 255, .32);
        animation: sfScheduledCtaPulse 2.2s ease-in-out infinite;
      }

      .sf-youtube-status[data-status="scheduled"] {
        border: 1px solid #83e6ff;
        background: linear-gradient(135deg, #16c7ff 0%, #0877ff 58%, #5138ff 100%);
        color: #ffffff;
        padding: 4px 8px;
        font-weight: 950;
        letter-spacing: .055em;
        text-shadow: 0 1px 2px rgba(0, 20, 70, .5);
        box-shadow: 0 0 14px rgba(22, 199, 255, .42);
      }

      .sf-queue-item:has(.sf-youtube-status[data-status="scheduled"]) {
        border-color: rgba(75, 205, 255, .82);
        box-shadow:
          inset 0 0 0 1px rgba(75, 205, 255, .18),
          0 0 18px rgba(8, 119, 255, .16);
      }

      @keyframes sfScheduledCtaPulse {
        0%, 100% {
          box-shadow:
            0 0 0 3px rgba(22, 199, 255, .16),
            0 0 20px rgba(22, 199, 255, .48),
            0 10px 26px rgba(8, 119, 255, .28);
        }
        50% {
          box-shadow:
            0 0 0 5px rgba(22, 199, 255, .24),
            0 0 34px rgba(22, 199, 255, .72),
            0 12px 34px rgba(81, 56, 255, .4);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #publishStatusPill[data-status="scheduled"] { animation: none; }
      }
    `;
    document.head.appendChild(style);
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
      published: 'YouTube Published', publishing: 'YouTube Publishing', queued: 'YouTube Queued',
      retrying: 'YouTube Retrying', scheduled: '✓ YouTube Scheduled', publish_failed: 'YouTube Failed',
      not_published: 'Not on YouTube'
    }[status] || 'Not on YouTube';
  }

  function detailFor(item = {}) {
    const status = normalizedStatus(item);
    const youtube = item.platform_results?.youtube || {};
    if (status === 'published') {
      return [youtube.privacy_status || item.publish_settings?.actual_visibility || 'unlisted', item.published_at || youtube.published_at].filter(Boolean).join(' · ');
    }
    if (status === 'scheduled') return item.publish_settings?.scheduled_at || item.schedule?.scheduled_at || '';
    if (status === 'publish_failed') return clean(youtube.error || youtube.last_error || item.publish_error || item.schedule?.last_error || 'YouTube upload failed.');
    return '';
  }

  function youtubeUrl(item = {}) { return clean(item.platform_results?.youtube?.url); }
  function selectedReviewId() { return clean(document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId); }

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
    const item = itemsById.get(selectedReviewId());
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

  function decorate() { decorateQueue(); decorateSelected(); }

  async function loadStatuses() {
    const token = getToken();
    if (!token || loading) return;
    loading = true;
    try {
      const response = await fetch(`${API_BASE}/social/review-items?limit=100`, { headers: { 'x-admin-token': token }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.items)) return;
      itemsById.clear();
      payload.items.forEach((item) => { if (item?.id) itemsById.set(clean(item.id), item); });
      decorate();
    } catch (error) {
      console.warn('[Social Factory] YouTube status display refresh failed', error);
    } finally {
      loading = false;
    }
  }

  function loadCampaignEnhancements() {
    if (!document.querySelector('link[data-content-review-campaigns]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/radio-admin/dev/social-factory/content-review-campaigns.css?v=20260801-wide2';
      stylesheet.dataset.contentReviewCampaigns = 'true';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-content-review-campaigns]')) {
      const script = document.createElement('script');
      script.src = '/radio-admin/dev/social-factory/content-review-campaigns.js?v=20260801-1';
      script.dataset.contentReviewCampaigns = 'true';
      document.body.appendChild(script);
    }
    if (!document.querySelector('script[data-campaign-review-links]')) {
      const exactLinks = document.createElement('script');
      exactLinks.src = '/radio-admin/dev/social-factory/campaign-review-links.js?v=20260801-1';
      exactLinks.dataset.campaignReviewLinks = 'true';
      document.body.appendChild(exactLinks);
    }
    if (!document.querySelector('script[data-review-hide-controls]')) {
      const hideControls = document.createElement('script');
      hideControls.src = '/radio-admin/dev/social-factory/review-hide-controls.js?v=20260801-5';
      hideControls.dataset.reviewHideControls = 'true';
      document.body.appendChild(hideControls);
    }
  }

  function install() {
    installScheduledCtaStyles();
    loadCampaignEnhancements();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
