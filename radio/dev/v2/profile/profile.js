(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  const VEC_MODE_KEY = 'stashbox_v2_vec_mode';
  const SLEEP_END_KEY = 'stashbox_v2_sleep_timer_ends_at';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const app = document.getElementById('profileApp');
  if (!app) return;

  const state = {
    tokens: readJson(TOKEN_KEY, null),
    config: null,
    account: null,
    summary: {},
    preferences: null,
    favorites: [],
    playlists: [],
    playlistDetails: new Map(),
    history: [],
    follows: [],
    songs: [],
    songMap: new Map(),
    view: new URLSearchParams(location.search).get('view') === 'settings' ? 'settings' : 'profile',
    overlay: null,
    overlayTitle: '',
    refreshPromise: null
  };

  const icons = {
    back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 7h4l2-3h4l2 3h4v13H4Z"/><circle cx="12" cy="13" r="4"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4ZM14 7l3 3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    playlist: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h7"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 14a7 7 0 0 1 5 7"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.6 6.8-4.2M8.6 13.4l6.8 4.2"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m7 5 9 7-9 7ZM18 5v14"/></svg>',
    previous: '<svg viewBox="0 0 24 24"><path d="m17 5-9 7 9 7ZM6 5v14"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/></svg>',
    compass: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>',
    shop: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3Z"/><path d="m3 7 9 7 9-7"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg>',
    document: '<svg viewBox="0 0 24 24"><path d="M6 2h9l4 4v16H6Z"/><path d="M14 2v5h5M9 12h7M9 16h7"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
    fire: '<svg viewBox="0 0 24 24"><path d="M13 3s1 4-2 7c-2-2-3-3-3-3s-4 5-2 10c1 3 4 5 7 5 4 0 7-3 7-7 0-5-4-8-7-12Z"/><path d="M12 13c2 2 2 5 0 7-2-1-3-3-2-5 .5-1 1-1.5 2-2Z"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
  };

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clean(value) { return String(value ?? '').trim(); }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; }
  function compact(value) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value)); }
  function settings() { const value = state.preferences?.settings; return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function tokenExpiresSoon(token, seconds = 90) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return true;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const parsed = JSON.parse(atob(padded));
      return !parsed.exp || parsed.exp * 1000 <= Date.now() + seconds * 1000;
    } catch (_) { return true; }
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = body.code || '';
      throw error;
    }
    return body;
  }

  async function loadConfig() {
    if (state.config) return state.config;
    const body = await fetch(`${API_ROOT}/radio/auth/config`, { cache: 'no-store' }).then(parseResponse);
    state.config = body.auth || {};
    return state.config;
  }

  async function refreshSession() {
    if (state.refreshPromise) return state.refreshPromise;
    if (!state.tokens?.refreshToken) throw new Error('Your session expired. Log in again.');
    state.refreshPromise = (async () => {
      const config = await loadConfig();
      const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: config.app_client_id,
          AuthParameters: { REFRESH_TOKEN: state.tokens.refreshToken }
        })
      }).then(parseResponse);
      const auth = response.AuthenticationResult || {};
      state.tokens = {
        accessToken: auth.AccessToken || '',
        idToken: auth.IdToken || '',
        refreshToken: state.tokens.refreshToken,
        expiresAt: Date.now() + Math.max(60, Number(auth.ExpiresIn || 3600)) * 1000
      };
      writeJson(TOKEN_KEY, state.tokens);
      return state.tokens;
    })().finally(() => { state.refreshPromise = null; });
    return state.refreshPromise;
  }

  async function validTokens() {
    if (!state.tokens?.accessToken) throw new Error('Log in to continue.');
    if (tokenExpiresSoon(state.tokens.accessToken)) await refreshSession();
    return state.tokens;
  }

  async function api(path, options = {}, retry = true) {
    const tokens = await validTokens();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    if (tokens.idToken) headers.set('X-Cognito-Id-Token', tokens.idToken);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path.startsWith('http') ? path : `${API_ROOT}${path}`, { cache: 'no-store', ...options, headers });
    if (response.status === 401 && retry && state.tokens?.refreshToken) {
      await refreshSession();
      return api(path, options, false);
    }
    return parseResponse(response);
  }

  function songFor(key) { return state.songMap.get(String(key || '')) || {}; }
  function songTitle(item) { const song = songFor(item?.song_key); return clean(item?.display_title || song.display_title || song.song_name || item?.song_key || 'Untitled Song'); }
  function songArtist(item) { const song = songFor(item?.song_key); return clean(item?.artist || song.artist || 'Stashbox'); }
  function songArt(item) {
    const song = songFor(item?.song_key);
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return clean(metadata.artwork_url || metadata.song_artwork_url || song.resolved_artwork_url || song.song_artwork_url || song.artwork_url) || FALLBACK_ART;
  }
  function songGenre(item) { const song = songFor(item?.song_key); const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}; return clean(metadata.genre || song.genre || song.primary_genre || 'Other'); }

  function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', options).format(date) : '';
  }

  function relativeTime(value) {
    const time = new Date(value || 0).getTime();
    if (!time) return '';
    const seconds = Math.max(1, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(value, { month: 'short', day: 'numeric' });
  }

  function initials(name) {
    return clean(name || 'Listener').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'L';
  }

  function profileHandle() {
    const saved = clean(settings().handle).replace(/^@/, '');
    if (saved) return saved;
    const emailName = clean(state.account?.email).split('@')[0];
    return (emailName || clean(state.account?.display_name).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'listener').slice(0, 30);
  }

  function avatarMarkup(sizeClass = '') {
    const avatar = clean(settings().avatar_url);
    return `<div class="profile-avatar ${sizeClass}">${avatar
      ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(state.account?.display_name || 'Listener')}" onerror="this.parentElement.innerHTML='<span class=\'profile-avatar-initials\'>${escapeHtml(initials(state.account?.display_name))}</span>'">`
      : `<span class="profile-avatar-initials">${escapeHtml(initials(state.account?.display_name))}</span>`}</div>`;
  }

  function totalListeningSeconds() { return state.history.reduce((sum, item) => sum + number(item.seconds_played), 0); }
  function uniqueSongsPlayed() { return new Set(state.history.filter(item => item.song_key).map(item => item.song_key)).size; }

  function listeningStreak() {
    const dates = new Set(state.history.map(item => {
      const date = new Date(item.listened_at || 0);
      return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }).filter(Boolean));
    if (!dates.size) return 0;
    let cursor = new Date();
    const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!dates.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (true) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (!dates.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function topGenres() {
    const counts = new Map();
    state.history.forEach(item => {
      const genre = songGenre(item);
      const weight = Math.max(1, number(item.seconds_played) || 1);
      counts.set(genre, (counts.get(genre) || 0) + weight);
    });
    if (!counts.size) state.favorites.forEach(item => counts.set(songGenre(item), (counts.get(songGenre(item)) || 0) + 1));
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1;
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, value]) => ({ genre, percent: Math.max(1, Math.round(value / total * 100)) }));
  }

  function latestSong() {
    const recent = state.history.find(item => item.song_key) || state.favorites[0];
    return recent || null;
  }

  function image(url, alt = '') {
    return `<img src="${escapeHtml(url || FALLBACK_ART)}" alt="${escapeHtml(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_ART}'">`;
  }

  function playSong(item) {
    const songKey = clean(item?.song_key || item);
    if (!songKey) return;
    try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ songKey, mode: 'profile', createdAt: Date.now() })); }
    catch (_) {}
    location.href = '/radio/dev/v2/?profile_play=1';
  }

  function profileStatsMarkup() {
    const hours = totalListeningSeconds() / 3600;
    const stats = [
      [icons.playlist, state.playlists.length, 'Playlists', 'playlists'],
      [icons.heart, state.favorites.length, 'Favorites', 'favorites'],
      [icons.clock, uniqueSongsPlayed(), 'Songs Played', 'history'],
      [icons.history, hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString(), 'Hours Listened', 'history'],
      [icons.users, state.follows.length, 'Following', 'following']
    ];
    return `<section class="profile-stat-grid">${stats.map(([icon, value, label, view]) => `<button type="button" class="profile-stat" data-open-library="${view}">${icon}<strong>${escapeHtml(value)}</strong><span>${label}</span></button>`).join('')}</section>`;
  }

  function shortcutsMarkup() {
    return `<section class="profile-shortcuts">
      <button type="button" class="profile-shortcut" data-open-library="playlists">${icons.playlist}<span>Playlists</span></button>
      <button type="button" class="profile-shortcut" data-open-library="favorites">${icons.heart}<span>Favorites</span></button>
      <button type="button" class="profile-shortcut" data-open-library="history">${icons.history}<span>Listening History</span></button>
      <button type="button" class="profile-shortcut" disabled title="Offline downloads are part of the future premium package">${icons.download}<span>Downloads</span></button>
      <button type="button" class="profile-shortcut" data-open-library="following">${icons.user}<span>Following</span></button>
    </section>`;
  }

  function playlistArt(playlist) {
    const detail = state.playlistDetails.get(playlist.id);
    const items = detail?.items || [];
    if (!items.length) return `<span class="profile-playlist-art single">${image(FALLBACK_ART, '')}</span>`;
    const arts = items.slice(0, 4).map(item => image(songArt(item), '')).join('');
    return `<span class="profile-playlist-art${items.length === 1 ? ' single' : ''}">${arts}</span>`;
  }

  function playlistsMarkup() {
    if (!state.playlists.length) return '<div class="profile-empty">Create your first playlist from the Playlists section.</div>';
    return `<div class="profile-playlist-row">${state.playlists.slice(0, 8).map(playlist => `
      <button type="button" class="profile-playlist-card" data-open-playlist="${escapeHtml(playlist.id)}">
        ${playlistArt(playlist)}
        <span class="profile-playlist-play">${icons.play}</span>
        <span class="profile-playlist-copy"><strong>${escapeHtml(playlist.name)}</strong><small>${number(playlist.item_count)} song${number(playlist.item_count) === 1 ? '' : 's'}</small></span>
      </button>`).join('')}</div>`;
  }

  function activityItems() {
    const history = state.history.slice(0, 10).map(item => ({
      type: item.event_type === 'play_full' ? 'completed' : 'played',
      item,
      title: `${item.event_type === 'play_full' ? 'Completed' : 'Played'} ${songTitle(item)}`,
      subtitle: songArtist(item),
      at: item.listened_at
    }));
    const favorites = state.favorites.slice(0, 8).map(item => ({ type: 'favorite', item, title: `Liked ${songTitle(item)}`, subtitle: songArtist(item), at: item.created_at }));
    return [...history, ...favorites].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 8);
  }

  function activityMarkup() {
    const rows = activityItems();
    if (!rows.length) return '<div class="profile-empty">Your listening activity will appear here.</div>';
    return `<div class="profile-activity-list">${rows.map(row => `
      <article class="profile-activity">
        <button type="button" class="profile-activity-type${row.type === 'favorite' ? ' favorite' : ''}" data-play-song="${escapeHtml(row.item.song_key)}" aria-label="Play ${escapeHtml(songTitle(row.item))}">${row.type === 'favorite' ? icons.heart : icons.play}</button>
        <span class="profile-activity-art">${image(songArt(row.item), '')}</span>
        <span class="profile-activity-copy"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.subtitle)}</span></span>
        <time class="profile-activity-time">${escapeHtml(relativeTime(row.at))}</time>
        <button type="button" class="profile-activity-more" data-play-song="${escapeHtml(row.item.song_key)}" aria-label="Open song">•••</button>
      </article>`).join('')}</div>`;
  }

  function insightsMarkup() {
    const genres = topGenres();
    const streak = listeningStreak();
    const today = new Date().getDay();
    const labels = ['S','M','T','W','T','F','S'];
    return `<div class="profile-insight-grid">
      <section class="profile-insight"><h3>Top Genres</h3>${genres.length ? genres.map(item => `<div class="genre-row"><span>${escapeHtml(item.genre)}</span><span class="genre-track"><i style="width:${item.percent}%"></i></span><small>${item.percent}%</small></div>`).join('') : '<div class="profile-empty">Listen to more songs to build your genre profile.</div>'}</section>
      <section class="profile-insight streak-card"><h3>Listening Streak</h3><div class="streak-number">${icons.fire}<strong>${streak}</strong></div><b>day${streak === 1 ? '' : 's'} in a row</b><div class="streak-days">${labels.map((label, index) => `<span class="${index <= today && streak ? 'on' : ''}">${label}</span>`).join('')}</div><p>${streak ? 'Keep it going!' : 'Play a song today to begin a streak.'}</p></section>
    </div>`;
  }

  function miniPlayerMarkup() {
    const item = latestSong();
    if (!item) return '';
    return `<aside class="profile-mini-player"><span>${image(songArt(item), '')}</span><span class="profile-mini-copy"><strong>${escapeHtml(songTitle(item))}</strong><span>${escapeHtml(songArtist(item))}</span></span><span class="profile-mini-controls"><button type="button" data-play-song="${escapeHtml(item.song_key)}">${icons.previous}</button><button type="button" class="primary" data-play-song="${escapeHtml(item.song_key)}">${icons.play}</button><button type="button" data-play-song="${escapeHtml(item.song_key)}">${icons.next}</button></span></aside>`;
  }

  function bottomNavMarkup() {
    return `<nav class="profile-bottom-nav" aria-label="Primary navigation">
      <a href="/radio/dev/v2/">${icons.home}<span>Home</span></a>
      <a href="/radio/dev/v2/#popular-artists">${icons.compass}<span>Explore</span></a>
      <a href="/radio/dev/v2/">${icons.play}<span>Player</span></a>
      <a href="https://stashbox.ai" target="_blank" rel="noopener">${icons.shop}<span>Shop</span></a>
      <a class="active" href="/radio/dev/v2/profile/">${icons.user}<span>Profile</span></a>
    </nav>`;
  }

  function renderProfile() {
    state.view = 'profile';
    history.replaceState(null, '', '/radio/dev/v2/profile/');
    const profile = settings();
    const banner = clean(profile.banner_url) || songArt(latestSong()) || FALLBACK_ART;
    const displayName = state.account?.display_name || 'Listener';
    const bio = clean(profile.bio) || 'Music lover. Always discovering something new on Stashbox Radio.';
    app.innerHTML = `
      <div class="profile-shell">
        <header class="profile-hero" style="--profile-banner:url('${escapeHtml(banner)}')">
          <div class="profile-topbar"><button type="button" class="profile-round" data-open-settings aria-label="Settings">${icons.settings}</button><button type="button" class="profile-round profile-bell" data-open-notifications aria-label="Notifications">${icons.bell}${number(state.summary.unread_notifications) ? '<i class="profile-bell-dot"></i>' : ''}</button></div>
          <div class="profile-identity">
            <div class="profile-avatar-wrap">${avatarMarkup()}<button type="button" class="profile-avatar-edit" data-edit-profile aria-label="Edit profile image">${icons.camera}</button></div>
            <div class="profile-copy"><h1>${escapeHtml(displayName)}</h1><span class="profile-handle">@${escapeHtml(profileHandle())}</span><p class="profile-bio">${escapeHtml(bio)}</p><span class="profile-member">${icons.calendar} Member since ${escapeHtml(formatDate(state.account?.created_at, { month: 'long', year: 'numeric' }))}</span></div>
            <button type="button" class="profile-edit-button" data-edit-profile>${icons.edit}<span>Edit Profile</span></button>
          </div>
        </header>
        <main class="profile-main">
          ${profileStatsMarkup()}
          ${shortcutsMarkup()}
          <section class="profile-section"><div class="profile-section-head"><h2>Your Playlists</h2><button type="button" data-open-library="playlists">View All</button></div>${playlistsMarkup()}</section>
          <section class="profile-section"><div class="profile-section-head"><h2>Recent Activity</h2><button type="button" data-open-library="history">View All</button></div>${activityMarkup()}</section>
          ${insightsMarkup()}
        </main>
      </div>
      ${miniPlayerMarkup()}
      ${bottomNavMarkup()}`;
  }

  function settingRow({ icon, title, subtitle, value = '', accent = false, action = '', href = '', disabled = false }) {
    const content = `${icon}<span class="settings-row-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>${value ? `<span class="settings-row-value${accent ? ' accent' : ''}">${escapeHtml(value)}</span>` : '<span></span>'}<span class="settings-chevron">›</span>`;
    if (href) return `<a class="settings-row${disabled ? ' disabled' : ''}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${content}</a>`;
    return `<button type="button" class="settings-row${disabled ? ' disabled' : ''}" ${disabled ? 'disabled' : `data-settings-action="${escapeHtml(action)}"`}>${content}</button>`;
  }

  function renderSettings() {
    state.view = 'settings';
    history.replaceState(null, '', '/radio/dev/v2/profile/?view=settings');
    const profile = settings();
    const sleepEnd = number(localStorage.getItem(SLEEP_END_KEY));
    const remaining = sleepEnd > Date.now() ? Math.ceil((sleepEnd - Date.now()) / 60000) : 0;
    const vec = clean(profile.vec_mode || localStorage.getItem(VEC_MODE_KEY) || 'full') === 'artwork' ? 'Artwork Only' : 'Full Visuals';
    app.innerHTML = `<main class="settings-page"><div class="settings-shell">
      <header class="settings-top"><button type="button" class="profile-round" data-back-profile>${icons.back}</button><h1>Settings</h1><span></span></header>
      <section class="settings-card"><button type="button" class="settings-profile" data-settings-action="account"><div class="profile-avatar-wrap">${avatarMarkup()}</div><div class="settings-profile-copy"><h2>${escapeHtml(state.account?.display_name || 'Listener')}</h2><strong>@${escapeHtml(profileHandle())}</strong><p>${escapeHtml(clean(profile.bio) || 'Music lover. Always discovering.')}</p><small>${icons.calendar} Member since ${escapeHtml(formatDate(state.account?.created_at, { month: 'long', year: 'numeric' }))}</small></div><span class="settings-chevron">›</span></button><div class="settings-promo"><span class="settings-promo-icon">${icons.star}</span><span><strong>Stashbox Radio V2 is here.</strong><span>Better sound. Smarter controls. More discovery.</span></span><span class="settings-coming">What’s New<br>(Coming Soon)</span></div></section>
      <p class="settings-label">Playback</p><section class="settings-card">${settingRow({ icon: `<span class="settings-row-icon">${icons.moon}</span>`, title: 'Sleep Timer', subtitle: 'Stop playback after a set time', value: remaining ? `${remaining}m` : 'Off', action: 'playback' })}${settingRow({ icon: `<span class="settings-row-icon">${icons.screen}</span>`, title: 'Visual Experience (VEC)', subtitle: 'Choose full visuals or artwork only', value: vec, accent: true, action: 'playback' })}</section>
      <p class="settings-label">Account</p><section class="settings-card">${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.user}</span>`, title: 'Account Information', subtitle: 'Edit your profile details', action: 'account' })}${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.lock}</span>`, title: 'Security', subtitle: 'Change password', action: 'security' })}${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.mail}</span>`, title: 'Notification & Email Preferences', subtitle: 'Manage Stashbox Radio notifications', action: 'notifications' })}</section>
      <p class="settings-label">Support & Info</p><section class="settings-card">${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.info}</span>`, title: 'Help Center', subtitle: 'Get help and find answers', value: 'Coming Soon', disabled: true })}${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.document}</span>`, title: 'Terms of Service', subtitle: 'Read our terms', href: '/legal/terms-of-use/' })}${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.shield}</span>`, title: 'Privacy Policy', subtitle: 'How we protect your data', href: '/legal/privacy-policy/' })}${settingRow({ icon: `<span class="settings-row-icon neutral">${icons.info}</span>`, title: 'About Stashbox Radio V2', subtitle: 'Version 2.0 DEV', value: 'Coming Soon', disabled: true })}</section>
      <button type="button" class="settings-logout" data-logout>${icons.logout} &nbsp; Log Out</button>
    </div></main>`;
  }

  function preferencePayload({ settingsPatch = {}, fields = {} } = {}) {
    const p = state.preferences || {};
    return {
      autoplay_enabled: fields.autoplay_enabled ?? Boolean(p.autoplay_enabled ?? true),
      explicit_content_enabled: fields.explicit_content_enabled ?? Boolean(p.explicit_content_enabled ?? true),
      default_view_mode: fields.default_view_mode || p.default_view_mode || 'visual',
      preferred_genres: Array.isArray(p.preferred_genres) ? p.preferred_genres : [],
      preferred_artists: Array.isArray(p.preferred_artists) ? p.preferred_artists : [],
      in_app_enabled: fields.in_app_enabled ?? Boolean(p.in_app_enabled ?? true),
      browser_push_enabled: fields.browser_push_enabled ?? Boolean(p.browser_push_enabled ?? false),
      email_enabled: fields.email_enabled ?? Boolean(p.email_enabled ?? false),
      notification_categories: Array.isArray(p.notification_categories) ? p.notification_categories : [],
      notification_artist_keys: Array.isArray(p.notification_artist_keys) ? p.notification_artist_keys : [],
      settings: { ...settings(), ...settingsPatch }
    };
  }

  async function savePreferences(payload) {
    const body = await api('/radio/me/preferences', { method: 'PATCH', body: JSON.stringify(payload) });
    state.preferences = body.preferences || state.preferences;
    return state.preferences;
  }

  function overlayShell(title, body) {
    closeOverlay(true);
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.innerHTML = `<button type="button" class="profile-overlay-backdrop" data-close-overlay aria-label="Close"></button><section class="profile-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="profile-sheet-handle"></div><header class="profile-sheet-head"><h2>${escapeHtml(title)}</h2><button type="button" class="profile-sheet-close" data-close-overlay>×</button></header><div class="profile-sheet-body">${body}</div></section>`;
    document.body.appendChild(overlay);
    state.overlay = overlay;
    requestAnimationFrame(() => overlay.classList.add('open'));
    document.body.style.overflow = 'hidden';
    return overlay;
  }

  function closeOverlay(immediate = false) {
    if (!state.overlay) return;
    const overlay = state.overlay;
    state.overlay = null;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    window.setTimeout(() => overlay.remove(), immediate ? 0 : 330);
  }

  function listRow(item, actions = '') {
    return `<article class="profile-list-row"><span>${image(songArt(item), '')}</span><span class="profile-list-copy"><strong>${escapeHtml(songTitle(item))}</strong><span>${escapeHtml(songArtist(item))}</span></span><span class="profile-list-actions">${actions}</span></article>`;
  }

  function openFavorites() {
    const rows = state.favorites.length ? state.favorites.map(item => listRow(item, `<button type="button" data-play-song="${escapeHtml(item.song_key)}" aria-label="Play">${icons.play}</button><button type="button" data-remove-favorite="${escapeHtml(item.song_key)}" aria-label="Remove favorite">${icons.trash}</button>`)).join('') : '<div class="profile-empty">No favorites yet.</div>';
    overlayShell('Favorites', `<div class="profile-list">${rows}</div>`);
  }

  function openHistory() {
    const rows = state.history.length ? state.history.map(item => listRow(item, `<button type="button" data-play-song="${escapeHtml(item.song_key)}" aria-label="Play">${icons.play}</button>`)).join('') : '<div class="profile-empty">No listening history yet.</div>';
    overlayShell('Listening History', `<div class="profile-list">${rows}</div>`);
  }

  function openFollowing() {
    const rows = state.follows.length ? state.follows.map(artist => {
      const art = artist.profile_image_url || FALLBACK_ART;
      return `<article class="profile-list-row"><span>${image(art, '')}</span><span class="profile-list-copy"><strong>${escapeHtml(artist.name || artist.artist_name || artist.artist_key)}</strong><span>${compact(artist.follower_count || 0)} followers</span></span><span class="profile-list-actions"><button type="button" data-open-artist="${escapeHtml(artist.slug || artist.artist_key)}" aria-label="Open artist">${icons.chevron}</button><button type="button" data-unfollow="${escapeHtml(artist.artist_key)}" aria-label="Unfollow">${icons.trash}</button></span></article>`;
    }).join('') : '<div class="profile-empty">Artists you follow will appear here.</div>';
    overlayShell('Following', `<div class="profile-list">${rows}</div>`);
  }

  function openPlaylists() {
    const rows = state.playlists.length ? state.playlists.map(playlist => `<article class="profile-list-row"><span>${playlistArt(playlist)}</span><span class="profile-list-copy"><strong>${escapeHtml(playlist.name)}</strong><span>${number(playlist.item_count)} songs · ${escapeHtml(playlist.visibility || 'private')}</span></span><span class="profile-list-actions"><button type="button" data-open-playlist="${escapeHtml(playlist.id)}" aria-label="Open playlist">${icons.chevron}</button></span></article>`).join('') : '<div class="profile-empty">No playlists yet.</div>';
    overlayShell('Playlists', `<div class="profile-form-actions" style="margin:0 0 15px"><button type="button" class="profile-button" data-create-playlist>${icons.plus} New Playlist</button></div><div class="profile-list">${rows}</div>`);
  }

  async function openPlaylist(id) {
    let playlist = state.playlistDetails.get(id);
    if (!playlist) {
      const body = await api(`/radio/me/playlists/${encodeURIComponent(id)}`);
      playlist = body.playlist;
      state.playlistDetails.set(id, playlist);
    }
    const rows = playlist.items?.length ? playlist.items.map(item => listRow(item, `<button type="button" data-play-song="${escapeHtml(item.song_key)}" aria-label="Play">${icons.play}</button><button type="button" data-remove-playlist-item="${escapeHtml(item.id)}" data-playlist-id="${escapeHtml(id)}" aria-label="Remove">${icons.trash}</button>`)).join('') : '<div class="profile-empty">This playlist is empty.</div>';
    overlayShell(playlist.name || 'Playlist', `<div class="profile-form-actions" style="margin:0 0 15px"><button type="button" class="profile-button ghost" data-rename-playlist="${escapeHtml(id)}">Rename</button><button type="button" class="profile-button danger" data-delete-playlist="${escapeHtml(id)}">Delete Playlist</button></div><div class="profile-list">${rows}</div>`);
  }

  function openCreatePlaylist() {
    overlayShell('New Playlist', `<form class="profile-form" data-form="create-playlist"><label>Name<input name="name" maxlength="160" required placeholder="My playlist"></label><label>Description<textarea name="description" maxlength="1000" placeholder="Optional"></textarea></label><label>Visibility<select name="visibility"><option value="private">Private</option><option value="unlisted">Unlisted</option></select></label><div class="profile-form-actions"><button type="submit" class="profile-button">Create Playlist</button></div><p class="profile-message" data-message></p></form>`);
  }

  function openRenamePlaylist(id) {
    const playlist = state.playlistDetails.get(id) || state.playlists.find(item => item.id === id);
    overlayShell('Rename Playlist', `<form class="profile-form" data-form="rename-playlist" data-playlist-id="${escapeHtml(id)}"><label>Name<input name="name" maxlength="160" required value="${escapeHtml(playlist?.name || '')}"></label><label>Description<textarea name="description" maxlength="1000">${escapeHtml(playlist?.description || '')}</textarea></label><div class="profile-form-actions"><button type="submit" class="profile-button">Save Changes</button></div><p class="profile-message" data-message></p></form>`);
  }

  function openAccountSettings() {
    const profile = settings();
    overlayShell('Account Information', `<form class="profile-form" data-form="account"><div class="profile-form-grid"><label>Display Name<input name="display_name" maxlength="120" required value="${escapeHtml(state.account?.display_name || '')}"></label><label>Profile Handle<input name="handle" maxlength="30" pattern="[A-Za-z0-9._-]+" value="${escapeHtml(profileHandle())}"></label><label class="full">Profile Bio<textarea name="bio" maxlength="240" placeholder="Tell listeners about yourself">${escapeHtml(profile.bio || '')}</textarea></label><label class="full">Profile Image URL<input name="avatar_url" type="url" value="${escapeHtml(profile.avatar_url || '')}" placeholder="https://..."></label><label class="full">Profile Banner URL<input name="banner_url" type="url" value="${escapeHtml(profile.banner_url || '')}" placeholder="https://..."></label><label class="full">Sign-in Email<input value="${escapeHtml(state.account?.email || '')}" disabled></label></div><div class="profile-form-actions"><button type="submit" class="profile-button">Save Profile</button></div><p class="profile-message" data-message></p></form>`);
  }

  function openSecuritySettings() {
    overlayShell('Security', `<form class="profile-form" data-form="password"><label>Current Password<input name="current_password" type="password" autocomplete="current-password" required></label><label>New Password<input name="new_password" type="password" minlength="12" autocomplete="new-password" required></label><label>Confirm New Password<input name="confirm_password" type="password" minlength="12" autocomplete="new-password" required></label><p style="margin:0;color:var(--p-muted);font-size:11px">Use at least 12 characters with uppercase, lowercase, a number, and a symbol.</p><div class="profile-form-actions"><button type="submit" class="profile-button">Change Password</button></div><p class="profile-message" data-message></p></form>`);
  }

  function openPlaybackSettings() {
    const profile = settings();
    const sleepEnd = number(localStorage.getItem(SLEEP_END_KEY));
    const remaining = sleepEnd > Date.now() ? Math.ceil((sleepEnd - Date.now()) / 60000) : 0;
    overlayShell('Playback', `<form class="profile-form" data-form="playback"><label>Sleep Timer<select name="sleep_timer"><option value="0">Off</option>${[15,30,45,60,90].map(value => `<option value="${value}" ${remaining && Math.abs(remaining-value) < 3 ? 'selected' : ''}>${value} minutes</option>`).join('')}</select></label><label>Visual Experience<select name="vec_mode"><option value="full" ${clean(profile.vec_mode || localStorage.getItem(VEC_MODE_KEY)) !== 'artwork' ? 'selected' : ''}>Full Visuals</option><option value="artwork" ${clean(profile.vec_mode || localStorage.getItem(VEC_MODE_KEY)) === 'artwork' ? 'selected' : ''}>Artwork Only</option></select></label><div class="profile-toggle-row"><span class="profile-toggle-copy"><strong>Autoplay</strong><span>Continue to the next song automatically</span></span><label class="profile-switch"><input type="checkbox" name="autoplay" ${state.preferences?.autoplay_enabled !== false ? 'checked' : ''}><i></i></label></div><div class="profile-toggle-row"><span class="profile-toggle-copy"><strong>Explicit Content</strong><span>Allow songs marked explicit</span></span><label class="profile-switch"><input type="checkbox" name="explicit" ${state.preferences?.explicit_content_enabled !== false ? 'checked' : ''}><i></i></label></div><div class="profile-form-actions"><button type="submit" class="profile-button">Save Playback Settings</button></div><p class="profile-message" data-message></p></form>`);
  }

  function openNotificationSettings() {
    overlayShell('Notification Preferences', `<form class="profile-form" data-form="notifications"><div class="profile-toggle-row"><span class="profile-toggle-copy"><strong>In-App Notifications</strong><span>Updates inside Stashbox Radio</span></span><label class="profile-switch"><input type="checkbox" name="in_app" ${state.preferences?.in_app_enabled !== false ? 'checked' : ''}><i></i></label></div><div class="profile-toggle-row"><span class="profile-toggle-copy"><strong>Email Notifications</strong><span>Save your preference for future email delivery</span></span><label class="profile-switch"><input type="checkbox" name="email" ${state.preferences?.email_enabled ? 'checked' : ''}><i></i></label></div><div class="profile-toggle-row"><span class="profile-toggle-copy"><strong>Browser Push</strong><span>Allow browser alerts when supported</span></span><label class="profile-switch"><input type="checkbox" name="push" ${state.preferences?.browser_push_enabled ? 'checked' : ''}><i></i></label></div><div class="profile-form-actions"><button type="submit" class="profile-button">Save Notification Settings</button></div><p class="profile-message" data-message></p></form>`);
  }

  function messageFor(form, text, error = false) {
    const target = form.querySelector('[data-message]');
    if (!target) return;
    target.textContent = text;
    target.classList.toggle('error', error);
  }

  async function changePassword(currentPassword, newPassword) {
    const config = await loadConfig();
    const tokens = await validTokens();
    const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ChangePassword'
      },
      body: JSON.stringify({ AccessToken: tokens.accessToken, PreviousPassword: currentPassword, ProposedPassword: newPassword })
    });
    return parseResponse(response);
  }

  async function handleForm(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('button,input,textarea,select').forEach(element => { element.disabled = true; });
    messageFor(form, 'Saving…');
    try {
      if (form.dataset.form === 'account') {
        const displayName = clean(values.display_name);
        await api('/radio/me', { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) });
        await savePreferences(preferencePayload({ settingsPatch: {
          handle: clean(values.handle).replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30),
          bio: clean(values.bio).slice(0, 240),
          avatar_url: clean(values.avatar_url),
          banner_url: clean(values.banner_url)
        } }));
        state.account.display_name = displayName;
        messageFor(form, 'Profile saved.');
        window.setTimeout(() => { closeOverlay(); state.view === 'settings' ? renderSettings() : renderProfile(); }, 500);
      } else if (form.dataset.form === 'password') {
        if (values.new_password !== values.confirm_password) throw new Error('The new passwords do not match.');
        await changePassword(String(values.current_password || ''), String(values.new_password || ''));
        form.reset();
        messageFor(form, 'Password changed successfully.');
      } else if (form.dataset.form === 'playback') {
        const minutes = number(values.sleep_timer);
        const vecMode = values.vec_mode === 'artwork' ? 'artwork' : 'full';
        localStorage.setItem(VEC_MODE_KEY, vecMode);
        if (minutes) localStorage.setItem(SLEEP_END_KEY, String(Date.now() + minutes * 60000));
        else localStorage.removeItem(SLEEP_END_KEY);
        await savePreferences(preferencePayload({ settingsPatch: { vec_mode: vecMode, sleep_timer_minutes: minutes }, fields: { autoplay_enabled: form.elements.autoplay.checked, explicit_content_enabled: form.elements.explicit.checked } }));
        messageFor(form, 'Playback settings saved.');
        window.setTimeout(() => { closeOverlay(); renderSettings(); }, 500);
      } else if (form.dataset.form === 'notifications') {
        let pushEnabled = form.elements.push.checked;
        if (pushEnabled && 'Notification' in window && Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          pushEnabled = permission === 'granted';
          form.elements.push.checked = pushEnabled;
        }
        await savePreferences(preferencePayload({ fields: { in_app_enabled: form.elements.in_app.checked, email_enabled: form.elements.email.checked, browser_push_enabled: pushEnabled } }));
        messageFor(form, 'Notification preferences saved.');
      } else if (form.dataset.form === 'create-playlist') {
        const body = await api('/radio/me/playlists', { method: 'POST', body: JSON.stringify({ name: values.name, description: values.description, visibility: values.visibility }) });
        state.playlists.unshift({ ...body.playlist, item_count: 0 });
        state.summary.playlists = state.playlists.length;
        messageFor(form, 'Playlist created.');
        window.setTimeout(openPlaylists, 450);
      } else if (form.dataset.form === 'rename-playlist') {
        const id = form.dataset.playlistId;
        const body = await api(`/radio/me/playlists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name: values.name, description: values.description }) });
        state.playlists = state.playlists.map(item => item.id === id ? { ...item, ...body.playlist } : item);
        const detail = state.playlistDetails.get(id);
        if (detail) state.playlistDetails.set(id, { ...detail, ...body.playlist });
        messageFor(form, 'Playlist updated.');
        window.setTimeout(() => openPlaylist(id), 450);
      }
    } catch (error) {
      messageFor(form, error.message || 'The request failed.', true);
    } finally {
      form.querySelectorAll('button,input,textarea,select').forEach(element => { element.disabled = false; });
    }
  }

  async function loadPlaylistDetails() {
    const results = await Promise.allSettled(state.playlists.slice(0, 12).map(async playlist => {
      const body = await api(`/radio/me/playlists/${encodeURIComponent(playlist.id)}`);
      return body.playlist;
    }));
    results.forEach(result => { if (result.status === 'fulfilled' && result.value?.id) state.playlistDetails.set(result.value.id, result.value); });
  }

  async function loadAll() {
    if (!state.tokens?.accessToken) {
      location.replace('/radio/dev/v2/?auth=login&return=profile');
      return;
    }
    try {
      const [meResult, preferencesResult, favoritesResult, playlistsResult, historyResult, followsResult, songsResult] = await Promise.allSettled([
        api('/radio/me'),
        api('/radio/me/preferences'),
        api('/radio/me/favorites'),
        api('/radio/me/playlists'),
        api('/radio/me/history?limit=200'),
        api('/radio/me/follows'),
        fetch(`${API_ROOT}/radio/songs`, { cache: 'no-store' }).then(parseResponse)
      ]);
      if (meResult.status !== 'fulfilled') throw meResult.reason;
      state.account = meResult.value.user;
      state.summary = meResult.value.summary || {};
      state.preferences = preferencesResult.status === 'fulfilled' ? preferencesResult.value.preferences : { settings: {} };
      state.favorites = favoritesResult.status === 'fulfilled' ? (favoritesResult.value.favorites || []) : [];
      state.playlists = playlistsResult.status === 'fulfilled' ? (playlistsResult.value.playlists || []) : [];
      state.history = historyResult.status === 'fulfilled' ? (historyResult.value.history || []) : [];
      state.follows = followsResult.status === 'fulfilled' ? (followsResult.value.follows || []) : [];
      state.songs = songsResult.status === 'fulfilled' ? (songsResult.value.songs || songsResult.value.items || []) : [];
      state.songMap = new Map(state.songs.map(song => [String(song.song_key || ''), song]));
      await loadPlaylistDetails();
      state.view === 'settings' ? renderSettings() : renderProfile();
    } catch (error) {
      if (error.status === 401) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
        location.replace('/radio/dev/v2/?auth=login&return=profile');
        return;
      }
      app.innerHTML = `<section class="profile-error"><strong>STASH<span>BOX</span></strong><h1>Profile could not load</h1><p>${escapeHtml(error.message || 'Unknown error')}</p><a href="/radio/dev/v2/">Return to Radio</a></section>`;
    }
  }

  document.addEventListener('click', async event => {
    const target = event.target;
    if (target.closest('[data-open-settings]')) return renderSettings();
    if (target.closest('[data-back-profile]')) return renderProfile();
    if (target.closest('[data-edit-profile]')) return openAccountSettings();
    if (target.closest('[data-close-overlay]')) return closeOverlay();
    if (target.closest('[data-open-notifications]')) {
      try { sessionStorage.setItem('stashbox_v2_open_notifications', '1'); } catch (_) {}
      location.href = '/radio/dev/v2/?open_notifications=1';
      return;
    }
    const settingsAction = target.closest('[data-settings-action]')?.dataset.settingsAction;
    if (settingsAction === 'account') return openAccountSettings();
    if (settingsAction === 'security') return openSecuritySettings();
    if (settingsAction === 'playback') return openPlaybackSettings();
    if (settingsAction === 'notifications') return openNotificationSettings();
    const library = target.closest('[data-open-library]')?.dataset.openLibrary;
    if (library === 'favorites') return openFavorites();
    if (library === 'history') return openHistory();
    if (library === 'following') return openFollowing();
    if (library === 'playlists') return openPlaylists();
    const songKey = target.closest('[data-play-song]')?.dataset.playSong;
    if (songKey) return playSong(songKey);
    const playlistId = target.closest('[data-open-playlist]')?.dataset.openPlaylist;
    if (playlistId) return openPlaylist(playlistId);
    if (target.closest('[data-create-playlist]')) return openCreatePlaylist();
    const renameId = target.closest('[data-rename-playlist]')?.dataset.renamePlaylist;
    if (renameId) return openRenamePlaylist(renameId);
    const favoriteKey = target.closest('[data-remove-favorite]')?.dataset.removeFavorite;
    if (favoriteKey) {
      try {
        await api(`/radio/me/favorites/${encodeURIComponent(favoriteKey)}`, { method: 'DELETE' });
        state.favorites = state.favorites.filter(item => item.song_key !== favoriteKey);
        state.summary.favorites = state.favorites.length;
        openFavorites();
      } catch (_) {}
      return;
    }
    const unfollowKey = target.closest('[data-unfollow]')?.dataset.unfollow;
    if (unfollowKey) {
      try {
        await api(`/radio/me/follows/${encodeURIComponent(unfollowKey)}`, { method: 'DELETE' });
        state.follows = state.follows.filter(item => item.artist_key !== unfollowKey);
        openFollowing();
      } catch (_) {}
      return;
    }
    const artistKey = target.closest('[data-open-artist]')?.dataset.openArtist;
    if (artistKey) return location.href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(artistKey)}`;
    const removeItem = target.closest('[data-remove-playlist-item]');
    if (removeItem) {
      const id = removeItem.dataset.playlistId;
      try {
        await api(`/radio/me/playlists/${encodeURIComponent(id)}/items/${encodeURIComponent(removeItem.dataset.removePlaylistItem)}`, { method: 'DELETE' });
        const detail = state.playlistDetails.get(id);
        if (detail) {
          detail.items = detail.items.filter(item => item.id !== removeItem.dataset.removePlaylistItem);
          state.playlistDetails.set(id, detail);
        }
        state.playlists = state.playlists.map(item => item.id === id ? { ...item, item_count: Math.max(0, number(item.item_count) - 1) } : item);
        openPlaylist(id);
      } catch (_) {}
      return;
    }
    const deleteId = target.closest('[data-delete-playlist]')?.dataset.deletePlaylist;
    if (deleteId && confirm('Delete this playlist?')) {
      try {
        await api(`/radio/me/playlists/${encodeURIComponent(deleteId)}`, { method: 'DELETE' });
        state.playlists = state.playlists.filter(item => item.id !== deleteId);
        state.playlistDetails.delete(deleteId);
        openPlaylists();
      } catch (_) {}
      return;
    }
    if (target.closest('[data-logout]')) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
      state.tokens = null;
      location.replace('/radio/dev/v2/');
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    handleForm(form);
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.overlay) closeOverlay();
  });

  loadAll();
})();
