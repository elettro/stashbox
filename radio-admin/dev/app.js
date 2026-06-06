const API_BASE_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/songs';
const EVENTS_API_BASE_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/events';
const STATS_SUMMARY_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/summary';
const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';
const RADIO_DEV_BASE_URL = 'https://elettro.github.io/stashbox/radio/dev/';
const DEFAULT_TAB = 'dashboard';
const STASHBOX_PLACEHOLDER_ARTWORK = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" role="img" aria-label="Stashbox artwork placeholder">
    <defs>
      <linearGradient id="stashboxPlaceholderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#42d982"/>
        <stop offset="52%" stop-color="#17241f"/>
        <stop offset="100%" stop-color="#f0c04c"/>
      </linearGradient>
    </defs>
    <rect width="88" height="88" rx="18" fill="#111816"/>
    <rect x="7" y="7" width="74" height="74" rx="15" fill="url(#stashboxPlaceholderGradient)" opacity="0.72"/>
    <circle cx="44" cy="44" r="20" fill="rgba(8,11,10,0.72)"/>
    <path d="M38 31v26l22-13-22-13Z" fill="#f3f7ef"/>
  </svg>
`)}`;

const editableFields = [
  { name: 'song_key', label: 'Song key', type: 'text', createOnly: true, full: true, help: 'Unique URL-safe key for this song. You can generate it from display title + artist, then edit it manually.' },
  { name: 'song_name', label: 'Song name', type: 'text' },
  { name: 'display_title', label: 'Display title', type: 'text' },
  { name: 'artist', label: 'Artist', type: 'text' },
  { name: 'album_name', label: 'Album', type: 'text' },
  { name: 'genre', label: 'Genre', type: 'text' },
  { name: 'secondary_genre', label: 'Secondary genre', type: 'text' },
  { name: 'release_format', label: 'Release format', type: 'text' },
  { name: 'song_origin', label: 'Song origin', type: 'text' },
  { name: 'audio_url', label: 'Audio URL', type: 'url', full: true },
  { name: 'song_artwork_url', label: 'Song artwork URL', type: 'url', full: true },
  { name: 'video_link', label: 'Video link', type: 'url', full: true },
  { name: 'public_track_note', label: 'Public track note', type: 'textarea', full: true },
  { name: 'show_public_note', label: 'Show Public Note', type: 'checkbox' },
  { name: 'public_video_note', label: 'Public video note', type: 'textarea', full: true },
  { name: 'video_setlist', label: 'Video setlist', type: 'textarea', full: true },
  {
    name: 'public_visibility',
    label: 'Show in Radio',
    type: 'checkbox',
    help: 'Checked songs appear in the RDS-powered radio player. Uncheck only when you want to hide a song.'
  },
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
  'song_key',
  'song_name',
  'display_title',
  'artist',
  'album_name',
  'genre',
  'secondary_genre',
  'release_format',
  'song_origin',
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
  'featured'
]);

const kpiDefinitions = [
  { key: 'total_events', label: 'Total Events' },
  { key: 'events_last_24h', label: 'Events Last 24h' },
  { key: 'events_last_7d', label: 'Events Last 7 Days' },
  { key: 'play_starts', label: 'Play Starts' },
  { key: 'full_plays', label: 'Full Plays' },
  { key: 'partial_plays', label: 'Partial Plays' },
  { key: 'skips', label: 'Skips' },
  { key: 'likes', label: 'Likes' },
  { key: 'shares', label: 'Shares' },
  { key: 'video_clicks', label: 'Video Clicks' },
  { key: 'product_clicks', label: 'Product Clicks' },
  { key: 'total_seconds_played', label: 'Total Listening Time', formatter: formatListeningTime },
  { key: 'average_seconds_played', label: 'Average Seconds Played', formatter: formatAverageSeconds },
  { key: 'average_completion_percent', label: 'Average Completion %', formatter: formatPercentValue }
];

const todayStatDefinitions = [
  { key: 'events_today', label: 'Events Today' },
  { key: 'plays_today', label: 'Plays Today' },
  { key: 'likes_today', label: 'Likes Today' },
  { key: 'shares_today', label: 'Shares Today' },
  { key: 'product_clicks_today', label: 'Product Clicks Today' },
  { key: 'video_clicks_today', label: 'Video Clicks Today' }
];

const fieldElements = new Map();
const fieldWrappers = new Map();

const createRequiredFields = new Set([
  'song_key',
  'song_name',
  'display_title',
  'artist',
  'release_format',
  'public_visibility'
]);

const createDefaults = {
  song_key: '',
  song_name: '',
  display_title: '',
  artist: 'Stashbox',
  release_format: 'single',
  public_visibility: 'visible',
  exclusive: true,
  explicit: false,
  live_recording: false,
  featured: false,
  show_public_note: false,
  song_origin: 'original',
  mood_tags: [],
  specific_product_urls: []
};

let songs = [];
let filteredSongs = [];
let archivedSongs = [];
let events = [];
let statsSummary = null;
let statsSummaryError = '';
let selectedSong = null;
let selectedSongKey = '';
let messageTimer = null;
let activeTab = DEFAULT_TAB;
let editorMode = 'edit';

