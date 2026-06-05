const API_BASE_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/songs';
const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';
const RADIO_DEV_BASE_URL = 'https://elettro.github.io/stashbox/radio/dev/';

const editableFields = [
  { name: 'song_name', label: 'Song name', type: 'text' },
  { name: 'display_title', label: 'Display title', type: 'text' },
  { name: 'artist', label: 'Artist', type: 'text' },
  { name: 'album_name', label: 'Album', type: 'text' },
  { name: 'genre', label: 'Genre', type: 'text' },
  { name: 'secondary_genre', label: 'Secondary genre', type: 'text' },
  { name: 'release_format', label: 'Release format', type: 'text' },
  { name: 'audio_url', label: 'Audio URL', type: 'url', full: true },
  { name: 'song_artwork_url', label: 'Song artwork URL', type: 'url', full: true },
  { name: 'video_link', label: 'Video link', type: 'url', full: true },
  { name: 'public_track_note', label: 'Public track note', type: 'textarea', full: true },
  { name: 'show_public_note', label: 'Show public note', type: 'checkbox' },
  { name: 'public_video_note', label: 'Public video note', type: 'textarea', full: true },
  { name: 'video_setlist', label: 'Video setlist', type: 'textarea', full: true },
  { name: 'public_visibility', label: 'Public visibility', type: 'checkbox' },
  { name: 'exclusive', label: 'Exclusive', type: 'checkbox' },
  { name: 'explicit', label: 'Explicit', type: 'checkbox' },
  { name: 'live_recording', label: 'Live recording', type: 'checkbox' },
  { name: 'featured', label: 'Featured', type: 'checkbox' },
  {
    name: 'specific_product_urls',
    label: 'Specific product URLs',
    type: 'textarea',
    full: true,
    help: 'Enter one URL per line. Blank lines are ignored.'
  },
  { name: 'spotify_url', label: 'Spotify URL', type: 'url', full: true },
  { name: 'apple_music_url', label: 'Apple Music URL', type: 'url', full: true },
  { name: 'youtube_music_url', label: 'YouTube Music URL', type: 'url', full: true },
  { name: 'official_song_page_url', label: 'Official song page URL', type: 'url', full: true },
  { name: 'shop_url', label: 'Shop URL', type: 'url', full: true },
  { name: 'internal_version_name', label: 'Internal version name', type: 'text' },
  {
    name: 'mood_tags',
    label: 'Mood tags',
    type: 'text',
    full: true,
    help: 'Enter tags separated by commas. Empty tags are ignored.'
  },
  { name: 'internal_notes', label: 'Internal notes', type: 'textarea', full: true }
];

const plainTextFields = new Set([
  'public_track_note',
  'public_video_note',
  'video_setlist',
  'internal_notes',
  'song_name',
  'display_title',
  'artist',
  'album_name',
  'genre',
  'secondary_genre',
  'release_format',
  'audio_url',
  'song_artwork_url',
  'video_link',
  'spotify_url',
  'apple_music_url',
  'youtube_music_url',
  'official_song_page_url',
  'shop_url',
  'internal_version_name'
]);

const booleanFields = new Set([
  'show_public_note',
  'exclusive',
  'explicit',
  'live_recording',
  'featured',
  'public_visibility'
]);

const fieldElements = new Map();

let songs = [];
let filteredSongs = [];
let selectedSong = null;
let selectedSongKey = '';
let messageTimer = null;

const els = {
  tokenPanel: document.getElementById('tokenPanel'),
  adminPanel: document.getElementById('adminPanel'),
  adminToken: document.getElementById('adminToken'),
  saveTokenButton: document.getElementById('saveTokenButton'),
  clearTokenButton: document.getElementById('clearTokenButton'),
  tokenStatus: document.getElementById('tokenStatus'),
  refreshSongsButton: document.getElementById('refreshSongsButton'),
  songSearch: document.getElementById('songSearch'),
  songCount: document.getElementById('songCount'),
  songTableBody: document.getElementById('songTableBody'),
  editHeading: document.getElementById('editHeading'),
  selectedSongKey: document.getElementById('selectedSongKey'),
  emptyEditor: document.getElementById('emptyEditor'),
  editForm: document.getElementById('editForm'),
  formFields: document.getElementById('formFields'),
  saveChangesButton: document.getElementById('saveChangesButton'),
  cancelChangesButton: document.getElementById('cancelChangesButton'),
  message: document.getElementById('message')
};

document.addEventListener('DOMContentLoaded', () => {
  buildEditForm();
  bindEvents();
  initializeAdmin();
});

