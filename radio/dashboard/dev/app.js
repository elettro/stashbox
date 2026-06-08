const API_ROOT = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev';
const FALLBACK_ARTWORK_URL = '/images/branding/stashbox-logo-transparent-rastacolors.png';
const PUBLIC_SONGS_URL = `${API_ROOT}/radio/songs`;
const PUBLIC_DASHBOARD_ENDPOINTS = {
  summary: `${API_ROOT}/dashboard/summary`,
  songs: `${API_ROOT}/dashboard/songs`,
  events: `${API_ROOT}/dashboard/events?limit=100`,
  referrers: `${API_ROOT}/dashboard/referrers?limit=50`,
  devices: `${API_ROOT}/dashboard/devices?limit=50`
};

const state = {
  songs: [],
  events: [],
  summary: null,
  referrers: [],
  devices: [],
  today: null,
  productStats: null,
  missingPublicEndpoints: new Set(),
  loadErrors: []
};

const els = {
  statusBanner: document.getElementById('statusBanner'),
  refreshButton: document.getElementById('refreshButton'),
  refreshEventsButton: document.getElementById('refreshEventsButton'),
  dashboardView: document.getElementById('dashboardView'),
  eventsView: document.getElementById('eventsView'),
  operationalStats: document.getElementById('operationalStats'),
  topSongsBody: document.getElementById('topSongsBody'),
  eventsPreviewBody: document.getElementById('eventsPreviewBody'),
  eventsBody: document.getElementById('eventsBody'),
  likedSongs: document.getElementById('likedSongs'),
  engagementSongs: document.getElementById('engagementSongs'),
  sharedSongs: document.getElementById('sharedSongs'),
  videoClicks: document.getElementById('videoClicks'),
  productClicks: document.getElementById('productClicks'),
  songAnalyticsStats: document.getElementById('songAnalyticsStats'),
  todayStats: document.getElementById('todayStats'),
  productAnalytics: document.getElementById('productAnalytics'),
  referrersBody: document.getElementById('referrersBody'),
  devicesStats: document.getElementById('devicesStats'),
  skipRateSongs: document.getElementById('skipRateSongs'),
  headerRadioLink: document.getElementById('headerRadioLink')
};

function clean(value) {
  return String(value ?? '').trim();
}

function count(value) {
  return Math.max(0, Number(value) || 0);
}

function firstDefined(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && clean(row[name])) return row[name];
  }
  return '';
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(count(value));
}

function formatPercent(value) {
  const number = Number.isFinite(value) ? value : 0;
  return `${number.toFixed(number >= 10 ? 0 : 1)}%`;
}

function fixDropbox(url) {
  const image = typeof url === 'object' && url !== null ? (url.src || url.url || '') : url;
  const value = clean(image);
  if (!value) return '';
  return value.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '?raw=1');
}

