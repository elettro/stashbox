(() => {
  'use strict';

  const app = document.getElementById('artistApp');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';

  const icon = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 6l-9 6 9 6Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 6l9 6-9 6Z"/></svg>'
  };

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const songTitle = song => clean(song?.display_title || song?.song_name || song?.title || song?.song_key || 'Untitled Song');
  const songArt = song => fixUrl(song?.resolved_artwork_url || song?.song_artwork_url || song?.artwork_url || song?.cover_art_url || song?.image_url) || FALLBACK_ART;
  const songAudio = song => fixUrl(song?.audio_url || song?.audioUrl || song?.mp3_url || song?.stream_url || song?.audio_file_url || song?.file_url);
  const songPlays = song => number(song?.total_plays ?? song?.plays ?? song?.play_count);

  const state = {
    artist: null,
    songs: [],
    queue: [],
    index: 0,
    currentSong: null,
    overlay: null,
    audio: null,
    catalogPromise: null,
    vecRun: 0,
    sequence: [],
    sequenceIndex: 0,
    visualTimer: 0,
    visualSafetyTimer: 0,
    activeMedia: null,
    trackTimer: 0,
    trackedSongKey: ''
  };

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
  }

  async function json(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', ...options });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function rows(data, names) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const name of names) if (Array.isArray(data?.[name])) return data[name];
    return [];
  }

  function artistSongs(allSongs, artist) {
    const targetName = normalize(artist?.name);
    const targetKey = normalize(artist?.artist_key || artist?.slug || identifier);
    return (Array.isArray(allSongs) ? allSongs : []).filter(song => {
      const artistName = normalize(song.artist || song.artist_name);
      const artistKey = normalize(song.artist_key || song.primary_artist_key || song.artist_slug);
      return artistName === targetName || (targetKey && artistKey === targetKey);
    });
  }

  async function loadCatalog() {
    if (state.artist && state.songs.length) return state;
    if (!state.catalogPromise) {
      state.catalogPromise = Promise.all([
        json(`${API}/radio/artists/${encodeURIComponent(identifier)}`),
        json(SONGS_URL)
      ]).then(([artistBody, songsBody]) => {
        state.artist = artistBody.artist || {};
        const allSongs = rows(songsBody, ['songs', 'items', 'data']);
        state.songs = artistSongs(allSongs, state.artist)
          .filter(song => clean(song.song_key) && songAudio(song))
          .sort((a, b) => songPlays(b) - songPlays(a) || songTitle(a).localeCompare(songTitle(b)));
        return state;
      });
    }
    return state.catalogPromise;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  function ensureOverlay() {
    if (state.overlay) return state.overlay;
    const overlay = document.createElement('section');
    overlay.className = 'artist-realm-player';
    overlay.hidden = true;
    overlay.setAttribute('aria-label', 'Artist visual radio player');
    overlay.innerHTML = `
      <div class="artist-realm-stage" data-realm-stage></div>
      <header class="artist-realm-header">
        <button type="button" class="artist-realm-home" data-realm-home aria-label="Back to Stashbox Radio home">${icon.back}</button>
        <div class="artist-realm-brand"><strong data-realm-artist>Artist Radio</strong><span class="artist-realm-vec"><i></i><b>VEC</b></span></div>
        <button type="button" class="artist-realm-profile" data-realm-profile>Artist Page</button>
      </header>
      <div class="artist-realm-loader" data-realm-loader><i></i><span>Building visual experience…</span></div>
      <section class="artist-realm-bottom">
        <div class="artist-realm-meta"><small data-realm-genre>Artist Visual Radio</small><h2 data-realm-title>Loading…</h2><p data-realm-subtitle></p></div>
        <div class="artist-realm-progress-row"><span data-realm-current>0:00</span><input class="artist-realm-progress" data-realm-progress type="range" min="0" max="1000" value="0" aria-label="Song progress"><span data-realm-duration>0:00</span></div>
        <div class="artist-realm-controls">
          <button type="button" class="artist-realm-control" data-realm-prev aria-label="Previous song">${icon.prev}</button>
          <button type="button" class="artist-realm-control primary" data-realm-toggle aria-label="Play">${icon.play}</button>
          <button type="button" class="artist-realm-control" data-realm-next aria-label="Next song">${icon.next}</button>
        </div>
        <p class="artist-realm-status" data-realm-status></p>
      </section>`;
    document.body.appendChild(overlay);

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    state.overlay = overlay;
    state.audio = audio;

    overlay.querySelector('[data-realm-home]')?.addEventListener('click', () => {
      stopAll();
      location.href = '/radio/dev/v2/';
    });
    overlay.querySelector('[data-realm-profile]')?.addEventListener('click', closeRealm);
    overlay.querySelector('[data-realm-toggle]')?.addEventListener('click', toggleAudio);
    overlay.querySelector('[data-realm-prev]')?.addEventListener('click', () => moveSong(-1));
    overlay.querySelector('[data-realm-next]')?.addEventListener('click', () => moveSong(1));
    overlay.querySelector('[data-realm-progress]')?.addEventListener('input', event => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = Number(event.currentTarget.value || 0) / 1000 * audio.duration;
    });

    audio.addEventListener('play', updatePlaybackUi);
    audio.addEventListener('pause', updatePlaybackUi);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', () => moveSong(1));
    audio.addEventListener('error', () => setStatus('This song audio could not be loaded.'));
    return overlay;
  }

  function setLoading(loading, label = 'Building visual experience…') {
    const loader = state.overlay?.querySelector('[data-realm-loader]');
    if (!loader) return;
    loader.hidden = !loading;
    const text = loader.querySelector('span');
    if (text) text.textContent = label;
  }

  function setStatus(message = '') {
    const node = state.overlay?.querySelector('[data-realm-status]');
    if (node) node.textContent = message;
  }

  function updatePlaybackUi() {
    const button = state.overlay?.querySelector('[data-realm-toggle]');
    if (!button || !state.audio) return;
    const paused = state.audio.paused;
    button.innerHTML = paused ? icon.play : icon.pause;
    button.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }

  function updateProgress() {
    if (!state.audio || !state.overlay) return;
    const duration = Number.isFinite(state.audio.duration) ? state.audio.duration : 0;
    const current = Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
    const progress = state.overlay.querySelector('[data-realm-progress]');
    if (progress) progress.value = duration > 0 ? String(Math.round(current / duration * 1000)) : '0';
    const currentNode = state.overlay.querySelector('[data-realm-current]');
    const durationNode = state.overlay.querySelector('[data-realm-duration]');
    if (currentNode) currentNode.textContent = formatTime(current);
    if (durationNode) durationNode.textContent = formatTime(duration);
  }

  function renderSongMeta(song) {
    if (!state.overlay) return;
    const artistName = clean(state.artist?.name || song.artist || song.artist_name || 'Artist');
    const title = songTitle(song);
    const genre = clean(song.genre || song.primary_genre || 'Artist Visual Radio');
    const album = clean(song.album_name || song.release_format || 'Stashbox Radio');
    const artistNode = state.overlay.querySelector('[data-realm-artist]');
    const titleNode = state.overlay.querySelector('[data-realm-title]');
    const genreNode = state.overlay.querySelector('[data-realm-genre]');
    const subtitleNode = state.overlay.querySelector('[data-realm-subtitle]');
    if (artistNode) artistNode.textContent = artistName;
    if (titleNode) titleNode.textContent = title;
    if (genreNode) genreNode.textContent = genre;
    if (subtitleNode) subtitleNode.textContent = `${artistName} · ${album}`;
  }

  async function openRealm(song, queue = null) {
    await loadCatalog();
    if (!state.songs.length) return;
    const selected = song || state.songs[0];
    state.queue = Array.isArray(queue) && queue.length ? queue : [...state.songs];
    state.index = Math.max(0, state.queue.findIndex(item => item.song_key === selected.song_key));
    if (state.index < 0) state.index = 0;
    const overlay = ensureOverlay();
    overlay.hidden = false;
    document.body.classList.add('artist-realm-open');
    await playCurrentSong();
  }

  async function playCurrentSong() {
    const song = state.queue[state.index];
    if (!song || !state.audio) return;
    state.currentSong = song;
    clearTimeout(state.trackTimer);
    state.trackedSongKey = '';
    renderSongMeta(song);
    setStatus('');
    setLoading(true);

    state.audio.pause();
    state.audio.src = songAudio(song);
    state.audio.currentTime = 0;
    state.audio.load();
    updateProgress();
    updatePlaybackUi();

    loadVec(song).catch(() => showArtworkOnly(song));
    try {
      await state.audio.play();
      state.trackTimer = window.setTimeout(() => trackQualifiedPlay(song), 10000);
    } catch (_) {
      setStatus('Tap the play button to begin this artist experience.');
    }
  }

  function toggleAudio() {
    if (!state.audio) return;
    if (state.audio.paused) {
      state.audio.play().then(() => {
        if (state.currentSong && state.trackedSongKey !== state.currentSong.song_key) {
          clearTimeout(state.trackTimer);
          state.trackTimer = window.setTimeout(() => trackQualifiedPlay(state.currentSong), 10000);
        }
      }).catch(() => setStatus('Audio playback was blocked by the browser.'));
    } else {
      state.audio.pause();
    }
  }

  function moveSong(direction) {
    if (!state.queue.length) return;
    state.index = (state.index + direction + state.queue.length) % state.queue.length;
    playCurrentSong();
  }

  function closeRealm() {
    stopAll();
    if (state.overlay) state.overlay.hidden = true;
    document.body.classList.remove('artist-realm-open');
  }

  function stopAll() {
    clearTimeout(state.trackTimer);
    stopVec();
    if (state.audio) {
      state.audio.pause();
      state.audio.removeAttribute('src');
      state.audio.load();
    }
    state.currentSong = null;
    updatePlaybackUi();
  }

  function trackQualifiedPlay(song) {
    if (!song || state.trackedSongKey === song.song_key || state.audio?.paused) return;
    state.trackedSongKey = song.song_key;
    fetch(`${API}/radio/track`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'play',
        action: 'play',
        song_key: song.song_key,
        display_title: songTitle(song),
        artist: clean(state.artist?.name || song.artist || song.artist_name),
        source: 'v2_artist_realm'
      })
    }).catch(() => {});
  }

  function parseUrls(value) {
    if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
    if (!value) return [];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parseUrls(parsed);
      } catch (_) {}
      return [...new Set(trimmed.split(/[\n,]+/).map(clean).filter(Boolean))];
    }
    return [];
  }

  function assetType(asset) {
    const value = clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type).toLowerCase();
    return value === 'clip' || value === 'video' || value.startsWith('video/') ? 'clip' : 'image';
  }

  function normalizeAsset(asset, source, folder = null) {
    if (!asset || typeof asset !== 'object') return null;
    const url = fixUrl(asset.public_url || asset.url || asset.asset_url || asset.src || asset.file_url || asset.s3_url);
    if (!url) return null;
    const status = clean(asset.status).toLowerCase();
    if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || asset.hidden === true || asset.deleted === true) return null;
    const id = clean(asset.id || asset.asset_id || asset.s3_key || asset.key || url);
    return {
      id,
      key: id,
      type: assetType(asset),
      url,
      source,
      durationSeconds: Math.max(1, Number(asset.duration_seconds || asset.durationSeconds || 0) || 0),
      alt: clean(asset.alt_text || asset.altText || asset.file_name || asset.name || asset.title || 'Artist visual'),
      productUrls: parseUrls(asset.shopify_product_urls || asset.shopifyProductUrls || [])
    };
  }

  function idSet(values) {
    return new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean));
  }

  function includeByRecipe(assets, part = {}) {
    const activeImages = idSet(part.active_image_ids || part.activeImageIds);
    const activeClips = idSet(part.active_clip_ids || part.activeClipIds);
    const excludedImages = idSet(part.excluded_image_ids || part.excludedImageIds);
    const excludedClips = idSet(part.excluded_clip_ids || part.excludedClipIds);
    const hasActive = activeImages.size || activeClips.size;
    return assets.filter(asset => {
      const isClip = asset.type === 'clip';
      const active = isClip ? activeClips : activeImages;
      const excluded = isClip ? excludedClips : excludedImages;
      if (excluded.has(asset.id) || excluded.has(asset.key) || excluded.has(asset.url)) return false;
      if (!hasActive) return true;
      return active.has(asset.id) || active.has(asset.key) || active.has(asset.url);
    });
  }

  function dedupe(assets) {
    const seen = new Set();
    return assets.filter(asset => {
      const key = clean(asset.id || asset.url).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shuffle(assets) {
    const result = [...assets];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  async function fetchSongAssets(songKey, source = 'song') {
    const body = await json(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(songKey)}`);
    return rows(body, ['assets', 'items', 'data']).map(asset => normalizeAsset(asset, source)).filter(Boolean);
  }

  async function fetchFolderAssets(folder) {
    const folderId = clean(folder.folder_id || folder.visual_folder_id || folder.id);
    if (!folderId) return [];
    const body = await json(`${FOLDERS_URL}/${encodeURIComponent(folderId)}/assets`);
    return includeByRecipe(rows(body, ['assets', 'items', 'data']).map(asset => normalizeAsset(asset, `folder:${folderId}`, folder)).filter(Boolean), folder);
  }

  async function loadVec(song) {
    const run = ++state.vecRun;
    stopVisualPlayback();
    const [recipeBody, songAssets] = await Promise.all([
      json(`${RECIPE_URL}?song_key=${encodeURIComponent(song.song_key)}`).catch(() => ({})),
      fetchSongAssets(song.song_key).catch(() => [])
    ]);
    if (run !== state.vecRun) return;

    const recipe = recipeFrom(recipeBody);
    const folders = (Array.isArray(recipe?.folders) ? recipe.folders : []).filter(folder => folder?.enabled !== false && clean(folder?.status).toLowerCase() !== 'hidden');
    const folderGroups = await Promise.all(folders.map(folder => fetchFolderAssets(folder).catch(() => [])));
    if (run !== state.vecRun) return;

    const borrowedSource = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs]
      .find(candidate => Array.isArray(candidate) || Array.isArray(candidate?.sources) || Array.isArray(candidate?.songs));
    const borrowed = Array.isArray(borrowedSource) ? borrowedSource : (borrowedSource?.sources || borrowedSource?.songs || []);
    const borrowedGroups = await Promise.all(borrowed.filter(source => source?.enabled !== false).map(async source => {
      const key = clean(source.song_key || source.source_song_key || source.key || source.id);
      if (!key) return [];
      return includeByRecipe(await fetchSongAssets(key, `borrowed:${key}`).catch(() => []), source);
    }));
    if (run !== state.vecRun) return;

    const artwork = {
      id: `artwork:${song.song_key}`,
      key: `artwork:${song.song_key}`,
      type: 'image',
      url: songArt(song),
      source: 'official-artwork',
      durationSeconds: Math.max(2, Number(recipe?.artwork?.start_duration_seconds || recipe?.artwork_rules?.start_duration_seconds || 4) || 4),
      alt: `${songTitle(song)} artwork`
    };

    const visualMode = clean(recipe?.visual_mode || recipe?.visualMode).toLowerCase();
    if (visualMode === 'artwork_only') {
      startSequence(song, recipe, [artwork], run);
      return;
    }

    const all = dedupe([
      ...includeByRecipe(songAssets, recipe?.song_assets || recipe?.songAssets || {}),
      ...folderGroups.flat(),
      ...borrowedGroups.flat()
    ]);
    const manual = Array.isArray(recipe?.manual_sequence) ? recipe.manual_sequence : (Array.isArray(recipe?.sequence) ? recipe.sequence : []);
    const orderMode = clean(recipe?.shuffle?.order_mode || recipe?.shuffle_rules?.order_mode || recipe?.order_mode).toLowerCase();
    let sequence = [];

    if (orderMode === 'manual' && manual.length) {
      const byId = new Map(all.flatMap(asset => [[asset.id, asset], [asset.key, asset], [asset.url, asset]]));
      sequence = manual.map(entry => {
        const id = clean(entry.asset_id || entry.assetId || entry.asset_key || entry.assetKey);
        const isArtwork = clean(entry.source_kind || entry.sourceKind).toLowerCase() === 'artwork' || id === 'official-artwork';
        const asset = isArtwork ? artwork : byId.get(id);
        return asset ? { ...asset, durationSeconds: Math.max(1, Number(entry.duration_seconds || entry.durationSeconds || asset.durationSeconds || 4)) } : null;
      }).filter(Boolean);
    } else {
      const clips = all.filter(asset => asset.type === 'clip');
      const images = all.filter(asset => asset.type !== 'clip');
      const bag = shuffle(clips.length ? [...clips, ...images] : images);
      const startWithArtwork = recipe?.artwork?.start_with_artwork !== false && recipe?.artwork_rules?.start_with_artwork !== false;
      sequence = startWithArtwork ? [artwork, ...bag] : bag;
    }

    if (!sequence.length) sequence = [artwork];
    startSequence(song, recipe, sequence, run);
  }

  function showArtworkOnly(song) {
    const run = ++state.vecRun;
    startSequence(song, {}, [{
      id: `artwork:${song.song_key}`,
      key: `artwork:${song.song_key}`,
      type: 'image',
      url: songArt(song),
      source: 'official-artwork',
      durationSeconds: 8,
      alt: `${songTitle(song)} artwork`
    }], run);
  }

  function startSequence(song, recipe, sequence, run) {
    if (run !== state.vecRun || !state.overlay || state.overlay.hidden) return;
    state.sequence = sequence;
    state.sequenceIndex = 0;
    setLoading(false);
    renderAsset(song, recipe, run);
  }

  function stopVisualPlayback() {
    clearTimeout(state.visualTimer);
    clearTimeout(state.visualSafetyTimer);
    state.visualTimer = 0;
    state.visualSafetyTimer = 0;
    if (state.activeMedia) {
      try { state.activeMedia.pause?.(); } catch (_) {}
      state.activeMedia.remove();
      state.activeMedia = null;
    }
  }

  function stopVec() {
    state.vecRun += 1;
    state.sequence = [];
    state.sequenceIndex = 0;
    stopVisualPlayback();
    const stage = state.overlay?.querySelector('[data-realm-stage]');
    stage?.querySelectorAll('img,video').forEach(node => node.remove());
  }

  function scheduleNext(song, recipe, run, milliseconds) {
    clearTimeout(state.visualTimer);
    if (state.sequence.length <= 1) return;
    state.visualTimer = window.setTimeout(() => {
      if (run !== state.vecRun) return;
      state.sequenceIndex = (state.sequenceIndex + 1) % state.sequence.length;
      renderAsset(song, recipe, run);
    }, milliseconds);
  }

  function renderAsset(song, recipe, run) {
    if (run !== state.vecRun || !state.overlay) return;
    const stage = state.overlay.querySelector('[data-realm-stage]');
    const asset = state.sequence[state.sequenceIndex];
    if (!stage || !asset) return;

    stopVisualPlayback();
    const previous = [...stage.querySelectorAll('img,video')];
    const media = document.createElement(asset.type === 'clip' ? 'video' : 'img');
    media.src = asset.url;
    media.className = 'artist-realm-media';
    media.setAttribute('aria-label', asset.alt || 'Artist VEC visual');
    state.activeMedia = media;
    stage.appendChild(media);
    requestAnimationFrame(() => media.classList.add('is-active'));
    window.setTimeout(() => previous.forEach(node => node.remove()), 500);

    if (asset.type === 'clip') {
      media.muted = true;
      media.defaultMuted = true;
      media.volume = 0;
      media.playsInline = true;
      media.autoplay = true;
      media.preload = 'auto';
      media.setAttribute('muted', '');
      media.setAttribute('playsinline', '');
      media.onended = () => {
        if (run !== state.vecRun) return;
        state.sequenceIndex = (state.sequenceIndex + 1) % state.sequence.length;
        renderAsset(song, recipe, run);
      };
      media.onerror = media.onstalled = () => scheduleNext(song, recipe, run, 900);
      media.play().catch(() => {});
      state.visualSafetyTimer = window.setTimeout(() => {
        if (run !== state.vecRun) return;
        state.sequenceIndex = (state.sequenceIndex + 1) % state.sequence.length;
        renderAsset(song, recipe, run);
      }, Math.max(12000, Math.min(60000, (asset.durationSeconds || 45) * 1000)));
    } else {
      const duration = Math.max(2500, Math.min(15000, (asset.durationSeconds || recipe?.render?.still_image_duration_seconds || recipe?.render_settings?.still_image_duration_seconds || 6) * 1000));
      scheduleNext(song, recipe, run, duration);
    }
  }

  function ensureHeroLaunch() {
    const hero = app.querySelector('.artist-hero');
    if (!hero || hero.querySelector('[data-artist-realm-launch]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artist-hero-vec-launch';
    button.dataset.artistRealmLaunch = 'true';
    button.setAttribute('aria-label', 'Play this artist in VEC visual radio');
    button.innerHTML = `${icon.play}<span>Play Visual Radio</span>`;
    hero.appendChild(button);
  }

  async function interceptPlayback(event) {
    const launch = event.target.closest('#artistApp [data-artist-realm-launch]');
    const songButton = event.target.closest('#artistApp [data-play-song]');
    const radioButton = event.target.closest('#artistApp [data-start-radio]');
    const playlistButton = event.target.closest('#artistApp [data-play-playlist]');
    if (!launch && !songButton && !radioButton && !playlistButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await loadCatalog();
      if (!state.songs.length) return;
      if (songButton) {
        const selected = state.songs.find(song => song.song_key === songButton.dataset.playSong) || state.songs[0];
        await openRealm(selected, [...state.songs]);
        return;
      }
      if (radioButton) {
        const pool = state.songs.slice(0, Math.min(12, state.songs.length));
        const selected = pool[Math.floor(Math.random() * pool.length)] || state.songs[0];
        await openRealm(selected, shuffle([...state.songs]));
        return;
      }
      if (playlistButton) {
        const playlistIndex = Math.max(0, Number(playlistButton.dataset.playPlaylist || 0));
        const queue = playlistIndex === 1
          ? [...state.songs].sort((a, b) => new Date(b.release_date || b.created_at || 0) - new Date(a.release_date || a.created_at || 0))
          : [...state.songs];
        await openRealm(queue[0], queue);
        return;
      }
      await openRealm(state.songs[0], [...state.songs]);
    } catch (error) {
      console.error('[Artist Realm Player]', error);
    }
  }

  document.addEventListener('click', interceptPlayback, true);
  document.addEventListener('keydown', event => {
    if (!state.overlay || state.overlay.hidden) return;
    if (event.key === ' ' && !event.target.matches('input,button,a,textarea,select')) {
      event.preventDefault();
      toggleAudio();
    }
    if (event.key === 'ArrowRight') moveSong(1);
    if (event.key === 'ArrowLeft') moveSong(-1);
    if (event.key === 'Escape') closeRealm();
  });

  new MutationObserver(ensureHeroLaunch).observe(app, { childList: true, subtree: true });
  ensureHeroLaunch();
})();
