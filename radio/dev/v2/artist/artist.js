(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  const PENDING_FOLLOW_KEY = 'stashbox_radio_dev_pending_artist_follow';
  const SHOP_URL = 'https://stashbox.ai/products.json?limit=250';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const app = document.getElementById('artistApp');
  if (!app) return;

  const state = {
    artist: null,
    songs: [],
    events: [],
    activeTab: 'overview',
    shopProducts: [],
    shopLoaded: false,
    shopLoading: false,
    followingBusy: false,
    pendingFollowAfterLogin: false
  };

  const icon = {
    back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
    radio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    ticket: '<svg viewBox="0 0 24 24"><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M12 7v12"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13M9 9l10-2"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 14a7 7 0 0 1 5 7"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2Z"/></svg>'
  };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value));
  const dateValue = song => new Date(song.release_date || song.created_at || song.updated_at || 0).getTime() || 0;
  const songTitle = song => clean(song.display_title || song.song_name || song.title || song.song_key || 'Untitled Song');
  const songArt = song => clean(song.resolved_artwork_url || song.song_artwork_url || song.artwork_url || song.cover_art_url || song.image_url) || FALLBACK;
  const songPlays = song => number(song.total_plays ?? song.plays ?? song.play_count);
  const songLikes = song => number(song.total_likes ?? song.likes ?? song.like_count);
  const songShares = song => number(song.total_shares ?? song.shares ?? song.share_count);
  const videoUrl = song => clean(song.video_link || song.video_url || song.videoUrl);

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function authHeaders(json = false) {
    const tokens = readTokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
    };
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', ...options });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  async function optionalEvents() {
    try {
      const body = await api(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}/events`);
      return Array.isArray(body.events) ? body.events : [];
    } catch (_) {
      return [];
    }
  }

  function artistSongs(rows, artist) {
    const targetName = normalize(artist.name);
    const targetKey = normalize(artist.artist_key || artist.slug);
    return (Array.isArray(rows) ? rows : []).filter(song => {
      const songArtist = normalize(song.artist || song.artist_name);
      const songArtistKey = normalize(song.artist_key || song.primary_artist_key || song.artist_slug);
      return songArtist === targetName || (targetKey && songArtistKey === targetKey);
    });
  }

  function normalizeEvents(artist, fetched) {
    const embedded = [artist.events, artist.upcoming_events, artist.event_listings].find(Array.isArray) || [];
    const seen = new Set();
    return [...embedded, ...fetched]
      .map((event, index) => ({
        id: clean(event.id || event.event_id || `${index}-${event.start_at || event.date || event.title || ''}`),
        title: clean(event.title || event.name || event.event_name || artist.name),
        start: clean(event.start_at || event.start_date || event.date || event.datetime),
        venue: clean(event.venue || event.venue_name),
        city: clean(event.city || event.location || event.market),
        region: clean(event.region || event.state || event.country),
        ticketUrl: clean(event.ticket_url || event.tickets_url || event.buy_url || event.url),
        soldOut: Boolean(event.sold_out || event.status === 'sold_out')
      }))
      .filter(event => {
        const key = `${event.start}|${event.venue}|${event.city}|${event.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return !event.start || new Date(event.start).getTime() >= Date.now() - 86400000;
      })
      .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
  }

  function genreSummary() {
    const counts = new Map();
    state.songs.forEach(song => {
      const genre = clean(song.genre || song.primary_genre || 'Other');
      counts.set(genre, (counts.get(genre) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function albumGroups() {
    const groups = new Map();
    state.songs.forEach(song => {
      const album = clean(song.album_name || song.release_title);
      if (!album) return;
      if (!groups.has(album)) groups.set(album, []);
      groups.get(album).push(song);
    });
    return [...groups.entries()]
      .map(([name, songs]) => ({ name, songs: songs.sort((a, b) => dateValue(b) - dateValue(a)), date: Math.max(...songs.map(dateValue)) }))
      .sort((a, b) => b.date - a.date);
  }

  function sortedSongs(mode = 'plays') {
    const songs = [...state.songs];
    if (mode === 'latest') return songs.sort((a, b) => dateValue(b) - dateValue(a) || songTitle(a).localeCompare(songTitle(b)));
    if (mode === 'likes') return songs.sort((a, b) => songLikes(b) - songLikes(a) || songPlays(b) - songPlays(a));
    return songs.sort((a, b) => songPlays(b) - songPlays(a) || songLikes(b) - songLikes(a) || songShares(b) - songShares(a));
  }

  function generatedPlaylists() {
    const topGenres = genreSummary();
    const plays = sortedSongs('plays');
    const latest = sortedSongs('latest');
    const playlists = [
      { name: `${state.artist.name} Essentials`, subtitle: `${Math.min(25, plays.length)} songs`, songs: plays.slice(0, 25) },
      { name: 'Latest Releases', subtitle: `${Math.min(20, latest.length)} songs`, songs: latest.slice(0, 20) }
    ];
    topGenres.slice(0, 2).forEach(([genre]) => {
      const songs = state.songs.filter(song => clean(song.genre || song.primary_genre) === genre).sort((a, b) => songPlays(b) - songPlays(a));
      if (songs.length >= 2) playlists.push({ name: `${genre} Collection`, subtitle: `${songs.length} songs`, songs });
    });
    const deepCuts = plays.slice(Math.ceil(plays.length / 2)).reverse();
    if (deepCuts.length >= 2) playlists.push({ name: 'Deep Cuts', subtitle: `${deepCuts.length} songs`, songs: deepCuts });
    return playlists.slice(0, 4);
  }

  function profileStats() {
    return {
      songs: state.songs.length,
      followers: number(state.artist.follower_count),
      plays: state.songs.reduce((sum, song) => sum + songPlays(song), 0),
      shares: state.songs.reduce((sum, song) => sum + songShares(song), 0)
    };
  }

  function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', options).format(date) : '';
  }

  function releaseYear(song) {
    const date = dateValue(song);
    return date ? new Date(date).getFullYear() : '';
  }

  function image(url, alt = '') {
    return `<img src="${esc(url || FALLBACK)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  }

  function socialLinks() {
    const artist = state.artist;
    return [
      ['Website', artist.website_url],
      ['Spotify', artist.spotify_url],
      ['Apple Music', artist.apple_music_url],
      ['YouTube', artist.youtube_url],
      ['Instagram', artist.instagram_url],
      ['X', artist.x_url],
      ['Facebook', artist.facebook_url],
      ['Merch', artist.merch_url]
    ].filter(([, url]) => clean(url));
  }

  function startSong(song, mode = 'single') {
    if (!song?.song_key) return;
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
        songKey: song.song_key,
        artistKey: state.artist.artist_key || identifier,
        mode,
        createdAt: Date.now()
      }));
    } catch (_) {}
    location.href = '/radio/dev/v2/?artist_radio=1';
  }

  function songRow(song, index = 0) {
    return `
      <article class="artist-song-row" data-song-key="${esc(song.song_key)}">
        <span class="artist-song-rank">${index + 1}</span>
        <span class="artist-song-art">${image(songArt(song), '')}</span>
        <span class="artist-song-copy"><strong>${esc(songTitle(song))}</strong><small>${esc(clean(song.album_name || song.genre || state.artist.name))}</small></span>
        <span class="artist-song-plays">${compact(songPlays(song))} plays</span>
        <button type="button" class="artist-round-play" data-play-song="${esc(song.song_key)}" aria-label="Play ${esc(songTitle(song))}">${icon.play}</button>
      </article>`;
  }

  function latestReleaseMarkup() {
    const latest = sortedSongs('latest')[0];
    if (!latest) return '<div class="artist-empty">No releases are available yet.</div>';
    return `
      <article class="latest-release-card">
        <span class="latest-release-art">${image(songArt(latest), songTitle(latest))}</span>
        <div><strong>${esc(songTitle(latest))}</strong><small>${esc(clean(latest.release_format || latest.album_name || 'Single'))}${releaseYear(latest) ? ` · ${releaseYear(latest)}` : ''}</small></div>
        <button type="button" class="artist-round-play large" data-play-song="${esc(latest.song_key)}" aria-label="Play ${esc(songTitle(latest))}">${icon.play}</button>
      </article>`;
  }

  function playlistArtwork(songs) {
    return `<span class="playlist-collage">${songs.slice(0, 4).map(song => image(songArt(song), '')).join('')}</span>`;
  }

  function playlistsMarkup(limit = 4) {
    const playlists = generatedPlaylists().slice(0, limit);
    return playlists.length ? playlists.map((playlist, index) => `
      <button type="button" class="artist-playlist-row" data-play-playlist="${index}">
        ${playlistArtwork(playlist.songs)}
        <span><strong>${esc(playlist.name)}</strong><small>${esc(playlist.subtitle)}</small></span>
        <b>›</b>
      </button>`).join('') : '<div class="artist-empty">Playlists will appear as this catalog grows.</div>';
  }

  function eventsMarkup(limit = state.events.length) {
    const events = state.events.slice(0, limit);
    if (!events.length) return '';
    return `<div class="artist-event-grid">${events.map(event => {
      const date = event.start ? new Date(event.start) : null;
      const month = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date) : 'TBA';
      const day = date && !Number.isNaN(date.getTime()) ? date.getDate() : '—';
      return `
        <article class="artist-event-card">
          <div class="artist-event-date"><strong>${esc(month)}</strong><span>${esc(day)}</span></div>
          <div class="artist-event-copy"><h3>${esc(event.title || state.artist.name)}</h3><p>${esc([event.venue, event.city, event.region].filter(Boolean).join(' · ') || 'Location to be announced')}</p><small>${esc(formatDate(event.start, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }))}</small></div>
          ${event.ticketUrl ? `<a href="${esc(event.ticketUrl)}" target="_blank" rel="noopener" class="artist-ticket-button${event.soldOut ? ' sold-out' : ''}">${icon.ticket}<span>${event.soldOut ? 'Sold Out' : 'Tickets'}</span></a>` : '<span class="artist-ticket-tba">Tickets TBA</span>'}
        </article>`;
    }).join('')}</div>`;
  }

  function highlightsMarkup() {
    const genres = genreSummary();
    const favorite = sortedSongs('likes')[0] || sortedSongs('plays')[0];
    const albums = albumGroups();
    const videos = state.songs.filter(song => videoUrl(song));
    const live = state.songs.filter(song => Boolean(song.live_recording));
    const singles = state.songs.filter(song => !clean(song.album_name)).length;
    const cards = [
      { icon: icon.music, title: 'Signature Sound', value: genres.slice(0, 3).map(([genre]) => genre).join(' · ') || 'Genre blending catalog' },
      { icon: icon.users, title: 'Fan Favorite', value: favorite ? songTitle(favorite) : 'Audience favorite developing' },
      { icon: icon.globe, title: 'Catalog Depth', value: `${albums.length} album${albums.length === 1 ? '' : 's'} · ${singles} single${singles === 1 ? '' : 's'}` },
      { icon: icon.video, title: 'Visual Catalog', value: `${videos.length} video${videos.length === 1 ? '' : 's'}${live.length ? ` · ${live.length} live` : ''}` }
    ];
    return `<div class="artist-highlight-grid">${cards.map(card => `<article>${card.icon}<div><strong>${esc(card.title)}</strong><span>${esc(card.value)}</span></div></article>`).join('')}</div>`;
  }

  function overviewMarkup() {
    const topSongs = sortedSongs('plays').slice(0, 5);
    return `
      ${state.events.length ? `<section class="artist-overview-events"><div class="artist-section-title"><div><span>On the Road</span><h2>Upcoming Events</h2></div><button type="button" data-open-tab="events">View All</button></div>${eventsMarkup(3)}</section>` : ''}
      <div class="artist-overview-grid">
        <div class="artist-overview-column">
          <section class="artist-panel"><div class="artist-section-title"><h2>Latest Release</h2></div>${latestReleaseMarkup()}</section>
          <section class="artist-panel"><div class="artist-section-title"><h2>Popular Playlists</h2><button type="button" data-open-tab="playlists">View All</button></div>${playlistsMarkup(4)}</section>
        </div>
        <section class="artist-panel artist-top-songs"><div class="artist-section-title"><h2>Top Songs</h2><button type="button" data-open-tab="songs">View All</button></div>${topSongs.map(songRow).join('')}<button type="button" class="artist-view-all" data-open-tab="songs">View All Songs</button></section>
      </div>
      ${highlightsMarkup()}`;
  }

  function songsMarkup() {
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Complete Catalog</span><h2>All Songs</h2></div><button type="button" data-start-radio>${icon.radio}<span>Start Radio</span></button></div><div class="artist-all-songs">${sortedSongs('plays').map(songRow).join('') || '<div class="artist-empty">No songs are available yet.</div>'}</div></section>`;
  }

  function albumsMarkup() {
    const albums = albumGroups();
    const cards = albums.map(album => {
      const first = album.songs[0];
      return `<button type="button" class="artist-album-card" data-play-song="${esc(first.song_key)}"><span>${image(songArt(first), album.name)}</span><strong>${esc(album.name)}</strong><small>${album.songs.length} track${album.songs.length === 1 ? '' : 's'}${releaseYear(first) ? ` · ${releaseYear(first)}` : ''}</small></button>`;
    });
    if (!cards.length) {
      sortedSongs('latest').forEach(song => cards.push(`<button type="button" class="artist-album-card" data-play-song="${esc(song.song_key)}"><span>${image(songArt(song), songTitle(song))}</span><strong>${esc(songTitle(song))}</strong><small>${esc(clean(song.release_format || 'Single'))}${releaseYear(song) ? ` · ${releaseYear(song)}` : ''}</small></button>`));
    }
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Discography</span><h2>Albums & Releases</h2></div></div><div class="artist-album-grid">${cards.join('') || '<div class="artist-empty">No album information is available yet.</div>'}</div></section>`;
  }

  function playlistsTabMarkup() {
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Generated from the live catalog</span><h2>Artist Playlists</h2></div></div><div class="artist-playlist-grid">${playlistsMarkup(4)}</div></section>`;
  }

  function videosMarkup() {
    const videos = state.songs.filter(song => videoUrl(song));
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Watch</span><h2>Videos</h2></div></div><div class="artist-video-grid">${videos.map(song => `<a href="${esc(videoUrl(song))}" target="_blank" rel="noopener" class="artist-video-card"><span>${image(songArt(song), songTitle(song))}<i>${icon.play}</i></span><strong>${esc(songTitle(song))}</strong><small>${esc(clean(song.genre || state.artist.name))}</small></a>`).join('') || '<div class="artist-empty">No public videos are assigned yet.</div>'}</div></section>`;
  }

  function eventsTabMarkup() {
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Live</span><h2>Upcoming Events</h2></div></div>${eventsMarkup() || '<div class="artist-empty">No upcoming events are scheduled.</div>'}</section>`;
  }

  function merchMarkup() {
    if (state.shopLoading || !state.shopLoaded) return '<div class="artist-empty">Loading artist merchandise…</div>';
    const cards = state.shopProducts.map(product => {
      const imageUrl = product.images?.[0]?.src || '';
      const variant = product.variants?.[0];
      return `<a class="artist-merch-card" href="https://stashbox.ai/products/${encodeURIComponent(product.handle || '')}" target="_blank" rel="noopener"><span>${image(imageUrl, product.title || '')}</span><strong>${esc(product.title || 'Artist Merchandise')}</strong><small>${variant?.price ? `$${Number(variant.price).toFixed(2)}` : 'Shop now'}</small></a>`;
    });
    const direct = state.artist.merch_url ? `<a class="artist-merch-direct" href="${esc(state.artist.merch_url)}" target="_blank" rel="noopener">Visit ${esc(state.artist.name)} Merch Store</a>` : '';
    return `<section class="artist-tab-section"><div class="artist-section-title"><div><span>Official Store</span><h2>Merch</h2></div></div>${cards.length ? `<div class="artist-merch-grid">${cards.join('')}</div>` : `<div class="artist-empty">No matching store products were found.${direct ? `<br>${direct}` : ''}</div>`}${cards.length ? direct : ''}</section>`;
  }

  function tabContent() {
    if (state.activeTab === 'songs') return songsMarkup();
    if (state.activeTab === 'albums') return albumsMarkup();
    if (state.activeTab === 'playlists') return playlistsTabMarkup();
    if (state.activeTab === 'videos') return videosMarkup();
    if (state.activeTab === 'events') return eventsTabMarkup();
    if (state.activeTab === 'merch') return merchMarkup();
    return overviewMarkup();
  }

  function render() {
    const artist = state.artist;
    const stats = profileStats();
    const genres = genreSummary().slice(0, 4).map(([genre]) => genre);
    const links = socialLinks();
    const tabs = [
      ['overview', 'Overview'],
      ['songs', 'Songs'],
      ['albums', 'Albums'],
      ['playlists', 'Playlists'],
      ['videos', 'Videos'],
      ...(state.events.length ? [['events', 'Events']] : []),
      ['merch', 'Merch']
    ];
    document.title = `${artist.name} · Stashbox Radio V2`;

    app.innerHTML = `
      <section class="artist-hero" style="--artist-banner:url('${esc(artist.banner_image_url || artist.profile_image_url || FALLBACK)}')">
        <div class="artist-hero-shade"></div>
        <header class="artist-topbar">
          <button type="button" class="artist-circle-button" data-back aria-label="Back">${icon.back}</button>
          <div class="artist-topbar-actions">
            <button type="button" class="artist-circle-button" data-share-profile aria-label="Share artist">${icon.share}</button>
            <button type="button" class="artist-circle-button" data-toggle-more aria-label="More artist links">${icon.more}</button>
          </div>
          <div class="artist-more-menu" data-more-menu hidden>${links.length ? links.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('') : '<span>No additional links</span>'}</div>
        </header>
        <div class="artist-identity-wrap">
          <div class="artist-avatar-wrap"><div class="artist-avatar">${image(artist.profile_image_url || FALLBACK, artist.name)}</div>${artist.verified ? '<span class="artist-avatar-verified">✓</span>' : ''}</div>
          <div class="artist-identity">
            <h1>${esc(artist.name)}${artist.verified ? '<span class="artist-name-verified">✓</span>' : ''}</h1>
            <p>${esc(genres.join(' · ') || artist.location || 'Stashbox Radio Artist')}</p>
            <div class="artist-stats">
              <span><strong>${stats.songs.toLocaleString()}</strong><small>Songs</small></span>
              <span><strong id="artistFollowerCount">${stats.followers.toLocaleString()}</strong><small>Followers</small></span>
              <span><strong>${compact(stats.plays)}</strong><small>Plays</small></span>
              <span><strong>${compact(stats.shares)}</strong><small>Shares</small></span>
            </div>
          </div>
          <div class="artist-hero-actions">
            <button type="button" id="artistFollowButton" class="artist-action-button${artist.is_following ? ' is-following' : ''}" aria-pressed="${artist.is_following ? 'true' : 'false'}">${artist.is_following ? 'Following' : 'Follow'}</button>
            <button type="button" class="artist-action-button radio" data-start-radio>${icon.radio}<span>Start Radio</span></button>
          </div>
        </div>
        <div class="artist-bio-row">
          <p data-artist-bio>${esc(artist.bio || `${artist.name} is available now on Stashbox Radio.`)}</p>
          ${clean(artist.bio).length > 180 ? '<button type="button" data-toggle-bio>… more</button>' : ''}
        </div>
        <div class="artist-link-row">${artist.website_url ? `<a href="${esc(artist.website_url)}" target="_blank" rel="noopener">${icon.link}<span>${esc(clean(artist.website_url).replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span></a>` : ''}${artist.location ? `<span>${esc(artist.location)}</span>` : ''}</div>
      </section>
      <nav class="artist-tabs" aria-label="Artist profile sections">${tabs.map(([key, label]) => `<button type="button" data-tab="${key}" class="${state.activeTab === key ? 'active' : ''}">${label}</button>`).join('')}</nav>
      <main class="artist-content" data-artist-content>${tabContent()}</main>
      <button type="button" id="artistLoginTrigger" data-v2-auth-open="login" hidden></button>`;

    bind();
  }

  function bind() {
    app.querySelector('[data-back]')?.addEventListener('click', () => location.href = '/radio/dev/v2/');
    app.querySelector('[data-share-profile]')?.addEventListener('click', shareProfile);
    app.querySelector('[data-toggle-more]')?.addEventListener('click', () => {
      const menu = app.querySelector('[data-more-menu]');
      if (menu) menu.hidden = !menu.hidden;
    });
    app.querySelector('[data-toggle-bio]')?.addEventListener('click', event => {
      app.querySelector('[data-artist-bio]')?.classList.toggle('expanded');
      event.currentTarget.textContent = app.querySelector('[data-artist-bio]')?.classList.contains('expanded') ? 'less' : '… more';
    });
    app.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.tab)));
    app.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.openTab)));
    app.querySelectorAll('[data-play-song]').forEach(button => button.addEventListener('click', () => {
      const song = state.songs.find(item => item.song_key === button.dataset.playSong);
      startSong(song);
    }));
    app.querySelectorAll('[data-play-playlist]').forEach(button => button.addEventListener('click', () => {
      const playlist = generatedPlaylists()[Number(button.dataset.playPlaylist) || 0];
      startSong(playlist?.songs?.[0], 'playlist');
    }));
    app.querySelectorAll('[data-start-radio]').forEach(button => button.addEventListener('click', startRadio));
    app.querySelector('#artistFollowButton')?.addEventListener('click', toggleFollow);
  }

  function openTab(tab) {
    state.activeTab = tab || 'overview';
    render();
    const tabs = app.querySelector('.artist-tabs');
    const top = tabs ? tabs.getBoundingClientRect().top + window.scrollY - 8 : 0;
    window.scrollTo({ top, behavior: 'smooth' });
    if (state.activeTab === 'merch') loadMerch();
  }

  function startRadio() {
    const songs = sortedSongs('plays');
    if (!songs.length) return;
    const pool = songs.slice(0, Math.min(12, songs.length));
    startSong(pool[Math.floor(Math.random() * pool.length)], 'radio');
  }

  async function shareProfile() {
    const url = new URL('/radio/dev/v2/artist/', location.origin);
    url.searchParams.set('artist', state.artist.slug || state.artist.artist_key || identifier);
    try {
      if (navigator.share) await navigator.share({ title: `${state.artist.name} on Stashbox Radio`, url: url.toString() });
      else await navigator.clipboard.writeText(url.toString());
    } catch (_) {}
  }

  async function toggleFollow(event) {
    const button = event.currentTarget;
    if (state.followingBusy) return;
    const tokens = readTokens();
    if (!tokens.accessToken) {
      state.pendingFollowAfterLogin = true;
      try { sessionStorage.setItem(PENDING_FOLLOW_KEY, state.artist.artist_key || identifier); } catch (_) {}
      app.querySelector('#artistLoginTrigger')?.click();
      waitForLogin();
      return;
    }

    state.followingBusy = true;
    const wasFollowing = button.getAttribute('aria-pressed') === 'true';
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const data = await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(state.artist.artist_key || identifier)}`, {
        method: wasFollowing ? 'DELETE' : 'POST',
        headers: authHeaders(!wasFollowing),
        body: wasFollowing ? undefined : JSON.stringify({ notifications_enabled: true })
      });
      state.artist = { ...state.artist, ...(data.artist || {}), is_following: !wasFollowing };
      const next = Boolean(data.artist?.is_following ?? !wasFollowing);
      button.setAttribute('aria-pressed', String(next));
      button.classList.toggle('is-following', next);
      button.textContent = next ? 'Following' : 'Follow';
      const count = app.querySelector('#artistFollowerCount');
      if (count && data.artist?.follower_count != null) count.textContent = Number(data.artist.follower_count).toLocaleString();
    } catch (error) {
      button.textContent = wasFollowing ? 'Following' : 'Follow';
      button.title = error.message;
    } finally {
      button.disabled = false;
      state.followingBusy = false;
      state.pendingFollowAfterLogin = false;
    }
  }

  function waitForLogin() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (readTokens().accessToken) {
        window.clearInterval(timer);
        if (state.pendingFollowAfterLogin) app.querySelector('#artistFollowButton')?.click();
      } else if (attempts >= 180) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  async function loadMerch() {
    if (state.shopLoaded || state.shopLoading) return;
    state.shopLoading = true;
    const content = app.querySelector('[data-artist-content]');
    if (content) content.innerHTML = merchMarkup();
    try {
      const body = await api(SHOP_URL);
      const products = Array.isArray(body.products) ? body.products : [];
      const terms = [state.artist.name, state.artist.artist_key, state.artist.slug].filter(Boolean).map(normalize);
      state.shopProducts = products.filter(product => {
        const tags = Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || '');
        const haystack = normalize(`${product.title || ''} ${product.body_html || ''} ${tags} ${product.product_type || ''} ${product.vendor || ''}`);
        return terms.some(term => term && haystack.includes(term));
      }).sort(() => Math.random() - .5).slice(0, 12);
      state.shopLoaded = true;
    } catch (_) {
      state.shopProducts = [];
      state.shopLoaded = true;
    } finally {
      state.shopLoading = false;
      if (state.activeTab === 'merch') {
        const target = app.querySelector('[data-artist-content]');
        if (target) target.innerHTML = merchMarkup();
      }
    }
  }

  async function hydrateFollowing() {
    if (!readTokens().accessToken) return;
    try {
      const body = await api(`${API_ROOT}/radio/me/follows`, { headers: authHeaders() });
      const match = (body.follows || []).find(item => item.artist_key === state.artist.artist_key);
      if (match) state.artist = { ...state.artist, ...match, is_following: true };
    } catch (_) {}
  }

  async function init() {
    try {
      const [artistResult, songsResult, eventsResult] = await Promise.allSettled([
        api(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`),
        api(`${API_ROOT}/radio/songs`),
        optionalEvents()
      ]);
      if (artistResult.status !== 'fulfilled') throw artistResult.reason;
      state.artist = artistResult.value.artist;
      const songs = songsResult.status === 'fulfilled' ? (songsResult.value.songs || songsResult.value.items || []) : [];
      state.songs = artistSongs(songs, state.artist);
      const fetchedEvents = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
      state.events = normalizeEvents(state.artist, fetchedEvents);
      await hydrateFollowing();
      render();
    } catch (error) {
      app.innerHTML = `<section class="artist-load-error"><strong>STASH<span>BOX</span></strong><h1>Artist profile could not load</h1><p>${esc(error.message || 'Unknown error')}</p><a href="/radio/dev/v2/">Return to Radio</a></section>`;
    }
  }

  init();
})();