function formatDateTime(value) {
  if (!clean(value)) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getSitePrefix() {
  return window.location.pathname.startsWith('/stashbox/') ? '/stashbox' : '';
}

function getRadioBasePath() {
  const prefix = getSitePrefix();
  return window.location.pathname.includes('/dev/') ? `${prefix}/radio/dev/` : `${prefix}/radio/`;
}

function radioUrlForSong(song) {
  const basePath = getRadioBasePath();
  return song?.songKey ? `${basePath}?song=${encodeURIComponent(song.songKey)}` : basePath;
}

function isPublicUsefulUrl(value) {
  try {
    const url = new URL(clean(value));
    const hostname = url.hostname.toLowerCase();
    return ['http:', 'https:'].includes(url.protocol)
      && hostname !== 'localhost'
      && !hostname.endsWith('.local')
      && !hostname.startsWith('10.')
      && !hostname.startsWith('192.168.')
      && !/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch (_) {
    return false;
  }
}

function normalizeSong(row, index = 0) {
  const songKey = clean(firstDefined(row, ['song_key', 'key', 'slug', 'track_key', 'id', 'track_id'])) || `song-${index + 1}`;
  const artworkUrl = fixDropbox(firstDefined(row, ['resolved_artwork_url', 'artwork_url', 'image_url', 'cover_url', 'imageUrl', 'artwork', 'cover']));
  const plays = count(firstDefined(row, ['total_plays', 'plays', 'play_count', 'play_starts']));
  const likes = count(firstDefined(row, ['likes', 'like_count', 'total_likes']));
  const shares = count(firstDefined(row, ['shares', 'share_count', 'total_shares']));
  const videoClicks = count(firstDefined(row, ['video_clicks', 'video_click_count', 'total_video_clicks']));
  const productClicks = count(firstDefined(row, ['product_clicks', 'product_click_count', 'total_product_clicks']));
  const skips = count(firstDefined(row, ['skip_count', 'skips']));
  const fullPlays = count(firstDefined(row, ['full_play_count', 'full_plays']));
  const partialPlays = count(firstDefined(row, ['partial_play_count', 'partial_plays']));
  const engagementTotal = likes + shares + videoClicks + productClicks;

  return {
    songKey,
    title: clean(firstDefined(row, ['display_title', 'song_name', 'title', 'name'])) || 'Untitled Stashbox Track',
    artist: clean(firstDefined(row, ['artist', 'artist_name', 'band'])) || 'Stashbox',
    genre: clean(firstDefined(row, ['genre', 'primary_genre', 'section'])) || 'Other',
    artworkUrl,
    plays,
    likes,
    shares,
    videoClicks,
    productClicks,
    skips,
    fullPlays,
    partialPlays,
    engagementRate: plays ? (engagementTotal / plays) * 100 : 0,
    skipRate: plays ? (skips / plays) * 100 : 0,
    updatedAt: clean(firstDefined(row, ['updated_at', 'updatedAt', 'modified_at']))
  };
}

function normalizeEvent(event) {
  const productUrl = firstDefined(event, ['product_url', 'productUrl', 'product_link']);
  const songKey = clean(firstDefined(event, ['song_key', 'track_key', 'key', 'slug', 'track_id']));
  return {
    time: firstDefined(event, ['created_at', 'timestamp', 'time', 'event_time']),
    eventType: clean(firstDefined(event, ['event_type', 'type', 'event'])) || 'unknown',
    songKey,
    song: clean(firstDefined(event, ['song_title', 'song_name', 'title', 'display_title'])) || songKey || '—',
    artist: clean(firstDefined(event, ['artist', 'artist_name', 'band'])) || '—',
    deviceType: clean(firstDefined(event, ['device_type', 'device', 'listener_device'])) || '—',
    referrer: clean(firstDefined(event, ['referrer', 'source', 'track_source', 'traffic_source'])) || '—',
    artworkUrl: fixDropbox(firstDefined(event, ['resolved_artwork_url', 'artwork_url', 'image_url', 'cover_url', 'imageUrl', 'artwork', 'cover'])),
    productUrl: isPublicUsefulUrl(productUrl) ? clean(productUrl) : ''
  };
}

async function fetchJson(url, label, { optional = true } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || `${label} returned HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (optional) state.missingPublicEndpoints.add(label);
    state.loadErrors.push(`${label}: ${error.message || error}`);
    return null;
  }
}

function extractArray(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (Array.isArray(data)) return data;
  return [];
}

async function loadDashboardData() {
  state.loadErrors = [];
  state.missingPublicEndpoints.clear();
  setStatus('Loading public dashboard data…');
  els.refreshButton.disabled = true;

  const [publicSongs, dashboardSongs, summary, events, referrers, devices] = await Promise.all([
    fetchJson(PUBLIC_SONGS_URL, 'public radio songs', { optional: false }),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.songs, 'GET /dashboard/songs'),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.summary, 'GET /dashboard/summary'),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.events, 'GET /dashboard/events'),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.referrers, 'GET /dashboard/referrers'),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.devices, 'GET /dashboard/devices')
  ]);

  const songRows = extractArray(dashboardSongs, ['songs', 'items', 'results']);
  const fallbackSongRows = extractArray(publicSongs, ['songs', 'items', 'results']);
  state.songs = (songRows.length ? songRows : fallbackSongRows).map(normalizeSong);
  state.summary = summary?.summary || summary || null;
  state.today = summary?.today || null;
  state.productStats = summary?.products || summary?.product_stats || null;
  state.events = extractArray(events, ['events', 'items', 'results']).map(normalizeEvent);
  state.referrers = extractArray(referrers, ['referrers', 'sources', 'items', 'results']);
  state.devices = extractArray(devices, ['devices', 'items', 'results']);

  renderAll();
  setStatus(statusMessage(), state.songs.length ? 'success' : 'error');
  els.refreshButton.disabled = false;
}

async function loadEventsOnly() {
  els.refreshEventsButton.disabled = true;
  const events = await fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.events, 'GET /dashboard/events');
  state.events = extractArray(events, ['events', 'items', 'results']).map(normalizeEvent);
  renderEventsTables();
  setStatus(statusMessage(), state.songs.length ? 'success' : 'error');
  els.refreshEventsButton.disabled = false;
}

function statusMessage() {
  if (!state.songs.length) {
    return 'No public song analytics could be loaded. A public-safe read-only songs endpoint is required for this dashboard.';
  }
  const missing = [...state.missingPublicEndpoints];
  if (!missing.length) return `Loaded ${state.songs.length} public song row${state.songs.length === 1 ? '' : 's'} and ${state.events.length} public event row${state.events.length === 1 ? '' : 's'}.`;
  return `Loaded ${state.songs.length} public song row${state.songs.length === 1 ? '' : 's'} from the public radio songs API. Missing public-safe dashboard endpoints: ${missing.join(', ')}. Backend read-only endpoints are required for live events, referrers, devices, and full dashboard summary data.`;
}

function setStatus(message, tone = '') {
  els.statusBanner.textContent = message;
  els.statusBanner.classList.toggle('is-error', tone === 'error');
  els.statusBanner.classList.toggle('is-success', tone === 'success');
}

function renderAll() {
  renderStats();
  renderSongTables();
  renderRankings();
  renderEventsTables();
  renderReferrers();
  renderDevices();
}

function totals() {
  return state.songs.reduce((acc, song) => {
    acc.plays += song.plays;
    acc.likes += song.likes;
    acc.shares += song.shares;
    acc.videoClicks += song.videoClicks;
    acc.productClicks += song.productClicks;
    acc.skips += song.skips;
    acc.fullPlays += song.fullPlays;
    acc.partialPlays += song.partialPlays;
    return acc;
  }, { plays: 0, likes: 0, shares: 0, videoClicks: 0, productClicks: 0, skips: 0, fullPlays: 0, partialPlays: 0 });
}

function renderStats() {
  const total = totals();
  renderStatGrid(els.operationalStats, [
    ['Songs Tracked', state.summary?.songs_tracked ?? state.songs.length],
    ['Total Plays', state.summary?.total_plays ?? total.plays],
    ['Total Likes', state.summary?.total_likes ?? total.likes],
    ['Total Shares', state.summary?.total_shares ?? total.shares],
    ['Video Clicks', state.summary?.total_video_clicks ?? total.videoClicks],
    ['Product Clicks', state.summary?.total_product_clicks ?? total.productClicks],
    ['Recent Events', state.summary?.total_events ?? state.events.length],
    ['Skip Count', state.summary?.skip_count ?? total.skips]
  ]);

  renderStatGrid(els.songAnalyticsStats, [
    ['Full Plays', state.summary?.full_play_count ?? total.fullPlays],
    ['Partial Plays', state.summary?.partial_play_count ?? total.partialPlays],
    ['Average Engagement Rate', averageMetric('engagementRate'), formatPercent],
    ['Average Skip Rate', averageMetric('skipRate'), formatPercent],
    ['Songs With Likes', state.songs.filter(song => song.likes > 0).length],
    ['Songs With Product Clicks', state.songs.filter(song => song.productClicks > 0).length]
  ]);

  renderStatGrid(els.todayStats, [
    ['Events Today', state.today?.events_today ?? 0],
    ['Plays Today', state.today?.plays_today ?? 0],
    ['Likes Today', state.today?.likes_today ?? 0],
    ['Shares Today', state.today?.shares_today ?? 0],
    ['Product Clicks Today', state.today?.product_clicks_today ?? 0],
    ['Video Clicks Today', state.today?.video_clicks_today ?? 0]
  ]);

  renderStatGrid(els.productAnalytics, [
    ['Total Product Clicks', state.productStats?.total_product_clicks ?? total.productClicks],
    ['Songs With Product Clicks', state.songs.filter(song => song.productClicks > 0).length],
    ['Top Song Product Clicks', Math.max(0, ...state.songs.map(song => song.productClicks))],
    ['Product Clicks / Play', total.plays ? (total.productClicks / total.plays) * 100 : 0, formatPercent]
  ]);
}

function averageMetric(key) {
  if (!state.songs.length) return 0;
  return state.songs.reduce((sum, song) => sum + (song[key] || 0), 0) / state.songs.length;
}

function renderStatGrid(container, stats) {
  container.innerHTML = '';
  stats.forEach(([label, value, formatter = formatNumber]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.innerHTML = `<span class="stat-label"></span><strong class="stat-value"></strong>`;
    card.querySelector('.stat-label').textContent = label;
    card.querySelector('.stat-value').textContent = formatter(value);
    container.appendChild(card);
  });
}

function songArtworkUrl(song) {
  return clean(song?.artworkUrl) || FALLBACK_ARTWORK_URL;
}

function createSongArtwork(song, size = 'sm') {
  const img = document.createElement('img');
  img.className = `song-artwork song-artwork--${size}`;
  img.src = songArtworkUrl(song);
  img.alt = `${clean(song?.title) || clean(song?.song) || 'Song'} artwork`;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => {
    if (img.src.endsWith(FALLBACK_ARTWORK_URL)) return;
    img.src = FALLBACK_ARTWORK_URL;
  };
  return img;
}

function createSongIdentity(song, { includeGenre = true, size = 'sm' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'song-identity';
  wrap.appendChild(createSongArtwork(song, size));

  const copy = document.createElement('div');
  copy.className = 'song-identity__copy';
  const title = document.createElement('strong');
  title.textContent = clean(song?.title || song?.song) || 'Untitled Stashbox Track';
  copy.appendChild(title);

  if (includeGenre && clean(song?.genre)) {
    const subtext = document.createElement('div');
    subtext.className = 'song-subtext';
    subtext.textContent = song.genre;
    copy.appendChild(subtext);
  }

  wrap.appendChild(copy);
  return wrap;
}

function findSongForEvent(event) {
  const eventKey = clean(event?.songKey);
  if (eventKey) {
    const byKey = state.songs.find(song => song.songKey === eventKey);
    if (byKey) return byKey;
  }

  const eventSong = clean(event?.song).toLowerCase();
  const eventArtist = clean(event?.artist).toLowerCase();
  return state.songs.find(song => {
    const sameTitle = clean(song.title).toLowerCase() === eventSong;
    const sameArtist = !eventArtist || eventArtist === '—' || clean(song.artist).toLowerCase() === eventArtist;
    return sameTitle && sameArtist;
  }) || null;
}

function songIdentityForEvent(event) {
  const matchedSong = findSongForEvent(event);
  return createSongIdentity({
    title: event.song,
    song: event.song,
    artworkUrl: event.artworkUrl || matchedSong?.artworkUrl || '',
    genre: matchedSong?.genre || ''
  }, { includeGenre: false, size: 'xs' });
}

function renderSongTables() {
  const topSongs = sortSongs('plays').slice(0, 25);
  els.topSongsBody.innerHTML = '';
  if (!topSongs.length) return renderEmptyRow(els.topSongsBody, 7, 'No public song rows returned.');
  topSongs.forEach((song, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${index + 1}</td><td></td><td></td><td>${formatNumber(song.plays)}</td><td>${formatNumber(song.likes)}</td><td>${formatNumber(song.shares)}</td><td></td>`;
    row.children[1].appendChild(createSongIdentity(song));
    row.children[2].textContent = song.artist;
    row.children[6].appendChild(openRadioButton(song));
    els.topSongsBody.appendChild(row);
  });
}

