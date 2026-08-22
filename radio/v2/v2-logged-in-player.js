(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const SHOP_URL = 'https://stashbox.ai/products.json?limit=250';
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const app = document.getElementById('v2App');
  if (!app) return;

  const icons = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3c5 0 5 10 10 10h3M17 4l3 3-3 3M4 17h3c2 0 3-1.5 4-3M15 7c1-1 2-1 5-1M17 14l3 3-3 3"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    queue: '<svg viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M3 6h2M3 12h2M3 18h2"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    credits: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 14a7 7 0 0 1 5 7"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>'
  };

  const state = {
    player: null,
    songs: [],
    songsByKey: new Map(),
    products: [],
    productsLoaded: false,
    accountLoaded: false,
    accountName: 'Profile',
    avatarUrl: '',
    playlists: [],
    favorites: new Set(),
    follows: new Set(),
    artistCache: new Map(),
    currentKey: '',
    currentSong: null,
    activeSheet: null,
    merchTimer: 0,
    merchCloseTimer: 0,
    merchCountdownTimer: 0,
    merchShownFor: '',
    installed: false,
    bodyObserver: null,
    titleObserver: null,
    playerObserver: null,
    sheetStartY: null
  };

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const slugify = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artist';

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    return Boolean(readTokens().accessToken);
  }

  function authHeaders(json = false) {
    const tokens = readTokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
    };
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  async function api(path, options = {}) {
    const url = String(path).startsWith('http') ? path : `${API_ROOT}${path}`;
    return fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      ...options,
      headers: {
        ...authHeaders(Boolean(options.body)),
        ...(options.headers || {})
      }
    }).then(parseResponse);
  }

  function rows(data) {
    if (typeof data?.body === 'string') {
      try { data = JSON.parse(data.body); } catch (_) {}
    }
    if (Array.isArray(data)) return data;
    return data?.songs || data?.items || data?.data || [];
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK,
      likes: Math.max(0, Number(row.total_likes || row.likes || 0) || 0),
      duration: Math.max(0, Number(row.duration_seconds || row.duration || 0) || 0),
      raw: row
    };
  }

  function image(url, alt = '') {
    return `<img src="${esc(url || FALLBACK)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  async function loadCatalog() {
    if (state.songs.length) return state.songs;
    try {
      const body = await fetch(SONGS_URL, { cache: 'no-store' }).then(parseResponse);
      state.songs = rows(body).map(normalizeSong).filter(song => song.key);
      state.songsByKey = new Map(state.songs.map(song => [song.key, song]));
    } catch (error) {
      console.warn('[V2 logged-in player] catalog unavailable', error);
    }
    return state.songs;
  }

  async function loadAccountData(force = false) {
    if (!loggedIn()) return;
    if (state.accountLoaded && !force) return;
    const [account, preferences, playlists, favorites, follows] = await Promise.allSettled([
      api('/radio/me'),
      api('/radio/me/preferences'),
      api('/radio/me/playlists'),
      api('/radio/me/favorites'),
      api('/radio/me/follows')
    ]);
    if (account.status === 'fulfilled') {
      const user = account.value.user || {};
      state.accountName = clean(user.display_name).split(/\s+/)[0] || 'Profile';
    }
    if (preferences.status === 'fulfilled') {
      const settings = preferences.value.preferences?.settings || {};
      state.avatarUrl = clean(settings.avatar_url || settings.profile_image_url);
    }
    if (playlists.status === 'fulfilled') state.playlists = playlists.value.playlists || [];
    if (favorites.status === 'fulfilled') state.favorites = new Set((favorites.value.favorites || []).map(item => clean(item.song_key)));
    if (follows.status === 'fulfilled') state.follows = new Set((follows.value.follows || []).map(item => clean(item.artist_key)));
    state.accountLoaded = true;
    updateProfileButton();
  }

  async function loadProducts() {
    if (state.productsLoaded) return state.products;
    state.productsLoaded = true;
    try {
      const body = await fetch(SHOP_URL, { cache: 'no-store' }).then(parseResponse);
      state.products = Array.isArray(body.products) ? body.products : [];
    } catch (error) {
      console.warn('[V2 logged-in player] products unavailable', error);
      state.products = [];
    }
    return state.products;
  }

  function toast(message) {
    let node = document.querySelector('.v2-li-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'v2-toast v2-li-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    window.clearTimeout(node.__timer);
    node.__timer = window.setTimeout(() => node.classList.remove('is-visible'), 2300);
  }

  function playerOpen() {
    return Boolean(state.player && !state.player.hidden);
  }

  function resolveCurrentSong() {
    const title = clean(state.player?.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(state.player?.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    if (state.currentKey) {
      const existing = state.songsByKey.get(state.currentKey);
      if (existing && normalize(existing.title) === normalize(title)) return existing;
    }
    const match = state.songs.find(song => normalize(song.title) === normalize(title) && (!artist || normalize(song.artist) === normalize(artist)))
      || state.songs.find(song => normalize(song.title) === normalize(title));
    if (match) state.currentKey = match.key;
    return match || null;
  }

  function install() {
    const player = app.querySelector('[data-player]');
    if (!player) return false;
    state.player = player;
    if (!state.installed) {
      state.installed = true;
      installObservers();
      bindGlobalEvents();
    }
    syncLoginState();
    return true;
  }

  function syncLoginState() {
    if (!state.player) return;
    const active = loggedIn();
    state.player.classList.toggle('is-logged-in-player', active);
    document.body.classList.toggle('v2-logged-in-player-open', active && playerOpen());
    if (!active) return;
    injectPlayerUi();
    loadAccountData().catch(() => {});
    loadCatalog().then(syncCurrentSong);
  }

  function injectPlayerUi() {
    const header = state.player.querySelector('.v2-player-header');
    if (header && !header.querySelector('.v2-li-player-head-actions')) {
      const actions = document.createElement('div');
      actions.className = 'v2-li-player-head-actions';
      actions.innerHTML = `
        <button type="button" data-li-search aria-label="Search">${icons.search}</button>
        <button type="button" data-li-notifications aria-label="Notifications">${icons.bell}</button>
        <a class="v2-li-player-profile" data-li-profile href="/radio/dev/v2/profile/" aria-label="Open your profile">P</a>`;
      header.appendChild(actions);
    }

    const content = state.player.querySelector('.v2-player-content');
    const artistRow = content?.querySelector('.v2-artist-row');
    if (artistRow && !artistRow.querySelector('.v2-follow-button')) {
      const follow = document.createElement('button');
      follow.type = 'button';
      follow.className = 'v2-follow-button';
      follow.dataset.liFollow = 'true';
      follow.textContent = 'Follow';
      artistRow.appendChild(follow);
    }
    if (artistRow && !artistRow.querySelector('.v2-li-song-more')) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'v2-li-song-more';
      more.dataset.liMore = 'true';
      more.setAttribute('aria-label', 'More song actions');
      more.textContent = '•••';
      artistRow.appendChild(more);
    }
    if (artistRow && !content.querySelector('.v2-li-meta-chips')) {
      const chips = document.createElement('div');
      chips.className = 'v2-li-meta-chips';
      chips.dataset.liMeta = 'true';
      artistRow.insertAdjacentElement('afterend', chips);
    }

    const controls = content?.querySelector('.v2-player-controls');
    if (controls && !controls.querySelector('[data-li-shuffle]')) {
      const shuffle = document.createElement('button');
      shuffle.type = 'button';
      shuffle.className = 'v2-li-mode-button';
      shuffle.dataset.liShuffle = 'true';
      shuffle.setAttribute('aria-label', 'Shuffle');
      shuffle.innerHTML = icons.shuffle;
      controls.prepend(shuffle);
    }
    if (controls && !controls.querySelector('[data-li-repeat]')) {
      const repeat = document.createElement('button');
      repeat.type = 'button';
      repeat.className = 'v2-li-mode-button';
      repeat.dataset.liRepeat = 'true';
      repeat.setAttribute('aria-label', 'Repeat current song');
      repeat.innerHTML = icons.repeat;
      controls.appendChild(repeat);
    }
    if (controls && !content.querySelector('[data-li-up-next]')) {
      const upNext = document.createElement('button');
      upNext.type = 'button';
      upNext.className = 'v2-li-up-next-button';
      upNext.dataset.liUpNext = 'true';
      upNext.innerHTML = `${icons.queue}<span>Up Next</span>`;
      controls.insertAdjacentElement('afterend', upNext);
    }

    if (!state.player.querySelector('.v2-li-player-rail')) {
      const rail = document.createElement('aside');
      rail.className = 'v2-li-player-rail';
      rail.innerHTML = `
        <button type="button" class="v2-li-rail-item" data-li-add-playlist><span class="v2-li-rail-circle">${icons.plus}</span><small>Add to<br>Playlist</small></button>
        <button type="button" class="v2-li-rail-item" data-li-artist><span class="v2-li-rail-circle" data-li-artist-image>${icons.user}</span><strong data-li-artist-name>Artist</strong></button>
        <button type="button" class="v2-li-rail-item" data-li-favorite><span class="v2-li-rail-circle">${icons.heart}</span><strong data-li-like-count>0</strong><small>Favorites</small></button>
        <button type="button" class="v2-li-rail-item" data-li-share><span class="v2-li-rail-circle">${icons.share}</span><small>Share</small></button>`;
      state.player.appendChild(rail);
    }

    if (!state.player.querySelector('.v2-li-merch-tray')) {
      const tray = document.createElement('section');
      tray.className = 'v2-li-merch-tray';
      tray.dataset.liMerchTray = 'true';
      tray.setAttribute('aria-live', 'polite');
      state.player.appendChild(tray);
    }

    updateProfileButton();
  }

  function updateProfileButton() {
    const profile = state.player?.querySelector('[data-li-profile]');
    if (!profile) return;
    profile.innerHTML = state.avatarUrl ? image(state.avatarUrl, state.accountName) : esc((state.accountName || 'P').slice(0, 1).toUpperCase());
  }

  function installObservers() {
    const title = state.player.querySelector('[data-ptitle]');
    if (title) {
      state.titleObserver = new MutationObserver(() => {
        state.currentKey = '';
        window.setTimeout(syncCurrentSong, 10);
      });
      state.titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    }
    state.playerObserver = new MutationObserver(() => {
      document.body.classList.toggle('v2-logged-in-player-open', loggedIn() && playerOpen());
      if (playerOpen() && loggedIn()) {
        injectPlayerUi();
        syncCurrentSong();
      } else {
        clearMerchTimers();
        hideMerch();
      }
    });
    state.playerObserver.observe(state.player, { attributes: true, attributeFilter: ['hidden'] });
    state.player.querySelector('[data-audio]')?.addEventListener('play', scheduleMerch);
  }

  async function syncCurrentSong() {
    if (!loggedIn() || !playerOpen()) return;
    await loadCatalog();
    const song = resolveCurrentSong();
    if (!song) return;
    const changed = state.currentSong?.key !== song.key;
    state.currentSong = song;
    state.currentKey = song.key;
    updateSongUi(song);
    if (changed) {
      state.merchShownFor = '';
      clearMerchTimers();
      hideMerch();
      scheduleMerch();
    }
  }

  function metadataChips(song) {
    const raw = song.raw || {};
    const releaseDate = clean(raw.release_date || raw.created_at);
    const year = releaseDate && !Number.isNaN(new Date(releaseDate).getTime()) ? new Date(releaseDate).getFullYear() : '';
    const mood = Array.isArray(raw.mood_tags) ? raw.mood_tags[0] : clean(raw.mood || raw.mood_tags || raw.secondary_genre);
    const lossless = Boolean(raw.lossless || raw.is_lossless || /\.(wav|flac)(?:\?|$)/i.test(clean(raw.audio_url)));
    return [year, mood, lossless ? 'Lossless' : ''].filter(Boolean).slice(0, 3);
  }

  async function artistInfo(song) {
    const key = slugify(song.artist);
    if (state.artistCache.has(key)) return state.artistCache.get(key);
    try {
      const body = await api(`/radio/artists/${encodeURIComponent(key)}`);
      const artist = body.artist || {};
      state.artistCache.set(key, artist);
      return artist;
    } catch (_) {
      const fallback = { artist_key: key, slug: key, name: song.artist, profile_image_url: '' };
      state.artistCache.set(key, fallback);
      return fallback;
    }
  }

  async function updateSongUi(song) {
    const rail = state.player.querySelector('.v2-li-player-rail');
    const count = state.player.querySelector('[data-likes]')?.textContent || String(song.likes);
    if (rail?.querySelector('[data-li-like-count]')) rail.querySelector('[data-li-like-count]').textContent = count;
    rail?.querySelector('[data-li-favorite]')?.classList.toggle('is-favorite', state.favorites.has(song.key) || state.player.querySelector('[data-like]')?.classList.contains('is-liked'));
    if (rail?.querySelector('[data-li-artist-name]')) rail.querySelector('[data-li-artist-name]').textContent = song.artist;
    const chips = state.player.querySelector('[data-li-meta]');
    if (chips) chips.innerHTML = metadataChips(song).map(value => `<span>${esc(value)}</span>`).join('');

    const artist = await artistInfo(song);
    const artistImage = rail?.querySelector('[data-li-artist-image]');
    if (artistImage) artistImage.innerHTML = artist.profile_image_url ? image(artist.profile_image_url, artist.name || song.artist) : icons.user;
    rail?.querySelector('[data-li-artist]')?.setAttribute('data-artist-key', artist.slug || artist.artist_key || slugify(song.artist));
    const follow = state.player.querySelector('[data-li-follow]');
    const artistKey = clean(artist.artist_key || slugify(song.artist));
    if (follow) {
      follow.dataset.artistKey = artistKey;
      const following = state.follows.has(artistKey) || Boolean(artist.is_following);
      follow.classList.toggle('is-following', following);
      follow.textContent = following ? 'Following' : 'Follow';
      follow.setAttribute('aria-pressed', String(following));
    }
  }

  function queueSongs() {
    const current = state.currentSong;
    if (!current || !state.songs.length) return [];
    const index = Math.max(0, state.songs.findIndex(song => song.key === current.key));
    return Array.from({ length: Math.min(12, Math.max(0, state.songs.length - 1)) }, (_, offset) => state.songs[(index + offset + 1) % state.songs.length]);
  }

  function clickSong(key) {
    const card = [...app.querySelectorAll('[data-song]')].find(element => clean(element.dataset.song) === clean(key));
    if (card) card.click();
  }

  function openSheet(title, content) {
    closeSheet(true);
    const root = document.createElement('div');
    root.className = 'v2-li-sheet-root';
    root.innerHTML = `
      <button type="button" class="v2-li-sheet-backdrop" data-li-close-sheet aria-label="Close"></button>
      <section class="v2-li-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="v2-li-sheet-handle" data-li-sheet-handle></div>
        <header class="v2-li-sheet-head"><h2>${esc(title)}</h2><button type="button" class="v2-li-sheet-close" data-li-close-sheet aria-label="Close">×</button></header>
        <div class="v2-li-sheet-body">${content}</div>
      </section>`;
    document.body.appendChild(root);
    state.activeSheet = root;
    requestAnimationFrame(() => root.classList.add('is-open'));
  }

  function closeSheet(immediate = false) {
    if (!state.activeSheet) return;
    const root = state.activeSheet;
    state.activeSheet = null;
    root.classList.remove('is-open');
    window.setTimeout(() => root.remove(), immediate ? 0 : 310);
  }

  function openActions() {
    const song = state.currentSong;
    if (!song) return;
    openSheet('Song Actions', `
      <div class="v2-li-action-list">
        <button type="button" class="v2-li-action" data-li-action="artist"><span class="v2-li-action-icon">${icons.user}</span><span class="v2-li-action-copy"><strong>View Artist</strong><small>See more from ${esc(song.artist)}</small></span><span class="v2-li-action-arrow">›</span></button>
        <button type="button" class="v2-li-action" data-li-action="song-page"><span class="v2-li-action-icon">${icons.link}</span><span class="v2-li-action-copy"><strong>Open Song Page</strong><small>Visit the official song page</small></span><span class="v2-li-action-arrow">›</span></button>
        <button type="button" class="v2-li-action" data-li-action="credits"><span class="v2-li-action-icon">${icons.credits}</span><span class="v2-li-action-copy"><strong>View Credits</strong><small>Songwriting, production, and more</small></span><span class="v2-li-action-arrow">›</span></button>
        <button type="button" class="v2-li-action" data-li-action="report"><span class="v2-li-action-icon">${icons.warning}</span><span class="v2-li-action-copy"><strong>Report a Problem</strong><small>Let us know about an issue</small></span><span class="v2-li-action-arrow">›</span></button>
      </div>`);
  }

  function creditRows(song) {
    const raw = song.raw || {};
    return [
      ['Artist', song.artist],
      ['Songwriters', raw.songwriters || raw.songwriter || raw.writers || raw.writer],
      ['Producers', raw.producers || raw.producer],
      ['Featured Artists', raw.featured_artists || raw.featured_artist],
      ['Album / Release', raw.album_name || raw.release_title || raw.release_format],
      ['Credits', raw.credits || raw.public_track_note]
    ].map(([label, value]) => {
      const text = Array.isArray(value) ? value.join(', ') : clean(value);
      return text ? `<article><small>${esc(label)}</small><strong>${esc(text)}</strong></article>` : '';
    }).join('');
  }

  function openCredits() {
    const song = state.currentSong;
    if (!song) return;
    const content = creditRows(song);
    openSheet('Song Credits', `<div class="v2-li-credit-grid">${content || '<article><strong>Credits have not been added for this song yet.</strong></article>'}</div>`);
  }

  function openReport() {
    openSheet('Report a Problem', `
      <form class="v2-li-sheet-form" data-li-report-form>
        <label>Issue Type<select name="issue"><option value="audio">Audio issue</option><option value="video">Video or visual issue</option><option value="metadata">Incorrect song information</option><option value="merch">Merchandise issue</option><option value="other">Other</option></select></label>
        <label>Details<textarea name="details" maxlength="1000" placeholder="Tell us what happened"></textarea></label>
        <button class="v2-li-sheet-submit" type="submit">Send Report</button>
        <p class="v2-li-sheet-message" data-li-message></p>
      </form>`);
  }

  function openQueue() {
    const current = state.currentSong;
    if (!current) return;
    const queue = queueSongs();
    openSheet('Up Next', `
      <article class="v2-li-now-playing"><span>${image(current.art, current.title)}</span><div><b>Now Playing</b><strong>${esc(current.title)}</strong><small>${esc(current.artist)}</small></div><span class="v2-li-equalizer"><i></i><i></i><i></i><i></i></span></article>
      <div class="v2-li-queue-list">${queue.map((song, index) => `<button type="button" class="v2-li-queue-row" data-li-queue-song="${esc(song.key)}"><span class="v2-li-queue-index">${index + 1}</span><span class="v2-li-queue-art">${image(song.art, '')}</span><span class="v2-li-queue-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></span><span class="v2-li-queue-duration">${song.duration ? formatDuration(song.duration) : ''}</span></button>`).join('')}</div>
      <p class="v2-li-sheet-message">Tap any song to jump straight to it. Swipe down to close.</p>`);
  }

  async function openPlaylists() {
    await loadAccountData(true);
    const song = state.currentSong;
    if (!song) return;
    const playlistRows = state.playlists.map(playlist => `
      <button type="button" class="v2-li-playlist-option" data-li-playlist-id="${esc(playlist.id)}">
        <span class="v2-li-playlist-art">${icons.queue}</span>
        <span class="v2-li-playlist-copy"><strong>${esc(playlist.name)}</strong><small>${Number(playlist.item_count || 0)} songs · ${esc(playlist.visibility || 'private')}</small></span>
        <span class="v2-li-action-arrow">+</span>
      </button>`).join('');
    openSheet('Add to Playlist', `
      <div class="v2-li-playlist-list">${playlistRows || '<p class="v2-li-sheet-message" style="padding:16px">You have no playlists yet.</p>'}</div>
      <button type="button" class="v2-li-sheet-submit" style="width:100%;margin-top:12px" data-li-create-playlist>Create New Playlist</button>
      <p class="v2-li-sheet-message" data-li-message>Select a playlist to add “${esc(song.title)}”.</p>`);
  }

  function openCreatePlaylist() {
    openSheet('New Playlist', `
      <form class="v2-li-sheet-form" data-li-create-form>
        <label>Playlist Name<input name="name" maxlength="160" required placeholder="My Playlist"></label>
        <label>Description<textarea name="description" maxlength="1000" placeholder="Optional"></textarea></label>
        <label>Visibility<select name="visibility"><option value="private">Private</option><option value="unlisted">Unlisted</option></select></label>
        <button class="v2-li-sheet-submit" type="submit">Create and Add Song</button>
        <p class="v2-li-sheet-message" data-li-message></p>
      </form>`);
  }

  async function addToPlaylist(playlistId, messageNode) {
    const song = state.currentSong;
    if (!song) return;
    try {
      await api(`/radio/me/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: 'POST',
        body: JSON.stringify({ song_key: song.key, display_title: song.title, artist: song.artist, metadata: { artwork_url: song.art, genre: song.genre, source: 'v2_logged_in_player' } })
      });
      if (messageNode) {
        messageNode.textContent = `Added “${song.title}” to your playlist.`;
        messageNode.className = 'v2-li-sheet-message success';
      }
      toast('Added to playlist');
      window.setTimeout(closeSheet, 650);
    } catch (error) {
      if (messageNode) {
        messageNode.textContent = error.message;
        messageNode.className = 'v2-li-sheet-message error';
      }
    }
  }

  async function createPlaylist(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const message = form.querySelector('[data-li-message]');
    try {
      const body = await api('/radio/me/playlists', { method: 'POST', body: JSON.stringify({ name: values.name, description: values.description, visibility: values.visibility }) });
      state.playlists.unshift(body.playlist);
      await addToPlaylist(body.playlist.id, message);
    } catch (error) {
      message.textContent = error.message;
      message.className = 'v2-li-sheet-message error';
    }
  }

  async function saveFavorite() {
    const song = state.currentSong;
    if (!song || state.favorites.has(song.key)) return;
    const likeButton = state.player.querySelector('[data-like]');
    if (likeButton && !likeButton.classList.contains('is-liked')) likeButton.click();
    state.favorites.add(song.key);
    state.player.querySelector('[data-li-favorite]')?.classList.add('is-favorite');
    const railCount = state.player.querySelector('[data-li-like-count]');
    const playerCount = state.player.querySelector('[data-likes]');
    if (railCount && playerCount) railCount.textContent = playerCount.textContent;
    try {
      await api('/radio/me/favorites', {
        method: 'POST',
        body: JSON.stringify({ song_key: song.key, display_title: song.title, artist: song.artist, metadata: { artwork_url: song.art, genre: song.genre, source: 'v2_logged_in_player' } })
      });
      toast('Added to Favorites');
    } catch (error) {
      toast(error.message);
    }
  }

  async function toggleFollow(button) {
    const artistKey = clean(button.dataset.artistKey || slugify(state.currentSong?.artist));
    if (!artistKey) return;
    const following = state.follows.has(artistKey);
    button.disabled = true;
    try {
      await api(`/radio/me/follows/${encodeURIComponent(artistKey)}`, { method: following ? 'DELETE' : 'POST', body: following ? undefined : JSON.stringify({ notifications_enabled: true }) });
      if (following) state.follows.delete(artistKey);
      else state.follows.add(artistKey);
      button.classList.toggle('is-following', !following);
      button.textContent = following ? 'Follow' : 'Following';
      button.setAttribute('aria-pressed', String(!following));
      toast(following ? 'Artist unfollowed' : 'Artist followed');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function productHandles(song) {
    const raw = song.raw || {};
    return [raw.specific_product_urls, raw.product_urls, raw.shopify_product_urls, raw.shop_url]
      .flatMap(value => Array.isArray(value) ? value : clean(value) ? [value] : [])
      .map(value => {
        try {
          const url = new URL(value, location.origin);
          const parts = url.pathname.split('/').filter(Boolean);
          const productIndex = parts.indexOf('products');
          return productIndex >= 0 ? clean(parts[productIndex + 1]) : clean(parts.at(-1));
        } catch (_) {
          return clean(value).split('/').filter(Boolean).at(-1) || '';
        }
      }).filter(Boolean);
  }

  function productsForSong(song) {
    const handles = new Set(productHandles(song));
    if (!handles.size) return [];
    return state.products.filter(product => handles.has(clean(product.handle))).slice(0, 8);
  }

  function clearMerchTimers() {
    window.clearTimeout(state.merchTimer);
    window.clearTimeout(state.merchCloseTimer);
    window.clearInterval(state.merchCountdownTimer);
  }

  function scheduleMerch() {
    if (!loggedIn() || !playerOpen() || !state.currentSong || state.merchShownFor === state.currentSong.key) return;
    window.clearTimeout(state.merchTimer);
    state.merchTimer = window.setTimeout(showMerch, 15000);
  }

  async function showMerch() {
    const song = state.currentSong;
    if (!song || !playerOpen()) return;
    await loadProducts();
    const products = productsForSong(song);
    if (!products.length || state.currentSong?.key !== song.key) return;
    state.merchShownFor = song.key;
    const tray = state.player.querySelector('[data-li-merch-tray]');
    if (!tray) return;
    tray.innerHTML = `
      <header class="v2-li-merch-head"><strong>${icons.bag}<span>Merch for this song</span></strong><button type="button" data-li-dismiss-merch>Dismiss in <b data-li-merch-countdown>24</b>s</button></header>
      <div class="v2-li-merch-row">${products.map(product => {
        const variant = product.variants?.[0] || {};
        const art = product.images?.[0]?.src || '';
        return `<a class="v2-li-merch-card" href="https://stashbox.ai/products/${encodeURIComponent(product.handle || '')}" target="_blank" rel="noopener"><span>${art ? image(art, product.title || '') : ''}</span><strong>${esc(product.title || 'Stashbox Product')}</strong><small>${variant.price ? `$${Number(variant.price).toFixed(2)}` : 'Shop now'}</small></a>`;
      }).join('')}</div>`;
    tray.classList.add('is-open');
    let seconds = 24;
    state.merchCountdownTimer = window.setInterval(() => {
      seconds -= 1;
      const node = tray.querySelector('[data-li-merch-countdown]');
      if (node) node.textContent = String(Math.max(0, seconds));
    }, 1000);
    state.merchCloseTimer = window.setTimeout(hideMerch, 24000);
  }

  function hideMerch() {
    state.player?.querySelector('[data-li-merch-tray]')?.classList.remove('is-open');
    window.clearTimeout(state.merchCloseTimer);
    window.clearInterval(state.merchCountdownTimer);
  }

  function shuffleSong(button) {
    const choices = state.songs.filter(song => song.key !== state.currentSong?.key);
    if (!choices.length) return;
    button.classList.add('is-active');
    clickSong(choices[Math.floor(Math.random() * choices.length)].key);
    window.setTimeout(() => button.classList.remove('is-active'), 500);
  }

  function toggleRepeat(button) {
    const audio = state.player.querySelector('[data-audio]');
    if (!audio) return;
    audio.loop = !audio.loop;
    button.classList.toggle('is-active', audio.loop);
    button.setAttribute('aria-pressed', String(audio.loop));
    toast(audio.loop ? 'Repeat on' : 'Repeat off');
  }

  function viewArtist() {
    const key = state.player.querySelector('[data-li-artist]')?.dataset.artistKey || slugify(state.currentSong?.artist);
    location.href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(key)}`;
  }

  function openSongPage() {
    const url = clean(state.currentSong?.raw?.official_song_page_url || state.currentSong?.raw?.song_page_url);
    if (!url) return toast('No official song page is assigned yet');
    window.open(url, '_blank', 'noopener');
  }

  async function sendReport(form) {
    const song = state.currentSong;
    const values = Object.fromEntries(new FormData(form).entries());
    const message = form.querySelector('[data-li-message]');
    try {
      await fetch(TRACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report_problem', event_type: 'report_problem', song_key: song.key, display_title: song.title, artist: song.artist, source: 'radio_dev_v2', metadata: { issue_type: values.issue, details: clean(values.details).slice(0, 1000) } })
      }).then(response => response.ok ? response : Promise.reject(new Error(`HTTP ${response.status}`)));
      message.textContent = 'Thank you. The issue has been submitted for review.';
      message.className = 'v2-li-sheet-message success';
      form.querySelector('button').disabled = true;
    } catch (error) {
      message.textContent = `The report could not be sent: ${error.message}`;
      message.className = 'v2-li-sheet-message error';
    }
  }

  async function nativeShare() {
    state.player.querySelector('[data-share]')?.click();
  }

  function bindGlobalEvents() {
    document.addEventListener('click', event => {
      const songCard = event.target.closest('#v2App [data-song]');
      if (songCard) {
        state.currentKey = clean(songCard.dataset.song);
        window.setTimeout(syncCurrentSong, 25);
      }

      if (!loggedIn()) return;

      if (event.target.closest('.v2-player.is-logged-in-player .v2-player-mark')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.player.querySelector('[data-close]')?.click();
        return;
      }
      if (event.target.closest('[data-li-search]')) return state.player.querySelector('[data-close]')?.click(), window.setTimeout(() => app.querySelector('[data-search]')?.click(), 30);
      if (event.target.closest('[data-li-notifications]')) return document.querySelector('#v2App .v2-notifications-trigger')?.click();
      if (event.target.closest('[data-li-more]')) return openActions();
      if (event.target.closest('[data-li-up-next]')) return openQueue();
      if (event.target.closest('[data-li-add-playlist]')) return openPlaylists();
      if (event.target.closest('[data-li-artist]')) return viewArtist();
      if (event.target.closest('[data-li-favorite]')) return saveFavorite();
      if (event.target.closest('[data-li-share]')) return nativeShare();
      if (event.target.closest('[data-li-follow]')) return toggleFollow(event.target.closest('[data-li-follow]'));
      if (event.target.closest('[data-li-shuffle]')) return shuffleSong(event.target.closest('[data-li-shuffle]'));
      if (event.target.closest('[data-li-repeat]')) return toggleRepeat(event.target.closest('[data-li-repeat]'));
      if (event.target.closest('[data-li-dismiss-merch]')) return hideMerch();
      if (event.target.closest('[data-li-close-sheet]')) return closeSheet();

      const queueSong = event.target.closest('[data-li-queue-song]');
      if (queueSong) {
        closeSheet();
        return window.setTimeout(() => clickSong(queueSong.dataset.liQueueSong), 70);
      }

      const playlist = event.target.closest('[data-li-playlist-id]');
      if (playlist) return addToPlaylist(playlist.dataset.liPlaylistId, state.activeSheet?.querySelector('[data-li-message]'));
      if (event.target.closest('[data-li-create-playlist]')) return openCreatePlaylist();

      const action = event.target.closest('[data-li-action]')?.dataset.liAction;
      if (action === 'artist') return closeSheet(), window.setTimeout(viewArtist, 40);
      if (action === 'song-page') return openSongPage();
      if (action === 'credits') return openCredits();
      if (action === 'report') return openReport();
    }, true);

    document.addEventListener('submit', event => {
      if (event.target.matches('[data-li-create-form]')) {
        event.preventDefault();
        createPlaylist(event.target);
      }
      if (event.target.matches('[data-li-report-form]')) {
        event.preventDefault();
        sendReport(event.target);
      }
    });

    document.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-li-sheet-handle]')) state.sheetStartY = event.clientY;
    });
    document.addEventListener('pointerup', event => {
      if (state.sheetStartY == null) return;
      const delta = event.clientY - state.sheetStartY;
      state.sheetStartY = null;
      if (delta > 70) closeSheet();
    });

    window.addEventListener('storage', event => {
      if (event.key === TOKEN_KEY) {
        state.accountLoaded = false;
        syncLoginState();
      }
    });
  }

  state.bodyObserver = new MutationObserver(() => {
    if (!state.player || !document.body.contains(state.player)) {
      state.installed = false;
      state.player = null;
      install();
    } else {
      syncLoginState();
    }
  });
  state.bodyObserver.observe(app, { childList: true, subtree: true });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 300) window.clearInterval(timer);
  }, 50);
})();
