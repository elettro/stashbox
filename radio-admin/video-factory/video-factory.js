(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const JOBS_URL = `${API_ROOT}/admin/video-factory/jobs`;
  const SUMMARY_URL = `${API_ROOT}/admin/video-factory/summary`;
  const SONGS_URL = `${API_ROOT}/admin/songs`;
  const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';
  const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);

  const state = {
    songs: [],
    jobs: [],
    summary: {},
    pollTimer: null,
    actionJobId: ''
  };

  const els = {
    adminToken: document.getElementById('adminToken'),
    saveToken: document.getElementById('saveToken'),
    clearToken: document.getElementById('clearToken'),
    form: document.getElementById('renderForm'),
    createDraftButton: document.getElementById('createDraftButton'),
    songKey: document.getElementById('songKey'),
    songStatus: document.getElementById('songStatus'),
    clientName: document.getElementById('clientName'),
    projectName: document.getElementById('projectName'),
    batchName: document.getElementById('batchName'),
    durationMode: document.getElementById('durationMode'),
    durationSecondsLabel: document.getElementById('durationSecondsLabel'),
    durationSeconds: document.getElementById('durationSeconds'),
    aspectRatio: document.getElementById('aspectRatio'),
    fps: document.getElementById('fps'),
    introEnabled: document.getElementById('introEnabled'),
    outroEnabled: document.getElementById('outroEnabled'),
    cornerBugEnabled: document.getElementById('cornerBugEnabled'),
    includeArtist: document.getElementById('includeArtist'),
    includeSong: document.getElementById('includeSong'),
    includeAlbum: document.getElementById('includeAlbum'),
    filenameTemplate: document.getElementById('filenameTemplate'),
    filenamePreview: document.getElementById('filenamePreview'),
    message: document.getElementById('message'),
    refreshHistory: document.getElementById('refreshHistory'),
    historySearch: document.getElementById('historySearch'),
    historyStatus: document.getElementById('historyStatus'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    totalJobs: document.getElementById('totalJobs'),
    draftJobs: document.getElementById('draftJobs'),
    activeJobs: document.getElementById('activeJobs'),
    completedJobs: document.getElementById('completedJobs'),
    failedJobs: document.getElementById('failedJobs')
  };

  function getToken() {
    return String(localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim();
  }

  function headers(includeJson = false) {
    const token = getToken();
    const result = {};
    if (token) result['x-admin-token'] = token;
    if (includeJson) result['Content-Type'] = 'application/json';
    return result;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Request failed with status ${response.status}.`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function showMessage(text, isError = false) {
    els.message.textContent = text;
    els.message.classList.toggle('error', isError);
    els.message.classList.remove('hidden');
  }

  function clearMessage() {
    els.message.classList.add('hidden');
    els.message.textContent = '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slug(value, fallback) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  }

  function selectedSong() {
    return state.songs.find(song => String(song.song_key) === String(els.songKey.value)) || {};
  }

  function currentDurationLabel() {
    if (els.durationMode.value === 'full') return 'full-song';
    const seconds = Number(els.durationSeconds.value || 30);
    return `${Math.round(seconds)}s`;
  }

  function previewFilename() {
    const song = selectedSong();
    const ratio = els.aspectRatio.value;
    const dimensions = {
      '16:9': '1920x1080',
      '9:16': '1080x1920',
      '3:4': '1080x1440',
      '1:1': '1080x1080'
    };
    const tokens = {
      artist: slug(song.artist, 'artist'),
      song: slug(song.display_title || song.song_name || song.song_key, 'song'),
      album: slug(song.album_name, 'single'),
      duration: currentDurationLabel(),
      aspect: ratio.replace(':', 'x'),
      resolution: dimensions[ratio] || '1920x1080',
      variation: '01',
      date: new Date().toISOString().slice(0, 10),
      jobId: 'job-id'
    };
    const template = els.filenameTemplate.value || '{artist}_{song}_{duration}_{aspect}_v{variation}';
    const rendered = template
      .replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) => tokens[token] ?? '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/[-_]{2,}/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '') || 'stashbox-video';
    els.filenamePreview.textContent = rendered.toLowerCase().endsWith('.mp4') ? rendered : `${rendered}.mp4`;
  }

  function updateDurationControls() {
    const isFull = els.durationMode.value === 'full';
    els.durationSecondsLabel.classList.toggle('hidden', isFull);
    if (els.durationMode.value === 'promo') els.durationSeconds.value = '30';
    previewFilename();
  }

  async function loadSongs() {
    els.songStatus.textContent = 'Loading songs…';
    try {
      const body = await fetchJson(SONGS_URL, { headers: headers() });
      state.songs = Array.isArray(body.songs) ? body.songs : Array.isArray(body) ? body : [];
      state.songs.sort((a, b) => {
        const left = `${a.artist || ''} ${a.display_title || a.song_name || ''}`.toLowerCase();
        const right = `${b.artist || ''} ${b.display_title || b.song_name || ''}`.toLowerCase();
        return left.localeCompare(right);
      });
      els.songKey.innerHTML = '<option value="">Select a song…</option>' + state.songs.map(song => {
        const title = song.display_title || song.song_name || song.song_key;
        return `<option value="${escapeHtml(song.song_key)}">${escapeHtml(song.artist || 'Unknown Artist')} · ${escapeHtml(title)}</option>`;
      }).join('');
      els.songStatus.textContent = `${state.songs.length} songs available`;
      previewFilename();
    } catch (error) {
      els.songStatus.textContent = 'Song load failed';
      showMessage(error.message, true);
    }
  }

  function renderSummary() {
    const activeCount = Number(state.summary.active_jobs || state.jobs.filter(job => ACTIVE_STATUSES.has(job.status)).length || 0);
    els.totalJobs.textContent = Number(state.summary.total_jobs || state.jobs.length || 0);
    els.draftJobs.textContent = Number(state.summary.draft_jobs || state.jobs.filter(job => job.status === 'draft').length || 0);
    els.activeJobs.textContent = activeCount;
    els.completedJobs.textContent = Number(state.summary.completed_jobs || state.jobs.filter(job => job.status === 'completed').length || 0);
    els.failedJobs.textContent = Number(state.summary.failed_jobs || state.jobs.filter(job => job.status === 'failed').length || 0);
  }

  function formatDate(value) {
    if (!value) return 'No date';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function progressFor(job) {
    const runtime = job.render_recipe?.runtime || {};
    const progress = Number(runtime.progress_percent);
    return {
      percent: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : (job.status === 'completed' ? 100 : 0),
      message: String(runtime.status_message || '').trim()
    };
  }

  function actionButtons(job) {
    const busy = state.actionJobId === job.id;
    if (job.status === 'completed') {
      return `
        <button class="vf-small-button" type="button" data-job-action="preview" data-job-id="${escapeHtml(job.id)}" ${busy ? 'disabled' : ''}>Preview</button>
        <button class="vf-small-button" type="button" data-job-action="download" data-job-id="${escapeHtml(job.id)}" ${busy ? 'disabled' : ''}>Download MP4</button>`;
    }
    if (ACTIVE_STATUSES.has(job.status)) {
      return `<button class="vf-small-button vf-danger-button" type="button" data-job-action="cancel" data-job-id="${escapeHtml(job.id)}" ${busy ? 'disabled' : ''}>Cancel Render</button>`;
    }
    if (['draft', 'failed', 'cancelled'].includes(job.status)) {
      const label = job.status === 'draft' ? 'Render Now' : 'Retry Render';
      const action = job.status === 'draft' ? 'render' : 'retry';
      return `<button class="vf-small-button vf-primary-action" type="button" data-job-action="${action}" data-job-id="${escapeHtml(job.id)}" ${busy ? 'disabled' : ''}>${label}</button>`;
    }
    return '';
  }

  function renderHistory() {
    const query = els.historySearch.value.trim().toLowerCase();
    const status = els.historyStatus.value;
    const jobs = state.jobs.filter(job => {
      if (status !== 'all' && job.status !== status) return false;
      if (!query) return true;
      return [
        job.song_title,
        job.artist,
        job.client_name,
        job.project_name,
        job.batch_name,
        job.output_filename,
        job.song_key
      ].join(' ').toLowerCase().includes(query);
    });

    els.historyEmpty.classList.toggle('hidden', jobs.length > 0);
    els.historyList.innerHTML = jobs.map(job => {
      const duration = job.duration_mode === 'full' ? 'Full Song' : `${job.duration_seconds || 0}s`;
      const progress = progressFor(job);
      const errorBlock = job.error_message
        ? `<div class="vf-job-error">${escapeHtml(job.error_message)}</div>`
        : '';
      const progressBlock = ACTIVE_STATUSES.has(job.status) || progress.percent > 0
        ? `<div class="vf-progress-wrap" aria-label="Render progress ${progress.percent}%">
             <div class="vf-progress-track"><span style="width:${progress.percent}%"></span></div>
             <div class="vf-progress-meta"><span>${escapeHtml(progress.message || job.status)}</span><strong>${progress.percent}%</strong></div>
           </div>`
        : '';
      return `
        <article class="vf-job-card">
          <div class="vf-job-header">
            <div>
              <h3 class="vf-job-title">${escapeHtml(job.artist || 'Unknown Artist')} · ${escapeHtml(job.song_title || job.song_key)}</h3>
              <div class="vf-job-meta">${escapeHtml(job.client_name || 'Stashbox')} · ${escapeHtml(job.project_name || job.batch_name || 'Video Factory')} · ${escapeHtml(formatDate(job.created_at))}</div>
            </div>
            <span class="vf-badge status-${escapeHtml(job.status)}">${escapeHtml(job.status || 'draft')}</span>
          </div>
          <div class="vf-badges">
            <span class="vf-badge">${escapeHtml(duration)}</span>
            <span class="vf-badge">${escapeHtml(job.aspect_ratio)}</span>
            <span class="vf-badge">${escapeHtml(`${job.width}×${job.height}`)}</span>
            <span class="vf-badge">${escapeHtml(`${job.fps} FPS`)}</span>
          </div>
          <div class="vf-preview">${escapeHtml(job.output_filename)}</div>
          ${progressBlock}
          ${errorBlock}
          <div class="vf-actions">
            ${actionButtons(job)}
            <button class="vf-small-button" type="button" data-job-action="copy" data-job-id="${escapeHtml(job.id)}">Copy Job ID</button>
          </div>
        </article>`;
    }).join('');

    els.historyList.querySelectorAll('[data-job-action]').forEach(button => {
      button.addEventListener('click', () => handleJobAction(button.dataset.jobId, button.dataset.jobAction));
    });
  }

  function schedulePolling() {
    if (state.pollTimer) window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
    if (state.jobs.some(job => ACTIVE_STATUSES.has(job.status))) {
      state.pollTimer = window.setTimeout(() => loadHistory({ silent: true }), 8000);
    }
  }

  async function loadHistory(options = {}) {
    try {
      const [jobsBody, summaryBody] = await Promise.all([
        fetchJson(JOBS_URL, { headers: headers() }),
        fetchJson(SUMMARY_URL, { headers: headers() })
      ]);
      state.jobs = Array.isArray(jobsBody.jobs) ? jobsBody.jobs : [];
      state.summary = summaryBody.summary || {};
      renderSummary();
      renderHistory();
      schedulePolling();
    } catch (error) {
      state.jobs = [];
      state.summary = {};
      renderSummary();
      renderHistory();
      if (!options.silent) showMessage(error.message, true);
    }
  }

  async function openSignedAsset(jobId, action) {
    const body = await fetchJson(`${JOBS_URL}/${encodeURIComponent(jobId)}/${action}`, { headers: headers() });
    if (!body.url) throw new Error('The signed file URL was not returned.');
    if (action === 'download') {
      const anchor = document.createElement('a');
      anchor.href = body.url;
      anchor.rel = 'noopener';
      anchor.click();
      return;
    }
    window.open(body.url, '_blank', 'noopener');
  }

  async function handleJobAction(jobId, action) {
    if (!jobId || !action) return;
    if (action === 'copy') {
      await navigator.clipboard.writeText(jobId);
      showMessage('Job ID copied.');
      return;
    }

    clearMessage();
    state.actionJobId = jobId;
    renderHistory();
    try {
      if (action === 'preview' || action === 'download') {
        await openSignedAsset(jobId, action);
      } else {
        const body = await fetchJson(`${JOBS_URL}/${encodeURIComponent(jobId)}/${action}`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({})
        });
        showMessage(body.message || `Job action ${action} completed.`);
      }
      await loadHistory({ silent: true });
    } catch (error) {
      const activeHint = error.body?.active_job_id ? ` Active job: ${error.body.active_job_id}` : '';
      showMessage(`${error.message}${activeHint}`, true);
    } finally {
      state.actionJobId = '';
      renderHistory();
    }
  }

  function buildPayload() {
    return {
      song_key: els.songKey.value,
      client_name: els.clientName.value.trim(),
      project_name: els.projectName.value.trim(),
      batch_name: els.batchName.value.trim(),
      duration_mode: els.durationMode.value,
      duration_seconds: els.durationMode.value === 'full' ? null : Number(els.durationSeconds.value || 30),
      aspect_ratio: els.aspectRatio.value,
      fps: Number(els.fps.value),
      intro_enabled: els.introEnabled.checked,
      outro_enabled: els.outroEnabled.checked,
      corner_bug_enabled: els.cornerBugEnabled.checked,
      include_artist: els.includeArtist.checked,
      include_song: els.includeSong.checked,
      include_album: els.includeAlbum.checked,
      filename_template: els.filenameTemplate.value.trim()
    };
  }

  async function createDraft(event) {
    event.preventDefault();
    clearMessage();
    if (!getToken()) {
      showMessage('Save the DEV admin token before creating a render draft.', true);
      return;
    }
    if (!els.songKey.value) {
      showMessage('Select a song.', true);
      return;
    }

    els.createDraftButton.disabled = true;
    els.createDraftButton.textContent = 'Creating…';
    try {
      const body = await fetchJson(JOBS_URL, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(buildPayload())
      });
      showMessage(`${body.message || 'Render draft created.'} Use Render Now in Render History.`);
      await loadHistory();
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      els.createDraftButton.disabled = false;
      els.createDraftButton.textContent = 'Create Render Draft';
    }
  }

  function saveToken() {
    const value = els.adminToken.value.trim();
    if (!value) {
      showMessage('Paste an admin token before saving.', true);
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, value);
    showMessage('DEV admin token saved in this browser.');
    Promise.all([loadSongs(), loadHistory()]);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    els.adminToken.value = '';
    showMessage('DEV admin token cleared.');
  }

  function bindEvents() {
    els.saveToken.addEventListener('click', saveToken);
    els.clearToken.addEventListener('click', clearToken);
    els.form.addEventListener('submit', createDraft);
    els.refreshHistory.addEventListener('click', () => loadHistory());
    els.historySearch.addEventListener('input', renderHistory);
    els.historyStatus.addEventListener('change', renderHistory);
    [
      els.songKey,
      els.durationMode,
      els.durationSeconds,
      els.aspectRatio,
      els.filenameTemplate
    ].forEach(element => element.addEventListener('input', previewFilename));
    els.durationMode.addEventListener('change', updateDurationControls);
    window.addEventListener('beforeunload', () => {
      if (state.pollTimer) window.clearTimeout(state.pollTimer);
    });
  }

  async function init() {
    const token = getToken();
    if (token) els.adminToken.value = token;
    bindEvents();
    updateDurationControls();
    await loadSongs();
    await loadHistory();
  }

  init();
})();
