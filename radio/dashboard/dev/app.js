const API_ROOT = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev';
const PUBLIC_SONGS_URL = `${API_ROOT}/radio/songs`;
const PUBLIC_DASHBOARD_ENDPOINTS = {
  summary: `${API_ROOT}/dashboard/summary`,
  songs: `${API_ROOT}/dashboard/songs`
};

const ARTWORK_FIELDS = [
  'song_artwork_url',
  'artwork_url',
  'image_url',
  'cover_url',
  'artwork',
  'thumbnail_url',
  'album_artwork_url',
  'album_artwork',
  'artworkUrl',
  'songArtworkUrl',
  'resolved_artwork_url',
  'Artwork',
  'artworkLink',
  'Artwork Link',
  'imageUrl',
  'image',
  'Image',
  'coverUrl',
  'cover',
  'Cover',
  'cover_image_url',
  'coverImage',
  'thumbnailUrl',
  'thumbnail',
  'thumb',
  'song_image_url',
  'songImage',
  'songGraphic',
  'graphic'
];

const ARTWORK_OBJECT_URL_FIELDS = ['url', 'src', 'href'];

const state = {
  songs: [],
  summary: null,
  today: null,
  productStats: null,
  missingPublicEndpoints: new Set(),
  loadErrors: []
};

const els = {
  statusBanner: document.getElementById('statusBanner'),
  refreshButton: document.getElementById('refreshButton'),
  operationalStats: document.getElementById('operationalStats'),
  topSongsBody: document.getElementById('topSongsBody'),
  likedSongs: document.getElementById('likedSongs'),
  engagementSongs: document.getElementById('engagementSongs'),
  sharedSongs: document.getElementById('sharedSongs'),
  videoClicks: document.getElementById('videoClicks'),
  productClicks: document.getElementById('productClicks'),
  songAnalyticsStats: document.getElementById('songAnalyticsStats'),
  todayStats: document.getElementById('todayStats'),
  productAnalytics: document.getElementById('productAnalytics'),
  skipRateSongs: document.getElementById('skipRateSongs'),
  dashboardSections: [...document.querySelectorAll('[data-dashboard-section]')],
  dashboardViewLinks: [...document.querySelectorAll('[data-dashboard-view-link]')]
};

const DASHBOARD_VIEWS = new Set([
  'overview',
  'operational',
  'today',
  'top-songs',
  'most-liked',
  'most-shared',
  'product-analytics',
  'top-clicked-products',
  'recent-product-clicks',
  'events',
  'archive'
]);

function currentDashboardView() {
  const view = new URLSearchParams(window.location.search).get('view') || 'overview';
  return DASHBOARD_VIEWS.has(view) ? view : 'overview';
}

function applyDashboardView() {
  const activeView = currentDashboardView();
  els.dashboardSections.forEach((section) => {
    const isVisible = activeView === 'overview' || section.dataset.dashboardSection === activeView;
    section.classList.toggle('is-dashboard-section-hidden', !isVisible);
    section.toggleAttribute('hidden', !isVisible);
  });
  els.dashboardViewLinks.forEach((link) => {
    const isActive = link.dataset.dashboardViewLink === activeView;
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function setDashboardView(view) {
  const nextView = DASHBOARD_VIEWS.has(view) ? view : 'overview';
  const url = new URL(window.location.href);
  if (nextView === 'overview') {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', nextView);
  }
  window.history.pushState({ dashboardView: nextView }, '', url);
  applyDashboardView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

function isUsableArtworkUrl(value) {
  const artworkUrl = clean(value);
  if (!artworkUrl) return '';

  const lowerArtworkUrl = artworkUrl.toLowerCase();
  if (['null', 'undefined', 'none', 'n/a'].includes(lowerArtworkUrl)) return '';

  return artworkUrl;
}

function normalizeArtworkValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return isUsableArtworkUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const artworkUrl = normalizeArtworkValue(item);
      if (artworkUrl) return artworkUrl;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const field of ARTWORK_OBJECT_URL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
      const artworkUrl = normalizeArtworkValue(value[field]);
      if (artworkUrl) return artworkUrl;
    }
    return getSongArtworkUrl(value);
  }
  return '';
}

function getSongArtworkUrl(song) {
  if (!song) return '';
  for (const field of ARTWORK_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(song, field)) continue;
    const artworkUrl = normalizeArtworkValue(song[field]);
    if (artworkUrl) return artworkUrl;
  }
  return '';
}

