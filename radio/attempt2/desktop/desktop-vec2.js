(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopVec2) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const URLS = Object.freeze({
    songs: `${API}/radio/songs`,
    recipe: `${API}/radio/vec/recipe`,
    songAssets: `${API}/radio/vec/song-assets`,
    folders: `${API}/radio/visuals/folders`
  });
  const IMAGE_DEFAULT_MS = 8000;
  const SESSION_CACHE_MS = 60000;
  const PRELOAD_TIMEOUT_MS = 12000;
  const PRELOAD_ATTEMPT_LIMIT = 4;
  const TRANSITION_PRELOAD_WAIT_MS = 2600;
  const VIDEO_PLAY_START_TIMEOUT_MS = 1600;
  const VIDEO_LEASE_MAX_SECONDS = 12;
  const VIDEO_LEASE_GRACE_SECONDS = 0.5;
  const RECOVERY_RETRY_MS = 1800;
  const RECOVERY_RETRY_MAX_MS = 8000;

  const state = {
    generation: 0,
    starting: false,
    songKey: '',
    status: 'IDLE',
    catalogPromise: null,
    cache: new Map(),
    stage: null,
    artwork: null,
    layers: [],
    currentLayer: -1,
    nextLayer: 0,
    pool: [],
    played: new Set(),
    failed: new Set(),
    currentAsset: null,
    nextAsset: null,
    nextPrepared: null,
    nextPromise: null,
    preloadEpoch: 0,
    introTimer: 0,
    introTargetMs: 0,
    introComplete: false,
    introHandoffRunning: false,
    imageTimer: 0,
    imageDeadlineAudioSeconds: 0,
    videoTimer: 0,
    videoDeadlineAudioSeconds: 0,
    recoveryTimer: 0,
    recoveryCycles: 0,
    recovering: false,
    advancing: false,
    debugNode: null,
    diagnostics: []
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const normalize = value => lower(value).replace(/\s+/g, ' ');
  const list = value => Array.isArray(value) ? value : [];

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function rows(value, keys = ['assets', 'items', 'data']) {
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

  function currentPlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(player => {
      if (!player?.isConnected || player.hidden) return false;
      const style = getComputedStyle(player);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || document.querySelector('#v2App [data-player]');
  }

  function currentAudio(player = currentPlayer()) {
    return player?.querySelector('[data-audio], audio') || null;
  }

  function log(type, detail = {}) {
    const entry = { at: Date.now(), generation: state.generation, songKey: state.songKey, status: state.status, type, ...detail };
    state.diagnostics.push(entry);
    if (state.diagnostics.length > 120) state.diagnostics.shift();
    window.dispatchEvent(new CustomEvent('stashbox:desktop-vec2-diagnostic', { detail: entry }));
  }

  function setStatus(next, detail = '') {
    state.status = next;
    const player = currentPlayer();
    if (player) {
      player.dataset.vec2State = next;
      player.dataset.vec2Detail = detail;
      player.dataset.vec2SongKey = state.songKey;
      player.dataset.vec2PoolSize = String(state.pool.length);
      player.dataset.vec2PlayedCount = String(state.played.size);
      player.dataset.vec2FailedCount = String(state.failed.size);
    }
    log('state', { next, detail });
    renderDebug();
  }

  function canonical(value) {
    const raw = clean(value).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      url.hash = '';
      return url.href;
    } catch (_) { return raw; }
  }

  function canonicalPath(value) {
    try { return new URL(canonical(value), location.href).pathname.toLowerCase(); }
    catch (_) { return canonical(value).split(/[?#]/)[0].toLowerCase(); }
  }

  function songKey(song) { return clean(song?.song_key || song?.songKey || song?.id || song?.key); }
  function songTitle(song) { return clean(song?.display_title || song?.song_name || song?.title || songKey(song)); }
  function songArtist(song) { return clean(song?.artist || song?.artist_name || 'Stashbox'); }
  function songAudio(song) { return canonical(song?.audio_url || song?.resolved_audio_url || song?.audioUrl || song?.stream_url || song?.mp3_url); }
  function squareArtwork(song) { return canonical(song?.resolved_artwork_url || song?.song_artwork_url || song?.artwork_url || song?.cover_art_url || song?.image_url); }

  async function catalog() {
    if (!state.catalogPromise) {
      state.catalogPromise = getJson(URLS.songs)
        .then(body => rows(body, ['songs', 'items', 'data']))
        .catch(error => { state.catalogPromise = null; throw error; });
    }
    return state.catalogPromise;
  }

  function findSong(items, player, audio) {
    const audioPath = canonicalPath(audio?.currentSrc || audio?.src);
    if (audioPath) {
      const byAudio = items.find(item => canonicalPath(songAudio(item)) === audioPath);
      if (byAudio) return byAudio;
    }

    const title = normalize(player?.querySelector('[data-ptitle]')?.textContent);
    const artist = normalize(player?.querySelector('[data-partist]')?.textContent);
    if (title) {
      const byMeta = items.find(item => normalize(songTitle(item)) === title && (!artist || normalize(songArtist(item)) === artist))
        || items.find(item => normalize(songTitle(item)) === title);
      if (byMeta) return byMeta;
    }

    const hinted = clean(player?.dataset?.songKey || player?.dataset?.currentSongKey || player?.dataset?.song);
    return hinted ? items.find(item => songKey(item) === hinted) || null : null;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function assetUrl(asset) {
    return canonical(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url || asset?.video_url || asset?.clip_url || asset?.image_url || asset?.media_url || asset?.source_url);
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function assetType(asset) {
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.kind || asset?.file_type);
    return type.includes('video') || type.includes('clip') || /\.(mp4|webm|m4v|mov)(?:$|[?#])/i.test(assetUrl(asset)) ? 'video' : 'image';
  }

  function assetActive(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status)
      && asset?.hidden !== true && asset?.deleted !== true && asset?.active !== false;
  }

  function idSet(section, fields) {
    return new Set(fields.flatMap(field => list(section?.[field])).map(clean).filter(Boolean));
  }

  function selectedAssets(body, section = {}, source = 'song', folderId = '') {
    const assets = rows(body, ['assets', 'items', 'results', 'data']);
    const activeClips = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const activeImages = idSet(section, ['active_image_ids', 'activeImageIds']);
    const excludedClips = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    const excludedImages = idSet(section, ['excluded_image_ids', 'excludedImageIds']);
    const restricted = activeClips.size > 0 || activeImages.size > 0;

    return assets.filter(asset => {
      if (!asset || !assetActive(asset) || !assetUrl(asset)) return false;
      const id = assetId(asset);
      const url = assetUrl(asset);
      const type = assetType(asset);
      const active = type === 'video' ? activeClips : activeImages;
      const excluded = type === 'video' ? excludedClips : excludedImages;
      if (excluded.has(id) || excluded.has(url)) return false;
      return !restricted || active.has(id) || active.has(url);
    }).map(asset => ({
      id: assetId(asset),
      url: assetUrl(asset),
      type: assetType(asset),
      durationMs: Math.max(1500, Number(asset?.duration_ms || asset?.display_ms || asset?.display_duration_ms || 0) || IMAGE_DEFAULT_MS),
      folderId: clean(folderId || asset?.folder_id || asset?.folderId),
      source
    }));
  }

  function folderRecipes(recipe) {
    const groups = [recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders, recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders, recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders];
    const seen = new Set();
    const out = [];
    groups.forEach(group => {
      const items = Array.isArray(group) ? group : list(group?.items);
      items.forEach(folder => {
        if (!folder || folder.enabled === false || lower(folder.status) === 'hidden') return;
        const id = clean(folder.folder_id || folder.visual_folder_id || folder.folderId || folder.id || folder.key);
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({ ...folder, __id: id });
      });
    });
    return out;
  }

  function borrowedRecipes(recipe) {
    const groups = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs];
    const seen = new Set();
    const out = [];
    groups.forEach(group => {
      const items = Array.isArray(group) ? group : [...list(group?.sources), ...list(group?.songs)];
      items.forEach(source => {
        if (!source || source.enabled === false) return;
        const key = clean(source.source_song_key || source.song_key || source.key || source.id);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({ ...source, __key: key });
      });
    });
    return out;
  }

  function introSeconds(recipe) {
    const artwork = recipe?.artwork || recipe?.artwork_rules || {};
    if (artwork.start_with_artwork === false || artwork.startWithArtwork === false) return 0;
    const value = Number(artwork.start_duration_seconds ?? artwork.startDurationSeconds ?? 4);
    return Number.isFinite(value) ? Math.max(0, Math.min(30, value)) : 4;
  }

  function dedupe(assets) {
    const seen = new Set();
    return assets.filter(asset => {
      const key = `${asset.type}:${canonical(asset.url) || asset.id}`.toLowerCase();
      if (!asset.url || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shuffle(assets) {
    const out = [...assets];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [out[index], out[swap]] = [out[swap], out[index]];
    }
    return out;
  }

  function artworkImagesFrom(body, song) {
    body = unwrap(body) || {};
    const media = body.media || body.data?.media || body.data || body;
    const images = media?.artwork_images && typeof media.artwork_images === 'object' ? media.artwork_images : {};
    return {
      '1x1': canonical(images['1x1'] || media?.song_artwork_1x1_url || media?.song_artwork_url || squareArtwork(song)),
      '16x9': canonical(images['16x9'] || media?.song_artwork_16x9_url || song?.song_artwork_16x9_url),
      '21x9': canonical(images['21x9'] || media?.song_artwork_21x9_url || song?.song_artwork_21x9_url)
    };
  }

  function chooseArtwork(images, song) {
    const player = currentPlayer();
    const rect = player?.getBoundingClientRect?.();
    const ratio = (rect?.width || innerWidth || 1) / Math.max(1, rect?.height || innerHeight || 1);
    if (ratio >= 1.82 && images['21x9']) return images['21x9'];
    return images['16x9'] || images['21x9'] || images['1x1'] || squareArtwork(song);
  }

  async function buildSession(song, generation) {
    const key = songKey(song);
    const cached = state.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_MS) return cached;

    const [recipeResult, directResult, artworkResult] = await Promise.allSettled([
      getJson(`${URLS.recipe}?song_key=${encodeURIComponent(key)}`),
      getJson(`${URLS.songAssets}?song_key=${encodeURIComponent(key)}`),
      getJson(`${API}/radio/songs/${encodeURIComponent(key)}/artwork-images`)
    ]);
    if (generation !== state.generation) throw new Error('stale-session');

    const recipe = recipeFrom(recipeResult.status === 'fulfilled' ? recipeResult.value : {});
    const visualMode = lower(recipe?.visual_mode || recipe?.visualMode);
    let assets = visualMode === 'artwork_only' ? [] : selectedAssets(
      directResult.status === 'fulfilled' ? directResult.value : {},
      recipe?.song_assets || recipe?.songAssets || {},
      'song'
    );

    if (visualMode !== 'artwork_only') {
      const folderJobs = folderRecipes(recipe).map(async folder => {
        try {
          const body = await getJson(`${URLS.folders}/${encodeURIComponent(folder.__id)}/assets`);
          return selectedAssets(body, folder, `folder:${folder.__id}`, folder.__id);
        } catch (_) { return []; }
      });
      const borrowJobs = borrowedRecipes(recipe).filter(source => source.__key !== key).map(async source => {
        try {
          const body = await getJson(`${URLS.songAssets}?song_key=${encodeURIComponent(source.__key)}`);
          return selectedAssets(body, source, `borrowed:${source.__key}`);
        } catch (_) { return []; }
      });
      const groups = await Promise.all([...folderJobs, ...borrowJobs]);
      if (generation !== state.generation) throw new Error('stale-session');
      groups.forEach(group => assets.push(...group));
    }

    const artworkImages = artworkImagesFrom(artworkResult.status === 'fulfilled' ? artworkResult.value : {}, song);
    const built = {
      songKey: key,
      artworkUrl: chooseArtwork(artworkImages, song),
      introMs: introSeconds(recipe) * 1000,
      assets: shuffle(dedupe(assets)),
      visualMode,
      cachedAt: Date.now()
    };
    state.cache.set(key, built);
    return built;
  }

  function ensureStage(player) {
    let stage = player.querySelector(':scope > .desktop-vec2-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'desktop-vec2-stage';
      stage.hidden = true;
      const artwork = document.createElement('div');
      artwork.className = 'desktop-vec2-artwork';
      const a = document.createElement('div');
      a.className = 'desktop-vec2-layer';
      a.dataset.slot = 'a';
      const b = document.createElement('div');
      b.className = 'desktop-vec2-layer';
      b.dataset.slot = 'b';
      stage.append(artwork, a, b);
      const backdrop = player.querySelector('[data-backdrop]');
      if (backdrop?.nextSibling) player.insertBefore(stage, backdrop.nextSibling);
      else player.prepend(stage);
    }
    state.stage = stage;
    state.artwork = stage.querySelector('.desktop-vec2-artwork');
    state.layers = [...stage.querySelectorAll('.desktop-vec2-layer')];
    return stage;
  }

  function clearTimers() {
    clearTimeout(state.introTimer);
    clearTimeout(state.imageTimer);
    clearTimeout(state.videoTimer);
    clearTimeout(state.recoveryTimer);
    state.introTimer = 0;
    state.imageTimer = 0;
    state.videoTimer = 0;
    state.recoveryTimer = 0;
  }

  function disposeLayer(layer) {
    if (!layer) return;
    layer.querySelectorAll('video').forEach(video => {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
    });
    layer.replaceChildren();
    layer.classList.remove('is-current');
    delete layer.dataset.assetKey;
  }

  function resetVisuals({ hide = false } = {}) {
    clearTimers();
    state.layers.forEach(disposeLayer);
    state.currentLayer = -1;
    state.nextLayer = 0;
    state.currentAsset = null;
    state.nextAsset = null;
    state.nextPrepared = null;
    state.nextPromise = null;
    state.preloadEpoch += 1;
    state.pool = [];
    state.played = new Set();
    state.failed = new Set();
    state.introTargetMs = 0;
    state.introComplete = false;
    state.introHandoffRunning = false;
    state.imageDeadlineAudioSeconds = 0;
    state.videoDeadlineAudioSeconds = 0;
    state.recoveryCycles = 0;
    state.recovering = false;
    state.advancing = false;
    if (state.stage && hide) state.stage.hidden = true;
  }

  function cancel(reason = 'cancel') {
    state.generation += 1;
    state.starting = false;
    resetVisuals({ hide: true });
    state.songKey = '';
    setStatus('IDLE', reason);
  }

  function assetKey(asset) { return asset ? `${asset.type}:${canonical(asset.url) || asset.id}` : ''; }

  function pickNext() {
    const usable = state.pool.filter(asset => !state.failed.has(assetKey(asset)));
    if (!usable.length) return null;
    let candidates = usable.filter(asset => !state.played.has(assetKey(asset)));
    if (!candidates.length) {
      state.played.clear();
      candidates = [...usable];
      log('pool-reset', { size: usable.length });
    }
    const currentKey = assetKey(state.currentAsset);
    const withoutCurrent = currentKey ? candidates.filter(asset => assetKey(asset) !== currentKey) : candidates;
    if (withoutCurrent.length) candidates = withoutCurrent;
    const folder = state.currentAsset?.folderId || '';
    if (folder) {
      const different = candidates.filter(asset => !asset.folderId || asset.folderId !== folder);
      if (different.length) candidates = different;
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || null;
  }

  function preloadImage(asset, generation) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.alt = '';
      image.decoding = 'async';
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        if (generation !== state.generation) return reject(new Error('stale-session'));
        error ? reject(error) : resolve(image);
      };
      const timeout = setTimeout(() => finish(new Error('image-timeout')), PRELOAD_TIMEOUT_MS);
      image.onload = () => finish(null);
      image.onerror = () => finish(new Error('image-load-failed'));
      image.src = asset.url;
    });
  }

  function preloadVideo(asset, generation) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      Object.assign(video, {
        muted: true,
        defaultMuted: true,
        volume: 0,
        autoplay: false,
        playsInline: true,
        preload: 'auto',
        disablePictureInPicture: true
      });
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      let settled = false;
      const cleanup = () => {
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('canplay', ready);
        video.removeEventListener('error', fail);
        clearTimeout(timeout);
      };
      const ready = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (generation !== state.generation) return reject(new Error('stale-session'));
        resolve(video);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('video-load-failed'));
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('video-timeout'));
      }, PRELOAD_TIMEOUT_MS);
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('canplay', ready, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.src = asset.url;
      try { video.load(); } catch (_) {}
    });
  }

  async function prepare(asset, layerIndex, generation, preloadEpoch = state.preloadEpoch) {
    const layer = state.layers[layerIndex];
    if (!layer || !asset) throw new Error('missing-layer-or-asset');
    disposeLayer(layer);
    layer.dataset.assetKey = assetKey(asset);
    const node = asset.type === 'video' ? await preloadVideo(asset, generation) : await preloadImage(asset, generation);
    if (generation !== state.generation || preloadEpoch !== state.preloadEpoch) {
      if (node instanceof HTMLVideoElement) {
        try { node.pause(); } catch (_) {}
        node.removeAttribute('src');
        try { node.load(); } catch (_) {}
      }
      throw new Error('stale-preload');
    }
    layer.replaceChildren(node);
    log('asset-ready', { asset: assetKey(asset), layer: layerIndex, readyState: node.readyState ?? null });
    return { asset, layerIndex, node };
  }

  async function preloadNext(generation, preloadEpoch = state.preloadEpoch, attempts = 0) {
    if (generation !== state.generation || preloadEpoch !== state.preloadEpoch) return null;
    if (attempts >= PRELOAD_ATTEMPT_LIMIT) {
      log('preload-attempt-limit', { attempts, failed: state.failed.size, pool: state.pool.length });
      return null;
    }
    if (state.nextPrepared) return state.nextPrepared;
    if (state.nextPromise) return state.nextPromise;

    const asset = pickNext();
    if (!asset) return null;
    state.nextAsset = asset;

    state.nextPromise = prepare(asset, state.nextLayer, generation, preloadEpoch)
      .then(prepared => {
        if (generation !== state.generation || preloadEpoch !== state.preloadEpoch) throw new Error('stale-preload');
        state.nextPrepared = prepared;
        state.nextPromise = null;
        return prepared;
      })
      .catch(error => {
        if (generation !== state.generation || preloadEpoch !== state.preloadEpoch) return null;
        state.failed.add(assetKey(asset));
        state.nextAsset = null;
        state.nextPrepared = null;
        state.nextPromise = null;
        log('asset-failed', { asset: assetKey(asset), error: error?.message || String(error) });
        return preloadNext(generation, preloadEpoch, attempts + 1);
      });
    return state.nextPromise;
  }

  function abandonPendingPreload(reason) {
    const asset = state.nextAsset;
    const layerIndex = state.nextLayer;
    state.preloadEpoch += 1;
    state.nextAsset = null;
    state.nextPrepared = null;
    state.nextPromise = null;
    if (layerIndex >= 0 && layerIndex !== state.currentLayer) disposeLayer(state.layers[layerIndex]);
    if (asset) state.failed.add(assetKey(asset));
    log('preload-abandoned', { reason, asset: assetKey(asset) || null });
  }

  async function awaitTransitionPrepared(generation) {
    const preloadEpoch = state.preloadEpoch;
    let timeout = 0;
    const timedOut = new Promise(resolve => {
      timeout = setTimeout(() => resolve(null), TRANSITION_PRELOAD_WAIT_MS);
    });
    const prepared = await Promise.race([preloadNext(generation, preloadEpoch), timedOut]);
    clearTimeout(timeout);
    if (prepared || generation !== state.generation) return prepared;
    if (preloadEpoch === state.preloadEpoch && (state.nextPromise || state.nextAsset)) {
      abandonPendingPreload('transition-preload-timeout');
    }
    return null;
  }

  function scheduleImageAdvance(generation) {
    if (generation !== state.generation || state.currentAsset?.type !== 'image') return;
    const audio = currentAudio();
    if (!audio || audio.ended) return;

    clearTimeout(state.imageTimer);
    state.imageTimer = 0;

    const remainingMs = Math.max(0, (state.imageDeadlineAudioSeconds - Number(audio.currentTime || 0)) * 1000);
    if (remainingMs <= 25) {
      advance(generation, 'image-audio-duration');
      return;
    }
    if (audio.paused) return;

    state.imageTimer = setTimeout(() => scheduleImageAdvance(generation), Math.max(40, remainingMs + 20));
  }

  function scheduleVideoAdvance(generation) {
    if (generation !== state.generation || state.currentAsset?.type !== 'video') return;
    const audio = currentAudio();
    if (!audio || audio.ended) return;

    clearTimeout(state.videoTimer);
    state.videoTimer = 0;

    const remainingMs = Math.max(0, (state.videoDeadlineAudioSeconds - Number(audio.currentTime || 0)) * 1000);
    if (remainingMs <= 25) {
      advance(generation, 'video-audio-lease');
      return;
    }
    if (audio.paused) return;

    state.videoTimer = setTimeout(() => scheduleVideoAdvance(generation), Math.max(40, remainingMs + 20));
  }

  async function startVideo(node) {
    let timeout = 0;
    try {
      await Promise.race([
        Promise.resolve(node.play()),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('video-play-start-timeout')), VIDEO_PLAY_START_TIMEOUT_MS);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function promote(prepared, generation, reason = 'promote', promotionAttempts = 0) {
    if (!prepared || generation !== state.generation) return false;
    const { asset, layerIndex, node } = prepared;
    const player = currentPlayer();
    const audio = currentAudio(player);
    if (!player || !audio || audio.paused || audio.ended) return false;

    if (asset.type === 'video') {
      try {
        await startVideo(node);
      } catch (error) {
        state.failed.add(assetKey(asset));
        disposeLayer(state.layers[layerIndex]);
        state.nextAsset = null;
        state.nextPrepared = null;
        state.nextPromise = null;
        log('asset-failed', { asset: assetKey(asset), error: `play:${error?.message || error?.name || 'unknown'}` });
        if (promotionAttempts + 1 >= PRELOAD_ATTEMPT_LIMIT) return false;
        const replacement = await preloadNext(generation);
        return promote(replacement, generation, 'skip-play-failed', promotionAttempts + 1);
      }
    }

    if (generation !== state.generation) return false;
    const previousIndex = state.currentLayer;
    const previous = previousIndex >= 0 ? state.layers[previousIndex] : null;
    const incoming = state.layers[layerIndex];
    incoming.classList.add('is-current');

    state.currentLayer = layerIndex;
    state.nextLayer = layerIndex === 0 ? 1 : 0;
    state.currentAsset = asset;
    state.nextAsset = null;
    state.nextPrepared = null;
    state.nextPromise = null;
    state.played.add(assetKey(asset));
    setStatus(asset.type === 'video' ? 'PLAYING_VIDEO' : 'PLAYING_IMAGE', reason);

    if (previous && previous !== incoming) {
      previous.classList.remove('is-current');
      setTimeout(() => {
        if (generation === state.generation && state.currentLayer !== previousIndex) disposeLayer(previous);
      }, 180);
    }

    if (asset.type === 'video') {
      clearTimeout(state.imageTimer);
      state.imageTimer = 0;
      state.imageDeadlineAudioSeconds = 0;
      const mediaDurationSeconds = Number(node.duration);
      const expectedSeconds = Number.isFinite(mediaDurationSeconds) && mediaDurationSeconds > 0
        ? mediaDurationSeconds
        : Math.max(1.5, Number(asset.durationMs || 0) / 1000 || VIDEO_LEASE_MAX_SECONDS);
      const leaseSeconds = Math.min(VIDEO_LEASE_MAX_SECONDS, expectedSeconds + VIDEO_LEASE_GRACE_SECONDS);
      state.videoDeadlineAudioSeconds = Number(audio.currentTime || 0) + leaseSeconds;
      log('video-lease-start', {
        asset: assetKey(asset),
        mediaDurationSeconds: Number.isFinite(mediaDurationSeconds) ? mediaDurationSeconds : null,
        leaseSeconds,
        deadlineAudioSeconds: state.videoDeadlineAudioSeconds
      });
      scheduleVideoAdvance(generation);
      node.addEventListener('ended', () => {
        if (generation === state.generation && node === state.layers[state.currentLayer]?.firstElementChild) advance(generation, 'video-ended');
      }, { once: true });
      node.addEventListener('error', () => {
        if (generation !== state.generation) return;
        state.failed.add(assetKey(asset));
        advance(generation, 'video-error');
      }, { once: true });
    } else {
      clearTimeout(state.videoTimer);
      state.videoTimer = 0;
      state.videoDeadlineAudioSeconds = 0;
      state.imageDeadlineAudioSeconds = Number(audio.currentTime || 0) + asset.durationMs / 1000;
      scheduleImageAdvance(generation);
    }

    preloadNext(generation);
    return true;
  }

  function releaseCurrentToArtwork(generation, reason) {
    if (generation !== state.generation) return;
    const currentIndex = state.currentLayer;
    if (currentIndex >= 0) disposeLayer(state.layers[currentIndex]);
    state.currentLayer = -1;
    state.currentAsset = null;
    state.imageDeadlineAudioSeconds = 0;
    state.videoDeadlineAudioSeconds = 0;
    if (state.stage) state.stage.hidden = false;
    setStatus('FALLBACK', reason);
  }

  function showArtworkRecovery(generation, reason) {
    if (generation !== state.generation) return;
    state.preloadEpoch += 1;
    clearTimeout(state.imageTimer);
    clearTimeout(state.videoTimer);
    state.imageTimer = 0;
    state.videoTimer = 0;
    state.imageDeadlineAudioSeconds = 0;
    state.videoDeadlineAudioSeconds = 0;
    state.layers.forEach(disposeLayer);
    state.currentLayer = -1;
    state.nextLayer = 0;
    state.currentAsset = null;
    state.nextAsset = null;
    state.nextPrepared = null;
    state.nextPromise = null;
    if (state.stage) state.stage.hidden = false;
    setStatus('FALLBACK', reason);
  }

  function schedulePoolRecovery(generation, reason = 'pool-recovery') {
    if (generation !== state.generation || !state.pool.length || state.recoveryTimer || state.recovering) return;
    const audio = currentAudio();
    if (!audio || audio.ended) return;

    state.recoveryCycles += 1;
    const delay = Math.min(RECOVERY_RETRY_MAX_MS, RECOVERY_RETRY_MS * state.recoveryCycles);
    log('pool-recovery-scheduled', {
      reason,
      cycle: state.recoveryCycles,
      delay,
      failed: state.failed.size,
      pool: state.pool.length
    });

    state.recoveryTimer = setTimeout(async () => {
      state.recoveryTimer = 0;
      if (generation !== state.generation) return;
      const activeAudio = currentAudio();
      if (!activeAudio || activeAudio.ended || activeAudio.paused) return;

      state.recovering = true;
      let retryReason = '';
      try {
        state.failed.clear();
        state.played.clear();
        state.nextAsset = null;
        state.nextPrepared = null;
        state.nextPromise = null;
        log('pool-recovery-start', { cycle: state.recoveryCycles, pool: state.pool.length });

        const prepared = await preloadNext(generation);
        if (generation !== state.generation) return;
        if (!prepared) {
          showArtworkRecovery(generation, 'pool-recovery-no-playable-assets');
          retryReason = 'pool-recovery-repeat';
          return;
        }

        const promoted = await promote(prepared, generation, 'pool-recovery');
        if (promoted && generation === state.generation) {
          state.recoveryCycles = 0;
          log('pool-recovery-complete', { asset: assetKey(state.currentAsset) });
        } else if (generation === state.generation) {
          retryReason = 'pool-recovery-promotion-deferred';
        }
      } finally {
        if (generation === state.generation) {
          state.recovering = false;
          if (retryReason) schedulePoolRecovery(generation, retryReason);
        }
      }
    }, delay);
  }

  function recoverCurrent(reason = 'external-recovery') {
    if (!state.currentAsset || state.generation <= 0) return false;
    const generation = state.generation;
    if (reason !== 'video-ended-without-handoff') {
      state.failed.add(assetKey(state.currentAsset));
      log('asset-failed', { asset: assetKey(state.currentAsset), error: reason });
    } else {
      log('missed-video-ended-handoff', { asset: assetKey(state.currentAsset) });
    }
    void advance(generation, reason);
    return true;
  }

  async function advance(generation, reason = 'advance') {
    if (generation !== state.generation || state.advancing) return false;
    state.advancing = true;
    try {
      clearTimeout(state.imageTimer);
      clearTimeout(state.videoTimer);
      state.imageTimer = 0;
      state.videoTimer = 0;
      state.imageDeadlineAudioSeconds = 0;
      state.videoDeadlineAudioSeconds = 0;
      setStatus('TRANSITIONING', reason);
      let prepared = state.nextPrepared;
      releaseCurrentToArtwork(generation, prepared ? 'transition-starting-prepared' : 'transition-preloading');
      if (!prepared) {
        prepared = await awaitTransitionPrepared(generation);
      }
      if (!prepared || generation !== state.generation) {
        if (generation !== state.generation) return false;
        showArtworkRecovery(generation, state.pool.length ? 'no-next-asset-recovering' : 'no-playable-assets');
        if (state.pool.length) schedulePoolRecovery(generation, reason);
        return false;
      }
      const promoted = await promote(prepared, generation, reason);
      if (!promoted && generation === state.generation) {
        const activeAudio = currentAudio();
        if (activeAudio && !activeAudio.paused && !activeAudio.ended) {
          showArtworkRecovery(generation, 'promotion-failed-recovering');
          if (state.pool.length) schedulePoolRecovery(generation, reason);
        }
      }
      return promoted;
    } finally {
      if (generation === state.generation) state.advancing = false;
    }
  }

  function renderDebug() {
    const debug = new URLSearchParams(location.search).get('vecdebug') === '1';
    const player = currentPlayer();
    if (!debug || !player) {
      state.debugNode?.remove();
      state.debugNode = null;
      return;
    }
    if (!state.debugNode?.isConnected) {
      state.debugNode = document.createElement('pre');
      state.debugNode.className = 'desktop-vec2-debug';
      player.appendChild(state.debugNode);
    }
    state.debugNode.textContent = JSON.stringify({
      songKey: state.songKey,
      status: state.status,
      introTargetMs: state.introTargetMs,
      introComplete: state.introComplete,
      pool: state.pool.length,
      played: state.played.size,
      failed: state.failed.size,
      current: state.currentAsset?.id || null,
      next: state.nextAsset?.id || null,
      imageDeadlineAudioSeconds: state.imageDeadlineAudioSeconds || null,
      videoDeadlineAudioSeconds: state.videoDeadlineAudioSeconds || null
    }, null, 2);
  }

  async function finishIntro(generation) {
    if (generation !== state.generation || !state.introComplete || state.introHandoffRunning || state.currentAsset) return;
    const audio = currentAudio();
    if (!audio || audio.paused || audio.ended) return;

    state.introHandoffRunning = true;
    try {
      const prepared = state.nextPrepared || await preloadNext(generation);
      if (generation !== state.generation) return;
      if (!prepared) {
        setStatus('FALLBACK', 'artwork-only-or-no-playable-assets');
        return;
      }
      if (audio.paused || audio.ended) return;
      const promoted = await promote(prepared, generation, 'artwork-intro-complete');
      if (!promoted && generation === state.generation && !audio.paused && !audio.ended) {
        showArtworkRecovery(generation, 'intro-promotion-failed-recovering');
        if (state.pool.length) schedulePoolRecovery(generation, 'intro-promotion-failed');
      }
    } finally {
      if (generation === state.generation) state.introHandoffRunning = false;
    }
  }

  function scheduleIntroCheck(generation) {
    if (generation !== state.generation || state.introComplete) return;
    const audio = currentAudio();
    if (!audio || audio.ended) return;

    clearTimeout(state.introTimer);
    state.introTimer = 0;

    const elapsedMs = Math.max(0, Number(audio.currentTime || 0) * 1000);
    const remainingMs = Math.max(0, state.introTargetMs - elapsedMs);
    if (remainingMs <= 25) {
      state.introComplete = true;
      log('artwork-intro-complete', { elapsedMs, targetMs: state.introTargetMs });
      finishIntro(generation);
      return;
    }

    if (audio.paused) {
      setStatus('ARTWORK_INTRO', `paused:${Math.round(elapsedMs)}/${state.introTargetMs}ms`);
      return;
    }

    setStatus('ARTWORK_INTRO', `${Math.round(elapsedMs)}/${state.introTargetMs}ms`);
    state.introTimer = setTimeout(() => scheduleIntroCheck(generation), Math.max(40, remainingMs + 20));
  }

  async function startFromAudio(audio) {
    const player = audio?.closest?.('[data-player]') || currentPlayer();
    if (!player || !audio || audio.paused || audio.ended || state.starting) return;
    state.starting = true;

    const generation = ++state.generation;
    clearTimers();
    ensureStage(player);
    resetVisuals({ hide: true });
    setStatus('LOADING_SESSION', 'base-artwork-visible');

    try {
      const items = await catalog();
      if (generation !== state.generation) return;
      const song = findSong(items, player, audio);
      if (!song) throw new Error('song-not-found');
      const built = await buildSession(song, generation);
      if (generation !== state.generation) return;

      state.songKey = built.songKey;
      player.dataset.songKey = built.songKey;
      state.pool = [...built.assets];
      state.played = new Set();
      state.failed = new Set();
      state.introTargetMs = built.introMs;
      state.introComplete = false;
      state.artwork.style.backgroundImage = built.artworkUrl ? `url("${built.artworkUrl.replace(/"/g, '\\"')}")` : 'none';
      state.stage.hidden = false;
      log('session-start', {
        introMs: built.introMs,
        audioCurrentTimeMs: Math.round(Number(audio.currentTime || 0) * 1000),
        assets: state.pool.length,
        visualMode: built.visualMode
      });

      if (state.pool.length) preloadNext(generation);
      scheduleIntroCheck(generation);
    } catch (error) {
      if (generation !== state.generation) return;
      log('session-error', { error: error?.message || String(error) });
      setStatus('FALLBACK', error?.message || 'session-error');
      if (state.stage) state.stage.hidden = true;
    } finally {
      if (generation === state.generation) state.starting = false;
    }
  }

  function pauseVisuals(audio) {
    if (!audio?.paused) return;
    clearTimeout(state.introTimer);
    clearTimeout(state.imageTimer);
    clearTimeout(state.videoTimer);
    state.introTimer = 0;
    state.imageTimer = 0;
    state.videoTimer = 0;
    state.layers.forEach(layer => layer.querySelectorAll('video').forEach(video => {
      try { video.pause(); } catch (_) {}
    }));
    if (!state.introComplete && state.songKey) setStatus('ARTWORK_INTRO', 'paused');
  }

  function resumeVisuals(audio) {
    if (!audio || audio.paused || audio.ended || state.starting) return;
    if (!state.songKey) {
      startFromAudio(audio);
      return;
    }
    if (!state.introComplete) {
      scheduleIntroCheck(state.generation);
      return;
    }
    if (!state.currentAsset) {
      if (state.status === 'FALLBACK' && state.pool.length) schedulePoolRecovery(state.generation, 'audio-resume');
      else finishIntro(state.generation);
      return;
    }
    if (state.currentAsset.type === 'image') {
      scheduleImageAdvance(state.generation);
      return;
    }
    const video = state.currentLayer >= 0 ? state.layers[state.currentLayer]?.querySelector('video') : null;
    if (video && state.currentAsset.type === 'video') {
      scheduleVideoAdvance(state.generation);
      video.play().catch(() => {});
    }
  }

  function clearForAudioChange(reason) {
    state.generation += 1;
    state.starting = false;
    resetVisuals({ hide: true });
    state.songKey = '';
    const player = currentPlayer();
    if (player) delete player.dataset.songKey;
    setStatus('IDLE', reason);
  }

  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    if (state.songKey || state.starting) return resumeVisuals(event.target);
    startFromAudio(event.target);
  }, true);

  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) pauseVisuals(event.target);
  }, true);

  document.addEventListener('playing', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) resumeVisuals(event.target);
  }, true);

  document.addEventListener('timeupdate', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    if (state.songKey && !state.introComplete) {
      scheduleIntroCheck(state.generation);
      return;
    }
    if (state.currentAsset?.type === 'image') {
      scheduleImageAdvance(state.generation);
      return;
    }
    if (state.currentAsset?.type === 'video') {
      scheduleVideoAdvance(state.generation);
      return;
    }
    if (state.songKey && state.introComplete && !state.currentAsset && state.pool.length) {
      schedulePoolRecovery(state.generation, 'audio-timeupdate-no-current-asset');
    }
  }, true);

  document.addEventListener('emptied', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) clearForAudioChange('audio-emptied');
  }, true);

  document.addEventListener('ended', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) clearForAudioChange('audio-ended');
  }, true);

  window.StashboxDesktopVec2 = Object.freeze({
    stop: () => cancel('manual-stop'),
    refresh: () => {
      const audio = currentAudio();
      if (audio && !audio.paused && !audio.ended) {
        state.songKey = '';
        startFromAudio(audio);
      }
    },
    clearCache: () => state.cache.clear(),
    recoverCurrent,
    state: () => ({
      generation: state.generation,
      starting: state.starting,
      songKey: state.songKey,
      status: state.status,
      introTargetMs: state.introTargetMs,
      introComplete: state.introComplete,
      poolSize: state.pool.length,
      playedCount: state.played.size,
      failedCount: state.failed.size,
      currentAsset: state.currentAsset,
      nextAsset: state.nextAsset,
      imageDeadlineAudioSeconds: state.imageDeadlineAudioSeconds,
      videoDeadlineAudioSeconds: state.videoDeadlineAudioSeconds,
      preloadEpoch: state.preloadEpoch,
      recoveryCycles: state.recoveryCycles,
      recoveryScheduled: Boolean(state.recoveryTimer),
      recovering: state.recovering,
      advancing: state.advancing
    }),
    diagnostics: () => [...state.diagnostics]
  });
})();