function bindEvents() {
  els.saveTokenButton.addEventListener('click', saveToken);
  els.adminToken.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveToken();
    }
  });
  els.clearTokenButton.addEventListener('click', clearToken);
  els.refreshSongsButton.addEventListener('click', () => loadSongs());
  els.songSearch.addEventListener('input', renderSongList);
  els.editForm.addEventListener('submit', saveSelectedSong);
  els.cancelChangesButton.addEventListener('click', () => {
    if (selectedSongKey) {
      loadSongDetails(selectedSongKey);
    }
  });
}

function initializeAdmin() {
  const token = getToken();
  updateTokenUi(Boolean(token));

  if (token) {
    loadSongs();
  } else {
    els.adminToken.focus();
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function saveToken() {
  const token = els.adminToken.value.trim();

  if (!token) {
    showMessage('Enter an admin token before saving.', 'error');
    return;
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  els.adminToken.value = '';
  updateTokenUi(true);
  loadSongs();
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  songs = [];
  filteredSongs = [];
  selectedSong = null;
  selectedSongKey = '';
  renderSongList();
  clearEditor();
  updateTokenUi(false);
  showMessage('Admin token cleared from this browser.', 'success');
  els.adminToken.focus();
}

function updateTokenUi(hasToken) {
  els.tokenStatus.textContent = hasToken ? 'Token saved locally' : 'No token saved';
  els.tokenPanel.classList.toggle('hidden', hasToken);
  els.adminPanel.classList.toggle('hidden', !hasToken);
  els.clearTokenButton.classList.toggle('hidden', !hasToken);
}

async function adminFetch(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error('Enter and save an admin token first.');
  }

  const headers = {
    'x-admin-token': token,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized. Check admin token.');
    }

    throw new Error(`API error ${response.status}: ${getApiErrorMessage(data, response.statusText)}`);
  }

  return data;
}

function getApiErrorMessage(data, fallback) {
  const fallbackMessage = fallback || 'API request failed.';

  if (!data) {
    return fallbackMessage;
  }

  if (typeof data === 'string') {
    return data;
  }

  const parsedBody = parseJsonMaybe(data.body);
  const backendDetails = [
    data.error,
    data.message,
    data.detail,
    data.details,
    data.field,
    parsedBody?.error,
    parsedBody?.message,
    parsedBody?.detail,
    parsedBody?.details,
    parsedBody?.field
  ]
    .filter(Boolean)
    .map((detail) => (typeof detail === 'string' ? detail : JSON.stringify(detail)));

  const rawDetails = JSON.stringify(parsedBody || data);

  if (backendDetails.length && !backendDetails.includes(rawDetails)) {
    backendDetails.push(`Raw response: ${rawDetails}`);
  }

  return backendDetails.length ? backendDetails.join(' | ') : rawDetails || fallbackMessage;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadSongs({ silent = false } = {}) {
  setBusy(els.refreshSongsButton, true);

  try {
    const data = await adminFetch(API_BASE_URL);
    songs = normalizeSongsResponse(data);
    renderSongList();

    if (!silent) {
      showMessage(`Loaded ${songs.length} song${songs.length === 1 ? '' : 's'}.`, 'success');
    }
  } catch (error) {
    showMessage(`Could not load song list: ${error.message}`, 'error');
  } finally {
    setBusy(els.refreshSongsButton, false);
  }
}

function normalizeSongsResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.songs)) {
    return data.songs;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.body)) {
    return data.body;
  }

  if (typeof data?.body === 'string') {
    try {
      const parsedBody = JSON.parse(data.body);
      return normalizeSongsResponse(parsedBody);
    } catch {
      return [];
    }
  }

  return [];
}

function renderSongList() {
  const query = els.songSearch.value.trim().toLowerCase();
  filteredSongs = songs.filter((song) => songMatchesQuery(song, query));

  els.songCount.textContent = `${filteredSongs.length} of ${songs.length} song${songs.length === 1 ? '' : 's'}`;
  els.songTableBody.innerHTML = '';

  if (!filteredSongs.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" class="song-meta">No matching songs.</td>';
    els.songTableBody.appendChild(row);
    return;
  }

  filteredSongs.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.classList.toggle('is-selected', songKey === selectedSongKey);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('click', (event) => {
      if (isCardActionEvent(event)) {
        return;
      }

      loadSongDetails(songKey);
    });
    row.addEventListener('keydown', (event) => {
      if (isCardActionEvent(event)) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        loadSongDetails(songKey);
      }
    });

    row.appendChild(buildSongCell(song, songKey));
    row.appendChild(buildStatsCell(song));
    row.appendChild(buildUpdatedCell(song));
    els.songTableBody.appendChild(row);
  });
}

function isCardActionEvent(event) {
  return Boolean(event.target.closest('a, button'));
}

