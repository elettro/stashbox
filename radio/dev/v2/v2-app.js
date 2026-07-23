const API_ROOT_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const SONGS_API_URL = `${API_ROOT_URL}/radio/songs`;
const TRACKING_API_URL = `${API_ROOT_URL}/radio/track`;
const FALLBACK_ARTWORK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
const QUALIFIED_PLAY_SECONDS = 10;
const SESSION_KEY = 'stashbox-radio-v2-session-id';
const LIKED_KEY = 'stashbox-radio-v2-liked-songs';

const root = document.getElementById('root');
const audio = new Audio();
audio.preload = 'metadata';

const state = {
  songs: [],
  currentIndex: -1,
  screen: 'loading',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  searchTerm: '',
  qualifiedSeconds: 0,
  qualifiedTracked: false,
  qualifiedInterval: null,
  visualTimer: null,
  visualIndex: 0,
  likedSongs: new Set(readStoredArray(LIKED_KEY)),
  modalOpen: false,
  toastTimer: null
};

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

function bool(value) {
  return value === true || value === 1 || ['true', '1', 'yes'].includes(clean(value).toLowerCase());
}

function fixDropbox(url) {
  return clean(url)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');
}

function safeUrl(value, fallback = '') {
  const url = fixDropbox(value);
  if (!url) return fallback;
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol) && !url.startsWith('/')) return fallback;
    return url;
  } catch (_) {
    return fallback;
  }
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return '';
}

function countValue(row, fields) {
  return Math.max(0, ...fields.map(field => Number(row?.[field]) || 0));
}

function normalizeVisualAssets(value) {
  return parseList(value)
    .map((asset, index) => {
      const url = safeUrl(firstValue(asset, ['public_url', 'publicUrl', 'url', 'src', 'asset_url', 'file_url', 's3_url']));
      if (!url) return null;
      const rawType = clean(firstValue(asset, ['type', 'asset_type', 'media_type', 'content_type', 'mime_type'])).toLowerCase();
      const type = rawType.includes('video') || rawType === 'clip' ? 'clip' : 'image';
      return {
        id: clean(firstValue(asset, ['id', 'asset_id', 'key'])) || `visual-${index}`,
        type,
        url,
        duration: Math.max(3, Number(asset.duration_seconds || asset.durationSeconds) || 8)
      };
    })
    .filter(Boolean);
}

function normalizeSong(row, index) {
  const key = clean(firstValue(row, ['song_key', 'key', 'slug', 'id', 'track_id'])) || `song-${index}`;
  const title = clean(firstValue(row, ['display_title', 'song_name', 'title'])) || 'Untitled Stashbox Track';
  const artist = clean(firstValue(row, ['artist', 'artist_name', 'band'])) || 'Stashbox';
  const genre = clean(firstValue(row, ['genre', 'primary_genre', 'section'])) || 'Music';
  const artwork = safeUrl(firstValue(row, [
    'resolved_artwork_url',
    'song_artwork_url',
    'songArtworkUrl',
    'artwork_url',
    'artworkUrl',
    'cover_art_url',
    'coverArtUrl',
    'image_url',
    'imageUrl'
  ]), FALLBACK_ARTWORK);
  const audioUrl = safeUrl(firstValue(row, ['audio_url', 'audioUrl']));
  const visualAssets = normalizeVisualAssets(row.visual_assets || row.visualAssets);
  const artworkVisual = artwork ? [{ id: `artwork-${key}`, type: 'image', url: artwork, duration: 8 }] : [];

  return {
    raw: row,
    key,
    title,
    artist,
    genre,
    mood: clean(firstValue(row, ['mood', 'primary_mood'])),
    artwork,
    audioUrl,
    videoLink: safeUrl(firstValue(row, ['video_link', 'video_url', 'videoUrl'])),
    likes: countValue(row, ['likes', 'like_count', 'total_likes', 'likeCount', 'totalLikes']),
    shares: countValue(row, ['shares', 'share_count', 'total_shares', 'shareCount', 'totalShares']),
    plays: countValue(row, ['total_plays', 'plays', 'play_count', 'play_starts', 'totalPlays']),
    createdAt: clean(firstValue(row, ['created_at', 'createdAt', 'updated_at', 'updatedAt'])),
    featured: bool(row.featured),
    explicit: bool(row.explicit),
    visuals: visualAssets.length ? visualAssets : artworkVisual
  };
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveLikedSongs() {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...state.likedSongs]));
  } catch (_) {}
}