function sortSongs(key) {
  return [...state.songs].sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.title.localeCompare(b.title));
}

function renderRankings() {
  renderRankGrid(els.likedSongs, sortSongs('likes').slice(0, 10), song => formatNumber(song.likes), 'likes');
  renderRankGrid(els.engagementSongs, sortSongs('engagementRate').slice(0, 10), song => formatPercent(song.engagementRate), 'engagement rate');
  renderRankGrid(els.sharedSongs, sortSongs('shares').slice(0, 10), song => formatNumber(song.shares), 'shares');
  renderRankGrid(els.videoClicks, sortSongs('videoClicks').slice(0, 10), song => formatNumber(song.videoClicks), 'video clicks');
  renderRankGrid(els.productClicks, sortSongs('productClicks').slice(0, 10), song => formatNumber(song.productClicks), 'product clicks');
  renderRankGrid(els.skipRateSongs, sortSongs('skipRate').slice(0, 10), song => `${formatNumber(song.skips)} skips · ${formatPercent(song.skipRate)}`, 'skip count / plays');
}

function renderRankGrid(container, songs, metricFormatter, label) {
  container.innerHTML = '';
  if (!songs.length) {
    container.innerHTML = `<article class="rank-card muted">No public ${label} data returned.</article>`;
    return;
  }
  songs.forEach((song, index) => {
    const card = document.createElement('article');
    card.className = 'rank-card';
    card.innerHTML = `<div class="rank-top"><span class="rank-number">${index + 1}</span><div class="rank-title"></div></div><div class="rank-meta"></div><div class="rank-value"></div>`;
    card.querySelector('.rank-title').appendChild(createSongIdentity(song, { includeGenre: false }));
    card.querySelector('.rank-meta').textContent = `${song.artist} · ${song.genre}`;
    card.querySelector('.rank-value').textContent = metricFormatter(song);
    card.appendChild(openRadioButton(song));
    container.appendChild(card);
  });
}