function songMatchesQuery(song, query) {
  if (!query) {
    return true;
  }

  return [song.display_title, song.artist, song.album_name, song.genre, getSongKey(song)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function buildSongCell(song, songKey) {
  const cell = document.createElement('td');
  cell.innerHTML = `
    <span class="song-title"></span>
    <span class="song-meta"></span>
    <div class="song-card-actions">
      <button class="song-action-button" type="button">Edit</button>
      <a class="song-action-button song-action-link" target="_blank" rel="noopener noreferrer">Open in Radio</a>
    </div>
    <div class="badges"></div>
  `;
  cell.querySelector('.song-title').textContent = song.display_title || song.song_name || 'Untitled song';
  cell.querySelector('.song-meta').textContent = [song.artist, song.album_name, song.genre, song.release_format].filter(Boolean).join(' · ') || songKey;

  const editButton = cell.querySelector('.song-action-button[type="button"]');
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    loadSongDetails(songKey);
  });

  const radioLink = cell.querySelector('.song-action-link');
  radioLink.href = `${RADIO_DEV_BASE_URL}?song=${encodeURIComponent(songKey)}`;
  radioLink.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const badges = cell.querySelector('.badges');
  badges.appendChild(makeBadge('public', toBoolean(song.public_visibility)));

  if (song.album_name) {
    badges.appendChild(makeBadge('album', song.album_name));
  }

  badges.appendChild(makeBadge('format', song.release_format));
  return cell;
}

function buildStatsCell(song) {
  const cell = document.createElement('td');
  const stats = document.createElement('div');
  stats.className = 'stats-grid';

  [
    ['plays', song.total_plays],
    ['likes', song.likes],
    ['shares', song.shares],
    ['video', song.video_clicks],
    ['products', song.product_clicks]
  ].forEach(([label, value]) => {
    const stat = document.createElement('span');
    stat.className = 'stat';
    stat.textContent = `${label}: ${formatNumber(value)}`;
    stats.appendChild(stat);
  });

  cell.appendChild(stats);
  return cell;
}

function buildUpdatedCell(song) {
  const cell = document.createElement('td');
  const line = document.createElement('div');
  line.className = 'updated-line';
  line.textContent = formatDate(song.updated_at);
  cell.appendChild(line);
  return cell;
}

function makeBadge(label, value) {
  const badge = document.createElement('span');
  badge.className = `badge ${value ? 'badge-on' : ''}`;
  badge.textContent = `${label}: ${formatDisplayValue(value)}`;
  return badge;
}

async function loadSongDetails(songKey) {
  if (!songKey) {
    showMessage('Selected song is missing a song_key.', 'error');
    return;
  }

  selectedSongKey = songKey;
  renderSongList();
  setEditorLoading(true);

  try {
    const data = await adminFetch(`${API_BASE_URL}/${encodeURIComponent(songKey)}`);
    selectedSong = normalizeSongResponse(data);
    selectedSongKey = getSongKey(selectedSong) || songKey;
    populateEditor(selectedSong);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setEditorLoading(false);
  }
}

function normalizeSongResponse(data) {
  if (data?.song) {
    return data.song;
  }

  if (data?.item) {
    return data.item;
  }

  if (typeof data?.body === 'string') {
    try {
      return normalizeSongResponse(JSON.parse(data.body));
    } catch {
      return data;
    }
  }

  return data || {};
}

function buildEditForm() {
  const checkboxWrap = document.createElement('div');
  checkboxWrap.className = 'checkbox-grid';

  editableFields.forEach((field) => {
    const fieldId = `field_${field.name}`;

    if (field.type === 'checkbox') {
      const label = document.createElement('label');
      label.className = 'checkbox-field';
      label.setAttribute('for', fieldId);

      const input = document.createElement('input');
      input.id = fieldId;
      input.name = field.name;
      input.type = 'checkbox';
      fieldElements.set(field.name, input);

      const span = document.createElement('span');
      span.textContent = field.label;

      label.append(input, span);
      checkboxWrap.appendChild(label);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = `field ${field.full ? 'field-full' : ''}`;

    const label = document.createElement('label');
    label.setAttribute('for', fieldId);
    label.textContent = field.label;

    const input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    input.id = fieldId;
    input.name = field.name;

    if (field.type !== 'textarea') {
      input.type = field.type;
    }

    fieldElements.set(field.name, input);
    wrap.append(label, input);

    if (field.help) {
      const help = document.createElement('div');
      help.className = 'field-help';
      help.textContent = field.help;
      wrap.appendChild(help);
    }

    els.formFields.appendChild(wrap);
  });

  els.formFields.appendChild(checkboxWrap);
}

function populateEditor(song) {
  selectedSong = song;
  selectedSongKey = getSongKey(song) || selectedSongKey;
  els.editHeading.textContent = song.display_title || song.song_name || 'Untitled song';
  els.selectedSongKey.textContent = selectedSongKey;
  els.emptyEditor.classList.add('hidden');
  els.editForm.classList.remove('hidden');

  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    const value = song[field.name];

    if (field.type === 'checkbox') {
      input.checked = toBoolean(value);
    } else if (field.name === 'specific_product_urls') {
      input.value = normalizeArrayValue(value, '\n').join('\n');
    } else if (field.name === 'mood_tags') {
      input.value = normalizeArrayValue(value, ',').join(', ');
    } else if (Array.isArray(value)) {
      input.value = value.join('\n');
    } else if (value === null || value === undefined) {
      input.value = '';
    } else {
      input.value = value;
    }
  });
}

