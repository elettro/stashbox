(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const PRODUCTS_URL = 'https://stashbox.ai/products.json?limit=250';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const GUEST_KEY = 'stashbox_radio_v2_guest_plays';
  const LIKE_KEY = 'stashbox_radio_v2_local_likes';
  const SESSION_KEY = 'stashbox-radio-rds-dev-session-id';
  const QUALIFIED_SECONDS = 10;
  const GUEST_DAILY_LIMIT = 4;

  const app = document.getElementById('v2App');
  if (!app) return;

  const state = {
    songs: [],
    products: [],
    visibleSongs: [],
    selected: null,
    queue: [],
    queueIndex: -1,
    query: '',
    genre: 'ALL',
    mood: 'ALL',
    sort: 'latest',
    searchOpen: false,
    filterOpen: false,
    playerOpen: false,
    playing: false,
    qualifiedTimer: null,
    pendingSong: null,
    touchStartY: null,
    loadError: '',
    sessionId: getSessionId()
  };

  const icons = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M18 6l-8 6 8 6Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14M6 6l8 6-8 6Z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>',
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'
  };

  function clean(value) {
    return String(value ?? '').trim().replace(/^"|"$/g, '');
  }

  function bool(value) {
    return value === true || value === 1 || ['true', '1', 'yes'].includes(clean(value).toLowerCase());
  }

  function number(value) {
    return Math.max(0, Number(value) || 0);
  }

  function fixUrl(value) {
    const url = clean(value);
    if (!url) return '';
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function splitTags(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    if (value && typeof value === 'object') return Object.values(value).flatMap(splitTags);
    return clean(value).split(/[|,;/]+/).map(clean).filter(Boolean);
  }

  function parseBody(data) {
    if (typeof data?.body === 'string') {
      try { return parseBody(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  function rowsFrom(data, keys) {
    const parsed = parseBody(data);
    if (Array.isArray(parsed)) return parsed;
    for (const key of keys) if (Array.isArray(parsed?.[key])) return parsed[key];
    return [];
  }

  function normalizeSong(row, index) {
    const title = clean(row.display_title || row.title || row.song_name || row.name) || `Song ${index + 1}`;
    const songKey = clean(row.song_key || row.songKey || row.song_id || row.songId || row.id) || slug(title);
    const artist = clean(row.artist || row.artist_name || row.artistName) || 'Stashbox';
    const genre = clean(row.genre || row.primary_genre || row.section || row.category) || 'Other';
    const moods = splitTags(row.mood_tags || row.moods || row.mood || row.secondary_mood);
    const artwork = fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url || row.artwork) || FALLBACK_ART;
    const audioUrl = fixUrl(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url);
    const videoUrl = fixUrl(row.video_link || row.video_url || row.videoUrl || row.official_video_url);
    const createdAt = clean(row.release_date || row.created_at || row.createdAt || row.updated_at || row.updatedAt);
    return {
      raw: row,
      id: songKey,
      songKey,
      title,
      artist,
      genre,
      moods,
      artwork,
      audioUrl,
      videoUrl,
      createdAt,
      plays: number(row.total_plays || row.plays || row.play_count || row.full_play_count),
      likes: number(row.total_likes || row.likes || row.like_count),
      shares: number(row.total_shares || row.shares || row.share_count),
      featured: bool(row.featured || row.is_featured),
      exclusive: bool(row.exclusive),
      explicit: bool(row.explicit),
      videoOnly: bool(row.video_only) || (!audioUrl && Boolean(videoUrl)),
      releaseFormat: clean(row.release_format),
      idx: index
    };
  }

  function normalizeProduct(product) {
    const variant = Array.isArray(product?.variants) ? product.variants[0] : null;
    const imageRaw = product?.images?.[0]?.src || product?.featured_image || product?.image?.src || '';
    const image = String(imageRaw || '').startsWith('//') ? `https:${imageRaw}` : String(imageRaw || '');
    const priceValue = Number(variant?.price);
    return {
      id: clean(product?.id || product?.handle || product?.title),
      title: clean(product?.title) || 'Stashbox Product',
      handle: clean(product?.handle),
      image,
      price: Number.isFinite(priceValue) ? `$${priceValue.toFixed(2)}` : '',
      url: `https://stashbox.ai/products/${encodeURIComponent(clean(product?.handle))}`
    };
  }

  function slug(value) {
    return clean(value).toLowerCase().replace(/['"]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getSessionId() {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const id = crypto.randomUUID?.() || `v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (_) {
      return `v2-${Date.now()}`;
    }
  }

  function isLoggedIn() {
    return Boolean(window.StashboxRadioAccount?.isLoggedIn?.());
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function guestState() {
    const fresh = { date: todayKey(), songs: [] };
    try {
      const stored = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
      if (!stored || stored.date !== fresh.date || !Array.isArray(stored.songs)) return fresh;
      return { date: stored.date, songs: [...new Set(stored.songs.map(String))] };
    } catch (_) {
      return fresh;
    }
  }

  function saveGuestState(value) {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function guestCanStart(song) {
    if (isLoggedIn()) return true;
    const usage = guestState();
    return usage.songs.includes(song.songKey) || usage.songs.length < GUEST_DAILY_LIMIT;
  }

  function qualifyGuestSong(song) {
    if (isLoggedIn()) return;
    const usage = guestState();
    if (!usage.songs.includes(song.songKey)) {
      usage.songs.push(song.songKey);
      saveGuestState(usage);
      renderGuestMeter();
    }
  }

  function localLikes() {
    try { return new Set(JSON.parse(localStorage.getItem(LIKE_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }

  function saveLocalLikes(values) {
    try { localStorage.setItem(LIKE_KEY, JSON.stringify([...values])); } catch (_) {}
  }

  function formatCount(value) {
    const count = number(value);
    if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
    return String(count);
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function dateScore(song) {
    const date = new Date(song.createdAt).getTime();
    return Number.isFinite(date) ? date : 0;
  }

  function aggregateBy(values, keyFn) {
    const map = new Map();
    values.forEach(item => {
      const key = clean(keyFn(item));
      if (!key) return;
      const current = map.get(key) || { key, count: 0, items: [] };
      current.count += 1;
      current.items.push(item);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  function sortSongs(songs) {
    const copy = [...songs];
    if (state.sort === 'most-played') return copy.sort((a, b) => b.plays - a.plays || b.likes - a.likes);
    if (state.sort === 'most-liked') return copy.sort((a, b) => b.likes - a.likes || b.plays - a.plays);
    if (state.sort === 'artist') return copy.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    if (state.sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title));
    return copy.sort((a, b) => dateScore(b) - dateScore(a) || b.idx - a.idx);
  }

  function computeVisibleSongs() {
    const query = state.query.toLowerCase();
    const filtered = state.songs.filter(song => {
      const matchesQuery = !query || [song.title, song.artist, song.genre, ...song.moods].join(' ').toLowerCase().includes(query);
      const matchesGenre = state.genre === 'ALL' || song.genre.toLowerCase() === state.genre.toLowerCase();
      const matchesMood = state.mood === 'ALL' || song.moods.some(mood => mood.toLowerCase() === state.mood.toLowerCase());
      return matchesQuery && matchesGenre && matchesMood;
    });
    state.visibleSongs = sortSongs(filtered);
  }

  function sectionHeading(title, action = '') {
    return `<div class="v2-section-heading"><h2>${escapeHtml(title)}</h2>${action ? `<button type="button" class="v2-see-all" ${action}>See All</button>` : ''}</div>`;
  }

  function songArtwork(song, className = '') {
    return `<img class="${className}" src="${escapeHtml(song.artwork)}" alt="${escapeHtml(song.title)} artwork" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_ART}'">`;
  }

  function featuredCard(song, index) {
    const label = index === 0 ? 'New Release' : index === 1 ? 'Most Played Today' : 'Trending Now';
    return `<article class="v2-feature-card" data-play-song="${escapeHtml(song.songKey)}" tabindex="0" role="button" aria-label="Play ${escapeHtml(song.title)}">
      <div class="v2-feature-art">
        ${songArtwork(song)}
        <span class="v2-feature-label">${escapeHtml(label)}</span>
        <button type="button" class="v2-art-play" tabindex="-1" aria-hidden="true">${icons.play}</button>
      </div>
      <h3>${escapeHtml(song.title)}</h3>
      <p>${escapeHtml(song.artist)}</p>
      <span>${escapeHtml(song.genre)}</span>
    </article>`;
  }

  function artistCard(group) {
    const song = group.items[0];
    const followerValue = Math.max(...group.items.map(item => number(item.raw?.followers || item.raw?.follower_count || item.raw?.artist_followers)));
    const meta = followerValue ? `${formatCount(followerValue)} followers` : `${group.count} track${group.count === 1 ? '' : 's'}`;
    return `<button type="button" class="v2-artist-card" data-artist-filter="${escapeHtml(group.key)}">
      <span class="v2-artist-avatar">${songArtwork(song)}</span>
      <strong>${escapeHtml(group.key)}</strong>
      <small>${escapeHtml(meta)}</small>
    </button>`;
  }

  function moodCard(group, index) {
    const className = `tone-${index % 6}`;
    return `<button type="button" class="v2-category-card ${className}" data-mood-filter="${escapeHtml(group.key)}">
      <strong>${escapeHtml(group.key)}</strong><small>${group.count} tracks</small>
    </button>`;
  }

  function genreCard(group, index) {
    const song = group.items.find(item => item.artwork !== FALLBACK_ART) || group.items[0];
    return `<button type="button" class="v2-genre-card" data-genre-filter="${escapeHtml(group.key)}" style="--genre-image:url('${escapeHtml(song.artwork).replaceAll("'", '%27')}');--genre-tone:${index}">
      <span></span><strong>${escapeHtml(group.key)}</strong><small>${group.count} tracks</small>
    </button>`;
  }

  function productCard(product) {
    return `<a class="v2-product-card" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">
      <span class="v2-product-image">${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.remove()">` : '<b>SB</b>'}</span>
      <strong>${escapeHtml(product.title)}</strong>
      <small>${escapeHtml(product.price || 'Shop on Stashbox.ai')}</small>
    </a>`;
  }

  function songGridCard(song) {
    return `<article class="v2-song-card song-card" data-play-song="${escapeHtml(song.songKey)}" tabindex="0" role="button" aria-label="Play ${escapeHtml(song.title)}">
      <div class="v2-song-art">
        ${songArtwork(song)}
        <button type="button" class="v2-art-play" tabindex="-1" aria-hidden="true">${icons.play}</button>
        ${song.videoOnly ? '<span class="v2-video-badge">Video</span>' : ''}
      </div>
      <div class="v2-song-copy">
        <h3>${escapeHtml(song.title)}</h3>
        <p>${escapeHtml(song.artist)}</p>
        <span>${escapeHtml(song.genre)}</span>
      </div>
    </article>`;
  }

  function renderShell() {
    const latest = [...state.songs].sort((a, b) => dateScore(b) - dateScore(a) || b.idx - a.idx);
    const featured = [...state.songs].sort((a, b) => Number(b.featured) - Number(a.featured) || dateScore(b) - dateScore(a) || b.plays - a.plays).slice(0, 8);
    const artists = aggregateBy(state.songs, song => song.artist).slice(0, 10);
    const moods = aggregateBy(state.songs.flatMap(song => song.moods.map(mood => ({ mood, song }))), item => item.mood)
      .map(group => ({ ...group, items: group.items.map(item => item.song) })).slice(0, 8);
    const genres = aggregateBy(state.songs, song => song.genre).slice(0, 10);

    computeVisibleSongs();

    app.innerHTML = `
      <header class="v2-header">
        <a class="v2-wordmark" href="/radio/dev/v2/" aria-label="Stashbox Radio V2 home">STASH<span>BOX</span></a>
        <div class="v2-header-actions">
          <button type="button" class="v2-icon-button" data-open-search aria-label="Search">${icons.search}</button>
          <button type="button" class="v2-icon-button v2-notifications-trigger" aria-label="Notifications">${icons.bell}<span class="v2-notification-dot"></span><span class="v2-notification-count" hidden>0</span></button>
          <div class="stashbox-action-row" aria-label="Account"></div>
        </div>
      </header>

      <main class="v2-home">
        <section class="v2-guest-meter" data-guest-meter></section>

        <section class="v2-section v2-featured-section">
          ${sectionHeading('Featured Songs', 'data-scroll-songs')}
          <div class="v2-horizontal v2-featured-row">${featured.map(featuredCard).join('')}</div>
        </section>

        <section class="v2-section">
          ${sectionHeading('Popular Artists', 'data-scroll-artists')}
          <div class="v2-horizontal v2-artists-row">${artists.map(artistCard).join('')}</div>
        </section>

        ${moods.length ? `<section class="v2-section">
          ${sectionHeading('Moods', 'data-clear-and-scroll')}
          <div class="v2-horizontal v2-category-row">${moods.map(moodCard).join('')}</div>
        </section>` : ''}

        <section class="v2-section">
          ${sectionHeading('Genres', 'data-clear-and-scroll')}
          <div class="v2-horizontal v2-genre-row">${genres.map(genreCard).join('')}</div>
        </section>

        ${state.products.length ? `<section class="v2-section">
          ${sectionHeading('Shop', 'data-open-shop')}
          <div class="v2-horizontal v2-shop-row">${state.products.slice(0, 12).map(productCard).join('')}</div>
        </section>` : ''}

        <section class="v2-section v2-songs-section" id="v2Songs">
          <div class="v2-section-heading v2-songs-heading">
            <div><h2>Songs</h2><span data-song-result-count>${state.visibleSongs.length} of ${state.songs.length}</span></div>
            <div class="v2-song-tools">
              <button type="button" class="v2-tool-button" data-open-filters aria-label="Filter songs">${icons.filter}<span>Filters</span></button>
              <label class="v2-sort-label">Sort
                <select data-song-sort>
                  <option value="latest" ${state.sort === 'latest' ? 'selected' : ''}>Latest</option>
                  <option value="most-played" ${state.sort === 'most-played' ? 'selected' : ''}>Most Played</option>
                  <option value="most-liked" ${state.sort === 'most-liked' ? 'selected' : ''}>Most Liked</option>
                  <option value="artist" ${state.sort === 'artist' ? 'selected' : ''}>Artist</option>
                  <option value="title" ${state.sort === 'title' ? 'selected' : ''}>Title</option>
                </select>
              </label>
            </div>
          </div>
          <div class="v2-active-filters" data-active-filters></div>
          <div class="v2-song-grid" data-song-grid>${state.visibleSongs.map(songGridCard).join('')}</div>
          <div class="v2-empty" data-empty-state ${state.visibleSongs.length ? 'hidden' : ''}>
            <strong>No songs match these filters.</strong>
            <button type="button" data-reset-filters>Reset Filters</button>
          </div>
        </section>
      </main>

      <section class="v2-search-sheet" data-search-sheet hidden aria-label="Search Stashbox Radio">
        <div class="v2-sheet-bar">
          <label class="v2-search-field">${icons.search}<input type="search" data-search-input placeholder="Song, artist, genre, mood…" autocomplete="off"></label>
          <button type="button" class="v2-sheet-close" data-close-search>Done</button>
        </div>
        <div class="v2-search-results" data-search-results></div>
      </section>

      <section class="v2-filter-sheet" data-filter-sheet hidden aria-label="Filter songs">
        <div class="v2-sheet-handle"></div>
        <header><div><small>Library</small><h2>Filter Songs</h2></div><button type="button" data-close-filters aria-label="Close filters">${icons.close}</button></header>
        <div class="v2-filter-body">
          <h3>Genres</h3><div class="v2-filter-chips" data-genre-chips><button type="button" data-genre-filter="ALL">All</button>${genres.map(group => `<button type="button" data-genre-filter="${escapeHtml(group.key)}">${escapeHtml(group.key)} <span>${group.count}</span></button>`).join('')}</div>
          ${moods.length ? `<h3>Moods</h3><div class="v2-filter-chips" data-mood-chips><button type="button" data-mood-filter="ALL">All</button>${moods.map(group => `<button type="button" data-mood-filter="${escapeHtml(group.key)}">${escapeHtml(group.key)} <span>${group.count}</span></button>`).join('')}</div>` : ''}
        </div>
        <footer><button type="button" class="v2-secondary-button" data-reset-filters>Reset</button><button type="button" class="v2-primary-button" data-apply-filters>Show Songs</button></footer>
      </section>

      <section class="v2-player" data-player hidden aria-label="Stashbox full-screen player">
        <div class="v2-player-backdrop" data-player-backdrop></div>
        <div class="v2-player-shade"></div>
        <header class="v2-player-header">
          <button type="button" class="v2-icon-button" data-close-player aria-label="Back to library">${icons.back}</button>
          <a class="v2-player-mark" href="/radio/dev/v2/">STASH<span>BOX</span></a>
          <div class="v2-player-head-actions">
            <button type="button" class="v2-icon-button" data-player-search aria-label="Search">${icons.search}</button>
            <button type="button" class="v2-icon-button v2-player-bell" aria-label="Notifications">${icons.bell}</button>
          </div>
        </header>
        <div class="v2-swipe-hint" data-swipe-hint>${icons.up}<span>Swipe for next track</span></div>
        <div class="v2-player-content player-info">
          <div class="v2-player-labels"><span data-player-genre></span><b><i></i>Now Playing</b></div>
          <h2 data-player-title></h2>
          <div class="meta v2-artist-row"><span class="v2-mini-avatar" data-player-avatar></span><strong data-player-artist></strong><button type="button" class="v2-follow-button">Follow</button></div>
          <div class="v2-timeline"><input type="range" min="0" max="0" value="0" step="0.1" data-scrubber aria-label="Song timeline"><div><span data-current-time>0:00</span><span data-duration>0:00</span></div></div>
          <div class="v2-player-controls player-controls-actions">
            <button type="button" class="v2-side-action like-button" data-like-song aria-label="Like song">${icons.heart}<span data-like-count>0</span></button>
            <button type="button" class="v2-transport" data-previous-song aria-label="Previous song">${icons.previous}</button>
            <button type="button" class="v2-main-play" data-toggle-play aria-label="Play">${icons.play}</button>
            <button type="button" class="v2-transport" data-next-song aria-label="Next song">${icons.next}</button>
            <button type="button" class="v2-side-action" data-share-song aria-label="Share song">${icons.share}<span data-share-count>0</span></button>
          </div>
        </div>
        <audio class="native-audio" data-audio preload="metadata" playsinline></audio>
      </section>

      <section class="v2-auth-gate" data-auth-gate hidden aria-label="Guest listening limit">
        <div class="v2-auth-card">
          <span class="v2-auth-icon">${icons.play}</span>
          <small>Free listener account</small>
          <h2>Continue Listening</h2>
          <p>You reached today’s four-song guest limit. Log in or create a free account to keep the music playing.</p>
          <button type="button" class="v2-primary-button" data-auth-login>Log In</button>
          <button type="button" class="v2-secondary-button" data-auth-signup>Create Account</button>
          <button type="button" class="v2-text-button" data-auth-close>Keep Browsing</button>
        </div>
      </section>

      <div class="v2-toast" data-toast hidden></div>
    `;

    bindEvents();
    renderGuestMeter();
    updateActiveFilters();
    updateNotificationBridge();
    if (latest.length && new URLSearchParams(location.search).get('song')) {
      const requested = state.songs.find(song => song.songKey === new URLSearchParams(location.search).get('song'));
      if (requested) openPlayer(requested, false);
    }
  }

  function bindEvents() {
    app.addEventListener('click', handleClick);
    app.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-play-song]')) {
        event.preventDefault();
        selectSongByKey(event.target.dataset.playSong);
      }
    });

    app.querySelector('[data-search-input]')?.addEventListener('input', event => {
      state.query = event.target.value;
      updateSearchResults();
    });

    app.querySelector('[data-song-sort]')?.addEventListener('change', event => {
      state.sort = event.target.value;
      refreshSongGrid();
    });

    const audio = getAudio();
    if (audio) {
      audio.addEventListener('loadedmetadata', updateTimeline);
      audio.addEventListener('durationchange', updateTimeline);
      audio.addEventListener('timeupdate', updateTimeline);
      audio.addEventListener('play', () => {
        state.playing = true;
        updatePlayButton();
        scheduleQualifiedPlay();
      });
      audio.addEventListener('pause', () => {
        state.playing = false;
        updatePlayButton();
        clearQualifiedTimer();
      });
      audio.addEventListener('ended', () => {
        state.playing = false;
        updatePlayButton();
        trackEvent('full_play', state.selected, { seconds: Math.floor(audio.duration || 0), completed: true });
        playAdjacent(1, true);
      });
      audio.addEventListener('error', () => showToast('This audio file is unavailable.'));
    }

    app.querySelector('[data-scrubber]')?.addEventListener('input', event => {
      if (audio && Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) || 0;
    });

    const player = app.querySelector('[data-player]');
    player?.addEventListener('touchstart', event => {
      state.touchStartY = event.changedTouches?.[0]?.clientY ?? null;
    }, { passive: true });
    player?.addEventListener('touchend', event => {
      if (state.touchStartY === null) return;
      const endY = event.changedTouches?.[0]?.clientY ?? state.touchStartY;
      const distance = endY - state.touchStartY;
      state.touchStartY = null;
      if (Math.abs(distance) < 65) return;
      playAdjacent(distance < 0 ? 1 : -1, true);
      dismissSwipeHint();
    }, { passive: true });
  }

  function handleClick(event) {
    const playTarget = event.target.closest('[data-play-song]');
    if (playTarget) return selectSongByKey(playTarget.dataset.playSong);
    if (event.target.closest('[data-open-search]')) return openSearch();
    if (event.target.closest('[data-close-search]')) return closeSearch();
    if (event.target.closest('[data-open-filters]')) return openFilters();
    if (event.target.closest('[data-close-filters]')) return closeFilters();
    if (event.target.closest('[data-apply-filters]')) return applyFiltersAndScroll();
    if (event.target.closest('[data-reset-filters]')) return resetFilters();
    if (event.target.closest('[data-scroll-songs]')) return scrollToSongs();
    if (event.target.closest('[data-scroll-artists]')) return openSearch();
    if (event.target.closest('[data-clear-and-scroll]')) return resetFilters(true);
    if (event.target.closest('[data-open-shop]')) return window.open('https://stashbox.ai/collections/stashbox', '_blank', 'noopener');
    if (event.target.closest('[data-close-player]')) return closePlayer();
    if (event.target.closest('[data-toggle-play]')) return togglePlayback();
    if (event.target.closest('[data-next-song]')) return playAdjacent(1, true);
    if (event.target.closest('[data-previous-song]')) return playAdjacent(-1, true);
    if (event.target.closest('[data-like-song]')) return toggleLike();
    if (event.target.closest('[data-share-song]')) return shareSelected();
    if (event.target.closest('[data-player-search]')) { closePlayer(); return openSearch(); }
    if (event.target.closest('.v2-notifications-trigger, .v2-player-bell')) return openNotifications();
    if (event.target.closest('[data-auth-login]')) return openAccount('login');
    if (event.target.closest('[data-auth-signup]')) return openAccount('signup');
    if (event.target.closest('[data-auth-close]')) return closeAuthGate();

    const artist = event.target.closest('[data-artist-filter]')?.dataset.artistFilter;
    if (artist) {
      state.query = artist;
      const input = app.querySelector('[data-search-input]');
      if (input) input.value = artist;
      refreshSongGrid();
      scrollToSongs();
      return;
    }

    const genre = event.target.closest('[data-genre-filter]')?.dataset.genreFilter;
    if (genre) {
      state.genre = genre || 'ALL';
      refreshSongGrid();
      updateFilterButtons();
      if (!event.target.closest('[data-filter-sheet]')) scrollToSongs();
      return;
    }

    const mood = event.target.closest('[data-mood-filter]')?.dataset.moodFilter;
    if (mood) {
      state.mood = mood || 'ALL';
      refreshSongGrid();
      updateFilterButtons();
      if (!event.target.closest('[data-filter-sheet]')) scrollToSongs();
    }
  }

  function selectSongByKey(songKey) {
    const song = state.songs.find(item => item.songKey === songKey);
    if (!song) return;
    if (state.searchOpen) closeSearch();
    if (state.filterOpen) closeFilters();
    openPlayer(song, true);
  }

  function openPlayer(song, autoplay = true) {
    if (!guestCanStart(song)) {
      state.pendingSong = song;
      showAuthGate();
      return;
    }

    state.selected = song;
    state.queue = state.visibleSongs.length ? [...state.visibleSongs] : [...state.songs];
    state.queueIndex = Math.max(0, state.queue.findIndex(item => item.songKey === song.songKey));
    state.playerOpen = true;

    const player = app.querySelector('[data-player]');
    if (!player) return;
    player.hidden = false;
    document.body.classList.add('v2-player-open');
    updatePlayerUi();

    const audio = getAudio();
    if (audio) {
      const sourceChanged = audio.dataset.songKey !== song.songKey;
      if (sourceChanged) {
        clearQualifiedTimer();
        audio.pause();
        audio.dataset.songKey = song.songKey;
        audio.src = song.audioUrl || '';
        audio.load();
      }
      if (autoplay && song.audioUrl) audio.play().catch(() => showToast('Tap play to start audio.'));
      if (!song.audioUrl && song.videoUrl) {
        showToast('This track uses video playback. Opening the official video.');
        window.open(song.videoUrl, '_blank', 'noopener');
      }
    }

    const url = new URL(location.href);
    url.searchParams.set('song', song.songKey);
    history.replaceState({}, '', url);
  }

  function closePlayer() {
    const player = app.querySelector('[data-player]');
    if (player) player.hidden = true;
    document.body.classList.remove('v2-player-open');
    state.playerOpen = false;
    const url = new URL(location.href);
    url.searchParams.delete('song');
    history.replaceState({}, '', url);
  }

  function updatePlayerUi() {
    const song = state.selected;
    if (!song) return;
    const setText = (selector, value) => {
      const element = app.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText('[data-player-title]', song.title);
    setText('[data-player-artist]', song.artist);
    setText('[data-player-genre]', song.genre);
    setText('[data-like-count]', formatCount(song.likes));
    setText('[data-share-count]', formatCount(song.shares));
    const avatar = app.querySelector('[data-player-avatar]');
    if (avatar) avatar.innerHTML = songArtwork(song);
    const backdrop = app.querySelector('[data-player-backdrop]');
    if (backdrop) {
      backdrop.style.backgroundImage = `url("${String(song.artwork).replaceAll('"', '%22')}")`;
      backdrop.setAttribute('aria-label', `${song.title} artwork`);
    }
    updateLikeButton();
    updatePlayButton();
  }

  function getAudio() {
    return app.querySelector('[data-audio]');
  }

  function togglePlayback() {
    const audio = getAudio();
    if (!audio || !state.selected) return;
    if (!state.selected.audioUrl) {
      if (state.selected.videoUrl) window.open(state.selected.videoUrl, '_blank', 'noopener');
      else showToast('No playable media is available for this song.');
      return;
    }
    if (audio.paused) audio.play().catch(() => showToast('Playback was blocked. Tap play again.'));
    else audio.pause();
  }

  function playAdjacent(direction, autoplay) {
    if (!state.queue.length) state.queue = state.visibleSongs.length ? [...state.visibleSongs] : [...state.songs];
    if (!state.queue.length) return;
    let nextIndex = state.queueIndex + direction;
    if (nextIndex < 0) nextIndex = state.queue.length - 1;
    if (nextIndex >= state.queue.length) nextIndex = 0;
    const song = state.queue[nextIndex];
    if (!song) return;
    if (!guestCanStart(song)) {
      state.pendingSong = song;
      showAuthGate();
      return;
    }
    state.queueIndex = nextIndex;
    openPlayer(song, autoplay);
  }

  function updatePlayButton() {
    const button = app.querySelector('[data-toggle-play]');
    if (!button) return;
    button.innerHTML = state.playing ? icons.pause : icons.play;
    button.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }

  function updateTimeline() {
    const audio = getAudio();
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const scrubber = app.querySelector('[data-scrubber]');
    if (scrubber) {
      scrubber.max = String(duration || 0);
      scrubber.value = String(Math.min(current, duration || current));
      scrubber.style.setProperty('--progress', `${duration ? (current / duration) * 100 : 0}%`);
    }
    const currentElement = app.querySelector('[data-current-time]');
    const durationElement = app.querySelector('[data-duration]');
    if (currentElement) currentElement.textContent = formatTime(current);
    if (durationElement) durationElement.textContent = formatTime(duration);
  }

  function scheduleQualifiedPlay() {
    clearQualifiedTimer();
    const song = state.selected;
    if (!song) return;
    state.qualifiedTimer = window.setTimeout(() => {
      const audio = getAudio();
      if (!audio || audio.paused || state.selected?.songKey !== song.songKey) return;
      qualifyGuestSong(song);
      trackEvent('play', song, { seconds: Math.floor(audio.currentTime || QUALIFIED_SECONDS) });
    }, QUALIFIED_SECONDS * 1000);
  }

  function clearQualifiedTimer() {
    if (state.qualifiedTimer) window.clearTimeout(state.qualifiedTimer);
    state.qualifiedTimer = null;
  }

  async function trackEvent(action, song, metadata = {}) {
    if (!song) return;
    const payload = {
      action,
      event_type: action,
      song_key: song.songKey,
      song_id: clean(song.raw?.song_id || song.raw?.songId || song.raw?.id),
      display_title: song.title,
      artist: song.artist,
      session_id: state.sessionId,
      seconds_played: number(metadata.seconds),
      completed: Boolean(metadata.completed),
      source: 'radio_dev_v2'
    };
    try {
      await fetch(TRACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (_) {}
  }

  function toggleLike() {
    const song = state.selected;
    if (!song) return;
    const likes = localLikes();
    const active = likes.has(song.songKey);
    if (active) {
      likes.delete(song.songKey);
      song.likes = Math.max(0, song.likes - 1);
    } else {
      likes.add(song.songKey);
      song.likes += 1;
      trackEvent('like', song);
    }
    saveLocalLikes(likes);
    updatePlayerUi();
  }

  function updateLikeButton() {
    const button = app.querySelector('[data-like-song]');
    if (!button || !state.selected) return;
    button.classList.toggle('is-liked', localLikes().has(state.selected.songKey));
  }

  async function shareSelected() {
    const song = state.selected;
    if (!song) return;
    const url = new URL('/radio/dev/v2/', location.origin);
    url.searchParams.set('song', song.songKey);
    try {
      if (navigator.share) await navigator.share({ title: `${song.title} by ${song.artist}`, text: `Listen to ${song.title} on Stashbox Radio`, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        showToast('Song link copied.');
      }
      song.shares += 1;
      trackEvent('share', song);
      updatePlayerUi();
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('Share was not completed.');
    }
  }

  function openSearch() {
    const sheet = app.querySelector('[data-search-sheet]');
    if (!sheet) return;
    sheet.hidden = false;
    state.searchOpen = true;
    document.body.classList.add('v2-sheet-open');
    const input = app.querySelector('[data-search-input]');
    if (input) {
      input.value = state.query;
      setTimeout(() => input.focus(), 50);
    }
    updateSearchResults();
  }

  function closeSearch() {
    const sheet = app.querySelector('[data-search-sheet]');
    if (sheet) sheet.hidden = true;
    state.searchOpen = false;
    document.body.classList.remove('v2-sheet-open');
    refreshSongGrid();
    if (state.query) scrollToSongs();
  }

  function updateSearchResults() {
    computeVisibleSongs();
    const target = app.querySelector('[data-search-results]');
    if (!target) return;
    const results = state.visibleSongs.slice(0, 30);
    target.innerHTML = `${state.query ? `<p class="v2-search-summary">${results.length}${state.visibleSongs.length > 30 ? '+' : ''} results</p>` : '<p class="v2-search-summary">Start typing to search the full library.</p>'}
      <div class="v2-search-result-list">${results.map(song => `<button type="button" data-play-song="${escapeHtml(song.songKey)}"><span>${songArtwork(song)}</span><div><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)} · ${escapeHtml(song.genre)}</small></div>${icons.chevron}</button>`).join('')}</div>`;
  }

  function openFilters() {
    const sheet = app.querySelector('[data-filter-sheet]');
    if (!sheet) return;
    sheet.hidden = false;
    state.filterOpen = true;
    document.body.classList.add('v2-sheet-open');
    updateFilterButtons();
  }

  function closeFilters() {
    const sheet = app.querySelector('[data-filter-sheet]');
    if (sheet) sheet.hidden = true;
    state.filterOpen = false;
    document.body.classList.remove('v2-sheet-open');
  }

  function applyFiltersAndScroll() {
    closeFilters();
    refreshSongGrid();
    scrollToSongs();
  }

  function resetFilters(scroll = false) {
    state.query = '';
    state.genre = 'ALL';
    state.mood = 'ALL';
    const input = app.querySelector('[data-search-input]');
    if (input) input.value = '';
    refreshSongGrid();
    updateFilterButtons();
    if (scroll) scrollToSongs();
  }

  function updateFilterButtons() {
    app.querySelectorAll('[data-genre-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.genreFilter === state.genre));
    app.querySelectorAll('[data-mood-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.moodFilter === state.mood));
  }

  function refreshSongGrid() {
    computeVisibleSongs();
    const grid = app.querySelector('[data-song-grid]');
    if (grid) grid.innerHTML = state.visibleSongs.map(songGridCard).join('');
    const count = app.querySelector('[data-song-result-count]');
    if (count) count.textContent = `${state.visibleSongs.length} of ${state.songs.length}`;
    const empty = app.querySelector('[data-empty-state]');
    if (empty) empty.hidden = state.visibleSongs.length > 0;
    updateActiveFilters();
  }

  function updateActiveFilters() {
    const target = app.querySelector('[data-active-filters]');
    if (!target) return;
    const chips = [];
    if (state.query) chips.push(`<button type="button" data-clear-query>Search: ${escapeHtml(state.query)} ×</button>`);
    if (state.genre !== 'ALL') chips.push(`<button type="button" data-genre-filter="ALL">${escapeHtml(state.genre)} ×</button>`);
    if (state.mood !== 'ALL') chips.push(`<button type="button" data-mood-filter="ALL">${escapeHtml(state.mood)} ×</button>`);
    target.innerHTML = chips.join('');
    const clearQuery = target.querySelector('[data-clear-query]');
    clearQuery?.addEventListener('click', () => {
      state.query = '';
      const input = app.querySelector('[data-search-input]');
      if (input) input.value = '';
      refreshSongGrid();
    });
  }

  function scrollToSongs() {
    app.querySelector('#v2Songs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderGuestMeter() {
    const target = app.querySelector('[data-guest-meter]');
    if (!target) return;
    if (isLoggedIn()) {
      target.innerHTML = '<span>Listener account active</span><strong>Unlimited listening</strong>';
      target.classList.add('is-account');
      return;
    }
    target.classList.remove('is-account');
    const usage = guestState();
    const remaining = Math.max(0, GUEST_DAILY_LIMIT - usage.songs.length);
    target.innerHTML = `<span>Guest listening</span><strong>${remaining} free song${remaining === 1 ? '' : 's'} left today</strong>`;
  }

  function showAuthGate() {
    const gate = app.querySelector('[data-auth-gate]');
    if (gate) gate.hidden = false;
    document.body.classList.add('v2-sheet-open');
  }

  function closeAuthGate() {
    const gate = app.querySelector('[data-auth-gate]');
    if (gate) gate.hidden = true;
    document.body.classList.remove('v2-sheet-open');
  }

  function openAccount(view) {
    const account = window.StashboxRadioAccount;
    if (!account?.open) {
      showToast('Account tools are still loading.');
      return;
    }
    account.open(view);
    const timer = window.setInterval(() => {
      if (!isLoggedIn()) return;
      window.clearInterval(timer);
      closeAuthGate();
      renderGuestMeter();
      if (state.pendingSong) {
        const pending = state.pendingSong;
        state.pendingSong = null;
        openPlayer(pending, true);
      }
    }, 800);
    window.setTimeout(() => window.clearInterval(timer), 120000);
  }

  function openNotifications() {
    const bell = document.querySelector('.sbr-notification-bell');
    if (bell) bell.click();
    else showToast('Notifications are still loading.');
  }

  function updateNotificationBridge() {
    const sync = () => {
      const source = document.querySelector('.sbr-notification-count');
      const target = app.querySelector('.v2-notification-count');
      const dot = app.querySelector('.v2-notification-dot');
      if (!target || !dot || !source) return;
      const count = number(source.textContent);
      target.textContent = count > 99 ? '99+' : String(count);
      target.hidden = count === 0;
      dot.hidden = count === 0;
    };
    sync();
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  function dismissSwipeHint() {
    const hint = app.querySelector('[data-swipe-hint]');
    if (hint) hint.classList.add('is-hidden');
  }

  function showToast(message) {
    const toast = app.querySelector('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 250);
    }, 2400);
  }

  async function loadData() {
    const [songsResult, productsResult] = await Promise.allSettled([
      fetch(SONGS_URL, { cache: 'no-store' }).then(async response => {
        const text = await response.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { data = null; }
        if (!response.ok) throw new Error(data?.message || data?.error || `Songs API HTTP ${response.status}`);
        return data;
      }),
      fetch(PRODUCTS_URL, { cache: 'default' }).then(response => response.ok ? response.json() : Promise.reject(new Error(`Shop HTTP ${response.status}`)))
    ]);

    if (songsResult.status !== 'fulfilled') throw songsResult.reason;
    state.songs = rowsFrom(songsResult.value, ['songs', 'items', 'data'])
      .map(normalizeSong)
      .filter(song => song.songKey && song.title && (song.audioUrl || song.videoUrl || song.artwork));

    if (!state.songs.length) throw new Error('The DEV songs API returned no public songs.');

    if (productsResult.status === 'fulfilled') {
      state.products = rowsFrom(productsResult.value, ['products', 'items', 'data'])
        .map(normalizeProduct)
        .filter(product => product.handle && (product.image || product.title));
    }
  }

  async function initialize() {
    try {
      await loadData();
      renderShell();
      window.setInterval(renderGuestMeter, 2500);
    } catch (error) {
      state.loadError = error?.message || 'Live content failed to load.';
      app.innerHTML = `<section class="v2-load-error"><span>STASH<span>BOX</span></span><h1>Radio V2 could not load</h1><p>${escapeHtml(state.loadError)}</p><button type="button">Retry</button></section>`;
      app.querySelector('button')?.addEventListener('click', () => location.reload());
    }
  }

  initialize();
})();
