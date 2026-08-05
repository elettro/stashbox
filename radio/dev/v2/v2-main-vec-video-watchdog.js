(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/dev/v2/') || path.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxMainVecVideoWatchdog) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const DEFAULT_INTRO_SECONDS = 2;
  const POLL_MS = 300;
  const DESKTOP_MIN_WIDTH = 900;
  const STALL_MS = 4000;

  const state = {
    songsPromise: null,
    generation: 0,
    signature: '',
    songKey: '',
    clips: [],
    introSeconds: DEFAULT_INTRO_SECONDS,
    index: 0,
    player: null,
    stage: null,
    audio: null,
    video: null,
    videoUrl: '',
    lastVideoTime: 0,
    lastVideoAdvanceAt: 0,
    resolving: false,
    clickedSongKey: '',
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
      ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature'].forEach(key => url.searchParams.delete(key));
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
    if (identity.hintedKey) {
      const hinted = songs.find(song => songKey(song) === identity.hintedKey);
      if (hinted) return hinted;
    }
    if (identity.audioUrl) {
      const byAudio = songs.find(song => songAudio(song) === identity.audioUrl);
      if (byAudio) return byAudio;
      let path = '';
      try { path = new URL(identity.audioUrl).pathname.toLowerCase(); } catch (_) {}
      if (path) {
        const byPath = songs.find(song => {
          try { return new URL(songAudio(song)).pathname.toLowerCase() === path; } catch (_) { return false; }
        });
        if (byPath) return byPath;
      }
    }
    const title = normalize(identity.title);
    const artist = normalize(identity.artist);
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
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.asset_kind || asset?.file_type || asset?.kind);
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

  function selectedClips(assets, section = {}) {
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
    }).map(asset => ({ id: assetId(asset), url: assetUrl(asset) }));
  }

  function folderRecipes(recipe) {
    const candidate = [
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
    ].find(value => Array.isArray(value) || Array.isArray(value?.items));
    const list = Array.isArray(candidate) ? candidate : candidate?.items || [];
    return list.filter(folder => folder?.enabled !== false && lower(folder?.status) !== 'hidden');
  }

  function borrowedRecipes(recipe) {
    const candidate = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs]
      .find(value => Array.isArray(value) || Array.isArray(value?.sources) || Array.isArray(value?.songs));
    const list = Array.isArray(candidate) ? candidate : candidate?.sources || candidate?.songs || [];
    return list.filter(source => source?.enabled !== false);
  }

  function introSeconds(recipe) {
    const artwork = recipe?.artwork || recipe?.artwork_rules || {};
    if (artwork.start_with_artwork === false || artwork.startWithArtwork === false) return 0;
    const configured = Number(artwork.start_duration_seconds ?? artwork.startDurationSeconds ?? DEFAULT_INTRO_SECONDS);
    return Number.isFinite(configured) ? Math.max(0, Math.min(15, configured)) : DEFAULT_INTRO_SECONDS;
  }

  async function discover(song) {
    const key = songKey(song);
    const [recipeResult, directResult] = await Promise.allSettled([
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`)
    ]);
    const recipeBody = recipeResult.status === 'fulfilled' ? recipeResult.value : {};
    const directBody = directResult.status === 'fulfilled' ? directResult.value : {};
    const recipe = recipeFrom(recipeBody);

    if (lower(recipe?.visual_mode || recipe?.visualMode) === 'artwork_only') {
      return { artworkOnly: true, introSeconds: introSeconds(recipe), clips: [] };
    }

    const clips = [];
    clips.push(...selectedClips(normalizeAssets(directBody), recipe?.song_assets || recipe?.songAssets || {}));

    const folderResults = await Promise.all(folderRecipes(recipe).map(async folder => {
      const id = clean(folder?.folder_id || folder?.visual_folder_id || folder?.folderId || folder?.id || folder?.key);
      if (!id) return [];
      try {
        const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(id)}/assets`);
        return selectedClips(normalizeAssets(body), folder);
      } catch (_) {
        return [];
      }
    }));
    clips.push(...folderResults.flat());

    const borrowedResults = await Promise.all(borrowedRecipes(recipe).map(async source => {
      const sourceKey = clean(source?.source_song_key || source?.song_key || source?.key || source?.id);
      if (!sourceKey || sourceKey === key) return [];
      try {
        const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(sourceKey)}`);
        return selectedClips(normalizeAssets(body), source);
      } catch (_) {
        return [];
      }
    }));
    clips.push(...borrowedResults.flat());

    const seen = new Set();
    const unique = clips.filter(clip => {
      const signature = canonicalUrl(clip.url) || lower(clip.id);
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });

    return { artworkOnly: false, introSeconds: introSeconds(recipe), clips: unique };
  }

  function nativeVideoPlaying(stage) {
    return [...(stage?.querySelectorAll('video.v2-mobile-vec-media') || [])].some(video => {
      if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
      const style = getComputedStyle(video);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    });
  }

  function cleanupVideo() {
    const video = state.video;
    state.video = null;
    state.videoUrl = '';
    state.lastVideoTime = 0;
    state.lastVideoAdvanceAt = 0;
    if (!video) return;
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    video.remove();
  }

  function mark(status, reason = '') {
    if (!state.player) return;
    state.player.dataset.mainVecWatchdogState = status;
    state.player.dataset.mainVecWatchdogReason = reason;
    state.player.dataset.mainVecWatchdogSongKey = state.songKey;
    state.player.dataset.mainVecWatchdogClipCount = String(state.clips.length);
    state.player.dataset.mainVecWatchdogIntroSeconds = String(state.introSeconds);
  }

  function nextClip() {
    cleanupVideo();
    if (!state.clips.length) return;
    state.index = (state.index + 1) % state.clips.length;
    startFallback();
  }

  function startFallback() {
    if (!state.player || !state.audio || state.audio.paused || state.audio.ended || !state.clips.length) return;
    const stage = stageFor(state.player, true);
    if (!stage || nativeVideoPlaying(stage)) return;
    state.stage = stage;

    const clip = state.clips[state.index % state.clips.length];
    if (state.video && state.videoUrl === clip.url && state.video.isConnected) {
      state.video.play().catch(() => {});
      return;
    }

    cleanupVideo();
    const generation = state.generation;
    const video = document.createElement('video');
    state.video = video;
    state.videoUrl = clip.url;
    video.className = 'v2-main-watchdog-video';
    video.dataset.mainVecWatchdog = 'true';
    video.dataset.vecAssetSource = 'desktop-recovery';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;inset:0;z-index:4;width:100%;height:100%;object-fit:contain;object-position:center center;background:#050607;pointer-events:none;opacity:0;visibility:visible;';
    video.src = clip.url;

    const play = () => {
      if (generation !== state.generation || video !== state.video || !video.isConnected || state.audio?.paused || state.audio?.ended) return;
      video.play().catch(() => {});
    };

    video.addEventListener('playing', () => {
      if (generation !== state.generation || video !== state.video) return;
      video.style.setProperty('opacity', '1', 'important');
      state.lastVideoTime = Number(video.currentTime || 0);
      state.lastVideoAdvanceAt = performance.now();
      mark('recovery-video-playing', clip.url);
    });
    video.addEventListener('timeupdate', () => {
      const current = Number(video.currentTime || 0);
      if (current > state.lastVideoTime + 0.08) {
        state.lastVideoTime = current;
        state.lastVideoAdvanceAt = performance.now();
      }
    });
    video.addEventListener('ended', nextClip);
    video.addEventListener('error', nextClip, { once: true });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => video.addEventListener(eventName, play));

    stage.appendChild(video);
    try { video.load(); } catch (_) {}
    play();
    window.setTimeout(play, 120);
    window.setTimeout(play, 450);
    mark('starting-recovery-video', clip.url);
  }

  async function resolveCurrent(player, identity, signature) {
    if (state.resolving) return;
    state.resolving = true;
    const generation = ++state.generation;
    cleanupVideo();
    state.songKey = '';
    state.clips = [];
    state.index = 0;
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
      const result = await discover(song);
      if (generation !== state.generation || signature !== state.signature) return;
      state.introSeconds = result.introSeconds;
      state.clips = result.clips;
      if (result.artworkOnly) mark('artwork-only');
      else if (!state.clips.length) mark('zero-greenlit-videos');
      else mark('ready');
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
      cleanupVideo();
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
      if (state.video && !state.video.paused) state.video.pause();
      mark('waiting-for-audio');
      return;
    }

    const stage = stageFor(player, false);
    if (nativeVideoPlaying(stage)) {
      cleanupVideo();
      mark('native-video-playing');
      return;
    }

    if (!state.songKey || !state.clips.length) return;
    if (Number(audio.currentTime || 0) < state.introSeconds) {
      mark('artwork-intro');
      return;
    }

    if (!state.video || !state.video.isConnected) {
      startFallback();
      return;
    }

    if (state.video.paused && !state.video.ended) {
      state.video.play().catch(() => {});
    }

    if (!state.video.paused && state.lastVideoAdvanceAt && performance.now() - state.lastVideoAdvanceAt > STALL_MS) {
      nextClip();
    }
  }

  document.addEventListener('click', event => {
    const node = event.target.closest?.('#v2App [data-song]');
    const key = clean(node?.dataset?.song);
    if (!key) return;
    state.clickedSongKey = key;
    const player = activePlayer();
    if (player) player.dataset.songKey = key;
    state.signature = '';
  }, true);

  window.addEventListener('stashbox:vec-asset-change', event => {
    const key = clean(event?.detail?.songKey);
    if (key) {
      state.clickedSongKey = key;
      const player = activePlayer();
      if (player) player.dataset.songKey = key;
    }
  });
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) {
      state.signature = '';
      window.setTimeout(tick, 0);
    }
  }, true);
  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && state.video && !state.video.paused) state.video.pause();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.video && !state.video.paused) state.video.pause();
    } else {
      tick();
    }
  });
  window.addEventListener('resize', tick, { passive: true });
  window.addEventListener('online', () => {
    state.signature = '';
    tick();
  });

  state.timer = window.setInterval(tick, POLL_MS);
  tick();

  window.StashboxMainVecVideoWatchdog = Object.freeze({
    refresh: () => {
      state.signature = '';
      tick();
    },
    activeSongKey: () => state.songKey,
    clipCount: () => state.clips.length,
    rescueActive: () => Boolean(state.video && !state.video.paused),
    rescueUrl: () => state.videoUrl,
    state: () => ({
      songKey: state.songKey,
      clipCount: state.clips.length,
      introSeconds: state.introSeconds,
      status: state.player?.dataset?.mainVecWatchdogState || '',
      reason: state.player?.dataset?.mainVecWatchdogReason || ''
    }),
    stop: () => {
      window.clearInterval(state.timer);
      cleanupVideo();
    }
  });
})();