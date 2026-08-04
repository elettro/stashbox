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
  const INTRO_SECONDS = 4.25;
  const POLL_MS = 350;
  const DESKTOP_MIN_WIDTH = 900;

  let songsPromise = null;
  const clipCache = new Map();
  const failedClipUrls = new Set();
  let pollTimer = 0;
  let run = 0;
  let activeSongKey = '';
  let activeClips = [];
  let clipIndex = 0;
  let rescueVideo = null;
  let rescueUrl = '';
  let lastDiscoveryAt = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
    try { return JSON.parse(trimmed); } catch (_) { return value; }
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

  function activePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function activeStage(player = activePlayer()) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function desktopSurface(player = activePlayer()) {
    const surface = activeStage(player) || player;
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    return width >= DESKTOP_MIN_WIDTH;
  }

  function currentIdentity(player = activePlayer()) {
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent)
    };
  }

  function songTitle(song) {
    return clean(song?.display_title || song?.song_name || song?.title || song?.song_key);
  }

  function songArtist(song) {
    return clean(song?.artist || song?.artist_name || 'Stashbox');
  }

  function songKey(song) {
    return clean(song?.song_key || song?.songKey || song?.id);
  }

  async function catalog() {
    if (!songsPromise) {
      songsPromise = getJson(SONGS_URL)
        .then(data => {
          data = unwrap(data);
          if (Array.isArray(data)) return data;
          for (const key of ['songs', 'items', 'data']) {
            if (Array.isArray(data?.[key])) return data[key];
          }
          return [];
        })
        .catch(error => {
          songsPromise = null;
          throw error;
        });
    }
    return songsPromise;
  }

  function findSong(songs, identity) {
    const title = normalize(identity?.title);
    const artist = normalize(identity?.artist);
    return songs.find(song => normalize(songTitle(song)) === title && (!artist || normalize(songArtist(song)) === artist))
      || songs.find(song => normalize(songTitle(song)) === title)
      || null;
  }

  function typeLooksLikeClip(asset, url = '') {
    const value = clean(
      asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type
    ).toLowerCase();
    if (value === 'clip' || value === 'video' || value.startsWith('video/')) return true;
    return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url);
  }

  function normalizeClip(asset) {
    if (!asset || typeof asset !== 'object') return null;
    const status = clean(asset.status).toLowerCase();
    if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || asset.hidden === true || asset.deleted === true) return null;
    const url = fixUrl(asset.public_url || asset.url || asset.asset_url || asset.src || asset.file_url || asset.s3_url || asset.video_url);
    if (!url || !typeLooksLikeClip(asset, url) || failedClipUrls.has(url)) return null;
    return {
      id: clean(asset.id || asset.asset_id || asset.s3_key || asset.key || url),
      url,
      durationSeconds: Math.max(1, Number(asset.duration_seconds || asset.durationSeconds || asset.duration || 0) || 0)
    };
  }

  function collectClips(value, output = [], seen = new WeakSet(), depth = 0) {
    value = parseMaybeJson(unwrap(value));
    if (depth > 8 || value == null) return output;
    if (Array.isArray(value)) {
      value.forEach(item => collectClips(item, output, seen, depth + 1));
      return output;
    }
    if (typeof value !== 'object') return output;
    if (seen.has(value)) return output;
    seen.add(value);

    const clip = normalizeClip(value);
    if (clip) output.push(clip);

    Object.values(value).forEach(child => {
      if (child && (typeof child === 'object' || typeof child === 'string')) {
        collectClips(child, output, seen, depth + 1);
      }
    });
    return output;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function visualMode(recipe) {
    return clean(recipe?.visual_mode || recipe?.visualMode).toLowerCase();
  }

  function folderIds(recipe) {
    const ids = new Set();
    const folders = Array.isArray(recipe?.folders) ? recipe.folders : [];
    folders.forEach(folder => {
      if (folder?.enabled === false || clean(folder?.status).toLowerCase() === 'hidden') return;
      const id = clean(folder?.folder_id || folder?.visual_folder_id || folder?.id);
      if (id) ids.add(id);
    });
    return [...ids];
  }

  function borrowedSongKeys(recipe) {
    const source = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs]
      .find(candidate => Array.isArray(candidate) || Array.isArray(candidate?.sources) || Array.isArray(candidate?.songs));
    const rows = Array.isArray(source) ? source : (source?.sources || source?.songs || []);
    return [...new Set(rows
      .filter(row => row?.enabled !== false)
      .map(row => clean(row.song_key || row.source_song_key || row.key || row.id))
      .filter(Boolean))];
  }

  function uniqueClips(clips) {
    const seen = new Set();
    return clips.filter(clip => {
      const signature = clip.url.toLowerCase();
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  async function discoverClips(song) {
    const key = songKey(song);
    if (!key) return { artworkOnly: false, clips: [] };
    if (clipCache.has(key)) return clipCache.get(key);

    const promise = Promise.all([
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({})),
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({}))
    ]).then(async ([assetBody, recipeBody]) => {
      const recipe = recipeFrom(recipeBody);
      if (visualMode(recipe) === 'artwork_only') return { artworkOnly: true, clips: [] };

      const clips = [
        ...collectClips(assetBody),
        ...collectClips(recipe),
        ...collectClips(song?.visual_assets),
        ...collectClips(song?.raw?.visual_assets)
      ];

      const folderBodies = await Promise.all(folderIds(recipe).map(id => (
        getJson(`${FOLDERS_URL}/${encodeURIComponent(id)}/assets`).catch(() => ({}))
      )));
      folderBodies.forEach(body => clips.push(...collectClips(body)));

      const borrowedBodies = await Promise.all(borrowedSongKeys(recipe).map(borrowedKey => (
        getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(borrowedKey)}`).catch(() => ({}))
      )));
      borrowedBodies.forEach(body => clips.push(...collectClips(body)));

      return { artworkOnly: false, clips: uniqueClips(clips) };
    }).catch(error => {
      clipCache.delete(key);
      console.warn('[Main VEC watchdog] Clip discovery failed.', error?.message || error);
      return { artworkOnly: false, clips: [] };
    });

    clipCache.set(key, promise);
    return promise;
  }

  function allAudio() {
    return [...document.querySelectorAll('#v2App audio, audio[data-audio]')];
  }

  function playingAudio(player = activePlayer()) {
    const local = player?.querySelector('[data-audio]');
    if (local && !local.paused && !local.ended) return local;
    return allAudio().find(audio => !audio.paused && !audio.ended) || local || allAudio()[0] || null;
  }

  function nativeVideoActive(stage = activeStage()) {
    return [...(stage?.querySelectorAll('video.v2-mobile-vec-media') || [])].some(video => {
      if (video === rescueVideo || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
      const style = getComputedStyle(video);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 0) > 0.05;
    });
  }

  function removeRescue({ resetIndex = false } = {}) {
    if (rescueVideo) {
      try { rescueVideo.pause(); } catch (_) {}
      rescueVideo.removeAttribute('src');
      try { rescueVideo.load(); } catch (_) {}
      rescueVideo.remove();
      rescueVideo = null;
      rescueUrl = '';
    }
    if (resetIndex) clipIndex = 0;
  }

  function markState(player, state, extra = {}) {
    if (!player) return;
    player.dataset.mainVecWatchdogState = state;
    player.dataset.mainVecWatchdogSongKey = activeSongKey;
    player.dataset.mainVecWatchdogClipCount = String(activeClips.length);
    Object.entries(extra).forEach(([key, value]) => {
      player.dataset[key] = String(value ?? '');
    });
  }

  function playNextRescue(player, stage, audio, token) {
    if (token !== run || !player || !stage || !audio || !activeClips.length || nativeVideoActive(stage)) return;
    if (audio.paused || audio.ended) {
      markState(player, 'waiting-for-audio');
      return;
    }

    removeRescue();
    const clip = activeClips[clipIndex % activeClips.length];
    clipIndex = (clipIndex + 1) % activeClips.length;
    rescueUrl = clip.url;

    const video = document.createElement('video');
    rescueVideo = video;
    video.className = 'v2-main-watchdog-video';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.dataset.mainVecWatchdog = 'true';
    video.dataset.vecAssetSource = 'desktop-watchdog';
    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.zIndex = '2';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.objectPosition = 'center center';
    video.style.background = '#050607';
    video.style.pointerEvents = 'none';
    video.style.setProperty('opacity', '0', 'important');
    video.src = clip.url;

    const attemptPlay = () => {
      if (token !== run || video !== rescueVideo || !video.isConnected || audio.paused || audio.ended) return;
      const result = video.play();
      if (result?.catch) result.catch(() => {});
    };

    video.addEventListener('playing', () => {
      if (token !== run || video !== rescueVideo) return;
      video.style.setProperty('opacity', '1', 'important');
      video.style.setProperty('visibility', 'visible', 'important');
      markState(player, 'rescue-playing', { mainVecWatchdogUrl: clip.url });
    });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(eventName => {
      video.addEventListener(eventName, attemptPlay, { passive: true });
    });
    video.addEventListener('ended', () => {
      if (token !== run || video !== rescueVideo) return;
      playNextRescue(player, stage, audio, token);
    });
    video.addEventListener('error', () => {
      if (token !== run || video !== rescueVideo) return;
      failedClipUrls.add(clip.url);
      activeClips = activeClips.filter(item => item.url !== clip.url);
      markState(player, 'clip-error', { mainVecWatchdogUrl: clip.url });
      if (activeClips.length) window.setTimeout(() => playNextRescue(player, stage, audio, token), 150);
      else removeRescue();
    });

    stage.appendChild(video);
    try { video.load(); } catch (_) {}
    attemptPlay();
    window.setTimeout(attemptPlay, 150);
    window.setTimeout(attemptPlay, 500);
    markState(player, 'starting-rescue', { mainVecWatchdogUrl: clip.url });
  }

  async function refreshSong(player, stage, identity) {
    const token = ++run;
    removeRescue({ resetIndex: true });
    activeClips = [];
    activeSongKey = '';

    const songs = await catalog().catch(() => []);
    if (token !== run) return;
    const song = findSong(songs, identity);
    const key = songKey(song);
    if (!key) {
      markState(player, 'song-not-found');
      return;
    }

    activeSongKey = key;
    markState(player, 'discovering');
    const result = await discoverClips(song);
    if (token !== run) return;
    lastDiscoveryAt = Date.now();

    if (result.artworkOnly) {
      markState(player, 'artwork-only');
      return;
    }

    activeClips = result.clips;
    markState(player, activeClips.length ? 'ready' : 'no-clips');
  }

  async function tick() {
    const player = activePlayer();
    const stage = activeStage(player);
    if (!player || !stage || !desktopSurface(player)) {
      removeRescue({ resetIndex: true });
      return;
    }

    const identity = currentIdentity(player);
    if (!identity.title) return;
    const signature = `${normalize(identity.artist)}|${normalize(identity.title)}`;
    if (player.dataset.mainVecWatchdogIdentity !== signature) {
      player.dataset.mainVecWatchdogIdentity = signature;
      await refreshSong(player, stage, identity);
      return;
    }

    if (!activeSongKey) return;
    if (!activeClips.length) {
      if (Date.now() - lastDiscoveryAt > 5000) {
        clipCache.delete(activeSongKey);
        await refreshSong(player, stage, identity);
      }
      return;
    }

    const audio = playingAudio(player);
    if (!audio || audio.paused || audio.ended) {
      if (rescueVideo && !rescueVideo.paused) rescueVideo.pause();
      markState(player, 'waiting-for-audio');
      return;
    }

    if (nativeVideoActive(stage)) {
      removeRescue();
      markState(player, 'native-video-playing');
      return;
    }

    if (Number(audio.currentTime || 0) < INTRO_SECONDS) {
      markState(player, 'artwork-intro');
      return;
    }

    if (!rescueVideo || !rescueVideo.isConnected) {
      playNextRescue(player, stage, audio, run);
      return;
    }

    if (rescueVideo.paused && !rescueVideo.ended) {
      rescueVideo.play().catch(() => {});
    }
  }

  pollTimer = window.setInterval(() => tick().catch(error => {
    console.warn('[Main VEC watchdog] Tick failed.', error?.message || error);
  }), POLL_MS);

  ['stashbox:vec-asset-change', 'stashbox:v2-session-changed', 'stashbox:v2-auth-changed'].forEach(eventName => {
    window.addEventListener(eventName, () => tick().catch(() => {}));
  });
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) tick().catch(() => {});
  }, true);
  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && rescueVideo && !rescueVideo.paused) rescueVideo.pause();
  }, true);
  window.addEventListener('resize', () => tick().catch(() => {}), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rescueVideo && !rescueVideo.paused) rescueVideo.pause();
    } else {
      tick().catch(() => {});
    }
  });

  tick().catch(() => {});

  window.StashboxMainVecVideoWatchdog = Object.freeze({
    refresh: () => {
      const player = activePlayer();
      if (player) delete player.dataset.mainVecWatchdogIdentity;
      return tick();
    },
    activeSongKey: () => activeSongKey,
    clipCount: () => activeClips.length,
    rescueActive: () => Boolean(rescueVideo),
    rescueUrl: () => rescueUrl,
    stop: () => {
      window.clearInterval(pollTimer);
      removeRescue({ resetIndex: true });
    }
  });
})();