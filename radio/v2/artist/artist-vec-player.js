(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const app = document.getElementById('artistApp');
  if (!app) return;

  const clean = value => String(value ?? '').trim();
  const fixUrl = value => clean(value).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const params = new URLSearchParams(location.search);
  const artistIdentifier = params.get('artist') || params.get('slug') || 'stashbox';
  const playIcon = '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>';
  const pauseIcon = '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM14 5h3v14h-3z"/></svg>';
  const backIcon = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';
  const prevIcon = '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6Z"/></svg>';
  const nextIcon = '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l9 6-9 6Z"/></svg>';

  const state = {
    artist: null,
    songs: [],
    queue: [],
    index: 0,
    run: 0,
    sequence: [],
    visualIndex: 0,
    visualTimer: 0,
    activeVisual: null
  };

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) {}
    }
    return data || {};
  }

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    body = unwrap(body);
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function rows(body, keys) {
    body = unwrap(body);
    if (Array.isArray(body)) return body;
    for (const key of keys) if (Array.isArray(body?.[key])) return body[key];
    return [];
  }

  function title(song) { return clean(song?.display_title || song?.song_name || song?.title || song?.song_key || 'Untitled Song'); }
  function art(song) { return fixUrl(song?.resolved_artwork_url || song?.song_artwork_url || song?.artwork_url || song?.image_url) || '/images/branding/stashbox-logo-transparent-rastacolors.png'; }
  function audioUrl(song) { return fixUrl(song?.audio_url || song?.audioUrl || song?.mp3_url || song?.file_url || song?.stream_url); }
  function artistName(song) { return clean(song?.artist || song?.artist_name || state.artist?.name || 'Stashbox'); }
  function plays(song) { return Math.max(0, Number(song?.total_plays ?? song?.plays ?? song?.play_count ?? 0)); }

  function normalizeName(value) { return clean(value).toLowerCase().replace(/\s+/g, ' '); }
  function songBelongs(song) {
    const targetName = normalizeName(state.artist?.name);
    const targetKey = normalizeName(state.artist?.artist_key || state.artist?.slug || artistIdentifier);
    return normalizeName(song.artist || song.artist_name) === targetName || normalizeName(song.artist_key || song.primary_artist_key || song.artist_slug) === targetKey;
  }

  function ensureHeroButton() {
    const hero = app.querySelector('.artist-hero');
    if (!hero || hero.querySelector('[data-artist-hero-vec-play]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artist-hero-vec-play';
    button.dataset.artistHeroVecPlay = 'true';
    button.setAttribute('aria-label', `Play ${state.artist?.name || 'artist'} VEC experience`);
    button.innerHTML = `${playIcon}<span>Play Artist</span>`;
    hero.appendChild(button);
  }

  function ensureOverlay() {
    let overlay = document.querySelector('[data-artist-vec-player]');
    if (overlay) return overlay;
    overlay = document.createElement('section');
    overlay.className = 'artist-vec-player';
    overlay.dataset.artistVecPlayer = 'true';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="artist-vec-media" data-artist-vec-media></div>
      <div class="artist-vec-shade"></div>
      <div class="artist-vec-top">
        <a class="artist-vec-home" href="/radio/dev/v2/" aria-label="Back to Stashbox Radio home">${backIcon}</a>
        <span class="artist-vec-badge"><i></i><b>VEC</b></span>
      </div>
      <div class="artist-vec-bottom">
        <span class="artist-vec-kicker" data-artist-vec-kicker>Artist VEC Experience</span>
        <h2 data-artist-vec-title>Loading…</h2>
        <p data-artist-vec-artist></p>
        <div class="artist-vec-progress"><i data-artist-vec-progress></i></div>
        <div class="artist-vec-times"><span data-artist-vec-current>0:00</span><span data-artist-vec-duration>0:00</span></div>
        <div class="artist-vec-controls">
          <button type="button" data-artist-vec-prev aria-label="Previous song">${prevIcon}</button>
          <button type="button" data-artist-vec-toggle aria-label="Play or pause">${playIcon}</button>
          <button type="button" data-artist-vec-next aria-label="Next song">${nextIcon}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-artist-vec-toggle]').addEventListener('click', toggleAudio);
    overlay.querySelector('[data-artist-vec-prev]').addEventListener('click', () => stepSong(-1));
    overlay.querySelector('[data-artist-vec-next]').addEventListener('click', () => stepSong(1));
    return overlay;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  function updateAudioUi() {
    const overlay = ensureOverlay();
    overlay.querySelector('[data-artist-vec-toggle]').innerHTML = audio.paused ? playIcon : pauseIcon;
    overlay.querySelector('[data-artist-vec-current]').textContent = formatTime(audio.currentTime);
    overlay.querySelector('[data-artist-vec-duration]').textContent = formatTime(audio.duration);
    const percent = audio.duration ? Math.min(100, Math.max(0, audio.currentTime / audio.duration * 100)) : 0;
    overlay.querySelector('[data-artist-vec-progress]').style.width = `${percent}%`;
  }

  function toggleAudio() {
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function stopVisual() {
    clearTimeout(state.visualTimer);
    state.visualTimer = 0;
    if (state.activeVisual?.tagName === 'VIDEO') {
      state.activeVisual.pause();
      state.activeVisual.removeAttribute('src');
      state.activeVisual.load();
    }
    state.activeVisual = null;
  }

  function assetType(asset) {
    const value = clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type).toLowerCase();
    return value === 'clip' || value === 'video' || value.startsWith('video/') ? 'clip' : 'image';
  }

  function normalizeAsset(asset, fallbackSource = '') {
    const url = fixUrl(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url);
    if (!url) return null;
    const status = clean(asset?.status).toLowerCase();
    if (['hidden','deleted','archived','inactive'].includes(status) || asset?.hidden === true) return null;
    return {
      id: clean(asset.id || asset.asset_id || asset.s3_key || asset.key || url),
      url,
      type: assetType(asset),
      duration: Math.max(4, Number(asset.duration_seconds || asset.durationSeconds || 8) || 8),
      source: fallbackSource
    };
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function buildVec(song, run) {
    const key = clean(song.song_key);
    const [recipeBody, assetBody] = await Promise.all([
      json(`${API}/radio/vec/recipe?song_key=${encodeURIComponent(key)}`).catch(() => ({})),
      json(`${API}/radio/vec/song-assets?song_key=${encodeURIComponent(key)}`).catch(() => ({}))
    ]);
    if (run !== state.run) return [];
    const recipe = recipeBody.recipe || recipeBody.vec_recipe || recipeBody.data?.recipe || recipeBody.data || recipeBody || {};
    const own = rows(assetBody, ['assets','items','data']).map(asset => normalizeAsset(asset, 'song')).filter(Boolean);
    const folders = (Array.isArray(recipe.folders) ? recipe.folders : []).filter(folder => folder?.enabled !== false);
    const folderAssets = await Promise.all(folders.map(async folder => {
      const id = clean(folder.folder_id || folder.visual_folder_id || folder.id);
      if (!id) return [];
      const body = await json(`${API}/radio/visuals/folders/${encodeURIComponent(id)}/assets`).catch(() => ({}));
      return rows(body, ['assets','items','data']).map(asset => normalizeAsset(asset, `folder:${id}`)).filter(Boolean);
    }));
    if (run !== state.run) return [];
    const artwork = { id:`art:${key}`, url:art(song), type:'image', duration:4, source:'artwork' };
    const mode = clean(recipe.visual_mode || recipe.visualMode).toLowerCase();
    if (mode === 'artwork_only') return [artwork];
    const seen = new Set();
    const assets = [...own, ...folderAssets.flat()].filter(asset => {
      const id = clean(asset.id || asset.url).toLowerCase();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return [artwork, ...shuffle(assets)];
  }

  function showVisual(index = 0) {
    stopVisual();
    if (!state.sequence.length) return;
    state.visualIndex = ((index % state.sequence.length) + state.sequence.length) % state.sequence.length;
    const asset = state.sequence[state.visualIndex];
    const media = ensureOverlay().querySelector('[data-artist-vec-media]');
    media.innerHTML = '';
    let node;
    if (asset.type === 'clip') {
      node = document.createElement('video');
      node.muted = true;
      node.autoplay = true;
      node.playsInline = true;
      node.loop = false;
      node.src = asset.url;
      node.addEventListener('ended', () => showVisual(state.visualIndex + 1), { once: true });
      node.play().catch(() => {});
    } else {
      node = document.createElement('img');
      node.alt = '';
      node.src = asset.url;
    }
    media.appendChild(node);
    state.activeVisual = node;
    state.visualTimer = setTimeout(() => showVisual(state.visualIndex + 1), Math.max(4000, asset.duration * 1000));
  }

  async function startSong(song, queue = null) {
    if (!song) return;
    if (Array.isArray(queue) && queue.length) {
      state.queue = queue;
      state.index = Math.max(0, queue.findIndex(item => item.song_key === song.song_key));
    } else if (!state.queue.length) {
      state.queue = [...state.songs].sort((a,b) => plays(b) - plays(a));
      state.index = Math.max(0, state.queue.findIndex(item => item.song_key === song.song_key));
    }

    const overlay = ensureOverlay();
    overlay.hidden = false;
    document.body.classList.add('artist-vec-open');
    overlay.querySelector('[data-artist-vec-title]').textContent = title(song);
    overlay.querySelector('[data-artist-vec-artist]').textContent = artistName(song);
    overlay.querySelector('[data-artist-vec-kicker]').textContent = `${state.artist?.name || 'Artist'} · VEC Experience`;

    const src = audioUrl(song);
    audio.pause();
    audio.src = src;
    audio.load();
    if (src) audio.play().catch(() => {});

    const run = ++state.run;
    state.sequence = [{ id:`art:${song.song_key}`, url:art(song), type:'image', duration:4 }];
    showVisual(0);
    const vec = await buildVec(song, run).catch(() => []);
    if (run !== state.run) return;
    state.sequence = vec.length ? vec : state.sequence;
    showVisual(0);
    updateAudioUi();
  }

  function stepSong(direction) {
    if (!state.queue.length) return;
    state.index = (state.index + direction + state.queue.length) % state.queue.length;
    startSong(state.queue[state.index], state.queue);
  }

  function startArtistRadio() {
    const queue = [...state.songs].sort((a,b) => plays(b) - plays(a));
    if (!queue.length) return;
    startSong(queue[0], queue);
  }

  function intercept(event) {
    const heroPlay = event.target.closest('[data-artist-hero-vec-play]');
    if (heroPlay) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startArtistRadio();
      return;
    }
    const songButton = event.target.closest('[data-play-song]');
    if (songButton) {
      const song = state.songs.find(item => item.song_key === songButton.dataset.playSong);
      if (!song) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startSong(song);
      return;
    }
    const radioButton = event.target.closest('[data-start-radio]');
    if (radioButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startArtistRadio();
      return;
    }
    const playlistButton = event.target.closest('[data-play-playlist]');
    if (playlistButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const queue = [...state.songs].sort((a,b) => plays(b) - plays(a));
      startSong(queue[0], queue);
    }
  }

  audio.addEventListener('timeupdate', updateAudioUi);
  audio.addEventListener('loadedmetadata', updateAudioUi);
  audio.addEventListener('play', updateAudioUi);
  audio.addEventListener('pause', updateAudioUi);
  audio.addEventListener('ended', () => stepSong(1));
  document.addEventListener('click', intercept, true);

  new MutationObserver(ensureHeroButton).observe(app, { childList:true, subtree:true });

  Promise.all([
    json(`${API}/radio/artists/${encodeURIComponent(artistIdentifier)}`),
    json(`${API}/radio/songs`)
  ]).then(([artistBody, songBody]) => {
    state.artist = artistBody.artist || {};
    state.songs = rows(songBody, ['songs','items','data']).filter(songBelongs);
    state.queue = [...state.songs].sort((a,b) => plays(b) - plays(a));
    ensureHeroButton();
    ensureOverlay();
  }).catch(() => {
    ensureHeroButton();
    ensureOverlay();
  });
})();
