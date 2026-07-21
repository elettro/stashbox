(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const root = document.getElementById('app');
  let artist = null;

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
    return song.song_artwork_url || song.resolved_artwork_url || song.artwork_url || song.cover_art_url || FALLBACK;
  }

  function songsForArtist(songs, artistName) {
    const target = normalizeArtistName(artistName);
    return (Array.isArray(songs) ? songs : []).filter(song => normalizeArtistName(song.artist) === target);
  }

  function render(data) {
    artist = data.artist;
    const songs = songsForArtist(data.songs, artist.name);
    document.title = `${artist.name} · Stashbox Radio`;
    const links = [
      ['Website', artist.website_url], ['Spotify', artist.spotify_url], ['Apple Music', artist.apple_music_url],
      ['YouTube', artist.youtube_url], ['Instagram', artist.instagram_url], ['X / Twitter', artist.x_url],
      ['Facebook', artist.facebook_url], ['Merch', artist.merch_url]
    ].filter(([, url]) => url);

    const musicContent = data.catalogUnavailable
      ? '<p class="bio">The artist profile loaded, but the public song catalog is temporarily unavailable.</p>'
      : songs.map(song => `
          <article class="song" data-song="${esc(song.song_key)}">
            <img src="${esc(songArtwork(song))}" alt="" onerror="this.src='${FALLBACK}'">
            <div><strong>${esc(song.display_title || song.song_name || song.song_key)}</strong><span>${esc(song.artist || artist.name)}${song.album_name ? ` · ${esc(song.album_name)}` : ''}</span></div>
            <span class="play">▶ Play</span>
          </article>`).join('') || '<p class="bio">No public songs in Song CMS yet.</p>';

    root.innerHTML = `
      <section class="hero">
        <div class="banner" style="background-image:url('${esc(artist.banner_image_url || artist.profile_image_url || '')}')"></div>
        <div class="identity">
          <img class="avatar" src="${esc(artist.profile_image_url || FALLBACK)}" alt="${esc(artist.name)}" onerror="this.src='${FALLBACK}'">
          <div>
            <h1>${esc(artist.name)} ${artist.verified ? '<span class="verified">✓ Verified</span>' : ''}</h1>
            <p class="location">${esc(artist.location || '')}</p>
            <p class="followers"><strong id="followerCount">${Number(artist.follower_count || 0).toLocaleString()}</strong> followers · ${songs.length.toLocaleString()} songs</p>
          </div>
          <div class="actions">
            <button id="followButton" class="button ${artist.is_following ? 'following' : ''}" type="button">${artist.is_following ? 'Following' : 'Follow'}</button>
            <a class="button following" href="/radio/dev/?artist=${encodeURIComponent(artist.artist_key)}">Open Radio</a>
          </div>
        </div>
      </section>
      <div class="content">
        <section class="card">
          <h2>Music</h2>
          <div class="song-list">${musicContent}</div>
        </section>
        <aside class="card">
          <h2>About</h2>
          <p class="bio">${esc(artist.bio || 'Artist biography coming soon.')}</p>
          <div class="links">${links.map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`).join('')}</div>
        </aside>
      </div>`;

    document.getElementById('followButton').addEventListener('click', toggleFollow);
    root.querySelectorAll('[data-song]').forEach(row => row.addEventListener('click', () => {
      location.href = `/radio/dev/?song=${encodeURIComponent(row.dataset.song)}`;
    }));
  }

  async function toggleFollow() {
    if (!tokens().accessToken) {
      sessionStorage.setItem('stashbox_radio_dev_pending_artist_follow', artist.artist_key);
      location.href = `/radio/dev/?follow_artist=${encodeURIComponent(artist.artist_key)}`;
      return;
    }
    const method = artist.is_following ? 'DELETE' : 'POST';
    const data = await authenticatedApi(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artist.artist_key)}`, {
      method,
      body: method === 'POST' ? JSON.stringify({ notifications_enabled: true }) : undefined
    });
    artist = data.artist;
    const button = document.getElementById('followButton');
    button.textContent = artist.is_following ? 'Following' : 'Follow';
    button.classList.toggle('following', artist.is_following);
    document.getElementById('followerCount').textContent = Number(artist.follower_count || 0).toLocaleString();
  }

  Promise.allSettled([
    publicApi(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`),
    publicApi(`${API_ROOT}/radio/songs`)
  ]).then(([artistResult, songResult]) => {
    if (artistResult.status !== 'fulfilled') throw artistResult.reason;
    render({
      artist: artistResult.value.artist,
      songs: songResult.status === 'fulfilled' ? (songResult.value.songs || []) : [],
      catalogUnavailable: songResult.status !== 'fulfilled'
    });
  }).catch(error => {
    root.innerHTML = `<div class="error">${esc(error.message || 'Artist profile could not be loaded.')}</div>`;
  });
})();
