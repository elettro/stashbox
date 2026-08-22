(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/attempt2/') || path.includes('/radio/attempt2/artist/')) return;
  if (window.StashboxMainVecVideoWatchdog) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const DEFAULT_INTRO_SECONDS = 2;
  const POLL_MS = 200;
  const DESKTOP_MIN_WIDTH = 900;
  const PRELOAD_COUNT = 3;
  const STARTUP_DEADLINE_MS = 1500;
  const STALL_MS = 4500;
  const NATIVE_TRANSITION_GRACE_MS = 900;

  const state = {
    songsPromise: null,
    rawCache: new Map(),
    generation: 0,
    signature: '',
    songKey: '',
    clips: [],
    introSeconds: DEFAULT_INTRO_SECONDS,
    artworkOnly: false,
    index: 0,
    player: null,
    stage: null,
    audio: null,
    owner: '',
    candidates: [],
    activeVideo: null,
    activeClip: null,
    startupTimer: 0,
    lastVideoTime: 0,
    lastVideoAdvanceAt: 0,
    nativeMissingSince: 0,
    resolving: false,
    clickedSongKey: '',
    failedUrls: new Set(),
    timer: 0
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const normalize = value => lower(value).replace(/\s+/g, ' ');
  const array = value => Array.isArray(value) ? value : [];

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function rows(value, keys = ['assets', 'items', 'data']) {
    value = unwrap(value);
    if (Array.isArray(value)) return value;
    for (const key of keys) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    if (value?.data && value.data !== value) return rows(value.data, keys);
    return [];
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function visible(node) {
    if (!node || node.hidden || !node.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function allAudio() {
    return [...document.querySelectorAll('#v2App audio, audio[data-audio]')];
  }

  function playingAudio() {
    return allAudio().find(audio => !audio.paused && !audio.ended) || null;
  }

  function activePlayer() {
    const liveAudio = playingAudio();
    const audioPlayer = liveAudio?.closest?.('[data-player]');
    if (audioPlayer && visible(audioPlayer)) return audioPlayer;
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function audioFor(player) {
    const local = player?.querySelector('[data-audio]');
    if (local && !local.paused && !local.ended) return local;
    return playingAudio() || local || null;
  }

  function desktopSurface(player) {
    const width = player?.getBoundingClientRect?.().width || window.innerWidth || 0;
    return width >= DESKTOP_MIN_WIDTH;
  }

  function stageFor(player, create = false) {
    let stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    if (!stage && create && player) {
      stage = document.createElement('div');
      stage.className = 'v2-mobile-vec-stage';
      stage.dataset.mobileVecStage = 'true';
      player.prepend(stage);
      player.classList.add('is-mobile-vec-active', 'is-vec-active');
    }
    return stage;
  }

  function canonicalUrl(value) {
    const source = clean(value)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
    if (!source) return '';
    try {
      const url = new URL(source, location.href);
      url.hash = '';
      [
        'X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date',
        'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature'
      ].forEach(key => url.searchParams.delete(key));
      return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
    } catch (_) {
      return source.toLowerCase();
    }
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
    return canonicalUrl(song?.audio_url || song?.audioUrl || song?.stream_url || song?.streamUrl || song?.audio);
  }

  async function catalog() {
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

  function currentIdentity(player) {
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent),
      hintedKey: clean(
        player?.dataset?.songKey ||
        player?.dataset?.currentSongKey ||
        player?.dataset?.song ||
        state.clickedSongKey
      ),
      audioUrl: canonicalUrl(audioFor(player)?.currentSrc || audioFor(player)?.src)
    };
  }

  function findSong(songs, identity) {
    const title = normalize(identity.title);
    const artist = normalize(identity.artist);

    if (identity.hintedKey) {
      const hinted = songs.find(song => songKey(song) === identity.hintedKey);
      if (hinted) {
        const titleMatches = title && normalize(songTitle(hinted)) === title;
        const audioMatches = identity.audioUrl && songAudio(hinted) === identity.audioUrl;
        if (titleMatches || audioMatches || (!title && !identity.audioUrl)) return hinted;
      }
    }

    if (identity.audioUrl) {
      const byAudio = songs.find(song => songAudio(song) === identity.audioUrl);
      if (byAudio) return byAudio;
      let pathName = '';
      try { pathName = new URL(identity.audioUrl).pathname.toLowerCase(); } catch (_) {}
      if (pathName) {
        const byPath = songs.find(song => {
          try { return new URL(songAudio(song)).pathname.toLowerCase() === pathName; } catch (_) { return false; }
        });
        if (byPath) return byPath;
      }
    }

    return songs.find(song => normalize(songTitle(song)) === title && (!artist || normalize(songArtist(song)) === artist))
      || songs.find(song => normalize(songTitle(song)) === title)
      || null;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function assetUrl(asset) {
    return clean(
      asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url ||
      asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url
    ).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function assetIsVideo(asset) {
    const type = lower(
      asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type ||
      asset?.mime_type || asset?.asset_kind || asset?.file_type || asset?.kind
    );
    return ['clip', 'video', 'video_clip', 'video-clip'].includes(type)
      || type.startsWith('video/')
      || type.includes('video')
      || type.includes('clip')
      || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }

  function assetActive(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status)
      && asset?.hidden !== true
      && asset?.deleted !== true
      && asset?.active !== false;
  }

  function normalizeAssets(body) {
    const combined = [
      ...rows(body, ['assets', 'items', 'results', 'data']),
      ...rows(body, ['clips'])
    ];
    const seen = new Set();
    return combined.filter(asset => {
      if (!asset || typeof asset !== 'object') return false;
      const signature = canonicalUrl(assetUrl(asset)) || lower(assetId(asset));
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function idSet(section, fields) {
    return new Set(fields.flatMap(field => array(section?.[field])).map(clean).filter(Boolean));
  }

  function selectedClips(assets, section = {}, source = 'song') {
    const activeClips = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const activeImages = idSet(section, ['active_image_ids', 'activeImageIds']);
    const excludedClips = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    const restricted = activeClips.size > 0 || activeImages.size > 0;

    return assets.filter(asset => {
      if (!assetActive(asset) || !assetIsVideo(asset) || !assetUrl(asset)) return false;
      const id = assetId(asset);
      const url = assetUrl(asset);
      if (excludedClips.has(id) || excludedClips.has(url)) return false;
      return !restricted || activeClips.has(id) || activeClips.has(url);
    }).map(asset => ({ id: assetId(asset), url: assetUrl(asset), source }));
  }

  function folderRecipes(recipe) {
    const groups = [
      recipe?.folders,
      recipe?.approved_folders,
      recipe?.approvedFolders,
      recipe?.selected_folders,
      recipe?.selectedFolders,
      recipe?.visual_folders,
      recipe?.visualFolders,
      recipe?.folder_sources,
      recipe?.folderSources,
      recipe?.sources?.folders
    ];
    const seen = new Set();
    const output = [];
    groups.forEach(group => {
      const list = Array.isArray(group) ? group : array(group?.items);
      list.forEach(folder => {
        if (!folder || folder.enabled === false || lower(folder.status) === 'hidden') return;
        const id = clean(folder.folder_id || folder.visual_folder_id || folder.folderId || folder.id || folder.key);
        if (!id || seen.has(id)) return;
        seen.add(id);
        output.push({ ...folder, __id: id });
      });
    });
    return output;
  }

  function borrowedRecipes(recipe) {
    const groups = [
      recipe?.borrowed_song_assets,
      recipe?.borrowed_sources,
      recipe?.borrowedSongs,
      recipe?.borrowed_songs
    ];
    const seen = new Set();
    const output = [];
    groups.forEach(group => {
      const list = Array.isArray(group) ? group : [...array(group?.sources), ...array(group?.songs)];
      list.forEach(source => {
        if (!source || source.enabled === false) return;
        const key = clean(source.source_song_key || source.song_key || source.key || source.id);
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push({ ...source, __key: key });
      });
    });
    return output;
  }

  function introSeconds(recipe) {
    const artwork = recipe?.artwork || recipe?.artwork_rules || {};
    if (artwork.start_with_artwork === false || artwork.startWithArtwork === false) return 0;
    const configured = Number(artwork.start_duration_seconds ?? artwork.startDurationSeconds ?? DEFAULT_INTRO_SECONDS);
    return Number.isFinite(configured) ? Math.max(0, Math.min(15, configured)) : DEFAULT_INTRO_SECONDS;
  }

  function randomInt(max) {
    if (!Number.isFinite(max) || max <= 1) return 0;
    try {
      const range = 0x100000000;
      const limit = range - (range % max);
      const values = new Uint32Array(1);
      do { crypto.getRandomValues(values); } while (values[0] >= limit);
      return values[0] % max;
    } catch (_) {
      return Math.floor(Math.random() * max);
    }
  }

  function fallbackShuffle(clips) {
    const output = [...clips];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function uniqueClips(clips) {
    const seen = new Set();
    return clips.filter(clip => {
      const signature = canonicalUrl(clip.url) || lower(clip.id);
      if (!signature || seen.has(signature) || state.failedUrls.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function orderClips(songKeyValue, clips) {
    const unique = uniqueClips(clips);
    const memory = window.StashboxVecShuffleMemory;
    if (memory?.build) return memory.build(songKeyValue, unique);
    return fallbackShuffle(unique);
  }

  function mergeClipPool(songKeyValue, existing, incoming) {
    const activeKey = state.activeClip ? canonicalUrl(state.activeClip.url) : '';
    const combined = uniqueClips([...existing, ...incoming]);
    const ordered = orderClips(songKeyValue, combined);
    if (!activeKey) return ordered;
    const active = ordered.find(clip => canonicalUrl(clip.url) === activeKey) || state.activeClip;
    return [active, ...ordered.filter(clip => canonicalUrl(clip.url) !== activeKey)];
  }

  async function discoverProgressive(song, generation, onUpdate) {
    const key = songKey(song);
    const cacheKey = key;
    const cached = state.rawCache.get(cacheKey);
    if (cached) {
      onUpdate({ ...cached, clips: orderClips(key, cached.clips) });
      return cached;
    }

    const [recipeResult, directResult] = await Promise.allSettled([
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`)
    ]);
    if (generation !== state.generation) return null;

    const recipeBody = recipeResult.status === 'fulfilled' ? recipeResult.value : {};
    const directBody = directResult.status === 'fulfilled' ? directResult.value : {};
    const recipe = recipeFrom(recipeBody);
    const artworkOnly = lower(recipe?.visual_mode || recipe?.visualMode) === 'artwork_only';
    const result = {
      artworkOnly,
      introSeconds: introSeconds(recipe),
      clips: artworkOnly ? [] : selectedClips(
        normalizeAssets(directBody),
        recipe?.song_assets || recipe?.songAssets || {},
        'song'
      )
    };

    onUpdate({ ...result, clips: orderClips(key, result.clips) });
    if (artworkOnly) {
      state.rawCache.set(cacheKey, result);
      return result;
    }

    const jobs = [];
    folderRecipes(recipe).forEach(folder => {
      jobs.push((async () => {
        try {
          const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(folder.__id)}/assets`);
          if (generation !== state.generation) return;
          const incoming = selectedClips(normalizeAssets(body), folder, `folder:${folder.__id}`);
          result.clips = uniqueClips([...result.clips, ...incoming]);
          onUpdate({ ...result, clips: orderClips(key, result.clips) });
        } catch (_) {}
      })());
    });

    borrowedRecipes(recipe).forEach(source => {
      if (source.__key === key) return;
      jobs.push((async () => {
        try {
          const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(source.__key)}`);
          if (generation !== state.generation) return;
          const incoming = selectedClips(normalizeAssets(body), source, `borrowed:${source.__key}`);
          result.clips = uniqueClips([...result.clips, ...incoming]);
          onUpdate({ ...result, clips: orderClips(key, result.clips) });
        } catch (_) {}
      })());
    });

    await Promise.allSettled(jobs);
    if (generation !== state.generation) return null;
    result.clips = uniqueClips(result.clips);
    state.rawCache.set(cacheKey, result);
    onUpdate({ ...result, clips: orderClips(key, result.clips) });
    return result;
  }

  function nativeVideos(stage = state.stage) {
    return [...(stage?.querySelectorAll('video.v2-mobile-vec-media') || [])];
  }

  function nativeVideoPlaying(stage = state.stage) {
    return nativeVideos(stage).some(video => {
      if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
      const style = getComputedStyle(video);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    });
  }

  function suppressNativeVideos() {
    nativeVideos().forEach(video => {
      if (video.dataset.vecWatchdogSuppressed !== 'true') {
        video.dataset.vecWatchdogSuppressed = 'true';
        video.dataset.vecWatchdogPreviousOpacity = video.style.opacity || '';
        video.dataset.vecWatchdogPreviousVisibility = video.style.visibility || '';
      }
      try { video.pause(); } catch (_) {}
      video.style.setProperty('opacity', '0', 'important');
      video.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function releaseNativeVideos() {
    document.querySelectorAll('video[data-vec-watchdog-suppressed="true"]').forEach(video => {
      const opacity = video.dataset.vecWatchdogPreviousOpacity || '';
      const visibility = video.dataset.vecWatchdogPreviousVisibility || '';
      video.style.removeProperty('opacity');
      video.style.removeProperty('visibility');
      if (opacity) video.style.opacity = opacity;
      if (visibility) video.style.visibility = visibility;
      delete video.dataset.vecWatchdogSuppressed;
      delete video.dataset.vecWatchdogPreviousOpacity;
      delete video.dataset.vecWatchdogPreviousVisibility;
    });
  }

  function clearStartupTimer() {
    window.clearTimeout(state.startupTimer);
    state.startupTimer = 0;
  }

  function removeVideo(video) {
    if (!video) return;
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    video.remove();
  }

  function clearCandidates({ keepActive = false } = {}) {
    clearStartupTimer();
    state.candidates.forEach(entry => {
      if (keepActive && entry.video === state.activeVideo) return;
      removeVideo(entry.video);
    });
    state.candidates = keepActive && state.activeVideo
      ? state.candidates.filter(entry => entry.video === state.activeVideo)
      : [];
    if (!keepActive) {
      state.activeVideo = null;
      state.activeClip = null;
      state.lastVideoTime = 0;
      state.lastVideoAdvanceAt = 0;
    }
  }

  function mark(status, reason = '') {
    if (!state.player) return;
    state.player.dataset.mainVecWatchdogState = status;
    state.player.dataset.mainVecWatchdogReason = reason;
    state.player.dataset.mainVecWatchdogSongKey = state.songKey;
    state.player.dataset.mainVecWatchdogClipCount = String(state.clips.length);
    state.player.dataset.mainVecWatchdogIntroSeconds = String(state.introSeconds);
    state.player.dataset.mainVecWatchdogOwner = state.owner;
  }

  function candidateForClip(clip) {
    const target = canonicalUrl(clip.url);
    return state.candidates.find(entry => canonicalUrl(entry.clip.url) === target) || null;
  }

  function createCandidate(clip) {
    const stage = stageFor(state.player, true);
    if (!stage) return null;
    const video = document.createElement('video');
    video.className = 'v2-main-watchdog-video v2-main-watchdog-preload';
    video.dataset.mainVecWatchdog = 'true';
    video.dataset.vecAssetSource = clip.source || 'desktop-recovery';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;inset:0;z-index:4;width:100%;height:100%;object-fit:contain;object-position:center center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;';
    video.src = clip.url;
    const entry = { clip, video, started: false, failed: false };

    video.addEventListener('timeupdate', () => {
      if (video !== state.activeVideo) return;
      const current = Number(video.currentTime || 0);
      if (current > state.lastVideoTime + 0.08) {
        state.lastVideoTime = current;
        state.lastVideoAdvanceAt = performance.now();
      }
    });
    video.addEventListener('ended', () => {
      if (video === state.activeVideo) advanceClip('ended');
    });
    video.addEventListener('error', () => {
      entry.failed = true;
      state.failedUrls.add(canonicalUrl(clip.url));
      if (video === state.activeVideo || !state.activeVideo) advanceClip('video-error');
    }, { once: true });

    stage.appendChild(video);
    try { video.load(); } catch (_) {}
    return entry;
  }

  function maintainPreloads() {
    if (!state.player || !state.clips.length || state.artworkOnly) return;
    const desired = [];
    for (let offset = 0; offset < Math.min(PRELOAD_COUNT, state.clips.length); offset += 1) {
      const clip = state.clips[(state.index + offset) % state.clips.length];
      if (!clip || state.failedUrls.has(canonicalUrl(clip.url))) continue;
      desired.push(clip);
    }
    const desiredKeys = new Set(desired.map(clip => canonicalUrl(clip.url)));

    state.candidates.slice().forEach(entry => {
      if (entry.video === state.activeVideo || desiredKeys.has(canonicalUrl(entry.clip.url))) return;
      removeVideo(entry.video);
      state.candidates = state.candidates.filter(candidate => candidate !== entry);
    });

    desired.forEach(clip => {
      if (!candidateForClip(clip)) {
        const entry = createCandidate(clip);
        if (entry) state.candidates.push(entry);
      }
    });
    mark('preloading', `${state.candidates.length} candidates`);
  }

  function selectCandidate() {
    const ordered = state.clips.map(candidateForClip).filter(Boolean).filter(entry => !entry.failed);
    return ordered.find(entry => entry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      || ordered.find(entry => entry.video.readyState >= HTMLMediaElement.HAVE_METADATA)
      || ordered[0]
      || null;
  }

  function activateCandidate() {
    if (!state.audio || state.audio.paused || state.audio.ended || !state.clips.length) return;
    maintainPreloads();
    const entry = selectCandidate();
    if (!entry) return;

    state.owner = 'fallback';
    suppressNativeVideos();
    state.activeVideo = entry.video;
    state.activeClip = entry.clip;
    entry.started = true;
    state.candidates.forEach(candidate => {
      const active = candidate === entry;
      candidate.video.style.setProperty('z-index', active ? '5' : '4', 'important');
      candidate.video.style.setProperty('opacity', '0', 'important');
      candidate.video.style.setProperty('visibility', active ? 'visible' : 'hidden', 'important');
    });

    const generation = state.generation;
    const play = () => {
      if (
        generation !== state.generation ||
        entry.video !== state.activeVideo ||
        !entry.video.isConnected ||
        state.audio?.paused ||
        state.audio?.ended
      ) return;
      entry.video.play().catch(() => {});
    };

    const onPlaying = () => {
      if (generation !== state.generation || entry.video !== state.activeVideo) return;
      clearStartupTimer();
      entry.video.style.setProperty('opacity', '1', 'important');
      entry.video.style.setProperty('visibility', 'visible', 'important');
      state.lastVideoTime = Number(entry.video.currentTime || 0);
      state.lastVideoAdvanceAt = performance.now();
      window.StashboxVecShuffleMemory?.mark?.(state.songKey, entry.clip);
      mark('fallback-video-playing', entry.clip.url);
    };

    entry.video.addEventListener('playing', onPlaying, { once: true });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => {
      entry.video.addEventListener(eventName, play, { once: true });
    });

    play();
    window.setTimeout(play, 80);
    window.setTimeout(play, 250);
    clearStartupTimer();
    state.startupTimer = window.setTimeout(() => {
      if (entry.video === state.activeVideo && entry.video.paused) {
        advanceClip('startup-timeout');
      }
    }, STARTUP_DEADLINE_MS);
    mark('starting-fallback-video', entry.clip.url);
  }

  function advanceClip(reason = 'next') {
    clearStartupTimer();
    const previous = state.activeVideo;
    const previousClip = state.activeClip;
    state.activeVideo = null;
    state.activeClip = null;
    if (previous) removeVideo(previous);
    state.candidates = state.candidates.filter(entry => entry.video !== previous);

    if (reason !== 'ended' && previousClip) {
      state.failedUrls.add(canonicalUrl(previousClip.url));
      state.clips = state.clips.filter(clip => canonicalUrl(clip.url) !== canonicalUrl(previousClip.url));
    } else if (state.clips.length) {
      state.index = (state.index + 1) % state.clips.length;
    }

    if (!state.clips.length) {
      mark('no-playable-videos', reason);
      return;
    }
    state.index %= state.clips.length;
    maintainPreloads();
    activateCandidate();
  }

  function applyDiscoveryUpdate(result, generation) {
    if (generation !== state.generation || !result) return;
    state.artworkOnly = Boolean(result.artworkOnly);
    state.introSeconds = result.introSeconds;
    state.clips = mergeClipPool(state.songKey, state.clips, result.clips || []);
    if (state.artworkOnly) {
      clearCandidates();
      mark('artwork-only');
      return;
    }
    if (!state.clips.length) {
      mark('loading-greenlit-videos');
      return;
    }
    maintainPreloads();
    const currentTime = Number(state.audio?.currentTime || 0);
    if (state.audio && !state.audio.paused && currentTime >= state.introSeconds && state.owner !== 'native') {
      activateCandidate();
    } else {
      mark('ready', `${state.clips.length} greenlit videos`);
    }
  }

  async function resolveCurrent(player, identity, signature) {
    if (state.resolving) return;
    state.resolving = true;
    const generation = ++state.generation;
    clearCandidates();
    releaseNativeVideos();
    state.owner = '';
    state.songKey = '';
    state.clips = [];
    state.index = 0;
    state.artworkOnly = false;
    state.failedUrls = new Set();
    mark('resolving-song');

    try {
      const songs = await catalog();
      if (generation !== state.generation || signature !== state.signature) return;
      const song = findSong(songs, identity);
      const key = songKey(song);
      if (!key) {
        mark('song-not-found', identity.title || identity.audioUrl);
        return;
      }

      state.songKey = key;
      player.dataset.songKey = key;
      mark('loading-recipe');
      await discoverProgressive(song, generation, result => applyDiscoveryUpdate(result, generation));
      if (generation !== state.generation || signature !== state.signature) return;
      if (!state.artworkOnly && !state.clips.length) mark('zero-greenlit-videos');
    } catch (error) {
      mark('recovery-error', error?.message || 'Unknown error');
    } finally {
      if (generation === state.generation) state.resolving = false;
    }
  }

  function tick() {
    const player = activePlayer();
    const audio = audioFor(player);
    if (!player || !desktopSurface(player)) {
      clearCandidates();
      releaseNativeVideos();
      state.owner = '';
      return;
    }

    state.player = player;
    state.audio = audio;
    state.stage = stageFor(player, false);

    const identity = currentIdentity(player);
    const signature = [identity.hintedKey, normalize(identity.artist), normalize(identity.title), identity.audioUrl].join('|');
    if (signature && signature !== state.signature) {
      state.signature = signature;
      state.resolving = false;
      resolveCurrent(player, identity, signature);
      return;
    }

    if (!audio || audio.paused || audio.ended) {
      if (state.activeVideo && !state.activeVideo.paused) state.activeVideo.pause();
      mark('waiting-for-audio');
      return;
    }

    const audioTime = Number(audio.currentTime || 0);
    if (state.artworkOnly) {
      mark('artwork-only');
      return;
    }

    if (state.owner === 'fallback') {
      suppressNativeVideos();
      if (!state.activeVideo || !state.activeVideo.isConnected) {
        activateCandidate();
        return;
      }
      if (state.activeVideo.paused && !state.activeVideo.ended) {
        state.activeVideo.play().catch(() => {});
      }
      if (
        !state.activeVideo.paused &&
        state.lastVideoAdvanceAt &&
        performance.now() - state.lastVideoAdvanceAt > STALL_MS
      ) {
        advanceClip('video-stalled');
      }
      return;
    }

    if (nativeVideoPlaying(state.stage)) {
      state.owner = 'native';
      state.nativeMissingSince = 0;
      clearCandidates();
      mark('native-video-playing');
      return;
    }

    if (state.owner === 'native') {
      if (!state.nativeMissingSince) state.nativeMissingSince = performance.now();
      if (performance.now() - state.nativeMissingSince < NATIVE_TRANSITION_GRACE_MS) return;
      state.owner = '';
      state.nativeMissingSince = 0;
    }

    if (!state.songKey || !state.clips.length) return;
    maintainPreloads();
    if (audioTime < state.introSeconds) {
      mark('artwork-intro');
      return;
    }

    activateCandidate();
  }

  async function warmSong(key) {
    const normalizedKey = clean(key);
    if (!normalizedKey || state.rawCache.has(normalizedKey)) return;
    try {
      const songs = await catalog();
      const song = songs.find(item => songKey(item) === normalizedKey);
      if (!song || state.rawCache.has(normalizedKey)) return;
      const generation = state.generation;
      const result = await discoverProgressive(song, generation, () => {});
      if (result) state.rawCache.set(normalizedKey, result);
    } catch (_) {}
  }

  document.addEventListener('pointerover', event => {
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (key) warmSong(key);
  }, { capture: true, passive: true });

  document.addEventListener('pointerdown', event => {
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (!key) return;
    state.clickedSongKey = key;
    warmSong(key);
  }, true);

  document.addEventListener('click', event => {
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (!key) return;
    state.clickedSongKey = key;
    const player = activePlayer();
    if (player) player.dataset.songKey = key;
  }, true);

  window.addEventListener('stashbox:vec-asset-change', event => {
    const key = clean(event?.detail?.songKey);
    if (!key) return;
    const player = activePlayer();
    const identity = currentIdentity(player);
    const currentSongMatches = !state.songKey || key === state.songKey || key === identity.hintedKey;
    if (currentSongMatches) {
      state.clickedSongKey = key;
      if (player) player.dataset.songKey = key;
    }
  });

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) window.setTimeout(tick, 0);
  }, true);

  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && state.activeVideo && !state.activeVideo.paused) {
      state.activeVideo.pause();
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.activeVideo && !state.activeVideo.paused) state.activeVideo.pause();
    } else {
      tick();
    }
  });

  window.addEventListener('resize', tick, { passive: true });
  window.addEventListener('online', () => {
    state.rawCache.clear();
    tick();
  });

  state.timer = window.setInterval(tick, POLL_MS);
  tick();

  window.StashboxMainVecVideoWatchdog = Object.freeze({
    refresh: () => {
      state.rawCache.delete(state.songKey);
      state.signature = '';
      tick();
    },
    activeSongKey: () => state.songKey,
    clipCount: () => state.clips.length,
    rescueActive: () => state.owner === 'fallback' && Boolean(state.activeVideo && !state.activeVideo.paused),
    rescueUrl: () => state.activeClip?.url || '',
    state: () => ({
      songKey: state.songKey,
      clipCount: state.clips.length,
      introSeconds: state.introSeconds,
      owner: state.owner,
      status: state.player?.dataset?.mainVecWatchdogState || '',
      reason: state.player?.dataset?.mainVecWatchdogReason || ''
    }),
    stop: () => {
      window.clearInterval(state.timer);
      clearCandidates();
      releaseNativeVideos();
    }
  });
})();