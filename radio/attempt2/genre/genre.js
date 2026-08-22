(() => {
  'use strict';

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const genre = String(params.get('genre') || 'Music').trim();
  const sourceArtist = String(params.get('source_artist') || '').trim();
  const sourceArtistName = String(params.get('source_artist_name') || '').trim();
  const embedded = window.self !== window.top && params.get('embedded') === '1';
  const app = document.getElementById('genreApp');
  if (!app) return;

  const icon = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>'
  };

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const slugify = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value));

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
  }

  function rows(data) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  function listValues(value) {
    if (Array.isArray(value)) return value.flatMap(listValues);
    if (value == null) return [];
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return listValues(parsed);
      } catch (_) {}
      return text.split(/[,|/]+/).map(clean).filter(Boolean);
    }
    return [clean(value)].filter(Boolean);
  }

  function normalizeSong(row, index) {
    const genres = [
      ...listValues(row.genre),
      ...listValues(row.primary_genre),
      ...listValues(row.secondary_genre),
      ...listValues(row.genres),
      ...listValues(row.genre_tags)
    ].filter(Boolean);

    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      artistKey: clean(row.artist_key || row.primary_artist_key || row.artist_slug),
      genre: clean(row.genre || row.primary_genre || genres[0] || 'Other'),
      genres: [...new Set(genres.map(clean).filter(Boolean))],
      art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK,
      plays: number(row.total_plays ?? row.plays ?? row.play_count),
      likes: number(row.total_likes ?? row.likes ?? row.like_count)
    };
  }

  function matchesGenre(song) {
    const target = normalize(genre);
    return song.genres.some(value => normalize(value) === target) || normalize(song.genre) === target;
  }

  function matchesSourceArtist(song) {
    if (!sourceArtist && !sourceArtistName) return false;
    const targets = [sourceArtist, sourceArtistName].map(value => normalize(value)).filter(Boolean);
    const slugs = [sourceArtist, sourceArtistName].map(slugify).filter(Boolean);
    return targets.includes(normalize(song.artistKey))
      || targets.includes(normalize(song.artist))
      || slugs.includes(slugify(song.artistKey))
      || slugs.includes(slugify(song.artist));
  }

  function sortSongs(songs) {
    return [...songs].sort((a, b) => b.plays - a.plays || b.likes - a.likes || a.title.localeCompare(b.title));
  }

  function image(song) {
    return `<img src="${esc(song.art)}" alt="${esc(song.title)} artwork" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  }

  function card(song) {
    return `
      <button type="button" class="genre-song" data-song-key="${esc(song.key)}" aria-label="Play ${esc(song.title)} by ${esc(song.artist)}">
        <span class="genre-song-art">${image(song)}<i>${icon.play}</i></span>
        <span class="genre-song-copy"><strong>${esc(song.title)}</strong><b>${esc(song.artist)}</b><small>${esc(song.genres.slice(0, 3).join(' · ') || song.genre)}</small></span>
        <span class="genre-song-stats">${compact(song.plays)} plays</span>
      </button>`;
  }

  function section(label, title, songs) {
    if (!songs.length) return '';
    return `
      <section class="genre-section">
        <div class="genre-section-heading"><div><span>${esc(label)}</span><h2>${esc(title)}</h2></div><small>${songs.length} song${songs.length === 1 ? '' : 's'}</small></div>
        <div class="genre-list">${songs.map(card).join('')}</div>
      </section>`;
  }

  function render(songs) {
    const prioritized = sortSongs(songs.filter(matchesSourceArtist));
    const remaining = sortSongs(songs.filter(song => !matchesSourceArtist(song)));
    const artistLabel = sourceArtistName || prioritized[0]?.artist || sourceArtist;
    const generalSection = prioritized.length
      ? section('More from this genre', `${genre} Songs`, remaining)
      : section('Complete genre catalog', `${genre} Songs`, remaining);
    document.title = `${genre} · Stashbox Radio V2`;

    app.innerHTML = `
      <header class="genre-topbar">
        <button type="button" class="genre-back" data-genre-back aria-label="Back">${icon.back}</button>
        <div class="genre-brand"><strong>STASH<span>BOX</span></strong><small>Genre Feed</small></div>
        <button type="button" class="genre-home" data-genre-home aria-label="Stashbox Radio home">${icon.home}</button>
      </header>
      <section class="genre-hero">
        <p class="genre-kicker">Songs by Genre</p>
        <h1>${esc(genre)}</h1>
        <p>Browse every available ${esc(genre)} song without interrupting the track already playing behind this page.</p>
        <span class="genre-count">${songs.length} matching song${songs.length === 1 ? '' : 's'}</span>
      </section>
      <main class="genre-main">
        ${prioritized.length ? section('Your artist first', `${artistLabel} · ${genre}`, prioritized) : ''}
        ${generalSection}
        ${songs.length ? '' : '<div class="genre-empty">No songs currently match this genre.</div>'}
      </main>`;

    bind();
  }

  function closePage() {
    if (embedded) {
      window.parent.postMessage({ type: 'stashbox:close-overlay' }, location.origin);
      return;
    }
    if (history.length > 1) history.back();
    else location.href = '/radio/attempt2/';
  }

  function playSong(songKey) {
    const key = clean(songKey);
    if (!key) return;

    if (embedded) {
      window.top.postMessage({ type: 'stashbox:play-song', songKey: key, mode: 'genre' }, location.origin);
      return;
    }

    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ songKey: key, mode: 'genre', createdAt: Date.now() }));
    } catch (_) {}
    location.href = '/radio/attempt2/?artist_radio=1';
  }

  function bind() {
    app.querySelector('[data-genre-back]')?.addEventListener('click', closePage);
    app.querySelector('[data-genre-home]')?.addEventListener('click', () => {
      if (embedded) window.top.location.href = '/radio/attempt2/';
      else location.href = '/radio/attempt2/';
    });
    app.querySelectorAll('[data-song-key]').forEach(button => button.addEventListener('click', () => playSong(button.dataset.songKey)));
  }

  async function init() {
    try {
      const response = await fetch(SONGS_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const songs = rows(body).map(normalizeSong).filter(song => song.key && matchesGenre(song));
      render(songs);
    } catch (error) {
      app.innerHTML = `<section class="genre-error"><h1>Genre feed unavailable</h1><p>${esc(error.message || 'The song catalog could not load.')}</p><button type="button" class="genre-back" onclick="location.reload()">Retry</button></section>`;
    }
  }

  init();
})();