const els = {
  tokenPanel: document.getElementById('tokenPanel'),
  adminPanel: document.getElementById('adminPanel'),
  adminToken: document.getElementById('adminToken'),
  saveTokenButton: document.getElementById('saveTokenButton'),
  clearTokenButton: document.getElementById('clearTokenButton'),
  tokenStatus: document.getElementById('tokenStatus'),
  tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  dashboardView: document.getElementById('dashboardView'),
  songsView: document.getElementById('songsView'),
  editView: document.getElementById('editView'),
  archiveView: document.getElementById('archiveView'),
  eventsView: document.getElementById('eventsView'),
  refreshDashboardButton: document.getElementById('refreshDashboardButton'),
  kpiGrid: document.getElementById('kpiGrid'),
  statsSummaryWarning: document.getElementById('statsSummaryWarning'),
  statsGeneratedAt: document.getElementById('statsGeneratedAt'),
  todayStatsGrid: document.getElementById('todayStatsGrid'),
  devicesStatsList: document.getElementById('devicesStatsList'),
  eventTypesStatsList: document.getElementById('eventTypesStatsList'),
  topSongsTableBody: document.getElementById('topSongsTableBody'),
  likedSongsList: document.getElementById('likedSongsList'),
  sharedSongsList: document.getElementById('sharedSongsList'),
  watchedVideosList: document.getElementById('watchedVideosList'),
  productClicksList: document.getElementById('productClicksList'),
  engagementList: document.getElementById('engagementList'),
  skipRateList: document.getElementById('skipRateList'),
  createSongButton: document.getElementById('createSongButton'),
  refreshSongsButton: document.getElementById('refreshSongsButton'),
  refreshArchiveButton: document.getElementById('refreshArchiveButton'),
  refreshEventsButton: document.getElementById('refreshEventsButton'),
  eventLimit: document.getElementById('eventLimit'),
  eventsStatus: document.getElementById('eventsStatus'),
  eventsTableBody: document.getElementById('eventsTableBody'),
  songSearch: document.getElementById('songSearch'),
  songCount: document.getElementById('songCount'),
  songTableBody: document.getElementById('songTableBody'),
  archiveCount: document.getElementById('archiveCount'),
  archiveTableBody: document.getElementById('archiveTableBody'),
  editHeading: document.getElementById('editHeading'),
  selectedSongKey: document.getElementById('selectedSongKey'),
  selectedVisibility: document.getElementById('selectedVisibility'),
  emptyEditor: document.getElementById('emptyEditor'),
  editForm: document.getElementById('editForm'),
  formFields: document.getElementById('formFields'),
  saveChangesButton: document.getElementById('saveChangesButton'),
  cancelChangesButton: document.getElementById('cancelChangesButton'),
  dangerZone: document.getElementById('dangerZone'),
  deleteSongButton: document.getElementById('deleteSongButton'),
  deleteModal: document.getElementById('deleteModal'),
  cancelDeleteButton: document.getElementById('cancelDeleteButton'),
  confirmDeleteButton: document.getElementById('confirmDeleteButton'),
  message: document.getElementById('message')
};

document.addEventListener('DOMContentLoaded', () => {
  buildEditForm();
  bindEvents();
  renderDashboard();
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
  els.refreshDashboardButton.addEventListener('click', () => loadDashboardData());
  els.createSongButton.addEventListener('click', startCreateSong);
  els.refreshSongsButton.addEventListener('click', () => loadSongs({ preserveSelection: true }));
  els.refreshArchiveButton.addEventListener('click', () => loadSongs({ preserveSelection: true }));
  els.refreshEventsButton.addEventListener('click', () => loadEvents());
  els.eventLimit.addEventListener('change', () => loadEvents());
  els.songSearch.addEventListener('input', renderSongList);
  els.saveChangesButton.addEventListener('click', () => {
    console.log("Save clicked");
  });
  els.editForm.addEventListener('submit', saveSelectedSong);
  els.deleteSongButton.addEventListener('click', openDeleteModal);
  els.cancelDeleteButton.addEventListener('click', closeDeleteModal);
  els.confirmDeleteButton.addEventListener('click', archiveSelectedSong);
  els.deleteModal.addEventListener('click', (event) => {
    if (event.target === els.deleteModal) {
      closeDeleteModal();
    }
  });
  els.cancelChangesButton.addEventListener('click', () => {
    if (editorMode === 'create') {
      clearEditor();
      return;
    }

    if (selectedSongKey) {
      loadSongDetails(selectedSongKey);
    }
  });
  els.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

function initializeAdmin() {
  const token = getToken();
  updateTokenUi(Boolean(token));

  if (token) {
    setActiveTab(DEFAULT_TAB);
    loadDashboardData();
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
  setActiveTab(DEFAULT_TAB);
  loadDashboardData();
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  songs = [];
  filteredSongs = [];
  selectedSong = null;
  selectedSongKey = '';
  events = [];
  statsSummary = null;
  statsSummaryError = '';
  renderDashboard();
  renderSongList();
  renderArchiveList();
  renderEvents();
  clearEditor();
  updateTokenUi(false);
  setActiveTab(DEFAULT_TAB);
  showMessage('Admin token cleared from this browser.', 'success');
  els.adminToken.focus();
}

function updateTokenUi(hasToken) {
  els.tokenStatus.textContent = hasToken ? 'Token saved locally' : 'No token saved';
  els.tokenPanel.classList.toggle('hidden', hasToken);
  els.adminPanel.classList.toggle('hidden', !hasToken);
  els.clearTokenButton.classList.toggle('hidden', !hasToken);
}

function setActiveTab(tabName) {
  activeTab = tabName || DEFAULT_TAB;
  els.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  [
    ['dashboard', els.dashboardView],
    ['songs', els.songsView],
    ['events', els.eventsView],
    ['archive', els.archiveView],
    ['edit', els.editView]
  ].forEach(([name, view]) => {
    view.classList.toggle('hidden', name !== activeTab);
  });

  if (activeTab === 'events' && !events.length) {
    loadEvents();
  }
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
    const message = response.status === 401
      ? 'Unauthorized. Check admin token.'
      : `API error ${response.status}: ${getApiErrorMessage(data, response.statusText)}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
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

async function loadEvents() {
  const limit = getSelectedEventLimit();
  const url = `${EVENTS_API_BASE_URL}?limit=${encodeURIComponent(limit)}`;

  setBusy(els.refreshEventsButton, true);
  els.eventsStatus.textContent = `Loading latest ${limit} events…`;

  try {
    const data = await adminFetch(url);
    events = normalizeEventsResponse(data);
    renderEvents();
    showMessage(`Loaded ${events.length} event${events.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    events = [];
    renderEvents(error.message);
    showMessage(`Could not load events: ${error.message}`, 'error');
  } finally {
    setBusy(els.refreshEventsButton, false);
  }
}

function getSelectedEventLimit() {
  const selectedLimit = Number(els.eventLimit.value || 100);
  return [25, 50, 100, 200].includes(selectedLimit) ? selectedLimit : 100;
}

function normalizeEventsResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.events)) {
    return data.events;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.body)) {
    return data.body;
  }

  if (typeof data?.body === 'string') {
    try {
      return normalizeEventsResponse(JSON.parse(data.body));
    } catch {
      return [];
    }
  }

  return [];
}

