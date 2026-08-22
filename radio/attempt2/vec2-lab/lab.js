(() => {
  'use strict';

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS = `${API}/radio/songs`;
  const RECIPE = `${API}/radio/vec/recipe`;
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const FOLDERS = `${API}/radio/visuals/folders`;

  const select = document.getElementById('songSelect');
  const loadBtn = document.getElementById('loadBtn');
  const nextBtn = document.getElementById('nextBtn');
  const audio = document.getElementById('audio');
  const stageHost = document.getElementById('stageHost');
  const status = document.getElementById('status');
  const songMeta = document.getElementById('songMeta');
  const introMeta = document.getElementById('introMeta');
  const assetMeta = document.getElementById('assetMeta');
  const stateMeta = document.getElementById('stateMeta');
  const logEl = document.getElementById('log');

  const state = { songs: [], currentSong: null, session: null, generation: 0 };
  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const arr = value => Array.isArray(value) ? value : [];

  function log(message, data) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`;
    logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 18000);
    console.log('[VEC2 LAB]', message, data ?? '');
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function rows(value, keys = ['items', 'data', 'assets']) {
    value = unwrap(value);
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    if (value?.data && value.data !== value) return rows(value.data, keys);
    return [];
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  const songKey = song => clean(song?.song_key || song?.songKey || song?.key || song?.id);
  const songTitle = song => clean(song?.display_title || song?.song_name || song?.title || songKey(song));
  const songArtist = song => clean(song?.artist || song?.artist_name || 'Stashbox');
  const songAudio = song => clean(song?.audio_url || song?.audioUrl || song?.stream_url || song?.streamUrl || song?.audio);

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function assetUrl(asset) {
    return clean(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url || asset?.video_url || asset?.clip_url || asset?.image_url || asset?.media_url || asset?.source_url)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function assetType(asset) {
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.kind);
    return type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset)) ? 'video' : 'image';
  }

  function activeAsset(asset) {
    const status = lower(asset?.status || 'active');
    return asset && assetUrl(asset) && !['hidden','deleted','archived','inactive','disabled'].includes(status) && asset.hidden !== true && asset.deleted !== true && asset.active !== false;
  }

  function idSet(section, names) {
    return new Set(names.flatMap(name => arr(section?.[name])).map(clean).filter(Boolean));
  }

  function selectAssets(body, section = {}, source = 'song', folderId = '') {
    const activeClips = idSet(section, ['active_clip_ids','activeClipIds']);
    const activeImages = idSet(section, ['active_image_ids','activeImageIds']);
    const excludedClips = idSet(section, ['excluded_clip_ids','excludedClipIds']);
    const excludedImages = idSet(section, ['excluded_image_ids','excludedImageIds']);
    const restricted = activeClips.size || activeImages.size;

    return rows(body, ['assets','items','results','data']).filter(activeAsset).filter(asset => {
      const id = assetId(asset), url = assetUrl(asset), type = assetType(asset);
      const allowed = type === 'video' ? activeClips : activeImages;
      const excluded = type === 'video' ? excludedClips : excludedImages;
      if (excluded.has(id) || excluded.has(url)) return false;
      return !restricted || allowed.has(id) || allowed.has(url);
    }).map(asset => ({
      id: assetId(asset),
      url: assetUrl(asset),
      type: assetType(asset),
      durationMs: Math.max(1000, Number(asset?.duration_ms || asset?.display_ms || asset?.display_duration_ms || 8000)),
      folderId: clean(folderId || asset?.folder_id || asset?.folderId),
      source
    }));
  }

  function folderRecipes(recipe) {
    const groups = [recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders, recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders, recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders];
    const seen = new Set(), out = [];
    for (const group of groups) {
      for (const folder of (Array.isArray(group) ? group : arr(group?.items))) {
        const id = clean(folder?.folder_id || folder?.visual_folder_id || folder?.folderId || folder?.id || folder?.key);
        if (!id || seen.has(id) || folder?.enabled === false || lower(folder?.status) === 'hidden') continue;
        seen.add(id); out.push({ ...folder, __id: id });
      }
    }
    return out;
  }

  function borrowedRecipes(recipe) {
    const groups = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs];
    const seen = new Set(), out = [];
    for (const group of groups) {
      const list = Array.isArray(group) ? group : [...arr(group?.sources), ...arr(group?.songs)];
      for (const source of list) {
        const key = clean(source?.source_song_key || source?.song_key || source?.key || source?.id);
        if (!key || seen.has(key) || source?.enabled === false) continue;
        seen.add(key); out.push({ ...source, __key: key });
      }
    }
    return out;
  }

  function introSeconds(recipe) {
    const art = recipe?.artwork || recipe?.artwork_rules || {};
    if (art.start_with_artwork === false || art.startWithArtwork === false) return 0;
    const value = Number(art.start_duration_seconds ?? art.startDurationSeconds ?? 4);
    return Number.isFinite(value) ? Math.max(0, Math.min(30, value)) : 4;
  }

  async function artworkUrl(song) {
    const key = songKey(song);
    const direct = clean(song?.artwork_16x9_url || song?.song_artwork_16x9_url || song?.wide_artwork_url || song?.resolved_artwork_url || song?.song_artwork_url || song?.artwork_url || song?.image_url);
    try {
      const body = await getJson(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`);
      const data = unwrap(body) || {};
      const media = data.media || data.data?.media || data.data || data;
      const images = media.artwork_images && typeof media.artwork_images === 'object' ? media.artwork_images : {};
      return clean(images['16x9'] || images['21x9'] || media.song_artwork_16x9_url || media.song_artwork_21x9_url || images['1x1'] || media.song_artwork_url || direct);
    } catch (_) {
      return direct;
    }
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter(asset => {
      const key = `${asset.type}:${asset.id || asset.url}`;
      if (!asset.url || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  async function buildSession(song, generation) {
    const key = songKey(song);
    status.textContent = 'LOADING CMS';
    const [recipeResult, directResult, artResult] = await Promise.allSettled([
      getJson(`${RECIPE}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(key)}`),
      artworkUrl(song)
    ]);
    if (generation !== state.generation) throw new Error('stale-load');

    const recipe = recipeFrom(recipeResult.status === 'fulfilled' ? recipeResult.value : {});
    const visualMode = lower(recipe?.visual_mode || recipe?.visualMode);
    let assets = visualMode === 'artwork_only' ? [] : selectAssets(directResult.status === 'fulfilled' ? directResult.value : {}, recipe?.song_assets || recipe?.songAssets || {}, 'song');

    if (visualMode !== 'artwork_only') {
      const jobs = [];
      for (const folder of folderRecipes(recipe)) {
        jobs.push(getJson(`${FOLDERS}/${encodeURIComponent(folder.__id)}/assets`)
          .then(body => selectAssets(body, folder, `folder:${folder.__id}`, folder.__id)).catch(() => []));
      }
      for (const source of borrowedRecipes(recipe)) {
        if (source.__key === key) continue;
        jobs.push(getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(source.__key)}`)
          .then(body => selectAssets(body, source, `borrowed:${source.__key}`)).catch(() => []));
      }
      const extras = await Promise.all(jobs);
      if (generation !== state.generation) throw new Error('stale-load');
      for (const group of extras) assets.push(...group);
    }

    return {
      songKey: key,
      artworkUrl: artResult.status === 'fulfilled' ? artResult.value : '',
      artworkIntroSeconds: introSeconds(recipe),
      assets: dedupe(assets),
      visualMode
    };
  }

  async function loadSelected() {
    const song = state.songs[Number(select.value) || 0];
    if (!song) return;
    const generation = ++state.generation;
    state.currentSong = song;
    state.session = null;
    window.StashboxVec2?.stop?.();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    status.textContent = 'LOADING';
    songMeta.textContent = `${songTitle(song)} — ${songArtist(song)}`;
    introMeta.textContent = '…'; assetMeta.textContent = '…'; stateMeta.textContent = 'LOADING';
    log('Loading song', { key: songKey(song), title: songTitle(song) });

    try {
      const session = await buildSession(song, generation);
      if (generation !== state.generation) return;
      state.session = session;
      const src = songAudio(song);
      if (!src) throw new Error('Song has no audio URL');
      audio.src = src;
      audio.load();
      introMeta.textContent = `${session.artworkIntroSeconds}s`;
      assetMeta.textContent = `${session.assets.length} VEC assets`;
      stateMeta.textContent = 'READY';
      status.textContent = 'READY — PRESS PLAY';
      log('Session ready', { intro: session.artworkIntroSeconds, assets: session.assets.length, mode: session.visualMode });
    } catch (error) {
      status.textContent = 'ERROR'; stateMeta.textContent = 'ERROR';
      log('Load failed', { error: error?.message || String(error) });
    }
  }

  async function startVec() {
    const session = state.session;
    if (!session || !state.currentSong) return;
    try {
      await window.StashboxVec2.begin({
        host: stageHost,
        songKey: session.songKey,
        artworkUrl: session.artworkUrl,
        artworkIntroSeconds: session.artworkIntroSeconds,
        assets: session.assets
      });
      status.textContent = 'PLAYING';
      log('VEC session started', window.StashboxVec2.state());
    } catch (error) {
      log('VEC start failed', { error: error?.message || String(error) });
    }
  }

  async function loadSongs() {
    status.textContent = 'LOADING SONGS';
    try {
      const body = await getJson(SONGS);
      state.songs = rows(body, ['songs','items','data']).filter(song => songKey(song) && songAudio(song));
      select.replaceChildren(...state.songs.map((song, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${songTitle(song)} — ${songArtist(song)}`;
        return option;
      }));
      status.textContent = `${state.songs.length} SONGS`;
      log('Song catalog loaded', { count: state.songs.length });
      if (state.songs.length) loadSelected();
    } catch (error) {
      status.textContent = 'CATALOG ERROR';
      log('Song catalog failed', { error: error?.message || String(error) });
    }
  }

  loadBtn.addEventListener('click', loadSelected);
  nextBtn.addEventListener('click', () => {
    if (!state.songs.length) return;
    select.value = String((Number(select.value || 0) + 1) % state.songs.length);
    loadSelected();
  });
  select.addEventListener('change', loadSelected);
  audio.addEventListener('play', startVec);
  audio.addEventListener('pause', () => {
    if (!audio.ended) { window.StashboxVec2?.stop?.(); status.textContent = 'PAUSED'; }
  });
  audio.addEventListener('ended', () => { window.StashboxVec2?.stop?.(); status.textContent = 'ENDED'; });

  window.addEventListener('stashbox:vec2-diagnostic', event => {
    const detail = event.detail || {};
    stateMeta.textContent = detail.state || detail.next || window.StashboxVec2?.state?.().state || '—';
    if (['session-start','asset-ready','asset-playing','asset-failed','pool-reset','state'].includes(detail.type)) {
      log(detail.type, detail);
    }
  });

  window.setInterval(() => {
    const vec = window.StashboxVec2?.state?.();
    if (vec) stateMeta.textContent = vec.state;
  }, 500);

  loadSongs();
})();