function sessionId() {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID?.() || `v2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch (_) {
    return `v2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function icon(name, className = '') {
  const icons = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.8-3.8"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"></path>',
    pause: '<path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" stroke="none"></path>',
    previous: '<path d="M6 6v12"></path><path d="m18 6-9 6 9 6z" fill="currentColor" stroke="none"></path>',
    next: '<path d="M18 6v12"></path><path d="m6 6 9 6-9 6z" fill="currentColor" stroke="none"></path>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"></path>',
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.6 6.8-4"></path><path d="m8.6 13.4 6.8 4"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    back: '<path d="m15 18-6-6 6-6"></path>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path>'
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
}

function logoMarkup() {
  return '<span class="brand-word"><span>STASH</span><strong>BOX</strong></span>';
}

function formatTime(seconds) {
  const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function deviceType() {
  return /mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
}

async function sendTracking(song, eventType, extra = {}) {
  if (!song?.key || !eventType) return;
  const payload = {
    song_key: song.key,
    song_id: clean(song.raw?.song_id || song.raw?.id || song.key),
    id: clean(song.raw?.id || song.key),
    display_title: song.title,
    song_name: clean(song.raw?.song_name || song.title),
    artist: song.artist,
    event_type: eventType,
    session_id: sessionId(),
    device_type: deviceType(),
    referrer: document.referrer || '',
    page: 'dev-v2',
    source: 'public_player_v2',
    ...extra
  };

  try {
    await fetch(TRACKING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn('[Stashbox V2] tracking failed', error);
  }
}

async function loadSongs() {
  state.screen = 'loading';
  render();
  try {
    const response = await fetch(SONGS_API_URL, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data?.success === false) throw new Error(data?.error || `Songs API returned ${response.status}`);
    const rows = Array.isArray(data?.songs) ? data.songs : (Array.isArray(data) ? data : []);
    state.songs = rows.map(normalizeSong).filter(song => song.title && (song.audioUrl || song.videoLink));
    if (!state.songs.length) throw new Error('No playable songs returned from the DEV API.');

    const requestedKey = new URLSearchParams(window.location.search).get('song');
    const requestedIndex = requestedKey ? state.songs.findIndex(song => song.key === requestedKey) : -1;
    if (requestedIndex >= 0) {
      openPlayer(requestedIndex, { autoplay: false, updateHistory: false });
    } else {
      state.screen = 'home';
      render();
    }
  } catch (error) {
    state.screen = 'error';
    root.innerHTML = `
      <main class="state-screen">
        <div class="state-card">
          ${logoMarkup()}
          <h1>Live data did not load</h1>
          <p>${escapeHtml(error.message)}</p>
          <button class="primary-button" id="retry-load">Retry</button>
        </div>
      </main>`;
    document.getElementById('retry-load')?.addEventListener('click', loadSongs);
  }
}

function featuredSongs() {
  const featured = state.songs.filter(song => song.featured);
  return (featured.length ? featured : [...state.songs].sort((a, b) => b.plays - a.plays)).slice(0, 8);
}

function latestSongs() {
  return [...state.songs]
    .sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)))
    .slice(0, 12);
}

function filteredSongs() {
  const term = state.searchTerm.trim().toLowerCase();
  if (!term) return [];
  return state.songs.filter(song => [song.title, song.artist, song.genre, song.mood].some(value => clean(value).toLowerCase().includes(term))).slice(0, 20);
}

function songCard(song, index, variant = 'square') {
  const artwork = safeUrl(song.artwork, FALLBACK_ARTWORK);
  return `
    <button class="song-card song-card--${variant}" data-song-index="${index}" aria-label="Play ${escapeHtml(song.title)} by ${escapeHtml(song.artist)}">
      <span class="song-card__art" style="background-image:url('${escapeHtml(artwork)}')">
        <span class="song-card__play">${icon('play')}</span>
      </span>
      <span class="song-card__copy">
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist)}</span>
        <small>${escapeHtml(song.genre)}</small>
      </span>
    </button>`;
}

