(() => {
  'use strict';

  if (window.StashboxVec2CmsBridge) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const POLL_MS = 250;

  const state = {
    songsPromise: null,
    sessionCache: new Map(),
    currentSignature: '',
    generation: 0,
    timer: 0,
    resolving: false,
    lastSongKey: ''
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const array = value => Array.isArray(value) ? value : [];
  const normalize = value => lower(value).replace(/\s+/g, ' ');

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

  async function songs() {
    if (!state.songsPromise) {
      state.songsPromise = getJson(SONGS_URL)
        .then(body => rows(body, ['songs', 'items', 'data']))
        .catch(error => {
          state.songsPromise = null;
          throw error;
        });
    }
    return state.songsPromise;
  }

  function visible(node) {
    if (!node || !node.isConnected || node.hidden) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function playingAudio() {
    return [...document.querySelectorAll('#v2App audio, audio[data-audio]')]
      .find(audio => audio.isConnected && !audio.paused && !audio.ended) || null;
  }

  function activePlayer() {
    const audio = playingAudio();
    const owner = audio?.closest?.('[data-player]');
    if (owner && visible(owner)) return owner;
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function audioFor(player) {
    return playingAudio() || player?.querySelector('[data-audio], audio') || null;
  }

  function currentIdentity(player) {
    const audio = audioFor(player);
    return {
      hintedKey: clean(player?.dataset?.songKey || player?.dataset?.currentSongKey || player?.dataset?.song),
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent),
      audioUrl: clean(audio?.currentSrc || audio?.src)
    };
  }

  function songKey(song) {
    return clean(song?.song_key || song?.songKey || song?.key || song?.id);
  }

  function songTitle(song) {
    return clean(song?.display_title || song?.song_name || song?.title || songKey(song));
  }

  function songArtist(song) {
    return clean(song?.artist || song?.artist_name || 'Stashbox');
  }

  function songAudio(song) {
    return clean(song?.audio_url || song?.audioUrl || song?.stream_url || song?.streamUrl || song?.audio);
  }

  function urlPath(value) {
    try { return new URL(clean(value), location.href).pathname.toLowerCase(); } catch (_) { return ''; }
  }

  function findSong(catalog, identity) {
    if (identity.hintedKey) {
      const found = catalog.find(song => songKey(song) === identity.hintedKey);
      if (found) return found;
    }
    const audioPath = urlPath(identity.audioUrl);
    if (audioPath) {
      const found = catalog.find(song => urlPath(songAudio(song)) === audioPath);
      if (found) return found;
    }
    const title = normalize(identity.title);
    const artist = normalize(identity.artist);
    return catalog.find(song => normalize(songTitle(song)) === title && (!artist || normalize(songArtist(song)) === artist))
      || catalog.find(song => normalize(songTitle(song)) === title)
      || null;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function assetUrl(asset) {
    return clean(
      asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url ||
      asset?.video_url || asset?.clip_url || asset?.image_url || asset?.media_url || asset?.source_url
    ).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function assetType(asset) {
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.kind);
    return type.includes('video') || type.includes('clip') || /\.(mp4|webm|m4v|mov)(?:$|[?#])/i.test(assetUrl(asset)) ? 'video' : 'image';
  }

  function assetActive(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status)
      && asset?.hidden !== true && asset?.deleted !== true && asset?.active !== false;
  }

  function idSet(section, fields) {
    return new Set(fields.flatMap(field => array(section?.[field])).map(clean).filter(Boolean));
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
      const excluded = type === 'video' ? excludedClips : excludedImages;
      const active = type === 'video' ? activeClips : activeImages;
      if (excluded.has(id) || excluded.has(url)) return false;
      return !restricted || active.has(id) || active.has(url);
    }).map(asset => ({
      id: assetId(asset),
      url: assetUrl(asset),
      type: assetType(asset),
      durationMs: Number(asset?.duration_ms || asset?.display_ms || asset?.display_duration_ms || 8000),
      folderId: clean(folderId || asset?.folder_id || asset?.folderId),
      source
    }));
  }

  function folderRecipes(recipe) {
    const groups = [
      recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders,
      recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders,
      recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders
    ];
    const seen = new Set();
    const out = [];
    groups.forEach(group => {
      const list = Array.isArray(group) ? group : array(group?.items);
      list.forEach(folder => {
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
      const list = Array.isArray(group) ? group : [...array(group?.sources), ...array(group?.songs)];
      list.forEach(source => {
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
    const value = Number(artwork.start_duration_seconds ?? artwork.startDurationSeconds ?? 2);
    return Number.isFinite(value) ? Math.max(0, Math.min(30, value)) : 2;
  }

  function artworkUrl(song, player) {
    const direct = clean(
      song?.artwork_16x9_url || song?.song_artwork_16x9_url || song?.wide_artwork_url ||
      song?.song_artwork_url || song?.artwork_url || song?.cover_url || song?.image_url
    );
    if (direct) return direct;
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const background = stage ? getComputedStyle(stage).backgroundImage : '';
    const match = background?.match(/^url\(["']?(.*?)["']?\)$/);
    return clean(match?.[1]);
  }

  function dedupe(assets) {
    const seen = new Set();
    return assets.filter(asset => {
      const key = `${asset.type}:${asset.id || asset.url}`;
      if (!asset.url || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function buildSession(song, player, generation) {
    const key = songKey(song);
    const cached = state.sessionCache.get(key);
    if (cached && Date.now() - cached.cachedAt < 60000) return { ...cached, artworkUrl: artworkUrl(song, player) || cached.artworkUrl };

    const [recipeResult, directResult] = await Promise.allSettled([
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`)
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
          const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(folder.__id)}/assets`);
          return selectedAssets(body, folder, `folder:${folder.__id}`, folder.__id);
        } catch (_) { return []; }
      });
      const borrowJobs = borrowedRecipes(recipe).filter(source => source.__key !== key).map(async source => {
        try {
          const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(source.__key)}`);
          return selectedAssets(body, source, `borrowed:${source.__key}`);
        } catch (_) { return []; }
      });
      const extras = await Promise.all([...folderJobs, ...borrowJobs]);
      if (generation !== state.generation) throw new Error('stale-session');
      extras.forEach(group => { assets.push(...group); });
    }

    const built = {
      songKey: key,
      artworkUrl: artworkUrl(song, player),
      artworkIntroSeconds: introSeconds(recipe),
      assets: dedupe(assets),
      visualMode,
      cachedAt: Date.now()
    };
    state.sessionCache.set(key, built);
    return built;
  }

  function hostFor(player) {
    return player?.querySelector('[data-mobile-vec-stage]')?.parentElement || player;
  }

  async function resolveCurrent(player, identity, signature) {
    if (state.resolving) return;
    state.resolving = true;
    const generation = ++state.generation;
    try {
      const catalog = await songs();
      if (generation !== state.generation || signature !== state.currentSignature) return;
      const song = findSong(catalog, identity);
      if (!song) throw new Error('song-not-found');
      const built = await buildSession(song, player, generation);
      if (generation !== state.generation || signature !== state.currentSignature) return;

      state.lastSongKey = built.songKey;
      player.dataset.songKey = built.songKey;
      await window.StashboxVec2?.begin?.({
        host: hostFor(player),
        songKey: built.songKey,
        artworkUrl: built.artworkUrl,
        artworkIntroSeconds: built.artworkIntroSeconds,
        assets: built.assets
      });
      player.dataset.vec2CmsState = built.assets.length ? 'running' : 'artwork-only';
      player.dataset.vec2AssetCount = String(built.assets.length);
      player.dataset.vec2ArtworkIntroSeconds = String(built.artworkIntroSeconds);
    } catch (error) {
      if (generation === state.generation) {
        player.dataset.vec2CmsState = 'error';
        player.dataset.vec2CmsError = error?.message || String(error);
        console.error('[VEC2 CMS]', error);
      }
    } finally {
      if (generation === state.generation) state.resolving = false;
    }
  }

  function tick() {
    if (!window.StashboxVec2) return;
    const player = activePlayer();
    const audio = audioFor(player);
    if (!player || !audio || audio.paused || audio.ended) return;

    const identity = currentIdentity(player);
    const signature = [identity.hintedKey, normalize(identity.artist), normalize(identity.title), urlPath(identity.audioUrl)].join('|');
    if (!signature || signature === state.currentSignature) return;
    state.currentSignature = signature;
    state.resolving = false;
    resolveCurrent(player, identity, signature);
  }

  function stop() {
    clearInterval(state.timer);
    state.timer = 0;
    state.generation += 1;
    window.StashboxVec2?.stop?.();
  }

  state.timer = window.setInterval(tick, POLL_MS);
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) setTimeout(tick, 0);
  }, true);
  window.addEventListener('stashbox:vec-asset-change', () => setTimeout(tick, 0));

  window.StashboxVec2CmsBridge = Object.freeze({
    refresh: () => {
      state.currentSignature = '';
      if (state.lastSongKey) state.sessionCache.delete(state.lastSongKey);
      tick();
    },
    clearCache: () => state.sessionCache.clear(),
    stop,
    state: () => ({
      currentSignature: state.currentSignature,
      lastSongKey: state.lastSongKey,
      cacheSize: state.sessionCache.size,
      resolving: state.resolving
    })
  });

  tick();
})();