function renderEvents(errorMessage = '') {
  els.eventsTableBody.innerHTML = '';

  if (errorMessage) {
    els.eventsStatus.textContent = errorMessage;
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9" class="song-meta">Could not load events.</td>';
    els.eventsTableBody.appendChild(row);
    return;
  }

  els.eventsStatus.textContent = events.length
    ? `${events.length} event${events.length === 1 ? '' : 's'} loaded. Newest first.`
    : 'No events loaded';

  if (!events.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9" class="song-meta">No events returned.</td>';
    els.eventsTableBody.appendChild(row);
    return;
  }

  events.forEach((event) => {
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDateTime(event.created_at || event.event_time || event.timestamp), 'event-time'));
    row.appendChild(buildEventTypeCell(event.event_type));
    row.appendChild(makeTextCell(formatEventSongTitle(event), 'song-title compact-title'));
    row.appendChild(makeTextCell(event.artist || event.artist_name || '—'));
    row.appendChild(makeTextCell(formatDisplayValue(event.device || event.device_type || event.platform || '—')));
    row.appendChild(makeTextCell(formatNumberOrDash(event.seconds_played ?? event.played_seconds ?? event.duration_seconds)));
    row.appendChild(makeTextCell(formatCompletionPercent(event.completion_percent ?? event.completion_pct ?? event.completion)));
    row.appendChild(buildProductUrlCell(event.product_url));
    row.appendChild(makeTextCell(event.session_id || event.sessionId || '—', 'song-key-inline'));
    els.eventsTableBody.appendChild(row);
  });
}

function buildEventTypeCell(eventType) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `event-badge event-badge-${sanitizeClassName(eventType)}`;
  badge.textContent = formatEventType(eventType);
  cell.appendChild(badge);
  return cell;
}

function buildProductUrlCell(productUrl) {
  const cell = document.createElement('td');
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    cell.textContent = '—';
    return cell;
  }

  const link = document.createElement('a');
  link.className = 'song-action-button event-product-link';
  link.href = normalizedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Product';
  cell.appendChild(link);
  return cell;
}

function formatEventSongTitle(event) {
  return event.display_title || event.song_name || event.song_key || '—';
}

function formatEventType(eventType) {
  return String(eventType || 'unknown').replace(/_/g, ' ');
}

function sanitizeClassName(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatNumberOrDash(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(number) : String(value);
}

function formatCompletionPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return `${Math.round(percent)}%`;
}


async function loadDashboardData({ silent = false, preserveSelection = Boolean(selectedSongKey) } = {}) {
  setBusy(els.refreshDashboardButton, true);
  setBusy(els.refreshSongsButton, true);
  setBusy(els.refreshArchiveButton, true);

  const [songsResult, statsResult] = await Promise.allSettled([
    fetchSongsData({ preserveSelection }),
    fetchStatsSummaryData()
  ]);

  if (songsResult.status === 'rejected') {
    showMessage(`Could not load song list: ${songsResult.reason.message}`, 'error');
  }

  if (statsResult.status === 'rejected') {
    statsSummary = null;
    statsSummaryError = statsResult.reason.message;
    showMessage(`Could not load stats summary: ${statsSummaryError}`, 'error');
  }

  renderDashboard();
  renderSongList();
  renderArchiveList();

  if (!silent && songsResult.status === 'fulfilled' && statsResult.status === 'fulfilled') {
    showMessage(`Loaded dashboard stats plus ${getActiveSongs().length} active and ${getArchivedSongs().length} archived song${songs.length === 1 ? '' : 's'}.`, 'success');
  }

  setBusy(els.refreshDashboardButton, false);
  setBusy(els.refreshSongsButton, false);
  setBusy(els.refreshArchiveButton, false);
}

async function fetchSongsData({ preserveSelection = Boolean(selectedSongKey) } = {}) {
  const previousSelectedSongKey = preserveSelection ? selectedSongKey : '';
  const data = await adminFetch(API_BASE_URL);
  songs = normalizeSongsResponse(data);

  if (previousSelectedSongKey) {
    preserveSelectedSong(previousSelectedSongKey);
  }

  return songs;
}

async function fetchStatsSummaryData() {
  const data = await adminFetch(STATS_SUMMARY_API_URL);
  statsSummary = normalizeStatsSummaryResponse(data);
  statsSummaryError = '';
  return statsSummary;
}

function normalizeStatsSummaryResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeStatsSummaryResponse(JSON.parse(data.body));
    } catch {
      return { summary: {}, today: {}, devices: [], event_types: [], generated_at: '' };
    }
  }

  return {
    summary: data?.summary || {},
    today: data?.today || {},
    devices: Array.isArray(data?.devices) ? data.devices : [],
    event_types: Array.isArray(data?.event_types) ? data.event_types : [],
    generated_at: data?.generated_at || ''
  };
}

async function loadSongs({ silent = false, preserveSelection = Boolean(selectedSongKey) } = {}) {
  setBusy(els.refreshSongsButton, true);
  setBusy(els.refreshArchiveButton, true);

  try {
    await fetchSongsData({ preserveSelection });
    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (!silent) {
      showMessage(`Loaded ${getActiveSongs().length} active and ${getArchivedSongs().length} archived song${songs.length === 1 ? '' : 's'}.`, 'success');
    }
  } catch (error) {
    showMessage(`Could not load song list: ${error.message}`, 'error');
  } finally {
    setBusy(els.refreshSongsButton, false);
    setBusy(els.refreshArchiveButton, false);
  }
}