function clearEditor() {
  els.editHeading.textContent = 'Select a song';
  els.selectedSongKey.textContent = '';
  els.emptyEditor.classList.remove('hidden');
  els.editForm.classList.add('hidden');
  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    if (field.type === 'checkbox') {
      input.checked = false;
    } else {
      input.value = '';
    }
  });
}

async function saveSelectedSong(event) {
  event.preventDefault();

  if (!selectedSongKey) {
    showMessage('Select a song before saving.', 'error');
    return;
  }

  const payload = buildUpdatePayload();
  const changedFields = Object.keys(payload);

  if (!changedFields.length) {
    showMessage('No changes to save. The selected song already matches the form values.', 'success');
    return;
  }

  setBusy(els.saveChangesButton, true);

  try {
    const data = await adminFetch(`${API_BASE_URL}/${encodeURIComponent(selectedSongKey)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const updatedSong = normalizeSongResponse(data);
    showMessage(`Saved ${formatSongTitle(selectedSong)} (${changedFields.join(', ')}).`, 'success');
    await loadSongs({ silent: true });

    if (updatedSong && Object.keys(updatedSong).length) {
      populateEditor({ ...selectedSong, ...updatedSong });
    }

    await loadSongDetails(selectedSongKey);
  } catch (error) {
    showMessage(`Save failed for ${formatSongTitle(selectedSong)}: ${error.message}`, 'error');
  } finally {
    setBusy(els.saveChangesButton, false);
  }
}

function buildUpdatePayload() {
  return editableFields.reduce((payload, field) => {
    const nextValue = getFieldPayloadValue(field);
    const currentValue = getComparableFieldValue(field, selectedSong?.[field.name]);

    if (areFieldValuesEqual(nextValue, currentValue)) {
      return payload;
    }

    payload[field.name] = nextValue;
    return payload;
  }, {});
}

function getFieldPayloadValue(field) {
  const input = fieldElements.get(field.name);

  if (booleanFields.has(field.name)) {
    return Boolean(input.checked);
  }

  if (field.name === 'specific_product_urls') {
    return parseLineSeparatedArray(input.value);
  }

  if (field.name === 'mood_tags') {
    return parseCommaSeparatedArray(input.value);
  }

  if (plainTextFields.has(field.name)) {
    return String(input.value || '').trim();
  }

  return String(input.value || '').trim();
}

function getComparableFieldValue(field, value) {
  if (booleanFields.has(field.name)) {
    return toBoolean(value);
  }

  if (field.name === 'specific_product_urls') {
    return normalizeArrayValue(value, '\n');
  }

  if (field.name === 'mood_tags') {
    return normalizeArrayValue(value, ',');
  }

  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeArrayValue(value, stringSeparator) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (typeof value === 'string') {
    return stringSeparator === ',' ? parseCommaSeparatedArray(value) : parseLineSeparatedArray(value);
  }

  return [];
}

function parseLineSeparatedArray(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCommaSeparatedArray(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }

  return false;
}

function areFieldValuesEqual(nextValue, currentValue) {
  if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
    return JSON.stringify(nextValue) === JSON.stringify(currentValue);
  }

  return nextValue === currentValue;
}

function getSongKey(song) {
  return song?.song_key || song?.id || song?.key || '';
}

function formatSongTitle(song) {
  return song?.display_title || song?.song_name || selectedSongKey || 'selected song';
}

function setBusy(button, isBusy) {
  button.disabled = isBusy;
}

function setEditorLoading(isLoading) {
  els.saveChangesButton.disabled = isLoading;
  els.cancelChangesButton.disabled = isLoading;
  if (isLoading) {
    els.editHeading.textContent = 'Loading song…';
  }
}

function showMessage(text, type = 'success') {
  window.clearTimeout(messageTimer);
  els.message.textContent = text;
  els.message.className = `message ${type}`;
  messageTimer = window.setTimeout(() => {
    els.message.classList.add('hidden');
  }, type === 'error' ? 7000 : 4000);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatDisplayValue(value) {
  if (value === true) {
    return 'yes';
  }

  if (value === false) {
    return 'no';
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return String(value);
}
