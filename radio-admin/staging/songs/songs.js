(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');

  const els = {
    search: document.getElementById('songSearch'),
    refresh: document.getElementById('refreshSongs'),
    message: document.getElementById('songsMessage'),
    count: document.getElementById('songCount'),
    body: document.getElementById('songsBody')
  };

  let songs = [];

  function getStoredToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return current;
    for (const key of env.legacyTokenStorageKeys || []) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return '';
  }

  async function loadSongs() {
    const token = getStoredToken();
    if (!token) {
      els.message.textContent = 'No DEV admin token found. Save one on the staging Dashboard first.';
      els.body.innerHTML = '<tr><td colspan="8" class="muted">Authentication required.</td></tr>';
      return;
    }

    migration.assertWriteAllowed('dev', 'songs-read-check');
    const url = `${env.apiBase}/admin/songs`;
    if (!url.startsWith(env.apiBase)) throw new Error('Blocked non-DEV song request.');

    els.refresh.disabled = true;
    els.message.textContent = 'Loading DEV song catalog…';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'x-admin-token': token, 'accept': 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      songs = normalizeRows(payload);
      els.message.textContent = 'DEV song catalog loaded.';
      renderSongs();
    } catch (error) {
      songs = [];
      els.message.textContent = `Unable to load DEV songs: ${error.message}`;
      els.body.innerHTML = '<tr><td colspan="8" class="muted">Load failed.</td></tr>';
      els.count.textContent = '';
    } finally {
      els.refresh.disabled = false;
    }
  }

  function normalizeRows(payload) {
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

  function yesNo(value) {
    if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 'Yes';
    return 'No';
  }

  function mediaLink(url, label) {
    const value = String(url || '').trim();
    if (!/^https?:\/\//i.test(value)) return '—';
    return `<a href="${escapeAttr(value)}" target="_blank" rel="noopener">${label}</a>`;
  }

  function renderSongs() {
    const query = String(els.search.value || '').trim().toLowerCase();
    const filtered = query ? songs.filter(song => {
      const haystack = [
        pick(song, ['display_title', 'song_name', 'title']),
        pick(song, ['artist', 'artist_name']),
        pick(song, ['genre']),
        pick(song, ['song_key']),
        pick(song, ['public_visibility'])
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    }) : songs;

    els.count.textContent = `${filtered.length.toLocaleString()} of ${songs.length.toLocaleString()} DEV songs shown`;

    if (!filtered.length) {
      els.body.innerHTML = '<tr><td colspan="8" class="muted">No matching songs.</td></tr>';
      return;
    }

    els.body.innerHTML = filtered.map(song => {
      const title = String(pick(song, ['display_title', 'song_name', 'title', 'song_key'], 'Untitled'));
      const artist = String(pick(song, ['artist', 'artist_name'], ''));
      const genre = String(pick(song, ['genre'], ''));
      const key = String(pick(song, ['song_key'], ''));
      const visibility = String(pick(song, ['public_visibility'], 'visible'));
      const audio = pick(song, ['audio_url']);
      const video = pick(song, ['video_link', 'video_url']);
      const enhanced = pick(song, ['enhanced_visuals_enabled'], false);

      return `<tr>
        <td>${escapeHtml(title)}</td>
        <td>${escapeHtml(artist)}</td>
        <td>${escapeHtml(genre)}</td>
        <td><code>${escapeHtml(key)}</code></td>
        <td>${escapeHtml(visibility)}</td>
        <td>${mediaLink(audio, 'Audio')}</td>
        <td>${mediaLink(video, 'Video')}</td>
        <td>${yesNo(enhanced)}</td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  els.search.addEventListener('input', renderSongs);
  els.refresh.addEventListener('click', loadSongs);
  loadSongs();
})();
