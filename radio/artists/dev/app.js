(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const QUEUE_STORAGE_KEY = 'stashbox_radio_dev_artist_queue_handoff';
  const VIEW_STORAGE_KEY = 'stashbox_radio_dev_artist_track_view';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const root = document.getElementById('app');
  const state = {
    artist: null,
    songs: [],
    topVisible: 5,
    sort: 'most_played',
    view: localStorage.getItem(VIEW_STORAGE_KEY) === 'artwork' ? 'artwork' : 'list',
    catalogUnavailable: false
  };

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function authHeaders(json = false) {
    const token = tokens();
    const result = {};
    if (token.accessToken) result.Authorization = `Bearer ${token.accessToken}`;
    if (token.idToken) result['X-Cognito-Id-Token'] = token.idToken;
    if (json) result['Content-Type'] = 'application/json';
    return result;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  function normalizeArtistName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function playCount(song) {
    return number(song?.total_plays ?? song?.play_count ?? song?.plays);
  }

  function shareCount(song) {
    return number(song?.total_shares ?? song?.share_count ?? song?.shares);
  }

  function listeningSeconds(song) {
    return number(song?.total_seconds_played ?? song?.listening_seconds ?? song?.total_listening_seconds);
  }

  function compactCount(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value));
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; }
    catch (_) { return { error: text || `HTTP ${response.status}` }; }
  }

  async function publicApi(url) {
    let response;
    try {
      response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    } catch (_) {
      throw new Error('The public Stashbox Radio API could not be reached.');
    }
    const body = await readJsonResponse(response);
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  async function authenticatedApi(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        ...options,
        headers: {
          ...authHeaders(Boolean(options.body)),
          ...(options.headers || {})
        }
      });
    } catch (_) {
      throw new Error('The signed-in artist request could not reach the DEV API.');
    }
    const body = await readJsonResponse(response);
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function songArtwork(song) {
    return song?.song_artwork_url || song?.resolved_artwork_url || song?.artwork_url || song?.cover_art_url || FALLBACK;
  }

  function songTitle(song) {
    return song?.display_title || song?.song_name || song?.song_key || 'Untitled Song';
  }

  function songsForArtist(songs, artistName) {
    const target = normalizeArtistName(artistName);
    return (Array.isArray(songs) ? songs : []).filter(song => normalizeArtistName(song.artist) === target);
  }

  function icon(name) {
    const paths = {
      plays: '<path d="M8 5v14l11-7z"/>',
      shares: '<path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .35 1.4L8.91 9.13A3 3 0 0 0 4 11.5a3 3 0 0 0 4.91 2.37l6.44 3.73A3 3 0 0 0 15 19a3 3 0 1 0 1-2.24l-6.43-3.72c.06-.34.06-.7 0-1.04L16 8.28c.53.45 1.22.72 2 .72z"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18"/>',
      spotify: '<circle cx="12" cy="12" r="9"/><path d="M7 9.2c3.7-1 7.5-.7 10.4.8M7.8 12.3c3-.8 6.2-.5 8.8.7M8.6 15.2c2.2-.5 4.6-.3 6.6.6"/>',
      apple: '<path d="M14.4 5.3c.8-1 1.3-2.2 1.2-3.3-1.2.1-2.5.8-3.3 1.8-.7.8-1.3 2.1-1.1 3.2 1.2.1 2.4-.6 3.2-1.7zM18.7 13.3c0-3 2.5-4.5 2.6-4.6-1.4-2.1-3.7-2.3-4.5-2.3-1.9-.2-3.7 1.1-4.7 1.1s-2.5-1.1-4.1-1c-2.1 0-4.1 1.2-5.2 3.1-2.2 3.8-.6 9.5 1.6 12.6 1.1 1.5 2.3 3.1 4 3 1.6-.1 2.2-1 4.1-1s2.5 1 4.2 1c1.7 0 2.8-1.5 3.8-3 1.2-1.7 1.7-3.4 1.7-3.5-.1 0-3.5-1.3-3.5-5.4z"/>',
      youtube: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9l6 3-6 3z"/>',
      instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
      x: '<path d="M5 4l14 16M19 4L5 20"/>',
      facebook: '<path d="M14 8h4V3h-4c-4 0-6 2.5-6 6v3H5v5h3v7h5v-7h4l1-5h-5V9c0-.7.3-1 1-1z"/>',
      merch: '<path d="M6 7h12l1 14H5L6 7zM9 7a3 3 0 0 1 6 0"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.globe}</svg>`;
  }

  function socialLinks(artist) {
    return [
      ['Website', artist.website_url, 'globe'],
      ['Spotify', artist.spotify_url, 'spotify'],
      ['Apple Music', artist.apple_music_url, 'apple'],
      ['YouTube', artist.youtube_url, 'youtube'],
      ['Instagram', artist.instagram_url, 'instagram'],
      ['X', artist.x_url, 'x'],
      ['Facebook', artist.facebook_url, 'facebook'],
      ['Merch', artist.merch_url, 'merch']
    ].filter(([, url]) => url);
  }

  function trackStats(song) {
    return `
      <span class="track-stat" title="${playCount(song).toLocaleString()} plays">${icon('plays')} ${compactCount(playCount(song))}</span>
      <span class="track-stat" title="${shareCount(song).toLocaleString()} shares">${icon('shares')} ${compactCount(shareCount(song))}</span>`;
  }

  function topSortedSongs() {
    return [...state.songs].sort((a, b) =>
      listeningSeconds(b) - listeningSeconds(a)
      || playCount(b) - playCount(a)
      || shareCount(b) - shareCount(a)
      || songTitle(a).localeCompare(songTitle(b))
    );
  }

  function sortedAllSongs() {
    const songs = [...state.songs];
    if (state.sort === 'most_shared') {
      return songs.sort((a, b) => shareCount(b) - shareCount(a) || playCount(b) - playCount(a) || songTitle(a).localeCompare(songTitle(b)));
    }
    if (state.sort === 'title') {
      return songs.sort((a, b) => songTitle(a).localeCompare(songTitle(b)));
    }
    if (state.sort === 'newest') {
      return songs.sort((a, b) => new Date(b.created_at || b.release_date || 0) - new Date(a.created_at || a.release_date || 0));
    }
    return songs.sort((a, b) => playCount(b) - playCount(a) || listeningSeconds(b) - listeningSeconds(a) || songTitle(a).localeCompare(songTitle(b)));
  }

  function queueItems(songs) {
    return songs.map(song => ({
      song_key: song.song_key,
      display_title: songTitle(song),
      artist: song.artist || state.artist?.name || '',
      genre: song.genre || '',
      artwork_url: songArtwork(song)
    }));
  }

  function startQueue(songs, mode = 'ordered', startIndex = 0) {
    if (!songs.length || !state.artist) return;
    const normalizedStart = Math.max(0, Math.min(startIndex, songs.length - 1));
    const rotated = mode === 'shuffle'
      ? songs
      : [...songs.slice(normalizedStart), ...songs.slice(0, normalizedStart)];
    sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({
      playlistId: `artist:${state.artist.artist_key}`,
      playlistName: `${state.artist.name} · All Tracks`,
      mode,
      items: queueItems(rotated),
      createdAt: Date.now()
    }));
    location.href = '/radio/dev/?artist_queue=1';
  }

  function renderTopTracks() {
    const container = document.getElementById('topTracksList');
    if (!container) return;
    const ranking = topSortedSongs();
    const visible = ranking.slice(0, state.topVisible);
    container.innerHTML = visible.map((song, index) => `
      <article class="top-track" data-song-key="${esc(song.song_key)}">
        <span class="rank">${index + 1}</span>
        <img src="${esc(songArtwork(song))}" alt="" loading="lazy" onerror="this.src='${FALLBACK}'">
        <div class="track-copy">
          <strong>${esc(songTitle(song))}</strong>
          <span>${esc(song.album_name || song.genre || state.artist.name)}</span>
        </div>
        <div class="track-stats">${trackStats(song)}</div>
        <button class="track-play-button" type="button" data-play-song="${esc(song.song_key)}"><span aria-hidden="true">▶</span> Play</button>
      </article>`).join('') || '<p class="empty-state">No public songs are available yet.</p>';
    const more = document.getElementById('topTracksMore');
    if (more) {
      more.hidden = state.topVisible >= ranking.length;
      more.textContent = `See ${Math.min(5, Math.max(0, ranking.length - state.topVisible))} More`;
    }
  }

  function renderAllTracks() {
    const container = document.getElementById('allTracksList');
    if (!container) return;
    const songs = sortedAllSongs();
    container.className = `all-tracks ${state.view === 'artwork' ? 'artwork-view' : 'list-view'}`;
    container.innerHTML = songs.map((song, index) => state.view === 'artwork' ? `
      <article class="artwork-track" data-song-key="${esc(song.song_key)}">
        <div class="artwork-frame">
          <img src="${esc(songArtwork(song))}" alt="${esc(songTitle(song))} artwork" loading="lazy" onerror="this.src='${FALLBACK}'">
          <button class="artwork-play" type="button" data-play-index="${index}" aria-label="Play ${esc(songTitle(song))}">▶</button>
        </div>
        <div class="artwork-copy">
          <strong>${esc(songTitle(song))}</strong>
          <span>${esc(song.album_name || song.genre || state.artist.name)}</span>
          <div class="track-stats">${trackStats(song)}</div>
        </div>
      </article>` : `
      <article class="list-track" data-song-key="${esc(song.song_key)}">
        <img src="${esc(songArtwork(song))}" alt="" loading="lazy" onerror="this.src='${FALLBACK}'">
        <div class="track-copy">
          <strong>${esc(songTitle(song))}</strong>
          <span>${esc(song.album_name || song.genre || state.artist.name)}</span>
        </div>
        <div class="track-stats">${trackStats(song)}</div>
        <button class="track-play-button compact" type="button" data-play-index="${index}"><span aria-hidden="true">▶</span> Play</button>
      </article>`).join('') || '<p class="empty-state">No public songs are available yet.</p>';
    document.querySelectorAll('[data-track-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.trackView === state.view);
      button.setAttribute('aria-pressed', String(button.dataset.trackView === state.view));
    });
  }

  function render() {
    const artist = state.artist;
    document.title = `${artist.name} · Stashbox Radio`;
    const social = socialLinks(artist);
    root.innerHTML = `
      <section class="hero">
        <div class="banner" style="background-image:url('${esc(artist.banner_image_url || artist.profile_image_url || '')}')"></div>
        ${social.length ? `<div class="social-links-overlay" aria-label="${esc(artist.name)} links">${social.map(([label, url, iconName]) => `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(label)}" aria-label="${esc(label)}">${icon(iconName)}</a>`).join('')}</div>` : ''}
        <div class="identity">
          <img class="avatar" src="${esc(artist.profile_image_url || FALLBACK)}" alt="${esc(artist.name)}" onerror="this.src='${FALLBACK}'">
          <div class="identity-copy">
            <h1>${esc(artist.name)} ${artist.verified ? '<span class="verified">✓ Verified</span>' : ''}</h1>
            ${artist.location ? `<p class="location">${esc(artist.location)}</p>` : ''}
            <p class="followers"><strong id="followerCount">${Number(artist.follower_count || 0).toLocaleString()}</strong> followers · ${state.songs.length.toLocaleString()} songs</p>
          </div>
          <div class="hero-actions">
            <button id="followButton" class="hero-button ${artist.is_following ? 'secondary' : 'primary'}" type="button">${artist.is_following ? 'Following' : 'Follow'}</button>
            <a class="hero-button secondary" href="/radio/dev/?artist=${encodeURIComponent(artist.artist_key)}">Open Radio</a>
          </div>
        </div>
      </section>

      <section class="music-page">
        <section class="music-section top-tracks-section">
          <header class="section-heading">
            <div>
              <p class="section-kicker">Most Listened</p>
              <h2>Top Tracks</h2>
            </div>
          </header>
          <div id="topTracksList" class="top-tracks-list"></div>
          <button id="topTracksMore" class="see-more-button" type="button">See 5 More</button>
        </section>

        <section class="music-section all-tracks-section">
          <header class="all-tracks-header">
            <div>
              <p class="section-kicker">Complete Catalog</p>
              <h2>All Tracks</h2>
            </div>
            <div class="catalog-controls">
              <button id="playAll" class="catalog-button primary" type="button"><span aria-hidden="true">▶</span> Play All</button>
              <button id="shuffleAll" class="catalog-button" type="button"><span aria-hidden="true">⇄</span> Shuffle All</button>
              <label class="sort-control"><span>Sort</span><select id="trackSort">
                <option value="most_played">Most Played</option>
                <option value="most_shared">Most Shared</option>
                <option value="newest">Newest</option>
                <option value="title">Title A–Z</option>
              </select></label>
              <div class="view-toggle" role="group" aria-label="Track presentation">
                <button type="button" data-track-view="artwork" aria-label="Artwork view">▦ <span>Artwork</span></button>
                <button type="button" data-track-view="list" aria-label="List view">☷ <span>List</span></button>
              </div>
            </div>
          </header>
          ${state.catalogUnavailable ? '<p class="catalog-warning">The artist profile loaded, but song statistics are temporarily unavailable.</p>' : ''}
          <div id="allTracksList"></div>
        </section>
      </section>`;

    document.getElementById('trackSort').value = state.sort;
    renderTopTracks();
    renderAllTracks();
    bindInteractions();
  }

  function bindInteractions() {
    document.getElementById('followButton').addEventListener('click', toggleFollow);
    document.getElementById('topTracksMore').addEventListener('click', () => {
      state.topVisible += 5;
      renderTopTracks();
    });
    document.getElementById('playAll').addEventListener('click', () => startQueue(sortedAllSongs(), 'ordered'));
    document.getElementById('shuffleAll').addEventListener('click', () => startQueue(sortedAllSongs(), 'shuffle'));
    document.getElementById('trackSort').addEventListener('change', event => {
      state.sort = event.target.value;
      renderAllTracks();
    });
    document.querySelector('.view-toggle').addEventListener('click', event => {
      const button = event.target.closest('[data-track-view]');
      if (!button) return;
      state.view = button.dataset.trackView === 'artwork' ? 'artwork' : 'list';
      localStorage.setItem(VIEW_STORAGE_KEY, state.view);
      renderAllTracks();
    });
    document.getElementById('topTracksList').addEventListener('click', event => {
      const button = event.target.closest('[data-play-song]');
      if (!button) return;
      const songs = sortedAllSongs();
      const index = songs.findIndex(song => song.song_key === button.dataset.playSong);
      startQueue(songs, 'ordered', Math.max(0, index));
    });
    document.getElementById('allTracksList').addEventListener('click', event => {
      const button = event.target.closest('[data-play-index]');
      if (!button) return;
      startQueue(sortedAllSongs(), 'ordered', Number(button.dataset.playIndex) || 0);
    });
  }

  async function toggleFollow() {
    if (!tokens().accessToken) {
      sessionStorage.setItem('stashbox_radio_dev_pending_artist_follow', state.artist.artist_key);
      location.href = `/radio/dev/?follow_artist=${encodeURIComponent(state.artist.artist_key)}`;
      return;
    }
    const shouldFollow = !state.artist.is_following;
    const button = document.getElementById('followButton');
    button.disabled = true;
    button.textContent = shouldFollow ? 'Following…' : 'Updating…';
    try {
      const method = shouldFollow ? 'POST' : 'DELETE';
      const data = await authenticatedApi(`${API_ROOT}/radio/me/follows/${encodeURIComponent(state.artist.artist_key)}`, {
        method,
        body: method === 'POST' ? JSON.stringify({ notifications_enabled: true }) : undefined
      });
      state.artist = data.artist;
      button.textContent = state.artist.is_following ? 'Following' : 'Follow';
      button.classList.toggle('primary', !state.artist.is_following);
      button.classList.toggle('secondary', state.artist.is_following);
      document.getElementById('followerCount').textContent = Number(state.artist.follower_count || 0).toLocaleString();
    } catch (error) {
      button.textContent = shouldFollow ? 'Follow Failed' : 'Update Failed';
      button.title = error.message;
    } finally {
      button.disabled = false;
    }
  }

  Promise.allSettled([
    publicApi(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`),
    publicApi(`${API_ROOT}/radio/songs`)
  ]).then(([artistResult, songResult]) => {
    if (artistResult.status !== 'fulfilled') throw artistResult.reason;
    state.artist = artistResult.value.artist;
    state.songs = songResult.status === 'fulfilled'
      ? songsForArtist(songResult.value.songs || [], state.artist.name)
      : [];
    state.catalogUnavailable = songResult.status !== 'fulfilled';
    render();
  }).catch(error => {
    root.innerHTML = `<div class="error">${esc(error.message || 'Artist profile could not be loaded.')}</div>`;
  });
})();