function topBar({ player = false } = {}) {
  return `
    <header class="topbar ${player ? 'topbar--player' : ''}">
      <button class="brand-button" id="home-button" aria-label="Stashbox Radio home">${player ? icon('back', 'back-icon') : ''}${logoMarkup()}</button>
      <div class="topbar__actions">
        <button class="icon-button" id="search-button" aria-label="Search">${icon('search')}</button>
        <button class="icon-button notification-button" id="notification-button" aria-label="Notifications">${icon('bell')}<span class="notification-dot"></span></button>
        <button class="login-pill" id="login-button">Log In</button>
      </div>
    </header>`;
}

function renderHome() {
  const featured = featuredSongs();
  const latest = latestSongs();
  const searchResults = filteredSongs();
  const lead = featured[0] || state.songs[0];
  const leadIndex = state.songs.indexOf(lead);

  root.innerHTML = `
    <main class="v2-home">
      ${topBar()}
      <section class="home-hero">
        <div class="home-hero__visual" style="background-image:url('${escapeHtml(safeUrl(lead.artwork, FALLBACK_ARTWORK))}')"></div>
        <div class="home-hero__shade"></div>
        <div class="home-hero__copy">
          <span class="eyebrow">Stashbox Radio V2</span>
          <h1>Pick a song.<br>Enter the experience.</h1>
          <p>Live music, artwork, stats, and playback from the DEV catalog.</p>
          <button class="hero-play" data-song-index="${leadIndex}">${icon('play')} Play ${escapeHtml(lead.title)}</button>
        </div>
      </section>

      <section class="search-drawer ${state.searchTerm ? 'is-open' : ''}" id="search-drawer">
        <label for="song-search">Search songs, artists, genres, or moods</label>
        <div class="search-field">${icon('search')}<input id="song-search" type="search" value="${escapeHtml(state.searchTerm)}" autocomplete="off" placeholder="Search Stashbox Radio"></div>
        <div class="search-results">
          ${state.searchTerm ? (searchResults.length ? searchResults.map(song => songCard(song, state.songs.indexOf(song), 'row')).join('') : '<p class="empty-search">No matching songs.</p>') : ''}
        </div>
      </section>

      <section class="home-section">
        <div class="section-heading"><div><span>Start here</span><h2>Featured songs</h2></div><small>${state.songs.length} live tracks</small></div>
        <div class="song-grid">${featured.map(song => songCard(song, state.songs.indexOf(song))).join('')}</div>
      </section>

      <section class="home-section home-section--latest">
        <div class="section-heading"><div><span>Fresh from the catalog</span><h2>Latest</h2></div></div>
        <div class="latest-list">${latest.map(song => songCard(song, state.songs.indexOf(song), 'row')).join('')}</div>
      </section>
    </main>
    ${modalMarkup()}
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  bindGlobalControls();
  bindSongButtons();

  const searchInput = document.getElementById('song-search');
  searchInput?.addEventListener('input', event => {
    state.searchTerm = event.target.value;
    renderHome();
    requestAnimationFrame(() => {
      const input = document.getElementById('song-search');
      input?.focus();
      input?.setSelectionRange(state.searchTerm.length, state.searchTerm.length);
    });
  });
}

function currentSong() {
  return state.songs[state.currentIndex] || null;
}

function renderPlayer() {
  const song = currentSong();
  if (!song) return;
  const liked = state.likedSongs.has(song.key);

  root.innerHTML = `
    <main class="v2-player" data-song-key="${escapeHtml(song.key)}">
      ${topBar({ player: true })}
      <section class="player-visual" id="player-visual" aria-label="Visual experience for ${escapeHtml(song.title)}">
        <div class="visual-backdrop" id="visual-backdrop"></div>
        <div class="visual-media" id="visual-media"></div>
        <div class="visual-overlay"></div>
        <div class="live-data-pill"><span></span> LIVE DEV DATA</div>
      </section>

      <aside class="action-rail" aria-label="Song actions">
        <button class="rail-button rail-button--accent" id="playlist-button" aria-label="Add to playlist">${icon('plus')}<span class="lock-badge">${icon('lock')}</span></button>
        <div class="brand-orb" aria-label="Stashbox visual experience"><span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span></div>
        <small class="orb-label">Stashbox</small>
        <button class="rail-button ${liked ? 'is-active' : ''}" id="like-button" aria-label="Like song">${icon('heart')}<strong id="like-count">${song.likes + (liked ? 1 : 0)}</strong></button>
        <button class="rail-button" id="share-button" aria-label="Share song">${icon('share')}<strong id="share-count">${song.shares}</strong></button>
      </aside>

      <section class="player-panel">
        <div class="player-meta">
          <span class="genre-pill">${escapeHtml(song.genre.toUpperCase())}</span>
          ${song.explicit ? '<span class="explicit-pill">EXPLICIT</span>' : ''}
          <h1>${escapeHtml(song.title)}</h1>
          <p>${escapeHtml(song.artist)}</p>
        </div>

        <div class="progress-block">
          <input class="progress-range" id="progress-range" type="range" min="0" max="1000" value="0" aria-label="Song progress">
          <div class="time-row"><span id="current-time">0:00</span><span id="duration-time">${formatTime(state.duration)}</span></div>
        </div>

        <div class="transport">
          <button class="transport-button" id="previous-button" aria-label="Previous song">${icon('previous')}</button>
          <button class="transport-button transport-button--play" id="play-button" aria-label="Play">${state.isPlaying ? icon('pause') : icon('play')}</button>
          <button class="transport-button" id="next-button" aria-label="Next song">${icon('next')}</button>
        </div>
      </section>
    </main>
    ${modalMarkup()}
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  bindGlobalControls();
  bindPlayerControls();
  renderCurrentVisual();
  updatePlayerTiming();
}

