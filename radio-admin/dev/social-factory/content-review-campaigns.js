(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const state = { items: [], applying: false, timer: null };

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function value(...choices) {
    return choices.find((choice) => choice !== undefined && choice !== null && String(choice).trim() !== '');
  }

  function itemDate(item) {
    const date = new Date(value(item.created_at, item.updated_at, item.source?.created_at, 0));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function campaignName(item) {
    return String(value(
      item.campaign_name,
      item.campaign?.name,
      item.source?.campaign_name,
      item.source?.batch_name,
      item.metadata?.campaign_name,
      item.metadata?.batch_name,
      'Ungrouped Content'
    ));
  }

  function creationSource(item) {
    const raw = String(value(
      item.creation_source,
      item.source?.creation_source,
      item.source?.type,
      item.metadata?.creation_source,
      item.metadata?.source,
      ''
    )).toLowerCase();
    if (raw.includes('gpt') || raw.includes('orchestration') || raw.includes('social')) return 'GPT';
    if (raw.includes('video') || raw.includes('render') || raw.includes('factory')) return 'Video Factory';
    return 'Manual';
  }

  function durationLabel(item) {
    const seconds = Number(value(
      item.video?.duration_seconds,
      item.duration_seconds,
      item.source?.duration_seconds,
      item.metadata?.duration_seconds,
      0
    ));
    return seconds > 0 ? `${Math.round(seconds)} SEC` : 'DURATION PENDING';
  }

  function youtubeLabel(item) {
    const published = Boolean(
      item.youtube?.video_id ||
      item.youtube_video_id ||
      item.publish_result?.youtube_video_id ||
      ['published', 'uploaded', 'scheduled'].includes(String(item.publishing_status || '').toLowerCase())
    );
    return published ? 'ON YOUTUBE' : 'NOT ON YOUTUBE';
  }

  function statusLabel(item) {
    return String(item.status || 'in_review').replace(/_/g, ' ').toUpperCase();
  }

  function ratioLabel(item) {
    return String(value(item.video?.aspect_ratio, item.aspect_ratio, item.source?.aspect_ratio, 'VIDEO')).toUpperCase();
  }

  function campaignProgress(items) {
    const suppliedTotal = Math.max(0, ...items.map((item) => Number(value(
      item.campaign_progress?.total,
      item.campaign_total,
      item.metadata?.campaign_total,
      item.source?.campaign_total,
      0
    ))));
    const suppliedComplete = Math.max(0, ...items.map((item) => Number(value(
      item.campaign_progress?.completed,
      item.campaign_completed,
      item.metadata?.campaign_completed,
      item.source?.campaign_completed,
      0
    ))));
    const total = suppliedTotal || items.length;
    const complete = suppliedComplete || items.filter((item) => !['draft', 'pending', 'preparing', 'rendering', 'uploading', 'failed'].includes(String(item.render_status || item.source?.render_status || '').toLowerCase())).length;
    return `${Math.min(complete || items.length, total)} of ${total} complete`;
  }

  async function fetchItems() {
    const token = getToken();
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/social/review-items?limit=100`, {
        headers: { 'x-admin-token': token }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) return;
      state.items = Array.isArray(payload.items) ? payload.items : [];
      applyCampaignLayout();
    } catch (_) {
      // The primary Content Review script owns user-facing API errors.
    }
  }

  function decorateCard(button, item) {
    const copy = button.querySelector('.sf-queue-copy');
    if (!copy) return;

    let source = copy.querySelector('.sf-queue-source');
    if (!source) {
      source = document.createElement('span');
      source.className = 'sf-queue-source';
      const date = copy.querySelectorAll(':scope > span')[1];
      if (date) date.after(source);
      else copy.appendChild(source);
    }
    source.textContent = `Created by ${creationSource(item)}`;

    let meta = copy.querySelector('.sf-queue-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'sf-queue-meta';
      copy.appendChild(meta);
    }
    meta.replaceChildren();
    [statusLabel(item), ratioLabel(item), durationLabel(item), youtubeLabel(item)].forEach((text) => {
      const pill = document.createElement('span');
      pill.className = 'sf-mini-pill';
      pill.textContent = text;
      meta.appendChild(pill);
    });
  }

  function createCampaignGroup(name, items) {
    const group = document.createElement('section');
    group.className = 'sf-review-campaign-group';
    group.dataset.campaignName = name;

    const header = document.createElement('div');
    header.className = 'sf-review-campaign-head';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'sf-review-campaign-label';
    eyebrow.textContent = 'Campaign';
    const title = document.createElement('strong');
    title.textContent = name;
    copy.append(eyebrow, title);

    const progress = document.createElement('span');
    progress.className = 'sf-review-campaign-progress';
    progress.textContent = campaignProgress(items);
    header.append(copy, progress);

    const list = document.createElement('div');
    list.className = 'sf-review-campaign-items';
    group.append(header, list);
    return { group, list };
  }

  function applyCampaignLayout() {
    const queue = document.getElementById('queueList');
    if (!queue || state.applying || !state.items.length) return;
    const buttons = [...queue.querySelectorAll('.sf-queue-item')];
    if (!buttons.length) return;

    state.applying = true;
    try {
      const byId = new Map(state.items.map((item) => [String(item.id), item]));
      const visible = buttons.map((button) => ({ button, item: byId.get(String(button.dataset.reviewId)) })).filter((entry) => entry.item);
      visible.forEach(({ button, item }) => decorateCard(button, item));

      const groups = new Map();
      visible.forEach((entry) => {
        const name = campaignName(entry.item);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(entry);
      });

      const sortedGroups = [...groups.entries()].sort((a, b) => {
        const newestA = Math.max(...a[1].map(({ item }) => itemDate(item)));
        const newestB = Math.max(...b[1].map(({ item }) => itemDate(item)));
        return newestB - newestA;
      });

      const fragment = document.createDocumentFragment();
      sortedGroups.forEach(([name, entries]) => {
        entries.sort((a, b) => itemDate(b.item) - itemDate(a.item));
        const { group, list } = createCampaignGroup(name, entries.map(({ item }) => item));
        entries.forEach(({ button }) => list.appendChild(button));
        fragment.appendChild(group);
      });
      queue.replaceChildren(fragment);
    } finally {
      state.applying = false;
    }
  }

  function scheduleApply() {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      applyCampaignLayout();
      if (getToken()) fetchItems();
    }, 80);
  }

  function init() {
    const queue = document.getElementById('queueList');
    if (!queue) return;
    new MutationObserver(() => {
      if (!state.applying) scheduleApply();
    }).observe(queue, { childList: true, subtree: true });
    document.getElementById('refreshQueue')?.addEventListener('click', () => window.setTimeout(fetchItems, 150));
    document.getElementById('saveToken')?.addEventListener('click', () => window.setTimeout(fetchItems, 150));
    fetchItems();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
