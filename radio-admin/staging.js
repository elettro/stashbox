(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');

  const env = migration.getEnvironment('prod');
  const els = {
    tokenPanel: document.getElementById('tokenPanel'),
    token: document.getElementById('adminToken'),
    save: document.getElementById('saveTokenButton'),
    clear: document.getElementById('clearTokenButton'),
    status: document.getElementById('tokenStatus'),
    refresh: document.getElementById('refreshButton'),
    message: document.getElementById('dashboardMessage'),
    kpis: document.getElementById('kpiGrid'),
    songs: document.getElementById('songStatsBody')
  };

  const preferredKpis = [
    ['plays', 'Plays'],
    ['total_plays', 'Total Plays'],
    ['full_plays', 'Full Plays'],
    ['partial_plays', 'Partial Plays'],
    ['likes', 'Likes'],
    ['shares', 'Shares'],
    ['skips', 'Skips'],
    ['video_clicks', 'Video Clicks'],
    ['product_clicks', 'Product Clicks'],
    ['unique_sessions', 'Unique Sessions'],
    ['sessions', 'Sessions'],
    ['events', 'Events']
  ];

  function updateProductionLabels() {
    if (els.tokenPanel) {
      const title = els.tokenPanel.querySelector('h2');
      const copy = els.tokenPanel.querySelector('.muted');
      if (title) title.textContent = 'PROD Admin Token';
      if (copy) copy.textContent = 'Uses the production Admin token namespace. DEV tokens are never used by this dashboard.';
    }
    if (els.token) els.token.placeholder = 'Paste PROD x-admin-token';

    const dashboardCard = els.kpis && els.kpis.closest('.card');
    if (dashboardCard) {
      const copy = dashboardCard.querySelector('.section-heading .muted');
      if (copy) copy.textContent = 'Live read from the PROD private admin stats APIs. This dashboard is GET-only.';
    }

    const songsCard = els.songs && els.songs.closest('.card');
    if (songsCard) {
      const title = songsCard.querySelector('.section-heading h2');
      if (title) title.textContent = 'Top PROD Songs';
    }

    document.querySelectorAll('.migration-grid article').forEach(article => {
      const strong = article.querySelector('strong');
      if (!strong || strong.textContent.trim() !== 'Dashboard') return;
      const status = article.querySelector('.done');
      const copy = article.querySelector('p');
      if (status) status.textContent = 'PROD Read';
      if (copy) copy.textContent = 'Private PROD summary and song analytics are wired into the unified Admin dashboard with GET-only requests.';
    });
  }

  function getStoredToken() {
    return localStorage.getItem(env.tokenStorageKey) || '';
  }

  function saveToken() {
    const token = String(els.token.value || '').trim();
    if (!token) return;
    localStorage.setItem(env.tokenStorageKey, token);
    els.token.value = '';
    els.status.textContent = 'PROD admin token saved in the production namespace.';
    loadDashboard();
  }

  function clearToken() {
    localStorage.removeItem(env.tokenStorageKey);
    els.status.textContent = 'PROD admin token cleared.';
    els.kpis.innerHTML = '';
    els.songs.innerHTML = '<tr><td colspan="6" class="muted">No data loaded.</td></tr>';
  }

  async function adminGet(path) {
    const token = getStoredToken();
    if (!token) throw new Error('No PROD admin token is available in this browser.');
    const url = `${env.apiBase}${path}`;
    if (!url.startsWith(env.apiBase)) throw new Error('Blocked non-PROD API request.');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-admin-token': token, 'accept': 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  function numberValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function flattenSummary(payload) {
    const candidates = [payload, payload && payload.summary, payload && payload.stats, payload && payload.data].filter(Boolean);
    const source = candidates.find(item => item && typeof item === 'object' && !Array.isArray(item)) || {};
    const flat = {};
    Object.entries(source).forEach(([key, value]) => {
      const n = numberValue(value);
      if (n !== null) flat[key] = n;
    });
    return flat;
  }

  function renderKpis(payload) {
    const stats = flattenSummary(payload);
    const used = new Set();
    const entries = [];

    preferredKpis.forEach(([key, label]) => {
      if (Object.prototype.hasOwnProperty.call(stats, key) && !used.has(key)) {
        used.add(key);
        entries.push([label, stats[key]]);
      }
    });

    Object.entries(stats).forEach(([key, value]) => {
      if (entries.length >= 10 || used.has(key)) return;
      used.add(key);
      entries.push([key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value]);
    });

    if (!entries.length) {
      els.kpis.innerHTML = '<div class="message">Summary endpoint responded, but no numeric KPI fields were found.</div>';
      return;
    }

    els.kpis.innerHTML = entries.slice(0, 10).map(([label, value]) => `
      <article class="kpi"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString()}</strong></article>
    `).join('');
  }

  function getRows(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ['songs', 'items', 'rows', 'data', 'results']) {
      if (Array.isArray(payload && payload[key])) return payload[key];
    }
    return [];
  }

  function pick(row, keys, fallback = '') {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return fallback;
  }

  function renderSongStats(payload) {
    const rows = getRows(payload).slice(0, 25);
    if (!rows.length) {
      els.songs.innerHTML = '<tr><td colspan="6" class="muted">Song stats endpoint returned no rows.</td></tr>';
      return;
    }

    els.songs.innerHTML = rows.map(row => `
      <tr>
        <td>${escapeHtml(String(pick(row, ['display_title', 'song_name', 'title', 'song_key'], 'Untitled')))}</td>
        <td>${escapeHtml(String(pick(row, ['artist', 'artist_name'], '')))}</td>
        <td>${formatCount(pick(row, ['plays', 'play_count', 'total_plays'], 0))}</td>
        <td>${formatCount(pick(row, ['likes', 'like_count'], 0))}</td>
        <td>${formatCount(pick(row, ['shares', 'share_count'], 0))}</td>
        <td>${formatCount(pick(row, ['skips', 'skip_count'], 0))}</td>
      </tr>
    `).join('');
  }

  function formatCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : '0';
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  async function loadDashboard() {
    const token = getStoredToken();
    if (!token) {
      els.status.textContent = 'No PROD admin token found.';
      els.message.textContent = 'Enter your PROD admin token above to load production analytics.';
      return;
    }

    els.status.textContent = 'PROD admin token available.';
    els.message.textContent = 'Loading PROD dashboard…';
    els.refresh.disabled = true;

    const [summaryResult, songsResult] = await Promise.allSettled([
      adminGet('/admin/stats/summary'),
      adminGet('/admin/stats/songs?limit=25')
    ]);

    const errors = [];
    if (summaryResult.status === 'fulfilled') renderKpis(summaryResult.value);
    else errors.push(`Summary: ${summaryResult.reason.message}`);

    if (songsResult.status === 'fulfilled') renderSongStats(songsResult.value);
    else errors.push(`Songs: ${songsResult.reason.message}`);

    els.message.textContent = errors.length
      ? `PROD loaded with warnings. ${errors.join(' · ')}`
      : 'PROD dashboard loaded successfully.';
    els.refresh.disabled = false;
  }

  updateProductionLabels();
  els.save.addEventListener('click', saveToken);
  els.clear.addEventListener('click', clearToken);
  els.refresh.addEventListener('click', loadDashboard);
  els.token.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveToken();
  });

  loadDashboard();
})();