function modalMarkup() {
  return `
    <div class="account-modal ${state.modalOpen ? 'is-open' : ''}" id="account-modal" aria-hidden="${state.modalOpen ? 'false' : 'true'}">
      <button class="modal-scrim" id="modal-scrim" aria-label="Close"></button>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button class="modal-close" id="modal-close" aria-label="Close">${icon('close')}</button>
        <span class="modal-kicker">Keep your music</span>
        <h2 id="modal-title">Log in to build your queue</h2>
        <p>Create playlists, save favorites, and carry your listening history across devices.</p>
        <button class="primary-button" id="modal-login">Log In</button>
        <button class="secondary-button" id="modal-create">Create Account</button>
      </section>
    </div>`;
}

function bindGlobalControls() {
  document.getElementById('home-button')?.addEventListener('click', goHome);
  document.getElementById('login-button')?.addEventListener('click', openAccountModal);
  document.getElementById('notification-button')?.addEventListener('click', () => showToast('Notification stream preview. Account read-state comes with login.'));
  document.getElementById('search-button')?.addEventListener('click', () => {
    if (state.screen === 'player') {
      goHome();
      state.searchTerm = '';
      renderHome();
    }
    requestAnimationFrame(() => document.getElementById('song-search')?.focus());
  });
  document.getElementById('modal-close')?.addEventListener('click', closeAccountModal);
  document.getElementById('modal-scrim')?.addEventListener('click', closeAccountModal);
  document.getElementById('modal-login')?.addEventListener('click', () => showToast('Login screen is the next V2 account step.'));
  document.getElementById('modal-create')?.addEventListener('click', () => showToast('Account creation screen is the next V2 account step.'));
}

function bindSongButtons() {
  document.querySelectorAll('[data-song-index]').forEach(button => {
    button.addEventListener('click', () => openPlayer(Number(button.dataset.songIndex), { autoplay: true }));
  });
}

function bindPlayerControls() {
  document.getElementById('play-button')?.addEventListener('click', togglePlay);
  document.getElementById('previous-button')?.addEventListener('click', () => moveTrack(-1));
  document.getElementById('next-button')?.addEventListener('click', () => moveTrack(1));
  document.getElementById('playlist-button')?.addEventListener('click', openAccountModal);
  document.getElementById('like-button')?.addEventListener('click', toggleLike);
  document.getElementById('share-button')?.addEventListener('click', shareCurrentSong);
  document.getElementById('progress-range')?.addEventListener('input', event => {
    if (!state.duration) return;
    const ratio = Number(event.target.value) / 1000;
    audio.currentTime = Math.max(0, Math.min(state.duration, state.duration * ratio));
  });
}

