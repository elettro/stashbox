(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const ARTISTS_URL = `${env.apiBase}/radio/admin/artists`;
  const SONG_STATS_URL = `${env.apiBase}/admin/stats/songs?limit=500`;

  const els = {
    token: document.getElementById('adminToken'),
    saveToken: document.getElementById('saveToken'),
    clearToken: document.getElementById('clearToken'),
    tokenStatus: document.getElementById('tokenStatus'),
    refresh: document.getElementById('refreshArtists'),
    message: document.getElementById('artistMessage'),
    stats: document.getElementById('artistStats'),
    search: document.getElementById('artistSearch'),
    count: document.getElementById('artistCount'),
    body: document.getElementById('artistsBody')
  };

  let artists = [];
  let performance = new Map();

  function getToken() {
    const direct = localStorage.getItem(env.tokenStorageKey);
    if (direct) return String(direct).trim();
    for (const key of env.legacyTokenStorageKeys || []) {
      const value = localStorage.getItem(key);
      if (value) return String(value).trim();
    }
    return '';
  }

  function updateTokenStatus() {
    const token = getToken();
    els.token.value = token;
    els.tokenStatus.textContent = token ? 'DEV admin token available.' : 'No DEV admin token saved.';
  }

  async function getJson(url) {
    if (!url.startsWith(env.apiBase)) throw new Error('Blocked non-DEV Artist request.');
    const token = getToken();
    if (!token) throw new Error('Save a DEV admin token first.');
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-admin-token': token, 'accept': 'application/json' },
      cache: 'no-store',
      credentials: 'omit'
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { error: text }; }
    }
    if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    if (typeof body.body === 'string') {
      try { return JSON.parse(body.body); } catch {}
    }
    return body;
  }

  function normName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function aggregatePerformance(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = normName(row.artist);
      if (!key) continue;
      const current = map.get(key) || { likes: 0, shares: 0, seconds: 0 };
      current.likes += number(row.likes ?? row.total_likes ?? row.like_count);
      current.shares += number(row.shares ?? row.total_shares ?? row.share_count);
      current.seconds += number(row.total_seconds_played ?? row.total_seconds);
      map.set(key, current);
    }
    return map;
  }

  function performanceFor(artist) {
    return performance.get(normName(artist?.name)) || { likes: 0, shares: 0, seconds: 0 };
  }

  function listening(seconds) {
    const total = Math.max(0, Math.round(number(seconds)));
    if (total >= 86400) return `${Math.floor(total / 86400)}d ${Math.floor((total % 86400) / 3600)}h`;
    if (total >= 3600) return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
    if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
    return `${total}s`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderStats() {
    const totals = artists.reduce((acc, artist) => {
      const p = performanceFor(artist);
      acc.followers += number(artist.follower_count);
      acc.likes += p.likes;
      acc.shares += p.shares;
      acc.seconds += p.seconds;
      return acc;
    }, { followers: 0, likes: 0, shares: 0, seconds: 0 });
    const cards = [
      ['Artists', artists.length.toLocaleString()],
      ['Published', artists.filter(a => a.status === 'published').length.toLocaleString()],
      ['Followers', totals.followers.toLocaleString()],
      ['Likes', totals.likes.toLocaleString()],
      ['Shares', totals.shares.toLocaleString()],
      ['Listening', listening(totals.seconds)]
    ];
    els.stats.innerHTML = cards.map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderArtists() {
    const q = String(els.search.value || '').trim().toLowerCase();
    const rows = q ? artists.filter(a => `${a.name || ''} ${a.artist_key || ''} ${a.slug || ''} ${a.status || ''}`.toLowerCase().includes(q)) : artists;
    els.count.textContent = `${rows.length.toLocaleString()} of ${artists.length.toLocaleString()} DEV artists shown`;
    if (!rows.length) {
      els.body.innerHTML = '<tr><td colspan="8" class="muted">No matching DEV artists.</td></tr>';
      return;
    }
    els.body.innerHTML = rows.map(artist => {
      const p = performanceFor(artist);
      const image = String(artist.profile_image_url || '').trim();
      return `<tr>
        <td>${escapeHtml(artist.name || 'Untitled')}</td>
        <td><code>${escapeHtml(artist.artist_key || '')}</code></td>
        <td>${escapeHtml(artist.status || '—')}</td>
        <td>${number(artist.follower_count).toLocaleString()}</td>
        <td>${p.likes.toLocaleString()}</td>
        <td>${p.shares.toLocaleString()}</td>
        <td>${escapeHtml(listening(p.seconds))}</td>
        <td>${/^https?:\/\//i.test(image) ? `<a href="${escapeHtml(image)}" target="_blank" rel="noopener">Open</a>` : '—'}</td>
      </tr>`;
    }).join('');
  }

  async function load() {
    els.refresh.disabled = true;
    els.message.textContent = 'Loading DEV artist profiles…';
    try {
      const [artistData, songData] = await Promise.all([getJson(ARTISTS_URL), getJson(SONG_STATS_URL)]);
      artists = Array.isArray(artistData?.artists) ? artistData.artists : [];
      performance = aggregatePerformance(songData?.songs || []);
      renderStats();
      renderArtists();
      els.message.textContent = `Loaded ${artists.length} DEV artist profile${artists.length === 1 ? '' : 's'} in read-only migration mode.`;
    } catch (error) {
      artists = [];
      performance = new Map();
      els.stats.innerHTML = '';
      els.body.innerHTML = '<tr><td colspan="8" class="muted">DEV Artist load failed.</td></tr>';
      els.count.textContent = '';
      els.message.textContent = `DEV Artist load failed: ${error.message}`;
    } finally {
      els.refresh.disabled = false;
      updateTokenStatus();
    }
  }

  els.saveToken.addEventListener('click', () => {
    const value = String(els.token.value || '').trim();
    if (value) localStorage.setItem(env.tokenStorageKey, value);
    else localStorage.removeItem(env.tokenStorageKey);
    updateTokenStatus();
    load();
  });
  els.clearToken.addEventListener('click', () => {
    localStorage.removeItem(env.tokenStorageKey);
    els.token.value = '';
    updateTokenStatus();
  });
  els.refresh.addEventListener('click', load);
  els.search.addEventListener('input', renderArtists);

  updateTokenStatus();
  if (getToken()) load();
})();