function preserveSelectedSong(songKey) {
  const refreshedSong = songs.find((song) => getSongKey(song) === songKey);

  if (!refreshedSong) {
    selectedSong = null;
    selectedSongKey = '';
    clearEditor();
    return;
  }

  selectedSong = refreshedSong;
  selectedSongKey = getSongKey(refreshedSong);

  if (!els.editForm.classList.contains('hidden')) {
    populateEditor(refreshedSong);
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


function getActiveSongs() {
  return songs.filter((song) => !isArchivedSong(song));
}

function getArchivedSongs() {
  archivedSongs = songs.filter((song) => isArchivedSong(song));
  return archivedSongs;
}

function isArchivedSong(songOrValue) {
  return normalizePublicVisibility(getPublicVisibilityValue(songOrValue)) === 'archived';
}

function renderDashboard() {
  const activeSongs = getActiveSongs();
  renderStatsSummaryWarning();
  renderStatsGeneratedAt();
  renderKpiCards(calculateDashboardTotals(activeSongs));
  renderTodayStats();
  renderDevicesStats();
  renderEventTypesStats();
  renderTopSongsTable(sortSongsByMetric('total_plays', activeSongs));
  renderRankList(els.likedSongsList, sortSongsByMetric('likes', activeSongs).slice(0, 5), 'likes');
  renderRankList(els.sharedSongsList, sortSongsByMetric('shares', activeSongs).slice(0, 5), 'shares');
  renderRankList(els.watchedVideosList, sortSongsByMetric('video_clicks', activeSongs), 'video clicks');
  renderRankList(els.productClicksList, sortSongsByMetric('product_clicks', activeSongs), 'product clicks');
  renderRankList(els.engagementList, sortSongsByEngagement(activeSongs).slice(0, 5), 'engagement', getSongEngagement);
  renderRankList(els.skipRateList, sortSongsBySkipRate(activeSongs), 'skip rate', getSongSkipRate, formatPercent);
}

function calculateDashboardTotals(songList) {
  const summary = statsSummary?.summary;

  if (summary) {
    return kpiDefinitions.reduce((totals, metric) => {
      totals[metric.key] = Number(summary[metric.key] || 0);
      return totals;
    }, {});
  }

  return {
    total_events: 0,
    events_last_24h: 0,
    events_last_7d: 0,
    play_starts: songList.reduce((sum, song) => sum + getMetricValue(song, 'total_plays'), 0),
    full_plays: songList.reduce((sum, song) => sum + getMetricValue(song, 'full_plays'), 0),
    partial_plays: songList.reduce((sum, song) => sum + getMetricValue(song, 'partial_plays'), 0),
    skips: songList.reduce((sum, song) => sum + getMetricValue(song, 'skip_count'), 0),
    likes: songList.reduce((sum, song) => sum + getMetricValue(song, 'likes'), 0),
    shares: songList.reduce((sum, song) => sum + getMetricValue(song, 'shares'), 0),
    video_clicks: songList.reduce((sum, song) => sum + getMetricValue(song, 'video_clicks'), 0),
    product_clicks: songList.reduce((sum, song) => sum + getMetricValue(song, 'product_clicks'), 0),
    total_seconds_played: songList.reduce((sum, song) => sum + getMetricValue(song, 'total_seconds_played'), 0),
    average_seconds_played: 0,
    average_completion_percent: 0
  };
}

function renderKpiCards(totals) {
  els.kpiGrid.innerHTML = '';

  kpiDefinitions.forEach((metric) => {
    const card = document.createElement('article');
    card.className = 'kpi-card';
    card.innerHTML = '<span class="kpi-label"></span><strong class="kpi-value"></strong>';
    card.querySelector('.kpi-label').textContent = metric.label;
    card.querySelector('.kpi-value').textContent = formatSummaryMetric(totals[metric.key], metric.formatter);
    els.kpiGrid.appendChild(card);
  });
}

function renderStatsSummaryWarning() {
  if (!els.statsSummaryWarning) {
    return;
  }

  els.statsSummaryWarning.classList.toggle('hidden', !statsSummaryError);
  els.statsSummaryWarning.textContent = statsSummaryError
    ? `Stats summary warning: ${statsSummaryError}`
    : '';
}

function renderStatsGeneratedAt() {
  if (!els.statsGeneratedAt) {
    return;
  }

  els.statsGeneratedAt.textContent = statsSummary?.generated_at
    ? `Stats generated: ${formatDateTime(statsSummary.generated_at)}`
    : 'Stats generated: —';
}

function renderTodayStats() {
  renderSummaryStatCards(els.todayStatsGrid, todayStatDefinitions, statsSummary?.today || {});
}

function renderSummaryStatCards(container, definitions, source) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  definitions.forEach((metric) => {
    const card = document.createElement('article');
    card.className = 'mini-stat-card';
    card.innerHTML = '<span class="mini-stat-label"></span><strong class="mini-stat-value"></strong>';
    card.querySelector('.mini-stat-label').textContent = metric.label;
    card.querySelector('.mini-stat-value').textContent = formatNumber(Number(source[metric.key] || 0));
    container.appendChild(card);
  });
}

function renderDevicesStats() {
  renderNamedCountList(els.devicesStatsList, statsSummary?.devices || [], 'device_type', ['desktop', 'mobile', 'unknown']);
}

function renderEventTypesStats() {
  renderNamedCountList(els.eventTypesStatsList, statsSummary?.event_types || [], 'event_type');
}

function renderNamedCountList(container, rows, labelKey, preferredOrder = []) {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  const counts = new Map();

  rows.forEach((row) => {
    const rawLabel = String(row[labelKey] || 'unknown').toLowerCase();
    counts.set(rawLabel, (counts.get(rawLabel) || 0) + Number(row.event_count || 0));
  });

  const labels = [
    ...preferredOrder,
    ...Array.from(counts.keys()).filter((label) => !preferredOrder.includes(label)).sort()
  ];

  if (!labels.length) {
    container.appendChild(makeEmptySummaryItem('No stats returned.'));
    return;
  }

  labels.forEach((label) => {
    const item = document.createElement('div');
    item.className = 'summary-list-item';
    item.innerHTML = '<span></span><strong></strong>';
    item.querySelector('span').textContent = formatDisplayValue(label);
    item.querySelector('strong').textContent = formatNumber(Number(counts.get(label) || 0));
    container.appendChild(item);
  });
}

function makeEmptySummaryItem(message) {
  const item = document.createElement('div');
  item.className = 'summary-list-item summary-list-empty';
  item.textContent = message;
  return item;
}

function formatSummaryMetric(value, formatter = formatNumber) {
  return formatter(Number(value || 0));
}

function formatListeningTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));

  if (totalSeconds < 60) {
    return `${formatNumber(totalSeconds)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes || hours) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatAverageSeconds(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${formatNumber(roundMetric(number))}s` : '0s';
}

function formatPercentValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${formatNumber(roundMetric(number))}%` : '0%';
}

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function renderTopSongsTable(songList) {
  els.topSongsTableBody.innerHTML = '';

  if (!songList.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" class="song-meta">No songs loaded.</td>';
    els.topSongsTableBody.appendChild(row);
    return;
  }

  songList.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.appendChild(buildSongTitleCell(song, songKey, 'compact-title'));
    row.appendChild(makeTextCell(song.artist || '—'));
    row.appendChild(makeTextCell(song.genre || '—'));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'total_plays'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'likes'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'shares'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'video_clicks'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'product_clicks'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'skip_count'))));
    row.appendChild(buildQuickLinksCell(songKey));
    els.topSongsTableBody.appendChild(row);
  });
}

function renderRankList(container, songList, metricLabel, valueGetter = null, formatter = formatNumber) {
  container.innerHTML = '';

  if (!songList.length) {
    const empty = document.createElement('p');
    empty.className = 'song-meta';
    empty.textContent = 'No songs loaded.';
    container.appendChild(empty);
    return;
  }

  songList.forEach((song, index) => {
    const songKey = getSongKey(song);
    const value = valueGetter ? valueGetter(song) : getMetricValue(song, metricLabel.replaceAll(' ', '_'));
    const item = document.createElement('div');
    item.className = 'rank-item';
    item.innerHTML = `
      <span class="rank-number"></span>
      <div class="song-cell-with-art rank-song-cell">
        <div class="rank-main">
          <strong></strong>
          <span></span>
        </div>
      </div>
      <div class="rank-value"></div>
      <div class="song-card-actions rank-actions">
        <button class="song-action-button" type="button">Edit</button>
        <a class="song-action-button song-action-link" target="_blank" rel="noopener noreferrer">Open in Radio</a>
      </div>
    `;
    item.querySelector('.rank-number').textContent = String(index + 1);
    item.querySelector('.rank-song-cell').prepend(buildSongArtworkImage(song));
    item.querySelector('.rank-main strong').textContent = formatSongTitle(song);
    item.querySelector('.rank-main span').textContent = [song.artist, song.genre].filter(Boolean).join(' · ') || songKey || '—';
    item.querySelector('.rank-value').textContent = `${formatter(value)} ${metricLabel}`;

    const editButton = item.querySelector('button');
    editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

    const radioLink = item.querySelector('a');
    radioLink.href = getRadioSongUrl(songKey);

    container.appendChild(item);
  });
}

function sortSongsByMetric(metricKey, songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getMetricValue(b, metricKey) - getMetricValue(a, metricKey));
}

function sortSongsByEngagement(songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getSongEngagement(b) - getSongEngagement(a));
}

function sortSongsBySkipRate(songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getSongSkipRate(b) - getSongSkipRate(a));
}

function getSongEngagement(song) {
  return getMetricValue(song, 'likes') + getMetricValue(song, 'shares') + getMetricValue(song, 'video_clicks') + getMetricValue(song, 'product_clicks');
}

function getSongSkipRate(song) {
  const plays = getMetricValue(song, 'total_plays');

  if (!plays) {
    return 0;
  }

  return getMetricValue(song, 'skip_count') / plays;
}

function getMetricValue(song, key) {
  const aliases = {
    skip_count: ['skip_count', 'skips'],
    total_seconds_played: ['total_seconds_played', 'seconds_played']
  };
  const keys = aliases[key] || [key];
  const rawValue = keys.map((fieldName) => song?.[fieldName]).find((value) => value !== undefined && value !== null && value !== '');
  const number = Number(rawValue || 0);
  return Number.isFinite(number) ? number : 0;
}


function getSongArtworkUrl(song) {
  const directArtworkUrl = [song?.resolved_artwork_url, song?.song_artwork_url]
    .map((value) => String(value || '').trim())
    .find(Boolean);

  if (directArtworkUrl) {
    return directArtworkUrl;
  }

  const youtubeVideoId = getYouTubeVideoId(song?.video_link);

  if (youtubeVideoId) {
    return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  }

  return STASHBOX_PLACEHOLDER_ARTWORK;
}

function getYouTubeVideoId(videoLink) {
  if (!videoLink) {
    return '';
  }

  try {
    const url = new URL(String(videoLink).trim());
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

    if (hostname === 'youtu.be') {
      return sanitizeYouTubeVideoId(url.pathname.split('/').filter(Boolean)[0]);
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname.endsWith('.youtube.com')) {
      const watchId = sanitizeYouTubeVideoId(url.searchParams.get('v'));

      if (watchId) {
        return watchId;
      }

      const pathParts = url.pathname.split('/').filter(Boolean);
      const videoPathIndex = pathParts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));

      if (videoPathIndex !== -1) {
        return sanitizeYouTubeVideoId(pathParts[videoPathIndex + 1]);
      }
    }
  } catch {
    return '';
  }

  return '';
}

function sanitizeYouTubeVideoId(value) {
  const videoId = String(value || '').trim().match(/^[a-zA-Z0-9_-]{6,}$/)?.[0] || '';
  return videoId.slice(0, 32);
}

function buildSongArtworkImage(song) {
  const image = document.createElement('img');
  image.className = 'song-thumb';
  image.src = getSongArtworkUrl(song);
  image.alt = `Artwork for ${formatSongTitle(song)}`;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    if (image.dataset.fallbackApplied === 'true') {
      image.hidden = true;
      return;
    }

    image.dataset.fallbackApplied = 'true';
    image.src = STASHBOX_PLACEHOLDER_ARTWORK;
  });
  return image;
}

function buildSongTitleCell(song, songKey, titleClassName = '') {
  const cell = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'song-cell-with-art';

  const textWrap = document.createElement('div');
  textWrap.className = 'song-cell-text';

  const title = document.createElement('span');
  title.className = ['song-title', titleClassName].filter(Boolean).join(' ');
  title.textContent = formatSongTitle(song);

  const meta = document.createElement('span');
  meta.className = 'song-meta';
  meta.textContent = [song.artist, song.album_name, song.genre].filter(Boolean).join(' · ') || songKey || '—';

  textWrap.append(title, meta);
  wrap.append(buildSongArtworkImage(song), textWrap);
  cell.appendChild(wrap);
  return cell;
}

function makeTextCell(text, className = '') {
  const cell = document.createElement('td');
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.textContent = text;
  cell.appendChild(span);
  return cell;
}

function buildQuickLinksCell(songKey) {
  const cell = document.createElement('td');
  cell.className = 'quick-links-cell';
  const actions = document.createElement('div');
  actions.className = 'song-card-actions table-actions';

  const editButton = document.createElement('button');
  editButton.className = 'song-action-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

  const radioLink = document.createElement('a');
  radioLink.className = 'song-action-button song-action-link';
  radioLink.href = getRadioSongUrl(songKey);
  radioLink.target = '_blank';
  radioLink.rel = 'noopener noreferrer';
  radioLink.textContent = 'Open in Radio';

  actions.append(editButton, radioLink);
  cell.appendChild(actions);
  return cell;
}

function renderSongList() {
  const query = els.songSearch.value.trim().toLowerCase();
  const activeSongs = getActiveSongs();
  filteredSongs = activeSongs.filter((song) => songMatchesQuery(song, query));

  els.songCount.textContent = `${filteredSongs.length} of ${activeSongs.length} active song${activeSongs.length === 1 ? '' : 's'}`;
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

      loadSongDetails(songKey, { openEditor: true });
    });
    row.addEventListener('keydown', (event) => {
      if (isCardActionEvent(event)) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        loadSongDetails(songKey, { openEditor: true });
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

  return [song.display_title, song.song_name, song.artist, song.album_name, song.genre, getSongKey(song)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function buildSongCell(song, songKey) {
  const cell = buildSongTitleCell(song, songKey);
  const textWrap = cell.querySelector('.song-cell-text');
  const actions = document.createElement('div');
  actions.className = 'song-card-actions';
  actions.innerHTML = `
    <button class="song-action-button" type="button">Edit</button>
    <a class="song-action-button song-action-link" target="_blank" rel="noopener noreferrer">Open in Radio</a>
  `;
  const badges = document.createElement('div');
  badges.className = 'badges';
  textWrap.append(actions, badges);

  const editButton = cell.querySelector('.song-action-button[type="button"]');
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    loadSongDetails(songKey, { openEditor: true });
  });

  const radioLink = cell.querySelector('.song-action-link');
  radioLink.href = getRadioSongUrl(songKey);
  radioLink.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  badges.appendChild(makeVisibilityBadge(song));

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
    ['plays', getMetricValue(song, 'total_plays')],
    ['likes', getMetricValue(song, 'likes')],
    ['shares', getMetricValue(song, 'shares')],
    ['video', getMetricValue(song, 'video_clicks')],
    ['products', getMetricValue(song, 'product_clicks')],
    ['skips', getMetricValue(song, 'skip_count')]
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

function makeBadge(label, value, isOn = Boolean(value)) {
  const badge = document.createElement('span');
  badge.className = `badge ${isOn ? 'badge-on' : ''}`;
  badge.textContent = `${label}: ${formatDisplayValue(value)}`;
  return badge;
}

function makeVisibilityBadge(song) {
  const badge = document.createElement('span');
  badge.className = `badge ${isShownInRadio(song) ? 'badge-on' : ''} ${isArchivedSong(song) ? 'badge-archived' : ''}`;
  badge.textContent = getRadioVisibilityLabel(song);
  return badge;
}

function renderArchiveList() {
  const archived = getArchivedSongs().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  els.archiveCount.textContent = `${archived.length} archived song${archived.length === 1 ? '' : 's'}`;
  els.archiveTableBody.innerHTML = '';

  if (!archived.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="song-meta">No archived songs.</td>';
    els.archiveTableBody.appendChild(row);
    return;
  }

  archived.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.classList.toggle('is-selected', songKey === selectedSongKey);
    row.appendChild(makeTextCell(formatSongTitle(song), 'song-title compact-title'));
    row.appendChild(makeTextCell(song.artist || '—'));
    row.appendChild(makeTextCell(songKey || '—', 'song-key-inline'));
    row.appendChild(buildUpdatedCell(song));
    row.appendChild(buildArchiveActionsCell(song, songKey));
    els.archiveTableBody.appendChild(row);
  });
}

function buildArchiveActionsCell(song, songKey) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'song-card-actions table-actions';

  const editButton = document.createElement('button');
  editButton.className = 'song-action-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

  const restoreButton = document.createElement('button');
  restoreButton.className = 'song-action-button song-action-restore';
  restoreButton.type = 'button';
  restoreButton.textContent = 'Restore';
  restoreButton.addEventListener('click', () => restoreArchivedSong(song, restoreButton));

  actions.append(editButton, restoreButton);
  cell.appendChild(actions);
  return cell;
}


async function loadSongDetails(songKey, { openEditor = false } = {}) {
  if (!songKey) {
    showMessage('Selected song is missing a song_key.', 'error');
    return;
  }

  selectedSongKey = songKey;
  renderSongList();

  if (openEditor) {
    setActiveTab('edit');
  }

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
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-item';
      wrap.dataset.fieldName = field.name;
      fieldWrappers.set(field.name, wrap);

      const label = document.createElement('label');
      label.className = 'checkbox-field';
      label.setAttribute('for', fieldId);

      const input = document.createElement('input');
      input.id = fieldId;
      input.name = field.name;
      input.type = 'checkbox';
      fieldElements.set(field.name, input);

      const textWrap = document.createElement('span');
      textWrap.className = 'checkbox-text';

      const span = document.createElement('span');
      span.textContent = field.label;
      textWrap.appendChild(span);

      if (field.help) {
        const help = document.createElement('span');
        help.className = 'checkbox-help';
        help.textContent = field.help;
        textWrap.appendChild(help);
      }

      label.append(input, textWrap);
      checkboxWrap.appendChild(label);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = `field ${field.full ? 'field-full' : ''}`;
    wrap.dataset.fieldName = field.name;
    fieldWrappers.set(field.name, wrap);

    const labelRow = document.createElement('div');
    labelRow.className = 'field-label-row';

    const label = document.createElement('label');
    label.setAttribute('for', fieldId);
    label.textContent = field.label;
    labelRow.appendChild(label);

    if (field.name === 'song_key') {
      const generateButton = document.createElement('button');
      generateButton.id = 'generateSongKeyButton';
      generateButton.className = 'song-action-button';
      generateButton.type = 'button';
      generateButton.textContent = 'Generate Song Key';
      generateButton.addEventListener('click', generateSongKeyFromForm);
      labelRow.appendChild(generateButton);
    }

    const input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    input.id = fieldId;
    input.name = field.name;

    if (field.type !== 'textarea') {
      input.type = field.type;
    }

    fieldElements.set(field.name, input);
    wrap.append(labelRow, input);

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

function startCreateSong() {
  selectedSong = null;
  selectedSongKey = '';
  renderSongList();
  populateEditor(getCreateSongDefaults(), { mode: 'create' });
  setActiveTab('edit');
}

function getCreateSongDefaults() {
  return { ...createDefaults };
}

function populateEditor(song, { mode = 'edit' } = {}) {
  editorMode = mode;
  selectedSong = mode === 'create' ? null : song;
  selectedSongKey = mode === 'create' ? '' : getSongKey(song) || selectedSongKey;
  els.editHeading.textContent = mode === 'create' ? 'Create New Song' : song.display_title || song.song_name || 'Untitled song';
  els.selectedSongKey.textContent = mode === 'create' ? 'new song' : selectedSongKey;
  updateEditorVisibilityStatus(song, mode);
  els.saveChangesButton.textContent = mode === 'create' ? 'Create Song' : 'Save Changes';
  els.cancelChangesButton.textContent = mode === 'create' ? 'Cancel' : 'Cancel/Revert';
  els.emptyEditor.classList.add('hidden');
  els.editForm.classList.remove('hidden');
  els.dangerZone.classList.toggle('hidden', mode === 'create');
  applyEditorModeToFields(mode);

  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    const value = song[field.name];

    if (field.name === 'public_visibility') {
      input.checked = isShownInRadio(song);
    } else if (field.type === 'checkbox') {
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


function updateEditorVisibilityStatus(song, mode) {
  if (mode === 'create') {
    els.selectedVisibility.classList.add('hidden');
    els.selectedVisibility.textContent = '';
    return;
  }

  const isArchived = isArchivedSong(song);
  els.selectedVisibility.textContent = getRadioVisibilityLabel(song);
  els.selectedVisibility.classList.toggle('visibility-archived', isArchived);
  els.selectedVisibility.classList.toggle('visibility-visible', isShownInRadio(song));
  els.selectedVisibility.classList.remove('hidden');
}

function applyEditorModeToFields(mode) {
  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    const wrap = fieldWrappers.get(field.name);
    const isCreateOnlyHidden = Boolean(field.createOnly && mode !== 'create');

    if (wrap) {
      wrap.classList.toggle('is-hidden-for-mode', isCreateOnlyHidden);
    }

    if (input) {
      input.disabled = isCreateOnlyHidden;
      input.required = mode === 'create' && createRequiredFields.has(field.name) && field.type !== 'checkbox';
    }
  });
}

function clearEditor() {
  editorMode = 'edit';
  els.editHeading.textContent = 'Select a song';
  els.selectedSongKey.textContent = '';
  els.saveChangesButton.textContent = 'Save Changes';
  els.cancelChangesButton.textContent = 'Cancel/Revert';
  els.emptyEditor.classList.remove('hidden');
  els.editForm.classList.add('hidden');
  els.dangerZone.classList.add('hidden');
  els.selectedVisibility.classList.add('hidden');
  selectedSong = null;
  selectedSongKey = '';
  applyEditorModeToFields('edit');
  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    if (field.type === 'checkbox') {
      input.checked = field.name === 'public_visibility';
    } else {
      input.value = '';
    }
  });
  renderSongList();
}

async function saveSelectedSong(event) {
  event.preventDefault();

  console.log("Selected song before save:", selectedSong);

  if (editorMode === 'create') {
    await createSelectedSong();
    return;
  }

  if (!selectedSongKey) {
    showMessage('Select a song before saving.', 'error');
    return;
  }

  const payload = buildUpdatePayload();
  const changedFields = Object.keys(payload);

  console.log("Admin PUT payload:", payload);

  if (!changedFields.length) {
    showMessage('No changes to save', 'success');
    return;
  }

  const url = `${API_BASE_URL}/${encodeURIComponent(selectedSongKey)}`;
  console.log("Admin PUT URL:", url);
  showMessage('Saving...', 'success');
  setBusy(els.saveChangesButton, true);

  try {
    const result = await adminFetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log("Admin PUT response:", result);

    const returnedSong = normalizeSongResponse(result);
    const updatedSong = returnedSong && Object.keys(returnedSong).length
      ? { ...selectedSong, ...returnedSong }
      : { ...selectedSong, ...payload };

    selectedSong = updatedSong;
    selectedSongKey = getSongKey(updatedSong) || selectedSongKey;
    updateSongInList(updatedSong);
    renderDashboard();
    renderSongList();
    renderArchiveList();
    populateEditor(updatedSong);
    setActiveTab('edit');
    showMessage('Saved successfully', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(els.saveChangesButton, false);
  }
}

function openDeleteModal() {
  if (editorMode === 'create' || !selectedSongKey) {
    return;
  }

  els.deleteModal.classList.remove('hidden');
  els.confirmDeleteButton.focus();
}

function closeDeleteModal() {
  els.deleteModal.classList.add('hidden');
}

async function archiveSelectedSong() {
  if (!selectedSongKey) {
    closeDeleteModal();
    showMessage('Select a song before deleting.', 'error');
    return;
  }

  const archivedAt = new Date().toLocaleString();
  const archiveNote = `Archived from admin CMS on ${archivedAt}.`;
  const currentNotes = String(selectedSong?.internal_notes || '').trim();
  const payload = {
    public_visibility: 'archived',
    internal_notes: currentNotes ? [currentNotes, archiveNote].join('\n') : archiveNote
  };

  setBusy(els.confirmDeleteButton, true);
  setBusy(els.deleteSongButton, true);
  showMessage('Moving song to archive...', 'success');

  try {
    const result = await updateSongByKey(selectedSongKey, payload);
    const returnedSong = normalizeSongResponse(result);
    const archivedSong = returnedSong && Object.keys(returnedSong).length
      ? { ...selectedSong, ...returnedSong, public_visibility: 'archived' }
      : { ...selectedSong, ...payload };

    updateSongInList(archivedSong);
    closeDeleteModal();
    clearEditor();
    renderDashboard();
    renderSongList();
    renderArchiveList();
    setActiveTab('songs');
    showMessage('Song moved to archive.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(els.confirmDeleteButton, false);
    setBusy(els.deleteSongButton, false);
  }
}

async function restoreArchivedSong(song, button) {
  const songKey = getSongKey(song);

  if (!songKey) {
    showMessage('Archived song is missing a song_key.', 'error');
    return;
  }

  setBusy(button, true);
  showMessage('Restoring song as hidden...', 'success');

  try {
    const result = await updateSongByKey(songKey, { public_visibility: 'hidden' });
    const returnedSong = normalizeSongResponse(result);
    const restoredSong = returnedSong && Object.keys(returnedSong).length
      ? { ...song, ...returnedSong, public_visibility: 'hidden' }
      : { ...song, public_visibility: 'hidden' };

    updateSongInList(restoredSong);

    if (selectedSongKey === songKey) {
      selectedSong = restoredSong;
      populateEditor(restoredSong);
    }

    renderDashboard();
    renderSongList();
    renderArchiveList();
    showMessage('Song restored as hidden.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function updateSongByKey(songKey, payload) {
  return adminFetch(`${API_BASE_URL}/${encodeURIComponent(songKey)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}