function render() {
  if (state.screen === 'loading') {
    root.innerHTML = `
      <main class="state-screen">
        <div class="loading-mark"><div class="loading-orb"></div>${logoMarkup()}<p>Loading live DEV catalog</p></div>
      </main>`;
    return;
  }
  if (state.screen === 'home') renderHome();
  if (state.screen === 'player') renderPlayer();
}

function openPlayer(index, { autoplay = true, updateHistory = true } = {}) {
  const song = state.songs[index];
  if (!song) return;

  stopQualifiedClock();
  clearVisualTimer();
  state.currentIndex = index;
  state.screen = 'player';
  state.currentTime = 0;
  state.duration = 0;
  state.qualifiedSeconds = 0;
  state.qualifiedTracked = false;
  state.visualIndex = 0;
  state.isPlaying = false;
  renderPlayer();

  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set('song', song.key);
    history.pushState({ song: song.key }, '', url);
  }

  if (song.audioUrl) {
    audio.src = song.audioUrl;
    audio.load();
    if (autoplay) playCurrent();
  } else if (song.videoLink) {
    showToast('This is a video-only track. Opening the video.');
    window.open(song.videoLink, '_blank', 'noopener,noreferrer');
  }
}

function goHome() {
  if (state.screen === 'home') return;
  audio.pause();
  stopQualifiedClock();
  clearVisualTimer();
  state.isPlaying = false;
  state.screen = 'home';
  const url = new URL(window.location.href);
  url.searchParams.delete('song');
  history.pushState({}, '', url);
  renderHome();
}

async function playCurrent() {
  const song = currentSong();
  if (!song?.audioUrl) return;
  try {
    await audio.play();
    state.isPlaying = true;
    startQualifiedClock();
    updatePlayButton();
  } catch (_) {
    state.isPlaying = false;
    updatePlayButton();
    showToast('Tap play to start audio.');
  }
}

function pauseCurrent() {
  audio.pause();
  state.isPlaying = false;
  stopQualifiedClock();
  updatePlayButton();
}

function togglePlay() {
  state.isPlaying ? pauseCurrent() : playCurrent();
}

function moveTrack(direction) {
  if (!state.songs.length) return;
  let nextIndex = state.currentIndex;
  for (let attempt = 0; attempt < state.songs.length; attempt += 1) {
    nextIndex = (nextIndex + direction + state.songs.length) % state.songs.length;
    if (state.songs[nextIndex]?.audioUrl) break;
  }
  openPlayer(nextIndex, { autoplay: true });
}

function updatePlayButton() {
  const button = document.getElementById('play-button');
  if (!button) return;
  button.innerHTML = state.isPlaying ? icon('pause') : icon('play');
  button.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
}

function startQualifiedClock() {
  if (state.qualifiedTracked || state.qualifiedInterval) return;
  state.qualifiedInterval = window.setInterval(() => {
    if (audio.paused || audio.ended) return;
    state.qualifiedSeconds += 1;
    if (state.qualifiedSeconds >= QUALIFIED_PLAY_SECONDS && !state.qualifiedTracked) {
      state.qualifiedTracked = true;
      stopQualifiedClock();
      sendTracking(currentSong(), 'play', { seconds_listened: state.qualifiedSeconds });
    }
  }, 1000);
}

function stopQualifiedClock() {
  if (state.qualifiedInterval) window.clearInterval(state.qualifiedInterval);
  state.qualifiedInterval = null;
}

function updatePlayerTiming() {
  const progress = document.getElementById('progress-range');
  const current = document.getElementById('current-time');
  const duration = document.getElementById('duration-time');
  if (progress) progress.value = state.duration ? String(Math.round((state.currentTime / state.duration) * 1000)) : '0';
  if (current) current.textContent = formatTime(state.currentTime);
  if (duration) duration.textContent = formatTime(state.duration);
}

function clearVisualTimer() {
  if (state.visualTimer) window.clearTimeout(state.visualTimer);
  state.visualTimer = null;
}

