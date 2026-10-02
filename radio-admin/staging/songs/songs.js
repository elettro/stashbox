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
    body: document.getElementById('songsBody'),
    editor: document.getElementById('songEditor'),
    editorHeading: document.getElementById('editorHeading'),
    editorModeText: document.getElementById('editorModeText'),
    editorMessage: document.getElementById('editorMessage'),
    newSongButton: document.getElementById('newSongButton'),
    generateKeyButton: document.getElementById('generateKeyButton'),
    saveSongButton: document.getElementById('saveSongButton')
  };

  const fieldGroups = [
    {
      title: 'Identity',
      fields: [
        { name: 'song_key', label: 'Song Key', type: 'text', required: true, createOnly: true },
        { name: 'song_name', label: 'Song Name', type: 'text', required: true },
        { name: 'display_title', label: 'Display Title', type: 'text' },
        { name: 'artist', label: 'Artist', type: 'text', required: true },
        { name: 'album_name', label: 'Album', type: 'text' },
        { name: 'genre', label: 'Genre', type: 'text', required: true },
        { name: 'secondary_genre', label: '2nd Genre', type: 'text' },
        { name: 'internal_version_name', label: 'Internal Version Name', type: 'text', full: true }
      ]
    },
    {
      title: 'Classification',
      fields: [
        { name: 'languages', label: 'Languages', type: 'text', full: true, help: 'Comma-separated. Leave blank for instrumental/no language.' },
        { name: 'release_format', label: 'Release Format', type: 'select', required: true, options: ['single', 'video_only', 'album_track', 'live_recording', 'demo', 'unreleased'] },
        { name: 'song_origin', label: 'Song Origin', type: 'select', options: ['original', 'cover', 'traditional', 'live recording', 'public domain', 'remix', 'instrumental', 'AI assisted', 'unknown'] },
        { name: 'mood_tags', label: 'Moods', type: 'text', full: true, help: 'Comma-separated mood tags.' }
      ]
    },
    {
      title: 'Media',
      fields: [
        { name: 'audio_url', label: 'Audio URL', type: 'url', full: true },
        { name: 'video_link', label: 'Video Link', type: 'url', full: true },
        { name: 'song_artwork_url', label: 'Song Artwork URL', type: 'url', full: true }
      ]
    },
    {
      title: 'Publishing',
      fields: [
        { name: 'public_visibility', label: 'Public Visibility', type: 'select', required: true, options: ['visible', 'hidden', 'archived'] },
        { name: 'exclusive', label: 'Exclusive', type: 'checkbox' },
        { name: 'explicit', label: 'Explicit', type: 'checkbox' },
        { name: 'live_recording', label: 'Live Recording', type: 'checkbox' },
        { name: 'featured', label: 'Featured', type: 'checkbox' },
        { name: 'show_public_note', label: 'Show Public Notes', type: 'checkbox' }
      ]
    },
    {
      title: 'Links & Products',
      fields: [
        { name: 'specific_product_urls', label: 'Specific Product URLs', type: 'textarea', full: true, help: 'One product URL per line.' },
        { name: 'shop_url', label: 'Shop URL', type: 'url', full: true },
        { name: 'spotify_url', label: 'Spotify URL', type: 'url', full: true },
        { name: 'apple_music_url', label: 'Apple Music URL', type: 'url', full: true },
        { name: 'youtube_music_url', label: 'YouTube Music URL', type: 'url', full: true },
        { name: 'official_song_page_url', label: 'Official Song Page URL', type: 'url', full: true }
      ]
    },
    {
      title: 'Notes',
      fields: [
        { name: 'public_track_note', label: 'Public Track Notes', type: 'textarea', full: true },
        { name: 'public_video_note', label: 'Public Video Notes', type: 'textarea', full: true },
        { name: 'video_setlist', label: 'Video Setlist', type: 'textarea', full: true },
        { name: 'internal_notes', label: 'Internal Notes', type: 'textarea', full: true }
      ]
    },
    {
      title: 'Song Experience',
      fields: [
        { name: 'enhanced_visuals_enabled', label: 'Enhanced Visuals Enabled', type: 'checkbox' },
        { name: 'shuffle_visuals', label: 'Shuffle Visuals', type: 'checkbox' },
        { name: 'visual_still_duration_seconds', label: 'Still Image Duration (seconds)', type: 'number' },
        { name: 'visual_assets', label: 'Visual Assets JSON', type: 'textarea', full: true, help: 'Existing modern field. Media upload migration will manage this automatically later.' }
      ]
    }
  ];

  const allFields = fieldGroups.flatMap(group => group.fields);
  const fieldsByName = new Map(allFields.map(field => [field.name, field]));
  let songs = [];
  let selectedSongKey = '';
  let editorMode = 'create';

  function getStoredToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return current;
    for (const key of env.legacyTokenStorageKeys || []) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return '';
  }

  function requireToken() {
    const token = getStoredToken();
    if (!token) throw new Error('No DEV admin token found. Save one on the staging Dashboard first.');
    return token;
  }

  async function apiRequest(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const token = requireToken();
    const url = `${env.apiBase}${path}`;
    const allowedPrefix = `${env.apiBase}/admin/songs`;
    if (!url.startsWith(allowedPrefix)) throw new Error('Blocked request outside the DEV Song CMS API boundary.');
    if (!['GET', 'HEAD'].includes(method)) migration.assertWriteAllowed('dev', 'songs');

    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        'x-admin-token': token,
        'accept': 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      cache: method === 'GET' ? 'no-store' : undefined
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { payload = text; }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object'
        ? (payload.error || payload.message || JSON.stringify(payload))
        : (payload || response.statusText);
      throw new Error(`${response.status}: ${detail}`);
    }
    return payload;
  }

  function buildEditor() {
    els.editor.innerHTML = fieldGroups.map(group => `
      <fieldset class="editor-group">
        <legend>${escapeHtml(group.title)}</legend>
        <div class="editor-grid">
          ${group.fields.map(renderField).join('')}
        </div>
      </fieldset>
    `).join('');
    openCreateMode();
  }

  function renderField(field) {
    const required = field.required ? ' required' : '';
    const full = field.full ? ' editor-field--full' : '';
    let control = '';
    if (field.type === 'select') {
      control = `<select id="field-${field.name}" name="${field.name}"${required}>${field.options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
    } else if (field.type === 'textarea') {
      control = `<textarea id="field-${field.name}" name="${field.name}" rows="4"${required}></textarea>`;
    } else if (field.type === 'checkbox') {
      control = `<label class="checkbox-control"><input id="field-${field.name}" name="${field.name}" type="checkbox" /> <span>Enabled</span></label>`;
    } else {
      control = `<input id="field-${field.name}" name="${field.name}" type="${field.type}"${required} />`;
    }
    return `<div class="editor-field${full}"><label for="field-${field.name}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>${control}${field.help ? `<small>${escapeHtml(field.help)}</small>` : ''}</div>`;
  }

  function fieldElement(name) {
    return document.getElementById(`field-${name}`);
  }

  function setFieldValue(field, value) {
    const el = fieldElement(field.name);
    if (!el) return;
    if (field.type === 'checkbox') {
      el.checked = value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
      return;
    }
    if (field.name === 'specific_product_urls' && Array.isArray(value)) {
      el.value = value.join('\n');
      return;
    }
    if ((field.name === 'languages' || field.name === 'mood_tags') && Array.isArray(value)) {
      el.value = value.join(', ');
      return;
    }
    if (field.name === 'visual_assets' && value && typeof value !== 'string') {
      el.value = JSON.stringify(value, null, 2);
      return;
    }
    el.value = value === undefined || value === null ? '' : String(value);
  }

  function clearEditor() {
    allFields.forEach(field => setFieldValue(field, field.type === 'checkbox' ? false : ''));
    setFieldValue(fieldsByName.get('release_format'), 'single');
    setFieldValue(fieldsByName.get('song_origin'), 'original');
    setFieldValue(fieldsByName.get('public_visibility'), 'visible');
    setFieldValue(fieldsByName.get('shuffle_visuals'), true);
    setFieldValue(fieldsByName.get('visual_still_duration_seconds'), 8);
  }

  function openCreateMode() {
    editorMode = 'create';
    selectedSongKey = '';
    clearEditor();
    const key = fieldElement('song_key');
    if (key) key.disabled = false;
    els.editorHeading.textContent = 'Create DEV Song';
    els.editorModeText.textContent = 'Create a song in the DEV catalog. PROD writes remain blocked.';
    els.saveSongButton.textContent = 'Create in DEV';
    els.editorMessage.textContent = 'DEV write guard active. PROD writes are blocked.';
  }

  function openEditMode(songKey) {
    const song = songs.find(item => String(item.song_key || '') === String(songKey || ''));
    if (!song) return;
    editorMode = 'edit';
    selectedSongKey = String(song.song_key || '');
    allFields.forEach(field => setFieldValue(field, song[field.name]));
    const key = fieldElement('song_key');
    if (key) key.disabled = true;
    els.editorHeading.textContent = `Edit DEV Song: ${song.display_title || song.song_name || selectedSongKey}`;
    els.editorModeText.textContent = 'Saving updates the selected DEV song only.';
    els.saveSongButton.textContent = 'Save DEV Changes';
    els.editorMessage.textContent = `Editing DEV song key: ${selectedSongKey}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function splitComma(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }

  function splitLines(value) {
    return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  }

  function readEditorPayload() {
    const payload = {};
    for (const field of allFields) {
      const el = fieldElement(field.name);
      if (!el) continue;
      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(el.checked);
      } else if (field.name === 'languages' || field.name === 'mood_tags') {
        payload[field.name] = splitComma(el.value);
      } else if (field.name === 'specific_product_urls') {
        payload[field.name] = splitLines(el.value);
      } else if (field.name === 'visual_assets') {
        const raw = String(el.value || '').trim();
        if (!raw) payload[field.name] = [];
        else {
          try { payload[field.name] = JSON.parse(raw); }
          catch (_) { throw new Error('Visual Assets JSON is not valid JSON.'); }
        }
      } else if (field.type === 'number') {
        const raw = String(el.value || '').trim();
        payload[field.name] = raw === '' ? null : Number(raw);
      } else {
        payload[field.name] = String(el.value || '').trim();
      }
    }
    return payload;
  }

  function validatePayload(payload) {
    const required = ['song_name', 'artist', 'genre', 'release_format', 'public_visibility'];
    if (editorMode === 'create') required.unshift('song_key');
    const missing = required.filter(name => !String(payload[name] || '').trim());
    if (missing.length) {
      const labels = missing.map(name => fieldsByName.get(name)?.label || name);
      throw new Error(`Fill required fields: ${labels.join(', ')}.`);
    }
    if (!String(payload.audio_url || '').trim() && !String(payload.video_link || '').trim()) {
      throw new Error('Audio URL or Video Link is required.');
    }
    if (payload.visual_still_duration_seconds !== null && (!Number.isFinite(payload.visual_still_duration_seconds) || payload.visual_still_duration_seconds <= 0)) {
      throw new Error('Still Image Duration must be a positive number.');
    }
  }

  function generateSongKey() {
    if (editorMode !== 'create') return;
    const title = String(fieldElement('display_title')?.value || fieldElement('song_name')?.value || '').trim();
    const artist = String(fieldElement('artist')?.value || '').trim();
    const source = [title, artist].filter(Boolean).join('-');
    const slug = source.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    fieldElement('song_key').value = slug;
    els.editorMessage.textContent = slug ? `Generated DEV song key: ${slug}` : 'Enter Song Name/Display Title and Artist before generating a key.';
  }

  async function saveSong() {
    let payload;
    try {
      payload = readEditorPayload();
      validatePayload(payload);
    } catch (error) {
      els.editorMessage.textContent = error.message;
      return;
    }

    const isCreate = editorMode === 'create';
    const targetKey = isCreate ? String(payload.song_key || '') : selectedSongKey;
    const path = isCreate ? '/admin/songs' : `/admin/songs/${encodeURIComponent(targetKey)}`;
    const method = isCreate ? 'POST' : 'PUT';
    if (!isCreate) delete payload.song_key;

    els.saveSongButton.disabled = true;
    els.editorMessage.textContent = isCreate ? 'Creating DEV song…' : `Saving DEV song ${targetKey}…`;

    try {
      await apiRequest(path, { method, body: JSON.stringify(payload) });
      els.editorMessage.textContent = isCreate ? `DEV song created: ${targetKey}` : `DEV song saved: ${targetKey}`;
      await loadSongs({ preserveMessage: true });
      if (isCreate) openEditMode(targetKey);
      else openEditMode(targetKey);
    } catch (error) {
      els.editorMessage.textContent = `DEV save failed: ${error.message}`;
    } finally {
      els.saveSongButton.disabled = false;
    }
  }

  async function loadSongs(options = {}) {
    if (!getStoredToken()) {
      els.message.textContent = 'No DEV admin token found. Save one on the staging Dashboard first.';
      els.body.innerHTML = '<tr><td colspan="9" class="muted">Authentication required.</td></tr>';
      return;
    }

    els.refresh.disabled = true;
    if (!options.preserveMessage) els.message.textContent = 'Loading DEV song catalog…';

    try {
      const payload = await apiRequest('/admin/songs', { method: 'GET' });
      songs = normalizeRows(payload);
      if (!options.preserveMessage) els.message.textContent = 'DEV song catalog loaded.';
      renderSongs();
    } catch (error) {
      songs = [];
      els.message.textContent = `Unable to load DEV songs: ${error.message}`;
      els.body.innerHTML = '<tr><td colspan="9" class="muted">Load failed.</td></tr>';
      els.count.textContent = '';
    } finally {
      els.refresh.disabled = false;
    }
  }

  function normalizeRows(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ['songs', 'items', 'rows', 'data', 'results']) {
      if (Array.isArray(payload && payload[key])) return payload[key];
      if (payload && payload[key] && typeof payload[key] === 'object') {
        for (const nestedKey of ['songs', 'items', 'rows', 'data', 'results']) {
          if (Array.isArray(payload[key][nestedKey])) return payload[key][nestedKey];
        }
      }
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
      els.body.innerHTML = '<tr><td colspan="9" class="muted">No matching songs.</td></tr>';
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
        <td><button type="button" class="secondary edit-song" data-song-key="${escapeAttr(key)}">Edit</button></td>
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
  els.refresh.addEventListener('click', () => loadSongs());
  els.newSongButton.addEventListener('click', openCreateMode);
  els.generateKeyButton.addEventListener('click', generateSongKey);
  els.saveSongButton.addEventListener('click', saveSong);
  els.body.addEventListener('click', event => {
    const button = event.target.closest('.edit-song');
    if (button) openEditMode(button.dataset.songKey);
  });

  buildEditor();
  loadSongs();
})();
