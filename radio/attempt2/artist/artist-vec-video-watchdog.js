(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/attempt2/artist/')) return;
  if (window.StashboxArtistVecVideoWatchdog) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const START_DELAY_MS = 5500;

  const catalogCache = { promise: null };
  const clipCache = new Map();
  let realm = null;
  let stage = null;
  let titleNode = null;
  let titleObserver = null;
  let realmObserver = null;
  let stageObserver = null;
  let installTimer = 0;
  let startTimer = 0;
  let run = 0;
  let rescueVideo = null;
  let activeSongKey = '';
  let clipIndex = 0;

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

  function songTitle(song) {
    return clean(song?.display_title || song?.song_name || song?.title || song?.song_key);
  }

  function songArtist(song) {
    return clean(song?.artist || song?.artist_name || 'Stashbox');
  }

  async function catalog() {
    if (!catalogCache.promise) {
      catalogCache.promise = getJson(SONGS_URL)
        .then(data => rows(data, ['songs', 'items', 'data']))
        .catch(error => {
          catalogCache.promise = null;
          throw error;
        });
    }
    return catalogCache.promise;
  }

  function currentIdentity() {
    return {
      title: clean(realm?.querySelector('[data-realm-title]')?.textContent),
      artist: clean(realm?.querySelector('[data-realm-artist]')?.textContent)
    };
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

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function folderId(folder) {
    return clean(folder?.folder_id || folder?.visual_folder_id || folder?.id);
  }

  async function clipsForSong(songKey) {
    const key = clean(songKey);
    if (!key) return [];
    if (clipCache.has(key)) return clipCache.get(key);

    const promise = Promise.all([
      getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({})),
      getJson(`${RECIPE_URL}?song_key=${encodeURIComponent(key)}`).catch(() => ({}))
    ]).then(async ([directBody, recipeBody]) => {
      const recipe = recipeFrom(recipeBody);
      const direct = rows(directBody).map(normalizeClip).filter(Boolean);
      const folders = (Array.isArray(recipe?.folders) ? recipe.folders : [])
        .filter(folder => folder?.enabled !== false && clean(folder?.status).toLowerCase() !== 'hidden');
      const folderGroups = await Promise.all(folders.map(async folder => {
        const id = folderId(folder);
        if (!id) return [];
        const body = await getJson(`${FOLDERS_URL}/${encodeURIComponent(id)}/assets`).catch(() => ({}));
        return rows(body).map(normalizeClip).filter(Boolean);
      }));

      const borrowedSource = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs]
        .find(candidate => Array.isArray(candidate) || Array.isArray(candidate?.sources) || Array.isArray(candidate?.songs));
      const borrowed = Array.isArray(borrowedSource) ? borrowedSource : (borrowedSource?.sources || borrowedSource?.songs || []);
      const borrowedGroups = await Promise.all(borrowed.filter(source => source?.enabled !== false).map(async source => {
        const borrowedKey = clean(source.song_key || source.source_song_key || source.key || source.id);
        if (!borrowedKey) return [];
        const body = await getJson(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(borrowedKey)}`).catch(() => ({}));
        return rows(body).map(normalizeClip).filter(Boolean);
      }));

      const seen = new Set();
      return [...direct, ...folderGroups.flat(), ...borrowedGroups.flat()].filter(clip => {
        const signature = clip.url.toLowerCase();
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
    }).catch(error => {
      clipCache.delete(key);
      console.warn('[Artist VEC video watchdog] Clip discovery failed.', error?.message || error);
      return [];
    });

    clipCache.set(key, promise);
    return promise;
  }

  function nativeVideoActive() {
    return [...(stage?.querySelectorAll('video.artist-realm-media') || [])].some(video => (
      video !== rescueVideo &&
      video.classList.contains('is-active') &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !video.paused
    ));
  }

  function stopRescue() {
    window.clearTimeout(startTimer);
    startTimer = 0;
    if (rescueVideo) {
      try { rescueVideo.pause(); } catch (_) {}
      rescueVideo.removeAttribute('src');
      try { rescueVideo.load(); } catch (_) {}
      rescueVideo.remove();
      rescueVideo = null;
    }
    clipIndex = 0;
  }

  function injectStyle() {
    if (document.getElementById('artistVecVideoWatchdogStyle')) return;
    const style = document.createElement('style');
    style.id = 'artistVecVideoWatchdogStyle';
    style.textContent = `
      .artist-realm-watchdog-video{
        position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;
        object-fit:contain;object-position:center center;background:transparent;
        opacity:0;transition:opacity .35s ease;pointer-events:none;
      }
      .artist-realm-watchdog-video.is-active{opacity:1}
    `;
    document.head.appendChild(style);
  }

  function playRescueClip(clips, token) {
    if (token !== run || !stage || !clips.length || nativeVideoActive()) {
      stopRescue();
      return;
    }

    const clip = clips[clipIndex % clips.length];
    clipIndex = (clipIndex + 1) % clips.length;

    stopRescue();
    injectStyle();
    const video = document.createElement('video');
    rescueVideo = video;
    video.className = 'artist-realm-watchdog-video';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.dataset.artistVecWatchdog = 'true';
    video.src = clip.url;
    video.addEventListener('playing', () => video.classList.add('is-active'), { once: true });
    video.addEventListener('ended', () => {
      if (token !== run) return;
      window.setTimeout(() => playRescueClip(clips, token), 150);
    }, { once: true });
    video.addEventListener('error', () => {
      if (token !== run) return;
      window.setTimeout(() => playRescueClip(clips, token), 250);
    }, { once: true });
    stage.appendChild(video);
    video.play().catch(() => {
      window.setTimeout(() => playRescueClip(clips, token), 500);
    });
    realm.dataset.artistVideoWatchdogState = 'rescue-playing';
  }

  async function armForCurrentSong() {
    const token = ++run;
    stopRescue();
    if (!realm || realm.hidden || !stage) return;

    const identity = currentIdentity();
    if (!identity.title || identity.title === 'Loading…') return;
    const songs = await catalog().catch(() => []);
    if (token !== run) return;
    const song = findSong(songs, identity);
    const songKey = clean(song?.song_key);
    if (!songKey) return;

    activeSongKey = songKey;
    const clips = await clipsForSong(songKey);
    if (token !== run || !realm || realm.hidden || activeSongKey !== songKey) return;

    realm.dataset.artistVideoClipCount = String(clips.length);
    if (!clips.length) {
      realm.dataset.artistVideoWatchdogState = 'no-clips';
      return;
    }

    realm.dataset.artistVideoWatchdogState = 'armed';
    startTimer = window.setTimeout(() => {
      if (token !== run || nativeVideoActive()) return;
      playRescueClip(clips, token);
    }, START_DELAY_MS);
  }

  function install() {
    const nextRealm = document.querySelector('.artist-realm-player');
    const nextStage = nextRealm?.querySelector('[data-realm-stage]');
    const nextTitle = nextRealm?.querySelector('[data-realm-title]');
    if (!nextRealm || !nextStage || !nextTitle) return false;

    realm = nextRealm;
    stage = nextStage;

    if (titleNode !== nextTitle) {
      titleObserver?.disconnect();
      titleNode = nextTitle;
      titleObserver = new MutationObserver(() => armForCurrentSong());
      titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
    }

    realmObserver?.disconnect();
    realmObserver = new MutationObserver(() => {
      if (realm.hidden) {
        run += 1;
        stopRescue();
      } else {
        armForCurrentSong();
      }
    });
    realmObserver.observe(realm, { attributes: true, attributeFilter: ['hidden'] });

    stageObserver?.disconnect();
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLVideoElement) || node === rescueVideo) return;
          node.addEventListener('playing', () => {
            if (nativeVideoActive()) {
              realm.dataset.artistVideoWatchdogState = 'native-video-playing';
              stopRescue();
            }
          }, { passive: true });
        });
      });
    });
    stageObserver.observe(stage, { childList: true });

    if (!realm.hidden) armForCurrentSong();
    return true;
  }

  installTimer = window.setInterval(() => {
    if (install()) window.clearInterval(installTimer);
  }, 60);
  install();

  window.StashboxArtistVecVideoWatchdog = Object.freeze({
    refresh: armForCurrentSong,
    stop: stopRescue,
    state: () => ({
      activeSongKey,
      clipIndex,
      rescuePlaying: Boolean(rescueVideo && !rescueVideo.paused),
      realmState: realm?.dataset?.artistVideoWatchdogState || ''
    })
  });
})();