function renderCurrentVisual() {
  clearVisualTimer();
  const song = currentSong();
  const container = document.getElementById('visual-media');
  const backdrop = document.getElementById('visual-backdrop');
  if (!song || !container || !backdrop) return;
  const visuals = song.visuals.length ? song.visuals : [{ type: 'image', url: song.artwork, duration: 8 }];
  const visual = visuals[state.visualIndex % visuals.length];
  backdrop.style.backgroundImage = `url('${safeUrl(visual.url, song.artwork).replaceAll("'", '%27')}')`;

  if (visual.type === 'clip') {
    container.innerHTML = `<video src="${escapeHtml(visual.url)}" autoplay muted playsinline preload="auto"></video>`;
    const video = container.querySelector('video');
    video?.addEventListener('ended', advanceVisual, { once: true });
    video?.addEventListener('error', advanceVisual, { once: true });
    state.visualTimer = window.setTimeout(advanceVisual, Math.max(5000, visual.duration * 1000));
  } else {
    container.innerHTML = `<img src="${escapeHtml(visual.url)}" alt="${escapeHtml(song.title)} visual">`;
    state.visualTimer = window.setTimeout(advanceVisual, Math.max(3000, visual.duration * 1000));
  }
}

function advanceVisual() {
  const song = currentSong();
  if (!song?.visuals?.length) return;
  state.visualIndex = (state.visualIndex + 1) % song.visuals.length;
  renderCurrentVisual();
}

function toggleLike() {
  const song = currentSong();
  if (!song) return;
  const wasLiked = state.likedSongs.has(song.key);
  if (wasLiked) state.likedSongs.delete(song.key);
  else state.likedSongs.add(song.key);
  saveLikedSongs();

  const button = document.getElementById('like-button');
  const count = document.getElementById('like-count');
  button?.classList.toggle('is-active', !wasLiked);
  if (count) count.textContent = String(song.likes + (!wasLiked ? 1 : 0));
  if (!wasLiked) sendTracking(song, 'like');
}

async function shareCurrentSong() {
  const song = currentSong();
  if (!song) return;
  const url = new URL(window.location.href);
  url.searchParams.set('song', song.key);
  const shareData = { title: `${song.title} by ${song.artist}`, text: `Listen to ${song.title} on Stashbox Radio`, url: url.toString() };

  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(url.toString());
      showToast('Song link copied.');
    }
    song.shares += 1;
    const count = document.getElementById('share-count');
    if (count) count.textContent = String(song.shares);
    sendTracking(song, 'share');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Unable to share this song.');
  }
}

function openAccountModal() {
  state.modalOpen = true;
  document.getElementById('account-modal')?.classList.add('is-open');
  document.getElementById('account-modal')?.setAttribute('aria-hidden', 'false');
}

function closeAccountModal() {
  state.modalOpen = false;
  document.getElementById('account-modal')?.classList.remove('is-open');
  document.getElementById('account-modal')?.setAttribute('aria-hidden', 'true');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  updatePlayerTiming();
});

audio.addEventListener('durationchange', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : state.duration;
  updatePlayerTiming();
});

audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime || 0;
  state.duration = Number.isFinite(audio.duration) ? audio.duration : state.duration;
  updatePlayerTiming();
});

audio.addEventListener('play', () => {
  state.isPlaying = true;
  startQualifiedClock();
  updatePlayButton();
});

audio.addEventListener('pause', () => {
  if (!audio.ended) {
    state.isPlaying = false;
    stopQualifiedClock();
    updatePlayButton();
  }
});

audio.addEventListener('ended', () => {
  state.isPlaying = false;
  stopQualifiedClock();
  sendTracking(currentSong(), 'full_play', { seconds_listened: Math.round(state.duration || state.currentTime || 0) });
  moveTrack(1);
});

audio.addEventListener('error', () => {
  state.isPlaying = false;
  stopQualifiedClock();
  updatePlayButton();
  showToast('This audio file did not load. Try the next song.');
});

window.addEventListener('popstate', () => {
  const key = new URLSearchParams(window.location.search).get('song');
  if (!key) {
    state.screen = 'home';
    audio.pause();
    renderHome();
    return;
  }
  const index = state.songs.findIndex(song => song.key === key);
  if (index >= 0 && index !== state.currentIndex) openPlayer(index, { autoplay: false, updateHistory: false });
});

loadSongs();
