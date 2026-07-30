(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
  const CHECK_INTERVAL_MS = 10000;
  let busy = false;
  let timer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function campaignName() {
    return String(byId('renderCampaignName')?.value || '').trim();
  }

  function showMessage(text, type = 'success') {
    const message = byId('message');
    if (!message || !text) return;
    message.hidden = false;
    message.textContent = text;
    message.dataset.type = type;
  }

  async function request(path, options = {}) {
    const token = getToken();
    if (!token) return null;
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        'x-admin-token': token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `Queue request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.details = payload.details || null;
      throw error;
    }
    return payload;
  }

  async function recoverNextDraft() {
    const name = campaignName();
    if (busy || !name || !getToken()) return;

    busy = true;
    try {
      const payload = await request(`/social/orchestration/batch-jobs?campaign_name=${encodeURIComponent(name)}`);
      const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
      if (!jobs.length || jobs.some((job) => ACTIVE_STATUSES.has(String(job.status || '').toLowerCase()))) return;

      const nextDraft = jobs
        .filter((job) => String(job.status || '').toLowerCase() === 'draft')
        .sort((left, right) => new Date(left.created_at || 0) - new Date(right.created_at || 0))[0];
      if (!nextDraft?.id) return;

      const result = await request('/social/orchestration/batch-launch', {
        method: 'POST',
        body: {
          job_ids: [nextDraft.id],
          confirm_render_batch: true
        }
      });

      const launched = Number(result?.launched_job_count || 0);
      if (launched > 0) {
        showMessage(`Render queue advanced automatically. The next ${name} video is starting now.`);
        window.setTimeout(() => byId('renderRefresh')?.click(), 1500);
      }
    } catch (error) {
      if (error?.status !== 401) {
        console.warn('[Social Factory queue recovery] automatic handoff did not run', error);
      }
    } finally {
      busy = false;
    }
  }

  function install() {
    if (timer) return;
    byId('loadRenderCampaign')?.addEventListener('click', () => window.setTimeout(recoverNextDraft, 2500));
    byId('renderRefresh')?.addEventListener('click', () => window.setTimeout(recoverNextDraft, 2500));
    window.addEventListener('socialfactory:drafts-created', () => window.setTimeout(recoverNextDraft, 3000));
    timer = window.setInterval(recoverNextDraft, CHECK_INTERVAL_MS);
    window.setTimeout(recoverNextDraft, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
