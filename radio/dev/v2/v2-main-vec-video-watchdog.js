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
  const START_DELAY_MS = 5500;

  let songsPromise = null;
  const clipCache = new Map();
  let player = null;
  let stage = null;
  let titleNode = null;
  let titleObserver = null;
  let stageObserver = null;
  let installTimer = 0;
  let startTimer = 0;
  let nativePoll = 0;
  let run = 0;
  let rescueVideo = null;
  let activeClips = [];
  let clipIndex = 0;
  let activeSongKey = '';

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  function rows(data, keys = ['assets', 'items', 'data']) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }
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

  function activePlayer() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => (
      !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden'
    )) || null;
  }

  function currentIdentity() {
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

  async function catalog() {
    if (!songsPromise) {
      songsPromise = getJson(SONGS_URL)
        .then(data => rows(data, ['songs', 'items', 'data']))
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

  function assetType(asset) {
    const value = clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type).toLowerCase();
    return value === 'clip' || value === 'video' || value.startsWith('video/') ? 'clip' : 'image';
  }

  function normalizeClip(asset) {
    if (!asset || typeof asset !== 'object' || assetType(asset) !== 'clip') return null;
    const status = clean(asset.status).toLowerCase();
    if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || asset.hidden === true || asset.deleted === true) return null;
    const url = fixUrl(asset.public_url || asset.url || asset.asset_url || asset.src || asset.file_url || asset.s3_url);
    if (!url) return null;
    return {
      id: clean(asset.id || asset.asset_id || asset.key || url),
      url,
      durationSeconds: Math.max(1, Number(asset.duration_seconds || asset.durationSeconds || 0) || 0)
    };
  }

  function idSet(values) {
    return new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean));
  }

  function includeByRecipe(clips, part = {}) {
    const active = idSet(part.active_clip_ids || part.activeClipIds);
    const excluded = idSet(part.excluded_clip_ids || part.excludedClipIds);
    return clips.filter(clip => {
      if (excluded.has(clip.id) || excluded.has(clip.url)) return false;
      return !active.size || active.has(clip.id) || active.has(clip.url);
    });
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function folderId(folder) {
    return clean(folder?.folder_id || folder?.visual_folder_id || folder?.id);
  }

  async function clipsForSong(songKey) {
    const key = clean(songKey);
    if (!key) return { artworkOnly: false, clips: [] };
    if (clipCache.has(key)) return clipCache.get(key);

    const promise = Promise.all([
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({})),
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({}))
    ]).then(async ([directBody, recipeBody]) => {
      const recipe = recipeFrom(recipeBody);
      const visualMode = clean(recipe?.visual_mode || recipe?.visualMode).toLowerCase();
      if (visualMode === 'artwork_only') return { artworkOnly: true, clips: [] };

      const direct = includeByRecipe(
        rows(directBody).map(normalizeClip).filter(Boolean),
        recipe?.song_assets || recipe?.songAssets || {}
      );

      const folders = (Array.isArray(recipe?.folders) ? recipe.folders : [])
        .filter(folder => folder?.enabled !== false && clean(folder?.status).toLowerCase() !== 'hidden');
      const folderGroups = await Promise.all(folders.map(async folder => {
        const id = folderId(folder);
        if (!id) return [];
        const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(id)}/assets`).catch(() => ({}));
        return includeByRecipe(rows(body).map(normalizeClip).filter(Boolean), folder);
      }));

      const borrowedSource = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs]
        .find(candidate => Array.isArray(candidate) || Array.isArray(candidate?.sources) || Array.isArray(candidate?.songs));
      const borrowed = Array.isArray(borrowedSource) ? borrowedSource : (borrowedSource?.sources || borrowedSource?.songs || []);
      const borrowedGroups = await Promise.all(borrowed.filter(source => source?.enabled !== false).map(async source => {
        const borrowedKey = clean(source.song_key || source.source_song_key || source.key || source.id);
        if (!borrowedKey) return [];
        const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(borrowedKey)}`).catch(() => ({}));
        return includeByRecipe(rows(body).map(normalizeClip).filter(Boolean), source);
      }));

      const seen = new Set();
      const clips = [...direct, ...folderGroups.flat(), ...borrowedGroups.flat()].filter(clip => {
        const signature = clip.url.toLowerCase();
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
      return { artworkOnly: false, clips };
    }).catch(error => {
      clipCache.delete(key);
      console.warn('[Main VEC watchdog] Clip discovery failed.', error?.message || error);
      return { artworkOnly: false, clips: [] };
    });

    clipCache.set(key, promise);
    return promise;
  }

  function audioElement() {
    return player?.querySelector('[data-audio]') || null;
  }

  function audioPlaying() {
    const audio = audioElement();
    return Boolean(audio && !audio.paused && !audio.ended);
  }

  function nativeVideoActive() {
    return [...(stage?.querySelectorAll('video.v2-mobile-vec-media') || [])].some(video => (
      video !== rescueVideo &&
      video.classList.contains('is-active') &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !video.paused
    ));
  }

  function removeRescue({ resetIndex = false } = {}) {
    window.clearTimeout(startTimer);
    startTimer = 0;
    window.clearInterval(nativePoll);
    nativePoll = 0;
    if (rescueVideo) {
      try { rescueVideo.pause(); } catch (_) {}
      rescueVideo.removeAttribute('src');
      try { rescueVideo.load(); } catch (_) {}
      rescueVideo.remove();
      rescueVideo = null;
    }
    if (resetIndex) clipIndex = 0;
  }

  function injectStyle() {
    if (document.getElementById('mainVecVideoWatchdogStyle')) return;
    const style = document.createElement('style');
    style.id = 'mainVecVideoWatchdogStyle';
    style.textContent = `
      .v2-main-watchdog-video{
        position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;
        object-fit:contain;object-position:center center;background:transparent;
        opacity:0;transition:opacity .3s ease;pointer-events:none;
      }
      .v2-main-watchdog-video.is-active{opacity:1}
    `;
    document.head.appendChild(style);
  }

  function playRescueClip(token) {
    if (token !== run || !stage || !activeClips.length) return;
    if (nativeVideoActive()) {
      removeRescue();
      return;
    }
    if (!audioPlaying()) return;

    const clip = activeClips[clipIndex % activeClips.length];
    clipIndex = (clipIndex + 1) % activeClips.length;
    removeRescue();
    injectStyle();

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
    video.src = clip.url;

    video.addEventListener('playing', () => {
      if (token !== run) return;
      video.classList.add('is-active');
      player.dataset.mainVecWatchdogState = 'rescue-playing';
    }, { once: true });
    video.addEventListener('ended', () => {
      if (token !== run) return;
      window.setTimeout(() => playRescueClip(token), 120);
    }, { once: true });
    video.addEventListener('error', () => {
      if (token !== run) return;
      window.setTimeout(() => playRescueClip(token), 240);
    }, { once: true });

    stage.appendChild(video);
    video.play().catch(() => {
      if (token !== run) return;
      window.setTimeout(() => playRescueClip(token), 500);
    });

    nativePoll = window.setInterval(() => {
      if (token !== run || nativeVideoActive()) removeRescue();
    }, 350);
  }

  function scheduleRescue(token, delay = START_DELAY_MS) {
    window.clearTimeout(startTimer);
    startTimer = window.setTimeout(() => {
      if (token !== run || nativeVideoActive() || !activeClips.length) return;
      if (audioPlaying()) playRescueClip(token);
      else player.dataset.mainVecWatchdogState = 'waiting-for-audio';
    }, delay);
  }

  async function armForCurrentSong() {
    const token = ++run;
    removeRescue({ resetIndex: true });
    activeClips = [];
    activeSongKey = '';
    if (!player || player.hidden || !stage) return;

    const identity = currentIdentity();
    if (!identity.title) return;
    const songs = await catalog().catch(() => []);
    if (token !== run) return;
    const song = findSong(songs, identity);
    const key = clean(song?.song_key);
    if (!key) return;

    activeSongKey = key;
    const result = await clipsForSong(key);
    if (token !== run || result.artworkOnly || !result.clips.length) return;
    activeClips = result.clips;
    scheduleRescue(token);
  }

  function bindAudio() {
    const audio = audioElement();
    if (!audio || audio.dataset.mainVecWatchdogBound === 'true') return;
    audio.dataset.mainVecWatchdogBound = 'true';
    audio.addEventListener('pause', () => {
      if (rescueVideo && !rescueVideo.paused) rescueVideo.pause();
    }, { passive: true });
    audio.addEventListener('play', () => {
      if (rescueVideo) rescueVideo.play().catch(() => {});
      else if (activeClips.length && !nativeVideoActive()) scheduleRescue(run, 350);
    }, { passive: true });
    audio.addEventListener('ended', () => removeRescue(), { passive: true });
  }

  function observeStage() {
    if (!stage) return;
    stageObserver?.disconnect();
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLVideoElement) || !node.matches('video.v2-mobile-vec-media')) return;
          ['playing', 'loadeddata', 'canplay'].forEach(eventName => {
            node.addEventListener(eventName, () => {
              if (nativeVideoActive()) removeRescue();
            }, { passive: true });
          });
        });
      });
    });
    stageObserver.observe(stage, { childList: true });
  }

  function install() {
    const nextPlayer = activePlayer();
    const nextStage = nextPlayer?.querySelector('[data-mobile-vec-stage]') || null;
    const nextTitle = nextPlayer?.querySelector('[data-ptitle]') || null;
    if (!nextPlayer || !nextStage || !nextTitle) return false;

    player = nextPlayer;
    stage = nextStage;
    bindAudio();
    observeStage();

    if (titleNode !== nextTitle) {
      titleObserver?.disconnect();
      titleNode = nextTitle;
      titleObserver = new MutationObserver(() => armForCurrentSong());
      titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
    }
    return true;
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const key = clean(detail.songKey);
    const type = clean(detail.asset?.type || detail.asset?.asset_type || detail.asset?.media_type).toLowerCase();
    install();
    if (key && key !== activeSongKey) armForCurrentSong();
    if (type === 'clip' || type === 'video') {
      window.setTimeout(() => {
        if (nativeVideoActive()) removeRescue();
      }, 250);
    }
  });

  installTimer = window.setInterval(() => {
    if (install()) {
      window.clearInterval(installTimer);
      armForCurrentSong();
    }
  }, 80);

  window.StashboxMainVecVideoWatchdog = Object.freeze({
    refresh: armForCurrentSong,
    activeSongKey: () => activeSongKey,
    rescueActive: () => Boolean(rescueVideo)
  });
})();