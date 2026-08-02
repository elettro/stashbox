(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const state = { items: [], filtered: [], month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
  const $ = (id) => document.getElementById(id);

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function saveToken(value) {
    const next = String(value || '').trim();
    if (next) {
      localStorage.setItem(TOKEN_KEY, next);
      sessionStorage.setItem(TOKEN_KEY, next);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
    updateTokenStatus();
  }

  function updateTokenStatus() {
    const el = $('tokenStatus');
    if (el) el.textContent = token() ? 'Token saved in this browser' : 'Token not saved';
    if ($('adminToken')) $('adminToken').value = '';
  }

  function message(text, type = 'info') {
    const el = $('message');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.dataset.type = type;
  }

  async function api(path) {
    const current = token();
    if (!current) throw new Error('Save the Social Factory DEV token first.');
    const response = await fetch(`${API_BASE}${path}`, { headers: { 'x-admin-token': current } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
    return payload;
  }

  function scheduleValue(item) {
    return item?.publishing?.scheduled_at || item?.schedule?.scheduled_at || item?.scheduled_at || item?.metadata?.scheduled_at || '';
  }

  function scheduleName(item) {
    return item?.publishing?.schedule_name || item?.schedule?.name || item?.schedule_name || '';
  }

  function publishStatus(item) {
    return String(item?.publishing_status || item?.publishing?.status || item?.publish_status || '').toLowerCase();
  }

  function normalize(item) {
    const rawDate = scheduleValue(item);
    const date = rawDate ? new Date(rawDate) : null;
    return {
      raw: item,
      id: item.id || item.review_id || '',
      title: item.song?.title || item.metadata?.selected_title || item.title || 'Untitled content',
      artist: item.song?.artist || item.artist || 'Unknown artist',
      artwork: item.song?.artwork_url || item.song?.song_artwork_url || item.artwork_url || '',
      platform: item.platform || item.publishing?.platform || 'YouTube',
      visibility: item.visibility || item.publishing?.visibility || item.metadata?.visibility || 'unlisted',
      reviewStatus: item.status || item.review_status || 'in_review',
      publishingStatus: publishStatus(item),
      scheduledAt: date && !Number.isNaN(date.getTime()) ? date : null,
      scheduleName: scheduleName(item),
      aspectRatio: item.video?.aspect_ratio || item.aspect_ratio || 'Video'
    };
  }

  function isScheduled(item) {
    return Boolean(item.scheduledAt) && ['scheduled', 'queued', 'pending'].includes(item.publishingStatus || 'scheduled');
  }

  function formatDate(date) {
    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  function safeArtwork(value) {
    const url = String(value || '').trim();
    if (/^https:\/\//i.test(url)) return url;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#16262b"/><path d="M42 30v60l48-30z" fill="#4de39a"/></svg>');
  }

  function applyFilters() {
    const search = String($('search')?.value || '').trim().toLowerCase();
    const platform = String($('platform')?.value || 'all').toLowerCase();
    const visibility = String($('visibility')?.value || 'all').toLowerCase();
    state.filtered = state.items.filter((item) => {
      const haystack = `${item.title} ${item.artist} ${item.id} ${item.platform}`.toLowerCase();
      return (!search || haystack.includes(search)) && (platform === 'all' || item.platform.toLowerCase() === platform) && (visibility === 'all' || item.visibility.toLowerCase() === visibility);
    });
    renderSummary();
    if (document.body.dataset.view === 'calendar') renderCalendar(); else renderList();
  }

  function renderSummary() {
    const now = Date.now();
    const next24 = now + 86400000;
    const next7 = now + 604800000;
    const counts = {
      total: state.filtered.length,
      day: state.filtered.filter((item) => item.scheduledAt.getTime() >= now && item.scheduledAt.getTime() <= next24).length,
      week: state.filtered.filter((item) => item.scheduledAt.getTime() >= now && item.scheduledAt.getTime() <= next7).length,
      overdue: state.filtered.filter((item) => item.scheduledAt.getTime() < now).length
    };
    Object.entries(counts).forEach(([key, value]) => { const el = $(`count-${key}`); if (el) el.textContent = String(value); });
  }

  function renderList() {
    const list = $('scheduledList');
    if (!list) return;
    list.replaceChildren();
    const sorted = [...state.filtered].sort((a, b) => a.scheduledAt - b.scheduledAt);
    $('empty').hidden = sorted.length > 0;
    sorted.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'card';
      const image = document.createElement('img');
      image.className = 'art';
      image.alt = '';
      image.src = safeArtwork(item.artwork);
      const copy = document.createElement('div');
      const title = document.createElement('div'); title.className = 'title'; title.textContent = item.title;
      const artist = document.createElement('div'); artist.className = 'muted'; artist.textContent = item.artist;
      const chips = document.createElement('div'); chips.className = 'chips';
      [item.platform, item.aspectRatio, item.visibility, item.reviewStatus, item.publishingStatus || 'scheduled'].forEach((value, index) => {
        const chip = document.createElement('span'); chip.className = `chip${index === 4 ? ' live' : ''}`; chip.textContent = value; chips.appendChild(chip);
      });
      const id = document.createElement('div'); id.className = 'muted'; id.textContent = item.id;
      copy.append(title, artist, chips, id);
      const when = document.createElement('div'); when.className = 'when';
      const date = document.createElement('strong'); date.textContent = formatDate(item.scheduledAt);
      const name = document.createElement('span'); name.textContent = item.scheduleName || 'Schedule active';
      when.append(date, name);
      article.append(image, copy, when);
      list.appendChild(article);
    });
  }

  function monthLabel(date) {
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  function renderCalendar() {
    const grid = $('calendarGrid');
    if (!grid) return;
    grid.replaceChildren();
    $('monthLabel').textContent = monthLabel(state.month);
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((label) => {
      const el = document.createElement('div'); el.className = 'weekday'; el.textContent = label; grid.appendChild(el);
    });
    const start = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    const first = new Date(start); first.setDate(1 - start.getDay());
    const today = new Date();
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(first); date.setDate(first.getDate() + i);
      const day = document.createElement('div'); day.className = 'day';
      if (date.getMonth() !== state.month.getMonth()) day.classList.add('outside');
      if (date.toDateString() === today.toDateString()) day.classList.add('today');
      const number = document.createElement('div'); number.className = 'day-number'; number.textContent = String(date.getDate()); day.appendChild(number);
      state.filtered.filter((item) => item.scheduledAt.toDateString() === date.toDateString()).sort((a,b) => a.scheduledAt-b.scheduledAt).forEach((item) => {
        const event = document.createElement('div'); event.className = 'event'; event.title = `${item.title} — ${formatDate(item.scheduledAt)}`;
        const time = document.createElement('span'); time.className = 'event-time'; time.textContent = item.scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const title = document.createElement('span'); title.className = 'event-title'; title.textContent = item.title;
        event.append(time, title); day.appendChild(event);
      });
      grid.appendChild(day);
    }
  }

  async function load() {
    message('Loading scheduled posts…');
    try {
      const payload = await api('/social/review-items?limit=250');
      state.items = (Array.isArray(payload.items) ? payload.items : []).map(normalize).filter(isScheduled);
      applyFilters();
      message(state.items.length ? '' : 'No scheduled posts were found.');
    } catch (error) {
      message(error.message || String(error), 'error');
    }
  }

  function bind() {
    $('saveToken')?.addEventListener('click', () => { saveToken($('adminToken').value); load(); });
    $('clearToken')?.addEventListener('click', () => saveToken(''));
    $('refresh')?.addEventListener('click', load);
    ['search','platform','visibility'].forEach((id) => $(id)?.addEventListener('input', applyFilters));
    $('prevMonth')?.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1); renderCalendar(); });
    $('nextMonth')?.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1); renderCalendar(); });
    $('todayMonth')?.addEventListener('click', () => { const now = new Date(); state.month = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); });
  }

  document.addEventListener('DOMContentLoaded', () => { bind(); updateTokenStatus(); if (token()) load(); });
})();
