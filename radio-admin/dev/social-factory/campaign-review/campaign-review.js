(() => {
  'use strict';

  const API = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const PENDING_KEY = 'stashbox_social_factory_campaign_regenerations_v1';
  const ACTIVE_RENDER_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading', 'queued', 'processing']);
  const COMPLETE_RENDER_STATUSES = new Set(['completed', 'complete', 'ready', 'succeeded']);
  const FAILURE_RENDER_STATUSES = new Set(['failed', 'cancelled', 'canceled']);
  const qs = new URLSearchParams(location.search);
  const requestedCampaign = clean(qs.get('campaign_id') || qs.get('campaign'));
  const state = {
    items: [],
    campaigns: [],
    campaignId: requestedCampaign,
    selected: new Set(),
    busy: new Set(),
    pending: loadPending(),
    refreshTimer: null,
    pendingTimer: null,
    loading: false
  };

  const $ = (id) => document.getElementById(id);

  function clean(value) { return String(value || '').trim(); }
  function lower(value, fallback = '') { return clean(value || fallback).toLowerCase(); }
  function label(value) { return clean(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
  function token() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; }
  function message(text, type = 'info') { $('message').textContent = text; $('message').dataset.type = type; }
  function itemTime(item) { const date = new Date(item?.created_at || item?.updated_at || 0); return Number.isNaN(date.getTime()) ? 0 : date.getTime(); }
  function title(item) { return clean(item?.song?.title || item?.song_title || item?.metadata?.selected_title || 'Untitled video'); }
  function artist(item) { return clean(item?.song?.artist || item?.artist || 'Unknown artist'); }
  function ratio(item) { return clean(item?.video?.aspect_ratio || item?.aspect_ratio || item?.source?.aspect_ratio || '16:9'); }
  function durationSeconds(item) { const value = Number(item?.video?.duration_seconds ?? item?.duration_seconds ?? item?.source?.duration_seconds); return Number.isFinite(value) && value > 0 ? value : 0; }
  function duration(item) { const seconds = durationSeconds(item); return seconds ? `${Math.round(seconds)} sec` : 'Duration pending'; }
  function reviewStatus(item) { return lower(item?.status, 'in_review'); }
  function renderStatus(item) { return lower(item?.render_status || item?.video?.render_status || item?.source?.render_status || (item?.video?.object_key ? 'completed' : 'pending')); }
  function youtubeStatus(item) { return lower(item?.publishing_status, 'not_published'); }
  function renderJobId(item) { return clean(item?.source?.render_job_id || item?.render_job_id || item?.video?.render_job_id); }
  function campaignId(item) {
    return clean(
      item?.campaign_id || item?.campaign?.id || item?.source?.campaign_id ||
      item?.source?.render_batch_id || item?.render_batch_id || item?.video?.render_batch_id || item?.batch_id ||
      'uncategorized'
    );
  }
  function campaignName(item, id = campaignId(item)) {
    return clean(
      item?.campaign_name || item?.campaign?.name || item?.source?.campaign_name ||
      item?.source?.batch_name || item?.metadata?.campaign_name || item?.metadata?.batch_name
    ) || (id === 'uncategorized' ? 'Ungrouped Content' : `Campaign ${id}`);
  }
  function ratioCss(value) {
    const match = clean(value).match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    if (!match) return '16 / 9';
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? `${width} / ${height}` : '16 / 9';
  }
  function loadPending() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.jobId) : [];
    } catch { return []; }
  }
  function savePending() { localStorage.setItem(PENDING_KEY, JSON.stringify(state.pending)); }

  async function api(path, options = {}) {
    const savedToken = token();
    if (!savedToken) throw Object.assign(new Error('Save the Social Factory DEV token to load campaign items.'), { status: 401 });
    const response = await fetch(API + path, {
      cache: 'no-store',
      ...options,
      headers: {
        'x-admin-token': savedToken,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.details = payload.details;
      throw error;
    }
    return payload;
  }

  function buildCampaigns() {
    const grouped = new Map();
    for (const item of state.items) {
      const id = campaignId(item);
      if (!grouped.has(id)) grouped.set(id, { id, name: campaignName(item, id), items: [], newest: 0 });
      const group = grouped.get(id);
      group.items.push(item);
      group.newest = Math.max(group.newest, itemTime(item));
      if (group.name.startsWith('Campaign ') || group.name === 'Ungrouped Content') group.name = campaignName(item, id);
    }
    state.campaigns = [...grouped.values()].sort((left, right) => right.newest - left.newest || left.name.localeCompare(right.name));
    if (!state.campaignId || !grouped.has(state.campaignId)) state.campaignId = state.campaigns[0]?.id || '';
  }

  function campaignItems() { return state.items.filter((item) => campaignId(item) === state.campaignId); }
  function filteredItems() {
    const query = clean($('search').value).toLowerCase();
    const reviewFilter = $('reviewFilter').value;
    const ratioFilter = $('ratioFilter').value;
    return campaignItems().filter((item) => {
      const haystack = [title(item), artist(item), item?.id, renderJobId(item), campaignId(item)].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) &&
        (reviewFilter === 'all' || reviewStatus(item) === reviewFilter) &&
        (ratioFilter === 'all' || ratio(item) === ratioFilter);
    });
  }

  function updateCampaignPicker() {
    const select = $('campaignSelect');
    select.replaceChildren();
    if (!state.campaigns.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No campaigns found';
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    for (const campaign of state.campaigns) {
      const option = document.createElement('option');
      option.value = campaign.id;
      option.textContent = `${campaign.name} (${campaign.items.length})`;
      select.appendChild(option);
    }
    select.value = state.campaignId;
  }

  function updateUrl() {
    const url = new URL(location.href);
    if (state.campaignId) url.searchParams.set('campaign_id', state.campaignId);
    else url.searchParams.delete('campaign_id');
    history.replaceState({}, '', url);
  }

  function setSummary() {
    const items = campaignItems();
    const campaign = state.campaigns.find((entry) => entry.id === state.campaignId);
    $('campaignName').textContent = campaign?.name || 'Campaign Review';
    $('campaignId').textContent = state.campaignId || 'No campaign selected';
    const renderStatuses = items.map(renderStatus);
    const reviewStatuses = items.map(reviewStatus);
    $('mTotal').textContent = items.length;
    $('mComplete').textContent = renderStatuses.filter((status) => COMPLETE_RENDER_STATUSES.has(status)).length;
    $('mRendering').textContent = renderStatuses.filter((status) => ACTIVE_RENDER_STATUSES.has(status)).length + state.pending.filter((entry) => entry.campaignId === state.campaignId && !FAILURE_RENDER_STATUSES.has(lower(entry.status))).length;
    $('mFailed').textContent = renderStatuses.filter((status) => FAILURE_RENDER_STATUSES.has(status)).length + state.pending.filter((entry) => entry.campaignId === state.campaignId && FAILURE_RENDER_STATUSES.has(lower(entry.status))).length;
    $('mReview').textContent = reviewStatuses.filter((status) => status === 'in_review').length;
    $('mApproved').textContent = reviewStatuses.filter((status) => status === 'approved').length;
    $('mHeld').textContent = reviewStatuses.filter((status) => status === 'held').length;
    $('mHidden').textContent = reviewStatuses.filter((status) => status === 'hidden').length;
  }

  function button(text, className, handler, disabled = false) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = `btn ${className || ''}`.trim();
    control.textContent = text;
    control.disabled = disabled;
    control.addEventListener('click', handler);
    return control;
  }

  async function preview(item, box) {
    if (state.busy.has(item.id)) return;
    state.busy.add(item.id);
    box.innerHTML = '<div class="spinner"></div>';
    try {
      const payload = await api(`/social/review-items/${encodeURIComponent(item.id)}/preview?viewer=browser`, { method: 'POST', body: '{}' });
      if (!payload.preview_url) throw new Error('Secure browser preview URL was not returned.');
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = payload.preview_url;
      box.replaceChildren(video);
      window.setTimeout(() => {
        if (!video.isConnected) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
        box.innerHTML = '<div class="preview-copy">Preview expired. Select Preview Video again.</div>';
      }, Number(payload.expires_in_seconds || 900) * 1000);
    } catch (error) {
      box.innerHTML = `<div class="preview-copy">Preview unavailable: ${escapeHtml(error.message)}</div>`;
    } finally {
      state.busy.delete(item.id);
    }
  }

  async function applyDecision(item, decision, quiet = false) {
    const key = `decision:${item.id}`;
    if (state.busy.has(key)) return null;
    state.busy.add(key);
    if (!quiet) message(`${label(decision)} ${title(item)}.`, 'working');
    try {
      const payload = await api(`/social/review-items/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: `Campaign Review: ${decision}` })
      });
      const index = state.items.findIndex((entry) => entry.id === item.id);
      if (index >= 0 && payload.item) state.items[index] = payload.item;
      if (!quiet) message(`${title(item)} updated to ${label(decision)}. Nothing was published.`, 'success');
      return payload.item || null;
    } catch (error) {
      if (!quiet) message(`${label(decision)} failed for ${title(item)}: ${error.message}`, 'error');
      throw error;
    } finally {
      state.busy.delete(key);
    }
  }

  function boolValue(source, keys, fallback = false) {
    for (const key of keys) {
      if (source && source[key] !== undefined && source[key] !== null) return Boolean(source[key]);
    }
    return fallback;
  }

  function regenerationRecipe(item, job) {
    const seconds = Number(job?.duration_seconds ?? durationSeconds(item));
    const durationMode = clean(job?.duration_mode) || (Number.isFinite(seconds) && seconds > 0 ? 'custom' : 'full');
    return {
      song_key: clean(item?.song?.song_key || job?.song_key),
      batch_name: clean(job?.batch_name || item?.source?.batch_name || campaignName(item)) + ' Regenerate',
      client_name: clean(job?.client_name || 'Stashbox'),
      project_name: clean(job?.project_name || 'Social Factory'),
      campaign_name: campaignName(item),
      duration_mode: durationMode,
      ...(durationMode === 'full' ? {} : { duration_seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 30 }),
      aspect_ratio: clean(job?.aspect_ratio || ratio(item) || '9:16'),
      fps: Number(job?.fps || 30),
      intro_enabled: boolValue(job, ['intro_enabled'], false),
      outro_enabled: boolValue(job, ['outro_enabled'], false),
      corner_bug_enabled: boolValue(job, ['corner_bug_enabled'], false),
      include_artist: boolValue(job, ['include_artist'], false),
      include_song: boolValue(job, ['include_song'], false),
      include_album: boolValue(job, ['include_album'], false),
      filename_template: clean(job?.filename_template || '{artist}_{song}_{duration}_{aspect}_v{variation}'),
      metadata_comment: `Regenerated from Content Review item ${item.id}`
    };
  }

  async function regenerate(item, quiet = false) {
    const key = `regenerate:${item.id}`;
    if (state.busy.has(key)) return null;
    const sourceJobId = renderJobId(item);
    if (!sourceJobId) throw new Error('This review item does not contain a source render job ID.');
    state.busy.add(key);
    if (!quiet) message(`Preparing a replacement render for ${title(item)}.`, 'working');
    try {
      const original = await api(`/social/orchestration/render-jobs/${encodeURIComponent(sourceJobId)}`);
      const recipe = regenerationRecipe(item, original.job || {});
      if (!recipe.song_key) throw new Error('The source song key is missing.');
      const draft = await api('/social/orchestration/render-jobs', { method: 'POST', body: JSON.stringify(recipe) });
      const jobId = clean(draft?.job?.id || draft?.job?.job_id || draft?.job_id);
      if (!jobId) throw new Error('The replacement draft did not return a render job ID.');
      await api(`/social/orchestration/render-jobs/${encodeURIComponent(jobId)}/launch`, {
        method: 'POST',
        body: JSON.stringify({ confirm_render: true })
      });
      const pending = {
        reviewId: item.id,
        sourceJobId,
        jobId,
        title: title(item),
        campaignId: campaignId(item),
        campaignName: campaignName(item),
        status: 'rendering',
        createdAt: new Date().toISOString(),
        lastError: ''
      };
      state.pending = state.pending.filter((entry) => entry.reviewId !== item.id || FAILURE_RENDER_STATUSES.has(lower(entry.status)));
      state.pending.push(pending);
      savePending();
      try { await applyDecision(item, 'hold', true); } catch (_) { /* The replacement render still proceeds. */ }
      if (!quiet) message(`Replacement render ${jobId} started for ${title(item)}. The current item was placed on hold.`, 'success');
      render();
      pollPendingSoon();
      return pending;
    } catch (error) {
      if (!quiet) message(`Regeneration failed for ${title(item)}: ${error.message}`, 'error');
      throw error;
    } finally {
      state.busy.delete(key);
    }
  }

  function card(item) {
    const article = document.createElement('article');
    article.className = 'card';
    article.dataset.selected = String(state.selected.has(item.id));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'card-check';
    checkbox.checked = state.selected.has(item.id);
    checkbox.setAttribute('aria-label', `Select ${title(item)}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      article.dataset.selected = String(checkbox.checked);
      updateBulkControls();
    });

    const previewBox = document.createElement('div');
    previewBox.className = 'preview';
    previewBox.style.setProperty('--media-ratio', ratioCss(ratio(item)));
    previewBox.innerHTML = `<div class="preview-copy">Full ${escapeHtml(ratio(item))} secure preview loads here without cropping.</div><span class="ratio-note">${escapeHtml(ratio(item))}</span>`;

    const body = document.createElement('div');
    body.className = 'card-body';
    const titleNode = document.createElement('div');
    titleNode.className = 'title';
    titleNode.textContent = title(item);
    const artistNode = document.createElement('div');
    artistNode.className = 'artist';
    artistNode.textContent = artist(item);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const metadata = [
      [duration(item), ''],
      [ratio(item), ''],
      [label(renderStatus(item)), renderStatus(item)],
      [label(reviewStatus(item)), reviewStatus(item)],
      [youtubeStatus(item) === 'not_published' ? 'Not on YouTube' : label(youtubeStatus(item)), youtubeStatus(item)]
    ];
    for (const [text, status] of metadata) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = text;
      if (status) pill.dataset.status = status;
      meta.appendChild(pill);
    }

    const ids = document.createElement('div');
    ids.className = 'ids';
    ids.textContent = `Review: ${clean(item.id)}\nRender: ${renderJobId(item) || 'Unavailable'}\nCampaign: ${campaignId(item)}`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(
      button('Preview Video', 'primary', () => preview(item, previewBox)),
      button('Approve', '', async () => { await applyDecision(item, 'approve'); render(); }, reviewStatus(item) === 'approved'),
      button('Hold', 'warn', async () => { await applyDecision(item, 'hold'); render(); }, reviewStatus(item) === 'held'),
      button('Regenerate', '', async () => {
        if (!window.confirm(`Create and launch a replacement render for ${title(item)}? The current item will be placed on hold.`)) return;
        await regenerate(item);
      }),
      button('Hide', 'danger', async () => {
        if (!window.confirm(`Hide ${title(item)} from Content Review?`)) return;
        await applyDecision(item, 'hide');
        state.selected.delete(item.id);
        render();
      }, reviewStatus(item) === 'hidden')
    );

    body.append(titleNode, artistNode, meta, ids, actions);
    article.append(checkbox, previewBox, body);
    return article;
  }

  function renderGrid() {
    const grid = $('grid');
    grid.replaceChildren();
    const items = filteredItems();
    if (!items.length) {
      grid.innerHTML = '<div class="empty">No videos match this campaign and filter selection.</div>';
      return;
    }
    for (const item of items) grid.appendChild(card(item));
  }

  function renderPending() {
    const relevant = state.pending.filter((entry) => entry.campaignId === state.campaignId);
    $('regenPanel').hidden = relevant.length === 0;
    $('regenCount').textContent = `${relevant.length} active`;
    const list = $('regenList');
    list.replaceChildren();
    for (const entry of relevant) {
      const row = document.createElement('div');
      row.className = 'regen-row';
      const copy = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = entry.title || 'Replacement render';
      const detail = document.createElement('small');
      detail.textContent = `${entry.jobId} · ${label(entry.status || 'rendering')}${entry.lastError ? ` · ${entry.lastError}` : ''}`;
      copy.append(strong, detail);
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.dataset.status = lower(entry.status, 'rendering');
      pill.textContent = label(entry.status || 'rendering');
      row.append(copy, pill);
      list.appendChild(row);
    }
  }

  function updateBulkControls() {
    const count = state.selected.size;
    $('selectionCount').textContent = count;
    ['bulkApprove', 'bulkHold', 'bulkRegenerate', 'bulkHide'].forEach((id) => { $(id).disabled = count === 0; });
  }

  function render() {
    updateCampaignPicker();
    setSummary();
    renderPending();
    renderGrid();
    updateBulkControls();
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    message('Loading campaign review items.', 'working');
    try {
      const payload = await api('/social/review-items?limit=250');
      state.items = Array.isArray(payload.items) ? payload.items : [];
      buildCampaigns();
      state.selected = new Set([...state.selected].filter((id) => state.items.some((item) => item.id === id && campaignId(item) === state.campaignId)));
      updateUrl();
      render();
      const count = campaignItems().length;
      message(`${count} campaign video${count === 1 ? '' : 's'} loaded. Nothing on this page publishes content.`, 'success');
      scheduleRefresh();
      pollPendingSoon();
    } catch (error) {
      state.items = [];
      state.campaigns = [];
      render();
      message(error.message, 'error');
    } finally {
      state.loading = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    const active = campaignItems().some((item) => ACTIVE_RENDER_STATUSES.has(renderStatus(item))) || state.pending.some((entry) => !FAILURE_RENDER_STATUSES.has(lower(entry.status)));
    if (active) state.refreshTimer = window.setTimeout(load, 15000);
  }

  function pollPendingSoon() {
    clearTimeout(state.pendingTimer);
    if (state.pending.length) state.pendingTimer = window.setTimeout(pollPending, 2500);
  }

  async function pollPending() {
    if (!state.pending.length || !token()) return;
    let changed = false;
    for (const entry of [...state.pending]) {
      try {
        const payload = await api(`/social/orchestration/render-jobs/${encodeURIComponent(entry.jobId)}`);
        const job = payload.job || {};
        const status = lower(job.status, entry.status || 'rendering');
        entry.status = status;
        entry.lastError = '';
        changed = true;
        if (COMPLETE_RENDER_STATUSES.has(status) || job.ready_for_staging) {
          const staged = await api(`/social/orchestration/render-jobs/${encodeURIComponent(entry.jobId)}/stage`, {
            method: 'POST',
            body: JSON.stringify({
              confirm_stage: true,
              campaign_id: entry.campaignId,
              campaign_name: entry.campaignName,
              replacement_for_review_id: entry.reviewId
            })
          });
          if (staged.staged) {
            state.pending = state.pending.filter((candidate) => candidate.jobId !== entry.jobId);
            savePending();
            message(`Replacement render for ${entry.title} entered Content Review.`, 'success');
            await load();
            return;
          }
        }
      } catch (error) {
        entry.lastError = error.message;
        if (error.status === 404) entry.status = 'failed';
        changed = true;
      }
    }
    if (changed) savePending();
    renderPending();
    setSummary();
    if (state.pending.some((entry) => !FAILURE_RENDER_STATUSES.has(lower(entry.status)))) {
      state.pendingTimer = window.setTimeout(pollPending, 15000);
    }
  }

  async function runBulkDecision(decision) {
    const items = campaignItems().filter((item) => state.selected.has(item.id));
    if (!items.length) return;
    if (!window.confirm(`${label(decision)} ${items.length} selected video${items.length === 1 ? '' : 's'}?`)) return;
    message(`${label(decision)} ${items.length} selected videos.`, 'working');
    let completed = 0;
    const failures = [];
    for (const item of items) {
      try { await applyDecision(item, decision, true); completed += 1; }
      catch (error) { failures.push(`${title(item)}: ${error.message}`); }
    }
    state.selected.clear();
    render();
    if (failures.length) message(`${completed} updated. ${failures.length} failed. ${failures.join(' | ')}`, 'error');
    else message(`${completed} selected videos updated to ${label(decision)}. Nothing was published.`, 'success');
  }

  async function runBulkRegenerate() {
    const items = campaignItems().filter((item) => state.selected.has(item.id));
    if (!items.length) return;
    if (!window.confirm(`Create and launch replacement renders for ${items.length} selected video${items.length === 1 ? '' : 's'}? Current review items will be placed on hold.`)) return;
    message(`Starting ${items.length} replacement renders.`, 'working');
    let completed = 0;
    const failures = [];
    for (const item of items) {
      try { await regenerate(item, true); completed += 1; }
      catch (error) { failures.push(`${title(item)}: ${error.message}`); }
    }
    state.selected.clear();
    render();
    if (failures.length) message(`${completed} replacement renders started. ${failures.length} failed. ${failures.join(' | ')}`, 'error');
    else message(`${completed} replacement renders started. Current review items were placed on hold.`, 'success');
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  }

  $('saveToken').addEventListener('click', () => {
    const savedToken = clean($('token').value);
    if (!savedToken) return message('Paste the DEV admin token first.', 'error');
    localStorage.setItem(TOKEN_KEY, savedToken);
    sessionStorage.setItem(TOKEN_KEY, savedToken);
    $('token').value = '';
    load();
  });
  $('clearToken').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    state.items = [];
    state.campaigns = [];
    state.selected.clear();
    render();
    message('Saved token cleared.');
  });
  $('refresh').addEventListener('click', load);
  $('campaignSelect').addEventListener('change', () => {
    state.campaignId = $('campaignSelect').value;
    state.selected.clear();
    updateUrl();
    render();
    scheduleRefresh();
  });
  $('search').addEventListener('input', renderGrid);
  $('reviewFilter').addEventListener('change', renderGrid);
  $('ratioFilter').addEventListener('change', renderGrid);
  $('clearFilters').addEventListener('click', () => {
    $('search').value = '';
    $('reviewFilter').value = 'all';
    $('ratioFilter').value = 'all';
    renderGrid();
  });
  $('selectVisible').addEventListener('click', () => {
    filteredItems().forEach((item) => state.selected.add(item.id));
    renderGrid();
    updateBulkControls();
  });
  $('clearSelection').addEventListener('click', () => { state.selected.clear(); renderGrid(); updateBulkControls(); });
  $('bulkApprove').addEventListener('click', () => runBulkDecision('approve'));
  $('bulkHold').addEventListener('click', () => runBulkDecision('hold'));
  $('bulkHide').addEventListener('click', () => runBulkDecision('hide'));
  $('bulkRegenerate').addEventListener('click', runBulkRegenerate);
  window.addEventListener('focus', () => { if (token()) load(); });

  render();
  if (token()) load();
  else message('Save the Social Factory DEV token to load the campaign review page.');
})();
