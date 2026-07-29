(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const state = {
    plan: null,
    payload: null,
    busy: false,
    selectionMode: 'automatic',
    candidates: [],
    candidatesLoaded: false,
    loadingCandidates: false,
    selectedSongKeys: new Set()
  };
  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      'campaignForm', 'campaignName', 'campaignSongCount', 'campaignVariations',
      'campaignDuration', 'campaignRatio', 'campaignGenre', 'campaignArtist',
      'campaignRequireVisuals', 'planCampaign', 'createCampaignDrafts',
      'campaignPlan', 'campaignPlanSummary', 'campaignPlanId', 'campaignPlanList',
      'message', 'saveToken', 'clearToken', 'tokenStatus'
    ].forEach((id) => { elements[id] = byId(id); });
  }

  function installSongPicker() {
    const requireVisualsLabel = elements.campaignRequireVisuals?.closest('label');
    if (!elements.campaignForm || !requireVisualsLabel || byId('campaignSongPicker')) return;

    const picker = document.createElement('section');
    picker.id = 'campaignSongPicker';
    picker.className = 'sf-song-picker';
    picker.setAttribute('aria-labelledby', 'campaignSongPickerTitle');
    picker.innerHTML = `
      <div class="sf-song-picker-head">
        <div>
          <strong id="campaignSongPickerTitle">Song Selection</strong>
          <span id="campaignSongModeHelp">Automatic mode chooses the highest-ranked eligible songs.</span>
        </div>
        <div class="sf-song-mode" role="group" aria-label="Campaign song selection mode">
          <button id="campaignModeAutomatic" class="sf-song-mode-button is-active" type="button" aria-pressed="true">Automatic</button>
          <button id="campaignModeSpecific" class="sf-song-mode-button" type="button" aria-pressed="false">Pick Specific Songs</button>
        </div>
      </div>
      <div id="campaignSpecificSongs" class="sf-specific-songs" hidden>
        <div class="sf-song-picker-toolbar">
          <input id="campaignSongSearch" type="search" placeholder="Search song title, artist, genre, or song key" autocomplete="off" />
          <span id="campaignSongSelectedCount" class="sf-mini-pill">0 selected</span>
          <button id="campaignReloadSongs" class="sf-button sf-button-secondary" type="button">Reload Songs</button>
        </div>
        <div id="campaignSongList" class="sf-song-list" role="group" aria-label="Specific songs"></div>
        <p id="campaignSongEmpty" class="sf-song-empty" hidden>No matching eligible songs were found.</p>
      </div>
    `;

    elements.campaignForm.insertBefore(picker, requireVisualsLabel);
    [
      'campaignSongPicker', 'campaignSongModeHelp', 'campaignModeAutomatic',
      'campaignModeSpecific', 'campaignSpecificSongs', 'campaignSongSearch',
      'campaignSongSelectedCount', 'campaignReloadSongs', 'campaignSongList',
      'campaignSongEmpty'
    ].forEach((id) => { elements[id] = byId(id); });
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function migrateLegacyToken() {
    const legacy = localStorage.getItem(TOKEN_KEY) || '';
    if (legacy && !getToken()) sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
    if (elements.tokenStatus) {
      elements.tokenStatus.textContent = getToken()
        ? 'Available until this tab closes'
        : 'Not saved in this tab';
    }
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
    const detail = error.details?.downstream_error || error.details?.song_keys?.join(', ');
    return detail ? `${error.message}: ${detail}` : String(error.message || error);
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

  async function apiGet(path) {
    const token = getToken();
    if (!token) {
      const error = new Error('unauthorized');
      error.status = 401;
      throw error;
    }

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

  function maxSpecificSongs() {
    const variations = Math.max(1, Number(elements.campaignVariations?.value || 1));
    return Math.min(10, Math.floor(20 / variations));
  }

  function specificSelectionValid() {
    if (state.selectionMode !== 'specific') return true;
    return state.selectedSongKeys.size > 0 && state.selectedSongKeys.size <= maxSpecificSongs();
  }

  function updatePlanButton() {
    if (!elements.planCampaign) return;
    elements.planCampaign.disabled = state.busy || !specificSelectionValid();
  }

  function invalidatePlan() {
    state.plan = null;
    state.payload = null;
    if (elements.campaignPlan) elements.campaignPlan.hidden = true;
    if (elements.createCampaignDrafts) elements.createCampaignDrafts.hidden = true;
  }

  function campaignPayload() {
    const selectedSongKeys = state.selectionMode === 'specific'
      ? [...state.selectedSongKeys]
      : [];

    if (state.selectionMode === 'specific' && !selectedSongKeys.length) {
      throw new Error('Choose at least one specific song before generating the plan.');
    }
    if (selectedSongKeys.length > maxSpecificSongs()) {
      throw new Error(`Choose no more than ${maxSpecificSongs()} songs with the current versions-per-song setting.`);
    }

    return {
      campaign_name: elements.campaignName.value.trim(),
      song_count: selectedSongKeys.length || Number(elements.campaignSongCount.value),
      selected_song_keys: selectedSongKeys,
      variations_per_song: Number(elements.campaignVariations.value),
      duration_mode: 'promo',
      duration_seconds: Number(elements.campaignDuration.value),
      aspect_ratio: elements.campaignRatio.value,
      genre: state.selectionMode === 'specific' ? '' : elements.campaignGenre.value.trim(),
      artist: state.selectionMode === 'specific' ? '' : elements.campaignArtist.value.trim(),
      require_visuals: elements.campaignRequireVisuals.checked
    };
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    updatePlanButton();
    elements.createCampaignDrafts.disabled = state.busy;
    if (elements.campaignReloadSongs) elements.campaignReloadSongs.disabled = state.busy || state.loadingCandidates;
  }

  function updateSelectedCount() {
    if (!elements.campaignSongSelectedCount) return;
    const selected = state.selectedSongKeys.size;
    const maximum = maxSpecificSongs();
    elements.campaignSongSelectedCount.textContent = `${selected} selected · max ${maximum}`;
    elements.campaignSongSelectedCount.classList.toggle('is-warning', selected > maximum);
    updatePlanButton();
  }

  function candidateIsSelectable(candidate) {
    return !elements.campaignRequireVisuals.checked || candidate.visual_readiness === 'indicated';
  }

  function renderCandidateSongs() {
    if (!elements.campaignSongList) return;
    const search = String(elements.campaignSongSearch?.value || '').trim().toLowerCase();
    const visible = state.candidates.filter((candidate) => {
      const haystack = [candidate.title, candidate.artist, candidate.genre, candidate.song_key]
        .join(' ')
        .toLowerCase();
      return !search || haystack.includes(search);
    });

    elements.campaignSongList.replaceChildren();
    visible.forEach((candidate) => {
      const selected = state.selectedSongKeys.has(candidate.song_key);
      const selectable = candidateIsSelectable(candidate) || selected;
      const label = document.createElement('label');
      label.className = 'sf-song-choice';
      label.classList.toggle('is-selected', selected);
      label.classList.toggle('is-unavailable', !selectable);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = candidate.song_key;
      checkbox.checked = selected;
      checkbox.disabled = !selectable;

      const copy = document.createElement('span');
      copy.className = 'sf-song-choice-copy';
      const title = document.createElement('strong');
      title.textContent = candidate.title || candidate.song_key;
      const meta = document.createElement('small');
      meta.textContent = [candidate.artist, candidate.genre, candidate.song_key]
        .filter(Boolean)
        .join(' · ');
      copy.append(title, meta);

      const readiness = document.createElement('span');
      readiness.className = 'sf-song-readiness';
      readiness.textContent = candidate.visual_readiness === 'indicated' ? 'Visuals Ready' : 'Needs VEC Check';
      readiness.dataset.ready = candidate.visual_readiness === 'indicated' ? 'true' : 'false';

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (state.selectedSongKeys.size >= maxSpecificSongs()) {
            checkbox.checked = false;
            showMessage(`You can select up to ${maxSpecificSongs()} songs with ${elements.campaignVariations.value} version${Number(elements.campaignVariations.value) === 1 ? '' : 's'} per song.`, 'error');
            return;
          }
          state.selectedSongKeys.add(candidate.song_key);
        } else {
          state.selectedSongKeys.delete(candidate.song_key);
        }
        invalidatePlan();
        updateSelectedCount();
        renderCandidateSongs();
      });

      label.append(checkbox, copy, readiness);
      elements.campaignSongList.appendChild(label);
    });

    elements.campaignSongEmpty.hidden = visible.length > 0;
    updateSelectedCount();
  }

  async function loadCandidates({ force = false } = {}) {
    if (state.loadingCandidates || (state.candidatesLoaded && !force)) {
      renderCandidateSongs();
      return;
    }

    state.loadingCandidates = true;
    setBusy(state.busy);
    showMessage('Loading eligible songs from the Song CMS…');
    try {
      const result = await apiGet('/social/orchestration/candidates?limit=100');
      state.candidates = Array.isArray(result.candidates) ? result.candidates : [];
      state.candidatesLoaded = true;
      renderCandidateSongs();
      showMessage(`${state.candidates.length} eligible song${state.candidates.length === 1 ? '' : 's'} loaded. Choose the exact songs for this campaign.`, 'success');
    } catch (error) {
      state.candidates = [];
      state.candidatesLoaded = false;
      renderCandidateSongs();
      showMessage(formatError(error), 'error');
    } finally {
      state.loadingCandidates = false;
      setBusy(state.busy);
    }
  }

  function setSelectionMode(mode) {
    state.selectionMode = mode === 'specific' ? 'specific' : 'automatic';
    const specific = state.selectionMode === 'specific';

    elements.campaignModeAutomatic?.classList.toggle('is-active', !specific);
    elements.campaignModeSpecific?.classList.toggle('is-active', specific);
    elements.campaignModeAutomatic?.setAttribute('aria-pressed', String(!specific));
    elements.campaignModeSpecific?.setAttribute('aria-pressed', String(specific));
    if (elements.campaignSpecificSongs) elements.campaignSpecificSongs.hidden = !specific;

    elements.campaignSongCount.disabled = specific;
    elements.campaignGenre.disabled = specific;
    elements.campaignArtist.disabled = specific;
    elements.campaignSongModeHelp.textContent = specific
      ? 'Specific mode uses only the songs you check below. Song count, genre, and artist filters are ignored.'
      : 'Automatic mode chooses the highest-ranked eligible songs using song count, genre, and artist filters.';

    invalidatePlan();
    updatePlanButton();
    if (specific) loadCandidates();
  }

  function renderPlan(plan) {
    state.plan = plan;
    elements.campaignPlan.hidden = false;
    elements.createCampaignDrafts.hidden = false;
    elements.campaignPlanSummary.textContent = `${plan.selected_song_count} song${plan.selected_song_count === 1 ? '' : 's'} · ${plan.proposed_job_count} draft job${plan.proposed_job_count === 1 ? '' : 's'} · ${plan.settings.duration_seconds || 'Full'} sec · ${plan.settings.aspect_ratio}`;
    elements.campaignPlanId.textContent = `Plan ${plan.plan_id}`;
    elements.campaignPlanList.replaceChildren();

    plan.jobs.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'sf-campaign-plan-item';
      const title = document.createElement('strong');
      title.textContent = entry.song.title || entry.song.song_key;
      const meta = document.createElement('span');
      meta.textContent = [
        entry.song.artist,
        entry.song.genre,
        `Version ${entry.variation}`,
        `Score ${entry.song.candidate_score}`
      ].filter(Boolean).join(' · ');
      const recipe = document.createElement('small');
      recipe.textContent = `${entry.recipe.duration_seconds || 'Full song'} sec · ${entry.recipe.aspect_ratio} · ${entry.recipe.fps} fps`;
      card.append(title, meta, recipe);
      elements.campaignPlanList.appendChild(card);
    });
  }

  async function planCampaign(event) {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    showMessage(state.selectionMode === 'specific'
      ? 'Building a safe proposal with your selected songs…'
      : 'Ranking eligible songs and building a safe batch proposal…');
    try {
      state.payload = campaignPayload();
      const result = await api('/social/orchestration/batch-plan', state.payload);
      renderPlan(result);
      showMessage('Batch proposal ready. No Video Factory jobs were created and no renders were launched.', 'success');
    } catch (error) {
      state.plan = null;
      elements.campaignPlan.hidden = true;
      elements.createCampaignDrafts.hidden = true;
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createDrafts() {
    if (!state.plan || !state.payload || state.busy) return;
    const approved = window.confirm(
      `Create ${state.plan.proposed_job_count} Video Factory draft job${state.plan.proposed_job_count === 1 ? '' : 's'}?\n\nThis will not launch renders or publish videos.`
    );
    if (!approved) return;

    setBusy(true);
    showMessage('Creating safe Video Factory draft jobs…');
    try {
      const result = await api('/social/orchestration/batch-drafts', {
        ...state.payload,
        confirm_create_drafts: true
      });
      const created = Number(result.created_job_count || 0);
      const skipped = Number(result.skipped_job_count || 0);
      elements.createCampaignDrafts.hidden = true;
      showMessage(
        `${created} draft job${created === 1 ? '' : 's'} created${skipped ? `, ${skipped} existing job${skipped === 1 ? '' : 's'} reused` : ''}. No renders were launched and nothing was published.`,
        'success'
      );
      window.dispatchEvent(new CustomEvent('socialfactory:drafts-created', {
        detail: {
          campaignName: result.campaign_name || state.payload.campaign_name,
          createdJobs: Array.isArray(result.created_jobs) ? result.created_jobs : [],
          skippedJobs: Array.isArray(result.skipped_jobs) ? result.skipped_jobs : []
        }
      }));
    } catch (error) {
      showMessage(formatError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    elements.campaignForm.addEventListener('submit', planCampaign);
    elements.createCampaignDrafts.addEventListener('click', createDrafts);
    elements.campaignModeAutomatic?.addEventListener('click', () => setSelectionMode('automatic'));
    elements.campaignModeSpecific?.addEventListener('click', () => setSelectionMode('specific'));
    elements.campaignReloadSongs?.addEventListener('click', () => loadCandidates({ force: true }));
    elements.campaignSongSearch?.addEventListener('input', renderCandidateSongs);
    elements.campaignRequireVisuals?.addEventListener('change', () => {
      invalidatePlan();
      renderCandidateSongs();
    });
    elements.campaignVariations?.addEventListener('change', () => {
      invalidatePlan();
      updateSelectedCount();
      renderCandidateSongs();
    });

    [
      elements.campaignName,
      elements.campaignSongCount,
      elements.campaignDuration,
      elements.campaignRatio,
      elements.campaignGenre,
      elements.campaignArtist
    ].filter(Boolean).forEach((control) => {
      control.addEventListener('change', invalidatePlan);
      control.addEventListener('input', invalidatePlan);
    });

    elements.saveToken?.addEventListener('click', () => {
      window.setTimeout(() => {
        const legacy = localStorage.getItem(TOKEN_KEY) || '';
        if (legacy) sessionStorage.setItem(TOKEN_KEY, legacy);
        localStorage.removeItem(TOKEN_KEY);
        migrateLegacyToken();
        if (state.selectionMode === 'specific') loadCandidates({ force: true });
      }, 0);
    });

    elements.clearToken?.addEventListener('click', () => {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      state.candidates = [];
      state.candidatesLoaded = false;
      state.selectedSongKeys.clear();
      migrateLegacyToken();
      renderCandidateSongs();
    });
  }

  function init() {
    cacheElements();
    if (!elements.campaignForm) return;
    installSongPicker();
    migrateLegacyToken();
    bindEvents();
    setSelectionMode('automatic');
    updateSelectedCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();