async function createSelectedSong() {
  const payload = buildCreatePayload();

  if (!validateCreatePayload(payload)) {
    return;
  }

  console.log("Create Song payload:", payload);
  showMessage('Creating song...', 'success');
  setBusy(els.saveChangesButton, true);

  try {
    const result = await adminFetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log("Admin POST response:", result);

    const returnedSong = normalizeSongResponse(result);
    const createdSong = returnedSong && Object.keys(returnedSong).length
      ? { ...payload, ...returnedSong }
      : payload;
    const createdSongKey = getSongKey(createdSong) || payload.song_key;

    selectedSong = createdSong;
    selectedSongKey = createdSongKey;
    updateSongInList(createdSong);
    renderDashboard();
    renderSongList();
    renderArchiveList();
    await loadSongs({ silent: true, preserveSelection: false });

    updateSongInList(createdSong);
    selectedSong = createdSong;
    selectedSongKey = createdSongKey;
    populateEditor(createdSong, { mode: 'edit' });
    renderSongList();
    renderArchiveList();
    setActiveTab('edit');
    showMessage('Song created successfully', 'success');
  } catch (error) {
    if (error.status === 409) {
      showMessage('Song key already exists. Choose a different song key.', 'error');
      return;
    }

    showMessage(error.message, 'error');
  } finally {
    setBusy(els.saveChangesButton, false);
  }
}

