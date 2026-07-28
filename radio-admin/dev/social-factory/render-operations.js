(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
  const MAX_SELECTED_JOBS = 10;

  const state = {
    campaignName: '',
    jobs: [],
    selected: new Set(),
    busy: false,
    pollTimer: null
  };
  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      'renderCampaignName', 'loadRenderCampaign', 'renderRefresh', 'renderTotalCount',
      'renderDraftCount', 'renderActiveCount', 'renderCompletedCount', 'renderFailedCount',
      'renderJobList', 'renderJobsEmpty', 'selectDraftRenders', 'selectCompletedRenders',
      'clearRenderSelection', 'launchSelectedRenders', 'stageSelectedRenders',
      'renderSelectionCount', 'message', 'refreshQueue'
    ].forEach((id) => { elements[id] = byId(id); });
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function showMessage(text, type = 'info') {
    if (!elements.message) return;
    elements.message.hidden = !text;
    elements.message.textContent = text || '';
    elements.message.dataset.type = type;
  }

  function formatError(error) {
    if (!error) return 'An unknown error occurred.';
    if (error.status === 401 || error.message === 'unauthorized') {
      return 'The Social Factory token is missing or incorrect. Use the current DEV token and try again.';
    }
    const details = error.details || {};
    if (details.selected_jobs && details.maximum_jobs) {
      return `This campaign has ${details.selected_jobs} jobs. Select no more than ${details.maximum_jobs} jobs at a time.`;
    }
    const detail = details.downstream_error || details.status || details.job_ids?.join(', ');
    return detail ? `${error.message}: ${detail}` : String(error.message || error);
  }

  async function api(path, options = {}) {
    const token = getToken();
    if (!token) {
      const error = new Error('unauthorized');
      error.status = 401;
      throw error;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'x-admin-token': token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
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

  function setBusy(value) {
    state.busy = Boolean(value);
    [
      elements.loadRenderCampaign,
      elements.renderRefresh,
      elements.selectDraftRenders,
      elements.selectCompletedRenders,
      elements.clearRenderSelection,
      elements.launchSelectedRenders,
      elements.stageSelectedRenders
    ].forEach((button) => {
      if (button) button.disabled = state.busy;
    });
    updateActionButtons();
  }

  function statusLabel(value) {
    return String(value || 'unknown')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function selectedJobs() {
    return state.jobs.filter((job) => state.selected.has(job.id));
  }

  function updateActionButtons() {
    const selected = selectedJobs();
    const draftCount = selected.filter((job) => job.status === 'draft').length;
    const completedCount = selected.filter((job) => job.status === 'completed').length;
    elements.renderSelectionCount.textContent = `${selected.length} selected`;
    elements.launchSelectedRenders.disabled = state.busy || draftCount === 0;
    elements.stageSelectedRenders.disabled = state.busy || completedCount === 0;
  }

  function updateCounts(counts = {}) {
    elements.renderTotalCount.textContent = Number(counts.total || 0);
    elements.renderDraftCount.textContent = Number(counts.draft || 0);
    elements.renderActiveCount.textContent = Number(counts.active || 0);
    elements.renderCompletedCount.textContent = Number(counts.completed || 0);
    elements.renderFailedCount.textContent = Number(counts.failed || 0);
  }

  function createJobCard(job) {
    const row = document.createElement('article');
    row.className = 'sf-render-job';
    row.dataset.jobId = job.id;
    row.setAttribute('aria-selected', String(state.selected.has(job.id)));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(job.id);
    checkbox.setAttribute('aria-label', `Select ${job.song_title || job.batch_name || job.id}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && state.selected.size >= MAX_SELECTED_JOBS) {
        checkbox.checked = false;
        showMessage(`Select no more than ${MAX_SELECTED_JOBS} jobs at a time.`, 'error');
        return;
      }
      if (checkbox.checked) state.selected.add(job.id);
      else state.selected.delete(job.id);
      row.setAttribute('aria-selected', String(checkbox.checked));
      updateActionButtons();
    });

    const copy = document.createElement('div');
    copy.className = 'sf-render-job-copy';
    const title = document.createElement('strong');
    title.textContent = job.song_title || job.batch_name || job.song_key || 'Untitled Render';
    const meta = document.createElement('span');
    meta.textContent = [
      job.artist,
      job.duration_seconds ? `${job.duration_seconds} sec` : job.duration_mode,
      job.aspect_ratio,
      job.width && job.height ? `${job.width} × ${job.height}` : ''
    ].filter(Boolean).join(' · ');
    const detail = document.createElement('small');
    detail.textContent = job.error_message || job.output_filename || `Job ${job.id}`;
    copy.append(title, meta, detail);

    const status = document.createElement('span');
    status.className = 'sf-render-status';
    status.dataset.status = job.status || 'unknown';
    status.textContent = statusLabel(job.status);

    row.append(checkbox, copy, status);
    return row;
  }

  function renderJobs(payload) {
    state.jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const validIds = new Set(state.jobs.map((job) => job.id));
    state.selected = new Set([...state.selected].filter((id) => validIds.has(id)));
    state.campaignName = payload.campaign_name || state.campaignName;
    if (state.campaignName) elements.renderCampaignName.value = state.campaignName;

    updateCounts(payload.counts);
    elements.renderJobList.replaceChildren();
    state.jobs.forEach((job) => elements.renderJobList.appendChild(createJobCard(job)));
    elements.renderJobsEmpty.hidden = state.jobs.length > 0;
    updateActionButtons();
    configurePolling();
  }

  function configurePolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (!state.jobs.some((job) => ACTIVE_STATUSES.has(job.status))) return;
    state.pollTimer = window.setInterval(() => {
      if (!state.busy && state.campaignName) loadJobs({ quiet: true });
    }, 15000);
  }

  async function loadJobs({ quiet = false, campaignName = '' } = {}) {
    const name = String(campaignName || elements.renderCampaignName.value || '').trim();
    if (!name) {
      showMessage('Enter a campaign name to load its Video Factory jobs.', 'error');
      return;
    }
    if (state.busy) return;

    setBusy(true);
    if (!quiet) showMessage('Loading Video Factory jobs for this campaign…');
    try {
      state.campaignName = name;
      const payload = await api(`/social/orchestration/batch-jobs?campaign_name=${encodeURIComponent(name)}`);
      renderJobs(payload);
      if (!quiet) {
        showMessage(
          `${payload.job_count} Video Factory job${payload.job_count === 1 ? '' : 's'} loaded. Nothing was rendered or published by this refresh.`,
          'success'
        );
      }
    } catch (error) {
      if (!quiet) showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function selectByStatus(status) {
    state.selected.clear();
    state.jobs
      .filter((job) => job.status === status)
      .slice(0, MAX_SELECTED_JOBS)
      .forEach((job) => state.selected.add(job.id));
    renderJobs({
      campaign_name: state.campaignName,
      jobs: state.jobs,
      counts: {
        total: state.jobs.length,
        draft: state.jobs.filter((job) => job.status === 'draft').length,
        active: state.jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length,
        completed: state.jobs.filter((job) => job.status === 'completed').length,
        failed: state.jobs.filter((job) => ['failed', 'cancelled'].includes(job.status)).length
      }
    });
  }

  async function launchSelected() {
    if (state.busy) return;
    const ids = selectedJobs().filter((job) => job.status === 'draft').map((job) => job.id);
    if (!ids.length) return;

    setBusy(true);
    showMessage('Validating the selected render launch…');
    try {
      const validation = await api('/social/orchestration/batch-launch', {
        job_ids: ids
      }, { method: 'POST' });
      const count = Number(validation.would_launch_count || 0);
      if (!count) {
        showMessage('No selected draft jobs are available to launch.', 'error');
        return;
      }

      const approved = window.confirm(
        `Launch ${count} Video Factory render${count === 1 ? '' : 's'} now?\n\nThis starts paid AWS rendering work. It does not publish anything to YouTube.`
      );
      if (!approved) {
        showMessage('Render launch cancelled. No jobs were changed.');
        return;
      }

      const result = await api('/social/orchestration/batch-launch', {
        job_ids: ids,
        confirm_render_batch: true
      }, { method: 'POST' });
      state.selected.clear();
      showMessage(
        `${Number(result.launched_job_count || 0)} render${Number(result.launched_job_count || 0) === 1 ? '' : 's'} launched. ${Number(result.failed_job_count || 0)} failed to launch. Nothing was published.`,
        result.failed_job_count ? 'error' : 'success'
      );
      await loadJobs({ quiet: true });
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function stageSelected() {
    if (state.busy) return;
    const ids = selectedJobs().filter((job) => job.status === 'completed').map((job) => job.id);
    if (!ids.length) return;

    setBusy(true);
    showMessage('Validating completed renders for Content Review…');
    try {
      const validation = await api('/social/orchestration/batch-stage', {
        job_ids: ids
      }, { method: 'POST' });
      const count = Number(validation.would_stage_count || 0);
      if (!count) {
        showMessage('No selected completed renders are available for staging.', 'error');
        return;
      }

      const approved = window.confirm(
        `Move ${count} completed render${count === 1 ? '' : 's'} into Social Factory Content Review?\n\nFiles move server-to-server. Metadata will be prepared. Nothing will be published to YouTube.`
      );
      if (!approved) {
        showMessage('Content Review staging cancelled. No files were moved.');
        return;
      }

      const result = await api('/social/orchestration/batch-stage', {
        job_ids: ids,
        confirm_stage_batch: true
      }, { method: 'POST' });
      state.selected.clear();
      const staged = Number(result.staged_job_count || 0);
      showMessage(
        `${staged} render${staged === 1 ? '' : 's'} moved into Content Review. ${Number(result.failed_job_count || 0)} failed to stage. Nothing was published.`,
        result.failed_job_count ? 'error' : 'success'
      );
      await loadJobs({ quiet: true });
      elements.refreshQueue?.click();
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    elements.loadRenderCampaign.addEventListener('click', () => loadJobs());
    elements.renderRefresh.addEventListener('click', () => loadJobs());
    elements.renderCampaignName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadJobs();
      }
    });
    elements.selectDraftRenders.addEventListener('click', () => selectByStatus('draft'));
    elements.selectCompletedRenders.addEventListener('click', () => selectByStatus('completed'));
    elements.clearRenderSelection.addEventListener('click', () => {
      state.selected.clear();
      renderJobs({
        campaign_name: state.campaignName,
        jobs: state.jobs,
        counts: {
          total: state.jobs.length,
          draft: state.jobs.filter((job) => job.status === 'draft').length,
          active: state.jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length,
          completed: state.jobs.filter((job) => job.status === 'completed').length,
          failed: state.jobs.filter((job) => ['failed', 'cancelled'].includes(job.status)).length
        }
      });
    });
    elements.launchSelectedRenders.addEventListener('click', launchSelected);
    elements.stageSelectedRenders.addEventListener('click', stageSelected);

    window.addEventListener('socialfactory:drafts-created', (event) => {
      const campaignName = String(event.detail?.campaignName || '').trim();
      if (!campaignName) return;
      elements.renderCampaignName.value = campaignName;
      loadJobs({ campaignName });
    });
  }

  function init() {
    cacheElements();
    if (!elements.renderJobList) return;
    bindEvents();
    updateCounts();
    updateActionButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