function getSongIdentity(row, index = 0) {
  return {
    songKey: clean(firstDefined(row, ['song_key', 'key', 'slug', 'id', 'track_id', 'track_key'])) || `song-${index + 1}`,
    title: clean(firstDefined(row, ['display_title', 'song_name', 'title', 'name'])) || 'Untitled Stashbox Track'
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(count(value));
}

function formatPercent(value) {
  const number = Number.isFinite(value) ? value : 0;
  return `${number.toFixed(number >= 10 ? 0 : 1)}%`;
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

function normalizeSong(row, index = 0) {
  const { songKey, title } = getSongIdentity(row, index);
  const plays = count(firstDefined(row, ['total_plays', 'plays', 'play_count', 'play_starts']));
  const likes = count(firstDefined(row, ['likes', 'like_count', 'total_likes']));
  const shares = count(firstDefined(row, ['shares', 'share_count', 'total_shares']));
  const videoClicks = count(firstDefined(row, ['video_clicks', 'video_click_count', 'total_video_clicks']));
  const productClicks = count(firstDefined(row, ['product_clicks', 'product_click_count', 'total_product_clicks']));
  const skips = count(firstDefined(row, ['skip_count', 'skips']));
  const fullPlays = count(firstDefined(row, ['full_play_count', 'full_plays']));
  const partialPlays = count(firstDefined(row, ['partial_play_count', 'partial_plays']));
  const engagementTotal = likes + shares + videoClicks + productClicks;
  const artworkUrl = getSongArtworkUrl(row);

  return {
    songKey,
    title,
    artist: clean(firstDefined(row, ['artist', 'artist_name', 'band'])) || 'Stashbox',
    genre: clean(firstDefined(row, ['genre', 'primary_genre', 'section'])) || 'Other',
    plays,
    likes,
    shares,
    videoClicks,
    productClicks,
    skips,
    fullPlays,
    partialPlays,
    song_artwork_url: artworkUrl,
    artworkUrl,
    engagementRate: plays ? (engagementTotal / plays) * 100 : 0,
    skipRate: plays ? (skips / plays) * 100 : 0,
    updatedAt: clean(firstDefined(row, ['updated_at', 'updatedAt', 'modified_at']))
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

function parseApiPayload(data) {
  if (typeof data?.body === 'string') {
    try {
      return parseApiPayload(JSON.parse(data.body));
    } catch {
      return data;
    }
  }

  return data;
}

const TODAY_STAT_FIELD_NAMES = [
  'events_today',
  'eventsToday',
  'activity_today',
  'activityToday',
  'total_events_today',
  'totalEventsToday',
  'event_count_today',
  'eventCountToday',
  'plays_today',
  'playsToday',
  'play_starts_today',
  'playStartsToday',
  'total_plays_today',
  'totalPlaysToday',
  'play_count_today',
  'playCountToday',
  'likes_today',
  'likesToday',
  'total_likes_today',
  'totalLikesToday',
  'like_count_today',
  'likeCountToday',
  'shares_today',
  'sharesToday',
  'total_shares_today',
  'totalSharesToday',
  'share_count_today',
  'shareCountToday',
  'video_clicks_today',
  'videoClicksToday',
  'total_video_clicks_today',
  'totalVideoClicksToday',
  'video_click_count_today',
  'videoClickCountToday',
  'product_clicks_today',
  'productClicksToday',
  'total_product_clicks_today',
  'totalProductClicksToday',
  'product_click_count_today',
  'productClickCountToday',
  'skips_today',
  'skipsToday',
  'skip_count_today',
  'skipCountToday',
  'total_skips_today',
  'totalSkipsToday',
  'active_songs_today',
  'activeSongsToday',
  'songs_played_today',
  'songsPlayedToday',
  'songs_today',
  'songsToday',
  'unique_songs_today',
  'uniqueSongsToday'
];

function hasTodayStatsFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  return TODAY_STAT_FIELD_NAMES.some((key) => value[key] !== undefined && value[key] !== null);
}

function firstPayloadObject(candidates, predicate = null) {
  let firstObject = null;

  for (const candidate of candidates) {
    const parsed = parseApiPayload(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    if (!firstObject) firstObject = parsed;
    if (!predicate || predicate(parsed)) return parsed;
  }

  return predicate ? null : firstObject;
}

function findNestedTodayStats(value, seen = new Set()) {
  const parsed = parseApiPayload(value);
  if (!parsed || typeof parsed !== 'object' || seen.has(parsed)) return null;
  seen.add(parsed);

  if (!Array.isArray(parsed) && hasTodayStatsFields(parsed)) return parsed;

  const nestedValues = Array.isArray(parsed) ? parsed : Object.values(parsed);
  for (const nestedValue of nestedValues) {
    const match = findNestedTodayStats(nestedValue, seen);
    if (match) return match;
  }

  return null;
}

function normalizeStatsSummaryResponse(data) {
  const payload = parseApiPayload(data) || {};
  const dataPayload = parseApiPayload(payload.data) || {};
  const dashboard = parseApiPayload(payload.dashboard || dataPayload.dashboard) || {};
  const stats = parseApiPayload(payload.stats || dataPayload.stats || dashboard.stats) || {};
  const summary = firstPayloadObject([
    payload.summary,
    dataPayload.summary,
    dashboard.summary,
    stats.summary,
    payload
  ]) || {};
  const todayCandidates = [
    payload.today,
    payload.today_stats,
    payload.stats_today,
    dataPayload.today,
    dataPayload.today_stats,
    dashboard.today,
    dashboard.today_stats,
    stats.today,
    stats.today_stats,
    summary.today,
    summary.today_stats,
    summary,
    stats,
    dashboard,
    dataPayload,
    payload
  ];
  const today = firstPayloadObject(todayCandidates, hasTodayStatsFields) || findNestedTodayStats(payload) || {};
  const products = firstPayloadObject([
    payload.products,
    payload.product_stats,
    dataPayload.products,
    dataPayload.product_stats,
    dashboard.products,
    dashboard.product_stats,
    stats.products,
    stats.product_stats,
    summary.products,
    summary.product_stats
  ]);

  return {
    summary,
    today,
    products,
    generated_at: payload.generated_at || dataPayload.generated_at || dashboard.generated_at || stats.generated_at || summary.generated_at || ''
  };
}

function normalizeTodayStats(today = {}) {
  const playsToday = count(firstDefined(today, ['plays_today', 'playsToday', 'play_starts_today', 'playStartsToday', 'total_plays_today', 'totalPlaysToday', 'play_count_today', 'playCountToday', 'play_starts', 'playStarts', 'plays', 'total_plays', 'totalPlays', 'play_count', 'playCount']));
  const likesToday = count(firstDefined(today, ['likes_today', 'likesToday', 'total_likes_today', 'totalLikesToday', 'like_count_today', 'likeCountToday', 'likes', 'total_likes', 'totalLikes', 'like_count', 'likeCount']));
  const sharesToday = count(firstDefined(today, ['shares_today', 'sharesToday', 'total_shares_today', 'totalSharesToday', 'share_count_today', 'shareCountToday', 'shares', 'total_shares', 'totalShares', 'share_count', 'shareCount']));
  const videoClicksToday = count(firstDefined(today, ['video_clicks_today', 'videoClicksToday', 'total_video_clicks_today', 'totalVideoClicksToday', 'video_click_count_today', 'videoClickCountToday', 'video_clicks', 'videoClicks', 'total_video_clicks', 'totalVideoClicks', 'video_click_count', 'videoClickCount']));
  const productClicksToday = count(firstDefined(today, ['product_clicks_today', 'productClicksToday', 'total_product_clicks_today', 'totalProductClicksToday', 'product_click_count_today', 'productClickCountToday', 'product_clicks', 'productClicks', 'total_product_clicks', 'totalProductClicks', 'product_click_count', 'productClickCount']));
  const skipsToday = count(firstDefined(today, ['skips_today', 'skipsToday', 'skip_count_today', 'skipCountToday', 'total_skips_today', 'totalSkipsToday', 'skips', 'skip_count', 'skipCount', 'total_skips', 'totalSkips']));
  const activeSongsToday = count(firstDefined(today, ['active_songs_today', 'activeSongsToday', 'songs_played_today', 'songsPlayedToday', 'songs_today', 'songsToday', 'unique_songs_today', 'uniqueSongsToday', 'active_songs', 'activeSongs', 'songs_played', 'songsPlayed', 'unique_songs', 'uniqueSongs']));
  const explicitActivityToday = firstDefined(today, ['events_today', 'eventsToday', 'activity_today', 'activityToday', 'total_events_today', 'totalEventsToday', 'event_count_today', 'eventCountToday', 'events', 'activity', 'total_events', 'totalEvents', 'event_count', 'eventCount']);

  return {
    events_today: explicitActivityToday === '' ? playsToday + likesToday + sharesToday + videoClicksToday + productClicksToday + skipsToday : count(explicitActivityToday),
    plays_today: playsToday,
    likes_today: likesToday,
    shares_today: sharesToday,
    video_clicks_today: videoClicksToday,
    product_clicks_today: productClicksToday,
    skips_today: skipsToday,
    active_songs_today: activeSongsToday
  };
}

function extractArray(data, keys) {
  const payload = parseApiPayload(data);

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

async function loadDashboardData() {
  state.loadErrors = [];
  state.missingPublicEndpoints.clear();
  setStatus('Loading public dashboard data…');
  els.refreshButton.disabled = true;

  const [publicSongs, dashboardSongs, summary] = await Promise.all([
    fetchJson(PUBLIC_SONGS_URL, 'public radio songs', { optional: false }),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.songs, 'GET /dashboard/songs'),
    fetchJson(PUBLIC_DASHBOARD_ENDPOINTS.summary, 'GET /dashboard/summary')
  ]);

  const songRows = extractArray(dashboardSongs, ['songs', 'items', 'results']);
  const fallbackSongRows = extractArray(publicSongs, ['songs', 'items', 'results']);
  const statsSummary = normalizeStatsSummaryResponse(summary);
  state.songs = (songRows.length ? songRows : fallbackSongRows).map(normalizeSong);
  hydrateArtworkFromPublicSongs(fallbackSongRows);
  state.summary = statsSummary.summary || null;
  state.today = normalizeTodayStats(statsSummary.today);
  state.productStats = statsSummary.products || null;

  renderAll();
  setStatus(statusMessage(), state.songs.length ? 'success' : 'error');
  els.refreshButton.disabled = false;
}

function hydrateArtworkFromPublicSongs(publicSongRows) {
  if (!publicSongRows.length || !state.songs.length) return;

  const artworkByKey = new Map();
  const artworkByTitle = new Map();
  publicSongRows.forEach((row, index) => {
    const artworkUrl = getSongArtworkUrl(row);
    if (!artworkUrl) return;

    const identity = getSongIdentity(row, index);
    artworkByKey.set(identity.songKey, artworkUrl);
    artworkByTitle.set(identity.title.toLowerCase(), artworkUrl);
  });

  state.songs = state.songs.map(song => {
    const artworkUrl = getSongArtworkUrl(song) || artworkByKey.get(song.songKey) || artworkByTitle.get(song.title.toLowerCase()) || '';
    return {
      ...song,
      song_artwork_url: artworkUrl,
      artworkUrl
    };
  });
}

function statusMessage() {
  if (!state.songs.length) {
    return 'No public song analytics could be loaded. A public-safe read-only songs endpoint is required for this dashboard.';
  }
  const missing = [...state.missingPublicEndpoints];
  if (!missing.length) return `Loaded ${state.songs.length} public song row${state.songs.length === 1 ? '' : 's'}.`;
  return `Loaded ${state.songs.length} public song row${state.songs.length === 1 ? '' : 's'} from the public radio songs API. Missing public-safe dashboard endpoints: ${missing.join(', ')}. Backend read-only endpoints are required for full dashboard summary data.`;
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
    ['Plays Today', state.today?.plays_today ?? 0],
    ['Likes Today', state.today?.likes_today ?? 0],
    ['Shares Today', state.today?.shares_today ?? 0],
    ['Video Clicks Today', state.today?.video_clicks_today ?? 0],
    ['Product Clicks Today', state.today?.product_clicks_today ?? 0],
    ['Skips Today', state.today?.skips_today ?? 0],
    ['Active Songs Today', state.today?.active_songs_today ?? 0],
    ['Activity Today', state.today?.events_today ?? 0]
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

function renderArtworkPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'song-art-thumb song-art-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.textContent = '♪';
  return placeholder;
}

function renderSongArtwork(song) {
  const artworkUrl = getSongArtworkUrl(song);
  if (!artworkUrl) return renderArtworkPlaceholder();

  const image = document.createElement('img');
  image.className = 'song-art-thumb';
  image.src = artworkUrl;
  image.alt = `${song.title} artwork`;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    image.replaceWith(renderArtworkPlaceholder());
  }, { once: true });
  return image;
}

function renderSongCell(song) {
  const wrapper = document.createElement('div');
  wrapper.className = 'song-cell-with-art';

  const copy = document.createElement('div');
  copy.className = 'song-cell-copy';
  const title = document.createElement('strong');
  title.textContent = song.title;
  const meta = document.createElement('span');
  meta.className = 'song-subtext';
  meta.textContent = song.genre;

  copy.append(title, meta);
  wrapper.append(renderSongArtwork(song), copy);
  return wrapper;
}

function renderSongTables() {
  const topSongs = sortSongs('plays').slice(0, 25);
  els.topSongsBody.innerHTML = '';
  if (!topSongs.length) return renderEmptyRow(els.topSongsBody, 7, 'No public song rows returned.');
  topSongs.forEach((song, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="rank-column">${index + 1}</td><td class="song-column"></td><td class="artist-column"></td><td class="metric-column">${formatNumber(song.plays)}</td><td class="metric-column">${formatNumber(song.likes)}</td><td class="metric-column">${formatNumber(song.shares)}</td><td class="open-column"></td>`;
    row.children[1].appendChild(renderSongCell(song));
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
  container.classList.add('rank-grid--compact');
  container.innerHTML = '';
  if (!songs.length) {
    container.innerHTML = `<article class="rank-card muted">No public ${label} data returned.</article>`;
    return;
  }
  songs.forEach((song, index) => {
    const card = document.createElement('article');
    card.className = 'rank-card';
    card.innerHTML = `<div class="rank-top"><span class="rank-number">${index + 1}</span></div><div class="rank-meta"></div><div class="rank-value"></div>`;
    card.querySelector('.rank-top').appendChild(renderSongCell(song));
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

function renderEmptyRow(body, colspan, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.className = 'empty-cell';
  cell.colSpan = colspan;
  cell.textContent = message;
  row.appendChild(cell);
  body.appendChild(row);
}

function bindDashboardControls() {
  els.refreshButton.addEventListener('click', loadDashboardData);
  els.dashboardViewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setDashboardView(link.dataset.dashboardViewLink);
    });
  });
  window.addEventListener('popstate', applyDashboardView);
}

bindDashboardControls();
applyDashboardView();
loadDashboardData();