function updateSongInList(updatedSong) {
  const updatedSongKey = getSongKey(updatedSong) || selectedSongKey;

  if (!updatedSongKey) {
    return;
  }

  const index = songs.findIndex((song) => getSongKey(song) === updatedSongKey);

  if (index === -1) {
    songs = [updatedSong, ...songs];
    return;
  }

  songs = songs.map((song, songIndex) => (songIndex === index ? { ...song, ...updatedSong } : song));
}

function buildCreatePayload() {
  const payload = editableFields.reduce((createPayload, field) => {
    createPayload[field.name] = getFieldPayloadValue(field);
    return createPayload;
  }, {});

  return normalizeCreatePayload(payload);
}

function normalizeCreatePayload(payload) {
  return {
    ...payload,
    mood_tags: normalizeArrayValue(payload.mood_tags, ','),
    specific_product_urls: normalizeArrayValue(payload.specific_product_urls, '\n'),
    show_public_note: toBoolean(payload.show_public_note),
    exclusive: toBoolean(payload.exclusive),
    explicit: toBoolean(payload.explicit),
    live_recording: toBoolean(payload.live_recording),
    featured: toBoolean(payload.featured),
    public_visibility: normalizePublicVisibility(payload.public_visibility)
  };
}

function validateCreatePayload(payload) {
  const missingFields = Array.from(createRequiredFields).filter((fieldName) => {
    if (fieldName === 'public_visibility') {
      return !['visible', 'hidden'].includes(payload[fieldName]);
    }

    return !String(payload[fieldName] || '').trim();
  });

  if (missingFields.length) {
    showMessage(`Fill required fields before creating: ${missingFields.join(', ')}.`, 'error');
    return false;
  }

  if (!String(payload.audio_url || '').trim() && !String(payload.video_link || '').trim()) {
    showMessage('Add either an Audio URL or Video Link before creating the song.', 'error');
    return false;
  }

  return true;
}

