(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopDirectVideoRescue20260815) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const RECIPE = `${API}/radio/vec/recipe`;
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const FOLDERS = `${API}/radio/visuals/folders`;
  const POLL_MS = 300;

  const state = {
    key: '',
    loadingKey: '',
    clips: [],
    index: 0,
    intro: 2,
    player: null,
    audio: null,
    video: null,
    failed: new Set(),
    generation: 0,
    timer: 0
  };

  const clean = v => String(v ?? '').trim();
  const lower = v => clean(v).toLowerCase();
  const array = v => Array.isArray(v) ? v : [];

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
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

  function allRows(value) {
    value = unwrap(value) || {};
    if (Array.isArray(value)) return value;
    const out = [];
    ['assets', 'clips', 'items', 'results'].forEach(key => {
      if (Array.isArray(value?.[key])) out.push(...value[key]);
    });
    if (value?.data && value.data !== value) out.push(...allRows(value.data));
    return out;
  }

  function recipeFrom(value) {
    value = unwrap(value) || {};
    return value.recipe || value.vec_recipe || value.data?.recipe || value.data || value;
  }

  function visible(node) {
    if (!node || node.hidden || !node.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function activePlayer() {
    const playingAudio = [...document.querySelectorAll('#v2App audio, audio[data-audio]')].find(audio => !audio.paused && !audio.ended);
    const fromAudio = playingAudio?.closest?.('[data-player]');
    if (fromAudio && visible(fromAudio)) return fromAudio;
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function audioFor(player) {
    const local = player?.querySelector('[data-audio]');
    if (local && !local.paused && !local.ended) return local;
    return [...document.querySelectorAll('#v2App audio, audio[data-audio]')].find(audio => !audio.paused && !audio.ended) || local || null;
  }

  function songKeyFor(player) {
    const query = clean(new URLSearchParams(location.search).get('song'));
    const dataset = clean(player?.dataset?.songKey || player?.dataset?.currentSongKey || player?.dataset?.song);
    return dataset || query;
  }

  function stageFor(player) {
    let stage = player?.querySelector('[data-mobile-vec-stage]');
    if (!stage && player) {
      stage = document.createElement('div');
      stage.className = 'v2-mobile-vec-stage';
      stage.dataset.mobileVecStage = 'true';
      player.prepend(stage);
    }
    if (stage && player) {
      player.classList.add('is-mobile-vec-active', 'is-vec-active', 'responsive-artwork-ready');
      stage.classList.add('responsive-artwork-surface-ready');
    }
    return stage || null;
  }

  function assetUrl(asset) {
    return clean(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url || asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
  }

  function assetId(asset) {
    return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key || assetUrl(asset));
  }

  function isVideo(asset) {
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.asset_kind || asset?.file_type || asset?.kind);
    return type === 'clip' || type === 'video' || type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }

  function activeAsset(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status) && asset?.hidden !== true && asset?.deleted !== true && asset?.active !== false;
  }

  function idSet(section, names) {
    return new Set(names.flatMap(name => array(section?.[name])).map(clean).filter(Boolean));
  }

  function selectedVideos(body, section = {}, source = 'song') {
    const selected = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const excluded = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    return allRows(body).filter(asset => {
      if (!asset || !activeAsset(asset) || !isVideo(asset)) return false;
      const id = assetId(asset);
      const url = assetUrl(asset);
      if (!url || excluded.has(id) || excluded.has(url)) return false;
      if (selected.size && !selected.has(id) && !selected.has(url)) return false;
      return true;
    }).map(asset => ({ id: assetId(asset), url: assetUrl(asset), source }));
  }

  function folderRecipes(recipe) {
    const groups = [recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders, recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders, recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders];
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
    return Number.isFinite(value) ? Math.max(0, Math.min(15, value)) : 2;
  }

  function uniqueShuffle(clips) {
    const seen = new Set();
    const out = clips.filter(clip => {
      const key = lower(clip.url);
      if (!key || seen.has(key) || state.failed.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function loadPool(key) {
    if (!key || state.loadingKey === key) return;
    state.loadingKey = key;
    const generation = ++state.generation;
    try {
      const [recipeResult, directResult] = await Promise.allSettled([
        getJson(`${RECIPE}?song_key=${encodeURIComponent(key)}`),
        getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(key)}`)
      ]);
      if (generation !== state.generation) return;
      const recipe = recipeFrom(recipeResult.status === 'fulfilled' ? recipeResult.value : {});
      if (lower(recipe?.visual_mode || recipe?.visualMode) === 'artwork_only') {
        state.key = key;
        state.clips = [];
        state.intro = 999999;
        if (state.player) state.player.dataset.desktopDirectRescue = 'artwork-only';
        return;
      }
      const clips = selectedVideos(directResult.status === 'fulfilled' ? directResult.value : {}, recipe?.song_assets || recipe?.songAssets || {}, 'song');
      const jobs = [];
      folderRecipes(recipe).forEach(folder => jobs.push((async () => {
        try {
          const body = await getJson(`${FOLDERS}/${encodeURIComponent(folder.__id)}/assets`);
          clips.push(...selectedVideos(body, folder, `folder:${folder.__id}`));
        } catch (_) {}
      })()));
      borrowedRecipes(recipe).forEach(source => jobs.push((async () => {
        try {
          const body = await getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(source.__key)}`);
          clips.push(...selectedVideos(body, source, `borrowed:${source.__key}`));
        } catch (_) {}
      })()));
      await Promise.allSettled(jobs);
      if (generation !== state.generation) return;
      state.key = key;
      state.intro = introSeconds(recipe);
      state.clips = uniqueShuffle(clips);
      state.index = 0;
      state.failed = new Set();
      if (state.player) {
        state.player.dataset.desktopDirectRescue = state.clips.length ? 'ready' : 'no-clips';
        state.player.dataset.desktopDirectRescueClipCount = String(state.clips.length);
        state.player.dataset.desktopDirectRescueSongKey = key;
      }
    } finally {
      if (generation === state.generation) state.loadingKey = '';
    }
  }

  function nativeVideoAdvancing(player) {
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    return [...(stage?.querySelectorAll('video:not([data-desktop-direct-rescue="true"])') || [])].some(video => {
      if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
      const style = getComputedStyle(video);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
    });
  }

  function removeVideo() {
    if (!state.video) return;
    try { state.video.pause(); } catch (_) {}
    state.video.removeAttribute('src');
    try { state.video.load(); } catch (_) {}
    state.video.remove();
    state.video = null;
  }

  function present(video, clip) {
    const player = state.player;
    const stage = stageFor(player);
    if (!player || !stage || video !== state.video) return;
    stage.querySelectorAll('video:not([data-desktop-direct-rescue="true"])').forEach(other => {
      try { other.pause(); } catch (_) {}
      other.style.setProperty('opacity', '0', 'important');
      other.style.setProperty('visibility', 'hidden', 'important');
    });
    player.classList.add('is-vec-active', 'is-mobile-vec-active', 'responsive-artwork-ready');
    stage.classList.add('responsive-artwork-surface-ready');
    stage.style.setProperty('opacity', '1', 'important');
    stage.style.setProperty('visibility', 'visible', 'important');
    stage.style.setProperty('z-index', '2', 'important');
    stage.style.setProperty('background-image', 'none', 'important');
    video.style.setProperty('display', 'block', 'important');
    video.style.setProperty('visibility', 'visible', 'important');
    video.style.setProperty('opacity', '1', 'important');
    video.style.setProperty('z-index', '50', 'important');
    const backdrop = player.querySelector('[data-backdrop]');
    if (backdrop) backdrop.style.setProperty('opacity', '0', 'important');
    player.dataset.desktopDirectRescue = 'playing';
    player.dataset.desktopDirectRescueUrl = clip.url;
  }

  function startClip() {
    if (!state.player || !state.audio || state.audio.paused || state.audio.ended || !state.clips.length) return;
    removeVideo();
    const stage = stageFor(state.player);
    if (!stage) return;
    const clip = state.clips[state.index % state.clips.length];
    if (!clip) return;
    const video = document.createElement('video');
    video.dataset.desktopDirectRescue = 'true';
    video.className = 'v2-desktop-direct-rescue-video';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;z-index:50;';
    video.src = clip.url;
    state.video = video;
    stage.appendChild(video);

    const play = () => {
      if (video !== state.video || state.audio?.paused || state.audio?.ended) return;
      video.play().catch(() => {});
    };
    video.addEventListener('playing', () => present(video, clip), { once: true });
    video.addEventListener('ended', () => {
      if (video !== state.video || !state.clips.length) return;
      state.index = (state.index + 1) % state.clips.length;
      startClip();
    });
    video.addEventListener('error', () => {
      if (video !== state.video) return;
      state.failed.add(lower(clip.url));
      state.clips = state.clips.filter(item => lower(item.url) !== lower(clip.url));
      state.index = 0;
      if (state.clips.length) startClip();
    }, { once: true });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(name => video.addEventListener(name, play, { once: true }));
    try { video.load(); } catch (_) {}
    play();
    setTimeout(play, 80);
    setTimeout(play, 250);
    setTimeout(play, 700);
  }

  async function tick() {
    const player = activePlayer();
    const audio = audioFor(player);
    if (!player || !audio) return;
    state.player = player;
    state.audio = audio;
    const key = songKeyFor(player);
    if (!key) return;

    if (key !== state.key && key !== state.loadingKey) {
      removeVideo();
      state.clips = [];
      state.failed = new Set();
      await loadPool(key).catch(error => {
        player.dataset.desktopDirectRescue = 'error';
        player.dataset.desktopDirectRescueReason = error?.message || 'unknown';
      });
      return;
    }

    if (audio.paused || audio.ended) {
      if (state.video && !state.video.paused) state.video.pause();
      return;
    }

    if (nativeVideoAdvancing(player)) {
      removeVideo();
      player.dataset.desktopDirectRescue = 'native-video-ok';
      return;
    }

    if (!state.clips.length || Number(audio.currentTime || 0) < state.intro) return;

    if (!state.video || !state.video.isConnected) {
      startClip();
      return;
    }
    if (state.video.paused && !state.video.ended) state.video.play().catch(() => {});
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) setTimeout(() => tick().catch(() => {}), 0);
  }, true);
  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && state.video && !state.video.paused) state.video.pause();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.video && !state.video.paused) state.video.pause();
    } else tick().catch(() => {});
  });

  state.timer = setInterval(() => tick().catch(() => {}), POLL_MS);
  tick().catch(() => {});

  window.StashboxDesktopDirectVideoRescue20260815 = Object.freeze({
    state: () => ({ key: state.key, clipCount: state.clips.length, intro: state.intro, playing: Boolean(state.video && !state.video.paused), url: state.video?.currentSrc || state.video?.src || '' }),
    refresh: () => { state.key = ''; state.loadingKey = ''; state.clips = []; removeVideo(); tick().catch(() => {}); },
    stop: () => { clearInterval(state.timer); removeVideo(); }
  });
})();