function openRadioButton(song) {
  const link = document.createElement('a');
  link.className = 'button open-radio';
  link.href = radioUrlForSong(song);
  link.textContent = 'Open In Radio';
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function renderEventsTables() {
  renderEventsBody(els.eventsPreviewBody, state.events.slice(0, 8));
  renderEventsBody(els.eventsBody, state.events);
}

function renderEventsBody(body, events) {
  body.innerHTML = '';
  if (!events.length) {
    renderEmptyRow(body, 7, 'No public-safe events endpoint returned data yet. GET /dashboard/events is required for live event rows.');
    return;
  }
  events.forEach(event => {
    const row = document.createElement('tr');
    row.innerHTML = `<td></td><td class="event-type"></td><td></td><td></td><td></td><td></td><td></td>`;
    row.children[0].textContent = formatDateTime(event.time);
    row.children[1].textContent = event.eventType.replace(/_/g, ' ');
    row.children[2].appendChild(songIdentityForEvent(event));
    row.children[3].textContent = event.artist;
    row.children[4].textContent = event.deviceType;
    row.children[5].textContent = event.referrer;
    if (event.productUrl) {
      const link = document.createElement('a');
      link.className = 'product-link';
      link.href = event.productUrl;
      link.textContent = 'Open product';
      link.target = '_blank';
      link.rel = 'noopener';
      row.children[6].appendChild(link);
    } else {
      row.children[6].textContent = '—';
    }
    body.appendChild(row);
  });
}

function renderReferrers() {
  els.referrersBody.innerHTML = '';
  if (!state.referrers.length) return renderEmptyRow(els.referrersBody, 3, 'No public-safe referrer endpoint returned data yet. GET /dashboard/referrers is required.');
  state.referrers.slice(0, 25).forEach(referrer => {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td>';
    row.children[0].textContent = clean(firstDefined(referrer, ['referrer', 'source', 'track_source'])) || 'Direct / Unknown';
    row.children[1].textContent = formatNumber(firstDefined(referrer, ['event_count', 'events', 'count']));
    row.children[2].textContent = formatDateTime(firstDefined(referrer, ['last_seen_at', 'last_seen', 'updated_at']));
    els.referrersBody.appendChild(row);
  });
}

function renderDevices() {
  els.devicesStats.innerHTML = '';
  if (!state.devices.length) {
    els.devicesStats.innerHTML = '<article class="rank-card muted">No public-safe device endpoint returned data yet. GET /dashboard/devices is required.</article>';
    return;
  }
  state.devices.slice(0, 10).forEach((device, index) => {
    const card = document.createElement('article');
    card.className = 'rank-card';
    const name = clean(firstDefined(device, ['device_type', 'device', 'listener_device'])) || 'Unknown';
    const events = firstDefined(device, ['event_count', 'events', 'count']);
    card.innerHTML = `<div class="rank-top"><span class="rank-number">${index + 1}</span><p class="rank-title"><span></span></p></div><div class="rank-meta">Listener device type</div><div class="rank-value"></div>`;
    card.querySelector('.rank-title span').textContent = name;
    card.querySelector('.rank-value').textContent = `${formatNumber(events)} events`;
    els.devicesStats.appendChild(card);
  });
}

function renderEmptyRow(body, colspan, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.className = 'empty-cell';
  cell.colSpan = colspan;
  cell.textContent = message;
  row.appendChild(cell);
  body.appendChild(row);
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  });
  els.dashboardView.classList.toggle('hidden', tabName !== 'dashboard');
  els.eventsView.classList.toggle('hidden', tabName !== 'events');
}

function bindEvents() {
  els.headerRadioLink.href = getRadioBasePath();
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  els.refreshButton.addEventListener('click', loadDashboardData);
  els.refreshEventsButton.addEventListener('click', loadEventsOnly);
}

bindEvents();
setActiveTab('dashboard');
loadDashboardData();
