(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxMobileVecVideoRuntime) return;

  const MOBILE = window.matchMedia('(max-width: 899px)');
  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const DEFAULT_INTRO_SECONDS = 2;
  const POLL_MS = 250;
  const PRELOAD_COUNT = 3;
  const STARTUP_TIMEOUT_MS = 2200;
  const STALL_MS = 5000;
  const CROSSFADE_MS = 180;

  const state = {
    songsPromise: null,
    cache: new Map(),
    signature: '',
    generation: 0,
    songKey: '',
    introSeconds: DEFAULT_INTRO_SECONDS,
    artworkOnly: false,
    clips: [],
    index: 0,
    player: null,
    stage: null,
    audio: null,
    entries: [],
    activeEntry: null,
    activeClip: null,
    clickedSongKey: '',
    failed: new Set(),
    startupTimer: 0,
    lastTime: 0,
    lastAdvanceAt: 0,
    resolving: false,
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
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
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
    if (!node || !node.isConnected || node.hidden) return false;
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
    const audio = playingAudio();
    const byAudio = audio?.closest?.('[data-player]');
    if (byAudio && visible(byAudio)) return byAudio;
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function audioFor(player) {
    const local = player?.querySelector('[data-audio]');
    if (local && !local.paused && !local.ended) return local;
    return playingAudio() || local || null;
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

  function identityFor(player) {
    const audio = audioFor(player);
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent),
      hintedKey: clean(
        player?.dataset?.songKey ||
        player?.dataset?.currentSongKey ||
        player?.dataset?.song ||
        state.clickedSongKey
      ),
      audioUrl: canonicalUrl(audio?.currentSrc || audio?.src)
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
      const exact = songs.find(song => songAudio(song) === identity.audioUrl);
      if (exact) return exact;
      let pathname = '';
      try { pathname = new URL(identity.audioUrl).pathname.toLowerCase(); } catch (_) {}
      if (pathname) {
        const pathMatch = songs.find(song => {
          try { return new URL(songAudio(song)).pathname.toLowerCase() === pathname; } catch (_) { return false; }
        });
        if (pathMatch) return pathMatch;
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

  function assetUrl(asset) {
    return clean(
      asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url ||
      asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url
    ).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function isVideo(asset) {
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

  function activeAsset(asset) {
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
      const key = canonicalUrl(assetUrl(asset)) || lower(assetId(asset));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function idSet(section, fields) {
    return new Set(fields.flatMap(field => array(section?.[field])).map(clean).filter(Boolean));
  }

  function selectedVideos(assets, section = {}, source = 'song') {
    const activeClips = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const activeImages = idSet(section, ['active_image_ids', 'activeImageIds']);
    const excluded = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    const restricted = activeClips.size > 0 || activeImages.size > 0;

    return assets.filter(asset => {
      if (!activeAsset(asset) || !isVideo(asset) || !assetUrl(asset)) return false;
      const id = assetId(asset);
      const url = assetUrl(asset);
      if (excluded.has(id) || excluded.has(url)) return false;
      return !restricted || activeClips.has(id) || activeClips.has(url);
    }).map(asset => ({ id: assetId(asset), url: assetUrl(asset), source }));
  }

  function folders(recipe) {
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

  function borrowed(recipe) {
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

  function shuffle(clips) {
    const memory = window.StashboxVecShuffleMemory;
    if (memory?.build) return memory.build(state.songKey, clips);
    const output = [...clips];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function unique(clips) {
    const seen = new Set();
    return clips.filter(clip => {
      const key = canonicalUrl(clip.url) || lower(clip.id);
      if (!key || seen.has(key) || state.failed.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeClips(incoming) {
    const activeKey = state.activeClip ? canonicalUrl(state.activeClip.url) : '';
    const ordered = shuffle(unique([...state.clips, ...incoming]));
    if (!activeKey) return ordered;
    const current = ordered.find(clip => canonicalUrl(clip.url) === activeKey) || state.activeClip;
    return [current, ...ordered.filter(clip => canonicalUrl(clip.url) !== activeKey)];
  }

  async function discover(song, generation, onUpdate) {
    const key = songKey(song);
    if (state.cache.has(key)) {
      const cached = state.cache.get(key);
      onUpdate({ ...cached, clips: shuffle(cached.clips) });
      return cached;
    }

    const [recipeResult, directResult] = await Promise.allSettled([
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`)
    ]);
    if (generation !== state.generation) return null;

    const recipe = recipeFrom(recipeResult.status === 'fulfilled' ? recipeResult.value : {});
    const directBody = directResult.status === 'fulfilled' ? directResult.value : {};
    const result = {
      artworkOnly: lower(recipe?.visual_mode || recipe?.visualMode) === 'artwork_only',
      introSeconds: introSeconds(recipe),
      clips: []
    };

    if (!result.artworkOnly) {
      result.clips = selectedVideos(
        normalizeAssets(directBody),
        recipe?.song_assets || recipe?.songAssets || {},
        'song'
      );
    }
    onUpdate({ ...result, clips: shuffle(result.clips) });
    if (result.artworkOnly) {
      state.cache.set(key, result);
      return result;
    }

    const jobs = [];
    folders(recipe).forEach(folder => {
      jobs.push((async () => {
        try {
          const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(folder.__id)}/assets`);
          if (generation !== state.generation) return;
          result.clips = unique([
            ...result.clips,
            ...selectedVideos(normalizeAssets(body), folder, `folder:${folder.__id}`)
          ]);
          onUpdate({ ...result, clips: shuffle(result.clips) });
        } catch (_) {}
      })());
    });

    borrowed(recipe).forEach(source => {
      if (source.__key === key) return;
      jobs.push((async () => {
        try {
          const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(source.__key)}`);
          if (generation !== state.generation) return;
          result.clips = unique([
            ...result.clips,
            ...selectedVideos(normalizeAssets(body), source, `borrowed:${source.__key}`)
          ]);
          onUpdate({ ...result, clips: shuffle(result.clips) });
        } catch (_) {}
      })());
    });

    await Promise.allSettled(jobs);
    if (generation !== state.generation) return null;
    result.clips = unique(result.clips);
    state.cache.set(key, result);
    onUpdate({ ...result, clips: shuffle(result.clips) });
    return result;
  }

  function nativeMedia() {
    return [...(state.stage?.querySelectorAll('.v2-mobile-vec-media') || [])];
  }

  function hideNativeMedia() {
    nativeMedia().forEach(media => {
      if (media.dataset.mobileRuntimeHidden !== 'true') {
        media.dataset.mobileRuntimeHidden = 'true';
        media.dataset.mobileRuntimeOpacity = media.style.opacity || '';
        media.dataset.mobileRuntimeVisibility = media.style.visibility || '';
      }
      if (media instanceof HTMLVideoElement) {
        try { media.pause(); } catch (_) {}
      }
      media.style.setProperty('opacity', '0', 'important');
      media.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function restoreNativeMedia() {
    document.querySelectorAll('[data-mobile-runtime-hidden="true"]').forEach(media => {
      const opacity = media.dataset.mobileRuntimeOpacity || '';
      const visibility = media.dataset.mobileRuntimeVisibility || '';
      media.style.removeProperty('opacity');
      media.style.removeProperty('visibility');
      if (opacity) media.style.opacity = opacity;
      if (visibility) media.style.visibility = visibility;
      delete media.dataset.mobileRuntimeHidden;
      delete media.dataset.mobileRuntimeOpacity;
      delete media.dataset.mobileRuntimeVisibility;
    });
  }

  function clearStartupTimer() {
    clearTimeout(state.startupTimer);
    state.startupTimer = 0;
  }

  function removeVideo(video) {
    if (!video) return;
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    video.remove();
  }

  function clearEntries() {
    clearStartupTimer();
    state.entries.forEach(entry => removeVideo(entry.video));
    state.entries = [];
    state.activeEntry = null;
    state.activeClip = null;
    state.lastTime = 0;
    state.lastAdvanceAt = 0;
  }

  function mark(status, reason = '') {
    if (!state.player) return;
    state.player.dataset.mobileVecRuntimeState = status;
    state.player.dataset.mobileVecRuntimeReason = reason;
    state.player.dataset.mobileVecRuntimeSongKey = state.songKey;
    state.player.dataset.mobileVecRuntimeClipCount = String(state.clips.length);
    state.player.dataset.mobileVecRuntimeIntroSeconds = String(state.introSeconds);
  }

  function entryFor(clip) {
    const target = canonicalUrl(clip.url);
    return state.entries.find(entry => canonicalUrl(entry.clip.url) === target) || null;
  }

  function createEntry(clip) {
    const stage = stageFor(state.player, true);
    if (!stage) return null;

    const video = document.createElement('video');
    video.className = 'v2-mobile-runtime-video';
    video.dataset.mobileVecRuntime = 'true';
    video.dataset.vecAssetSource = clip.source || 'mobile-runtime';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = `position:absolute;inset:0;z-index:6;width:100%;height:100%;object-fit:cover;object-position:center center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;transition:opacity ${CROSSFADE_MS}ms ease;`;
    video.src = clip.url;

    const entry = { clip, video, failed: false };
    video.addEventListener('timeupdate', () => {
      if (entry !== state.activeEntry) return;
      const current = Number(video.currentTime || 0);
      if (current > state.lastTime + 0.08) {
        state.lastTime = current;
        state.lastAdvanceAt = performance.now();
      }
    });
    video.addEventListener('ended', () => {
      if (entry === state.activeEntry) nextClip('ended');
    });
    video.addEventListener('error', () => {
      entry.failed = true;
      state.failed.add(canonicalUrl(clip.url));
      if (entry === state.activeEntry || !state.activeEntry) nextClip('error');
    }, { once: true });

    stage.appendChild(video);
    try { video.load(); } catch (_) {}
    return entry;
  }

  function maintainPreloads() {
    if (!state.player || state.artworkOnly || !state.clips.length) return;
    const desired = [];
    for (let offset = 0; offset < Math.min(PRELOAD_COUNT, state.clips.length); offset += 1) {
      const clip = state.clips[(state.index + offset) % state.clips.length];
      if (clip && !state.failed.has(canonicalUrl(clip.url))) desired.push(clip);
    }
    const keys = new Set(desired.map(clip => canonicalUrl(clip.url)));

    state.entries.slice().forEach(entry => {
      if (entry === state.activeEntry || keys.has(canonicalUrl(entry.clip.url))) return;
      removeVideo(entry.video);
      state.entries = state.entries.filter(item => item !== entry);
    });

    desired.forEach(clip => {
      if (!entryFor(clip)) {
        const entry = createEntry(clip);
        if (entry) state.entries.push(entry);
      }
    });
    mark('preloading', `${state.entries.length} videos`);
  }

  function selectEntry() {
    const ordered = state.clips.map(entryFor).filter(Boolean).filter(entry => !entry.failed);
    return ordered.find(entry => entry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      || ordered.find(entry => entry.video.readyState >= HTMLMediaElement.HAVE_METADATA)
      || ordered[0]
      || null;
  }

  function activate() {
    if (!MOBILE.matches || !state.audio || state.audio.paused || state.audio.ended || !state.clips.length) return;
    maintainPreloads();
    const next = selectEntry();
    if (!next) return;

    hideNativeMedia();
    const previous = state.activeEntry;
    state.activeEntry = next;
    state.activeClip = next.clip;

    state.entries.forEach(entry => {
      const active = entry === next;
      entry.video.style.setProperty('visibility', active ? 'visible' : 'hidden', 'important');
      if (!active) entry.video.style.setProperty('opacity', '0', 'important');
    });

    const generation = state.generation;
    const play = () => {
      if (
        generation !== state.generation ||
        next !== state.activeEntry ||
        !next.video.isConnected ||
        state.audio?.paused ||
        state.audio?.ended
      ) return;
      next.video.play().catch(() => {});
    };

    const onPlaying = () => {
      if (generation !== state.generation || next !== state.activeEntry) return;
      clearStartupTimer();
      next.video.style.setProperty('visibility', 'visible', 'important');
      next.video.style.setProperty('opacity', '1', 'important');
      if (previous && previous !== next) {
        previous.video.style.setProperty('opacity', '0', 'important');
        setTimeout(() => {
          if (previous !== state.activeEntry) {
            previous.video.style.setProperty('visibility', 'hidden', 'important');
            try { previous.video.pause(); } catch (_) {}
          }
        }, CROSSFADE_MS + 30);
      }
      state.lastTime = Number(next.video.currentTime || 0);
      state.lastAdvanceAt = performance.now();
      window.StashboxVecShuffleMemory?.mark?.(state.songKey, next.clip);
      mark('video-playing', next.clip.url);
    };

    next.video.addEventListener('playing', onPlaying, { once: true });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => next.video.addEventListener(eventName, play, { once: true }));
    play();
    setTimeout(play, 100);
    setTimeout(play, 350);

    clearStartupTimer();
    state.startupTimer = setTimeout(() => {
      if (next === state.activeEntry && next.video.paused) nextClip('startup-timeout');
    }, STARTUP_TIMEOUT_MS);
    mark('starting-video', next.clip.url);
  }

  function nextClip(reason = 'next') {
    clearStartupTimer();
    const previous = state.activeEntry;
    const previousClip = state.activeClip;
    state.activeEntry = null;
    state.activeClip = null;

    if (reason !== 'ended' && previousClip) {
      const key = canonicalUrl(previousClip.url);
      state.failed.add(key);
      state.clips = state.clips.filter(clip => canonicalUrl(clip.url) !== key);
    } else if (state.clips.length) {
      state.index = (state.index + 1) % state.clips.length;
    }

    if (previous) {
      previous.video.style.setProperty('opacity', '0', 'important');
      setTimeout(() => {
        removeVideo(previous.video);
        state.entries = state.entries.filter(entry => entry !== previous);
      }, CROSSFADE_MS + 40);
    }

    if (!state.clips.length) {
      restoreNativeMedia();
      mark('no-playable-videos', reason);
      return;
    }
    state.index %= state.clips.length;
    maintainPreloads();
    activate();
  }

  function applyUpdate(result, generation) {
    if (generation !== state.generation || !result) return;
    state.artworkOnly = Boolean(result.artworkOnly);
    state.introSeconds = result.introSeconds;
    state.clips = mergeClips(result.clips || []);

    if (state.artworkOnly) {
      clearEntries();
      restoreNativeMedia();
      mark('artwork-only');
      return;
    }
    if (!state.clips.length) {
      mark('loading-videos');
      return;
    }

    maintainPreloads();
    if (state.audio && !state.audio.paused && Number(state.audio.currentTime || 0) >= state.introSeconds) activate();
    else mark('ready', `${state.clips.length} videos`);
  }

  async function resolveCurrent(player, identity, signature) {
    if (state.resolving) return;
    state.resolving = true;
    const generation = ++state.generation;
    clearEntries();
    restoreNativeMedia();
    state.songKey = '';
    state.clips = [];
    state.index = 0;
    state.artworkOnly = false;
    state.failed = new Set();
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
      await discover(song, generation, result => applyUpdate(result, generation));
      if (generation !== state.generation || signature !== state.signature) return;
      if (!state.artworkOnly && !state.clips.length) mark('zero-greenlit-videos');
    } catch (error) {
      mark('runtime-error', error?.message || 'Unknown error');
    } finally {
      if (generation === state.generation) state.resolving = false;
    }
  }

  function tick() {
    if (!MOBILE.matches) {
      clearEntries();
      restoreNativeMedia();
      return;
    }

    const player = activePlayer();
    const audio = audioFor(player);
    if (!player) return;

    state.player = player;
    state.audio = audio;
    state.stage = stageFor(player, false);

    const identity = identityFor(player);
    const signature = [identity.hintedKey, normalize(identity.artist), normalize(identity.title), identity.audioUrl].join('|');
    if (signature && signature !== state.signature) {
      state.signature = signature;
      state.resolving = false;
      resolveCurrent(player, identity, signature);
      return;
    }

    if (!audio || audio.paused || audio.ended) {
      if (state.activeEntry && !state.activeEntry.video.paused) state.activeEntry.video.pause();
      mark('waiting-for-audio');
      return;
    }

    if (state.artworkOnly || !state.songKey || !state.clips.length) return;
    maintainPreloads();

    if (Number(audio.currentTime || 0) < state.introSeconds) {
      mark('artwork-intro');
      return;
    }

    hideNativeMedia();
    if (!state.activeEntry || !state.activeEntry.video.isConnected) {
      activate();
      return;
    }

    if (state.activeEntry.video.paused && !state.activeEntry.video.ended) {
      state.activeEntry.video.play().catch(() => {});
    }

    if (
      !state.activeEntry.video.paused &&
      state.lastAdvanceAt &&
      performance.now() - state.lastAdvanceAt > STALL_MS
    ) {
      nextClip('stalled');
    }
  }

  async function warmSong(key) {
    const normalizedKey = clean(key);
    if (!normalizedKey || state.cache.has(normalizedKey)) return;
    try {
      const songs = await catalog();
      const song = songs.find(item => songKey(item) === normalizedKey);
      if (!song) return;
      const generation = state.generation;
      const result = await discover(song, generation, () => {});
      if (result) state.cache.set(normalizedKey, result);
    } catch (_) {}
  }

  document.addEventListener('pointerdown', event => {
    if (!MOBILE.matches) return;
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (!key) return;
    state.clickedSongKey = key;
    warmSong(key);
  }, true);

  document.addEventListener('click', event => {
    if (!MOBILE.matches) return;
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (!key) return;
    state.clickedSongKey = key;
    const player = activePlayer();
    if (player) player.dataset.songKey = key;
  }, true);

  document.addEventListener('play', event => {
    if (MOBILE.matches && event.target instanceof HTMLAudioElement) setTimeout(tick, 0);
  }, true);

  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && state.activeEntry && !state.activeEntry.video.paused) {
      state.activeEntry.video.pause();
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.activeEntry && !state.activeEntry.video.paused) state.activeEntry.video.pause();
    } else {
      tick();
    }
  });

  if (typeof MOBILE.addEventListener === 'function') {
    MOBILE.addEventListener('change', tick);
  }
  window.addEventListener('resize', tick, { passive: true });
  window.addEventListener('online', () => {
    state.cache.clear();
    tick();
  });

  state.timer = setInterval(tick, POLL_MS);
  tick();

  window.StashboxMobileVecVideoRuntime = Object.freeze({
    refresh: () => {
      state.cache.delete(state.songKey);
      state.signature = '';
      tick();
    },
    state: () => ({
      songKey: state.songKey,
      clipCount: state.clips.length,
      introSeconds: state.introSeconds,
      status: state.player?.dataset?.mobileVecRuntimeState || '',
      reason: state.player?.dataset?.mobileVecRuntimeReason || '',
      activeUrl: state.activeClip?.url || ''
    }),
    stop: () => {
      clearInterval(state.timer);
      clearEntries();
      restoreNativeMedia();
    }
  });
})();