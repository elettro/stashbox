(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const API_PATH = '/admin/visuals/folders';

  const els = {
    search: document.getElementById('folderSearch'),
    refresh: document.getElementById('refreshFolders'),
    message: document.getElementById('videoLibraryMessage'),
    count: document.getElementById('folderCount'),
    body: document.getElementById('foldersBody')
  };

  let folders = [];

  function getToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return current;
    for (const key of env.legacyTokenStorageKeys || []) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return '';
  }

  async function loadFolders() {
    const token = getToken();
    if (!token) {
      els.message.textContent = 'No DEV admin token found. Save one on the staging Dashboard first.';
      els.body.innerHTML = '<tr><td colspan="7" class="muted">Authentication required.</td></tr>';
      return;
    }

    const url = `${env.apiBase}${API_PATH}`;
    if (!url.startsWith(`${env.apiBase}/admin/visuals/folders`)) throw new Error('Blocked non-DEV visual library request.');

    els.refresh.disabled = true;
    els.message.textContent = 'Loading authoritative DEV visual folders…';
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'x-admin-token': token, 'accept': 'application/json' },
        cache: 'no-store'
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
      if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
      folders = normalizeRows(data);
      els.message.textContent = 'DEV visual folders loaded. Staging remains read-only.';
      render();
    } catch (error) {
      folders = [];
      els.message.textContent = `DEV Video Library read failed: ${error.message || error}`;
      els.body.innerHTML = '<tr><td colspan="7" class="muted">Load failed.</td></tr>';
      els.count.textContent = '';
    } finally {
      els.refresh.disabled = false;
    }
  }

  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    for (const key of ['folders', 'items', 'rows', 'data', 'results']) {
      if (Array.isArray(data?.[key])) return data[key];
      if (data?.[key] && typeof data[key] === 'object') {
        for (const nested of ['folders', 'items', 'rows', 'data', 'results']) {
          if (Array.isArray(data[key][nested])) return data[key][nested];
        }
      }
    }
    return [];
  }

  function pick(row, keys, fallback = '') {
    for (const key of keys) {
      if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return fallback;
  }

  function listValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return Object.values(value).flat().filter(Boolean).join(', ');
    return String(value || '');
  }

  function countAssets(folder) {
    const direct = pick(folder, ['asset_count', 'assets_count', 'total_assets'], null);
    if (direct !== null) return Number(direct) || 0;
    const assets = pick(folder, ['assets', 'visual_assets'], []);
    return Array.isArray(assets) ? assets.length : 0;
  }

  function render() {
    const query = String(els.search.value || '').trim().toLowerCase();
    const visible = query ? folders.filter(folder => {
      return [
        pick(folder, ['name', 'folder_name', 'display_name', 'slug', 'folder_key']),
        listValue(pick(folder, ['artist_names', 'artists', 'artist_targeting'])),
        listValue(pick(folder, ['genres', 'genre_targeting'])),
        listValue(pick(folder, ['moods', 'mood_targeting']))
      ].join(' ').toLowerCase().includes(query);
    }) : folders;

    els.count.textContent = `${visible.length.toLocaleString()} of ${folders.length.toLocaleString()} DEV folders shown`;
    if (!visible.length) {
      els.body.innerHTML = '<tr><td colspan="7" class="muted">No matching folders.</td></tr>';
      return;
    }

    els.body.innerHTML = visible.map(folder => {
      const name = pick(folder, ['name', 'folder_name', 'display_name', 'slug', 'folder_key'], 'Untitled folder');
      const status = pick(folder, ['status'], pick(folder, ['active', 'is_active'], true) ? 'active' : 'hidden');
      const priority = pick(folder, ['priority', 'weight'], '—');
      const artists = listValue(pick(folder, ['artist_names', 'artists', 'artist_targeting']));
      const genres = listValue(pick(folder, ['genres', 'genre_targeting']));
      const moods = listValue(pick(folder, ['moods', 'mood_targeting']));
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(priority)}</td>
        <td>${countAssets(folder).toLocaleString()}</td>
        <td>${escapeHtml(artists || '—')}</td>
        <td>${escapeHtml(genres || '—')}</td>
        <td>${escapeHtml(moods || '—')}</td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  els.search.addEventListener('input', render);
  els.refresh.addEventListener('click', loadFolders);
  loadFolders();
})();