function generateSongKeyFromForm() {
  const displayTitle = fieldElements.get('display_title')?.value || '';
  const artist = fieldElements.get('artist')?.value || '';
  const generatedKey = slugifySongKey(`${displayTitle} ${artist}`);
  const songKeyInput = fieldElements.get('song_key');

  if (!generatedKey) {
    showMessage('Enter a display title and artist before generating a song key.', 'error');
    return;
  }

  songKeyInput.value = generatedKey;
  songKeyInput.focus();
}

function slugifySongKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildUpdatePayload() {
  return editableFields.reduce((payload, field) => {
    if (field.createOnly) {
      return payload;
    }

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

  if (field.name === 'public_visibility') {
    if (input.checked) {
      return 'visible';
    }

    return isArchivedSong(selectedSong) ? 'archived' : 'hidden';
  }

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
  if (field.name === 'public_visibility') {
    return normalizePublicVisibility(getPublicVisibilityValue(value));
  }

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


function normalizePublicVisibility(value) {
  return value === 'archived' || value === 'hidden' ? value : 'visible';
}

function getRadioVisibilityLabel(songOrValue) {
  const visibility = normalizePublicVisibility(getPublicVisibilityValue(songOrValue));
  return visibility === 'archived' ? 'archived' : `radio: ${visibility}`;
}

function isShownInRadio(songOrValue) {
  return normalizePublicVisibility(getPublicVisibilityValue(songOrValue)) === 'visible';
}

function getPublicVisibilityValue(songOrValue) {
  return typeof songOrValue === 'object' && songOrValue !== null
    ? songOrValue.public_visibility
    : songOrValue;
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

function getRadioSongUrl(songKey) {
  return `${RADIO_DEV_BASE_URL}?song=${encodeURIComponent(songKey)}`;
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
  els.deleteSongButton.disabled = isLoading;
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

function formatPercent(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '0.0%';
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
