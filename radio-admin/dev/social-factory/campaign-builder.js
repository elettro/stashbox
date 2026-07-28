(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const state = { plan: null, payload: null, busy: false };
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

  function campaignPayload() {
    return {
      campaign_name: elements.campaignName.value.trim(),
      song_count: Number(elements.campaignSongCount.value),
      variations_per_song: Number(elements.campaignVariations.value),
      duration_mode: 'promo',
      duration_seconds: Number(elements.campaignDuration.value),
      aspect_ratio: elements.campaignRatio.value,
      genre: elements.campaignGenre.value.trim(),
      artist: elements.campaignArtist.value.trim(),
      require_visuals: elements.campaignRequireVisuals.checked
    };
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    elements.planCampaign.disabled = state.busy;
    elements.createCampaignDrafts.disabled = state.busy;
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
    showMessage('Ranking eligible songs and building a safe batch proposal…');
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

    elements.saveToken?.addEventListener('click', () => {
      window.setTimeout(() => {
        const legacy = localStorage.getItem(TOKEN_KEY) || '';
        if (legacy) sessionStorage.setItem(TOKEN_KEY, legacy);
        localStorage.removeItem(TOKEN_KEY);
        migrateLegacyToken();
      }, 0);
    });

    elements.clearToken?.addEventListener('click', () => {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      migrateLegacyToken();
    });
  }

  function init() {
    cacheElements();
    if (!elements.campaignForm) return;
    migrateLegacyToken();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
