(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVecVideoRecovery20260815) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS = `${API}/radio/songs`;
  const RECIPE = `${API}/radio/vec/recipe`;
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const FOLDERS = `${API}/radio/visuals/folders`;
  const POLL_MS = 350;
  const DEFAULT_INTRO = 2;

  const state = {
    songKey: '',
    clips: [],
    index: 0,
    video: null,
    audio: null,
    player: null,
    loading: false,
    intro: DEFAULT_INTRO,
    failed: new Set(),
    catalog: null,
    generation: 0
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const arr = value => Array.isArray(value) ? value : [];

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

  function visible(node) {
    if (!node || node.hidden || !node.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function player() {
    const playingAudio = [...document.querySelectorAll('#v2App audio, audio[data-audio]')]
      .find(audio => !audio.paused && !audio.ended);
    const fromAudio = playingAudio?.closest?.('[data-player]');
    if (fromAudio && visible(fromAudio)) return fromAudio;
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function audioFor(p) {
    const local = p?.querySelector('[data-audio]');
    if (local && !local.paused && !local.ended) return local;
    return [...document.querySelectorAll('#v2App audio, audio[data-audio]')]
      .find(audio => !audio.paused && !audio.ended) || local || null;
  }

  function stageFor(p) {
    let stage = p?.querySelector('[data-mobile-vec-stage]');
    if (!stage && p) {
      stage = document.createElement('div');
      stage.className = 'v2-mobile-vec-stage';
      stage.dataset.mobileVecStage = 'true';
      p.prepend(stage);
      p.classList.add('is-mobile-vec-active', 'is-vec-active');
    }
    return stage || null;
  }

  function nativeVideoPlaying(p) {
    return [...(p?.querySelectorAll('[data-mobile-vec-stage] video:not([data-desktop-vec-emergency])') || [])]
      .some(video => {
        if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
        const style = getComputedStyle(video);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
      });
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
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.kind);
    return type === 'clip' || type === 'video' || type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }

  function active(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status) && asset?.hidden !== true && asset?.deleted !== true && asset?.active !== false;
  }

  function idSet(section, names) {
    return new Set(names.flatMap(name => arr(section?.[name])).map(clean).filter(Boolean));
  }

  function selectVideos(body, section = {}, source = 'song') {
    const activeClips = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const excludedClips = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    const restrictClips = activeClips.size > 0;
    const seen = new Set();
    return rows(body, ['assets', 'items', 'results', 'data', 'clips'])
      .filter(asset => asset && active(asset) && isVideo(asset) && assetUrl(asset))
      .filter(asset => {
        const id = assetId(asset);
        const url = assetUrl(asset);
        if (excludedClips.has(id) || excludedClips.has(url)) return false;
        if (restrictClips && !activeClips.has(id) && !activeClips.has(url)) return false;
        const key = url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(asset => ({ id: assetId(asset), url: assetUrl(asset), source }));
  }

  function folderRecipes(recipe) {
    const groups = [recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders, recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders, recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders];
    const seen = new Set();
    const out = [];
    groups.forEach(group => {
      const list = Array.isArray(group) ? group : arr(group?.items);
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
      const list = Array.isArray(group) ? group : [...arr(group?.sources), ...arr(group?.songs)];
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

  function uniqueShuffle(clips) {
    const seen = new Set();
    const list = clips.filter(clip => {
      const key = lower(clip.url);
      if (!key || seen.has(key) || state.failed.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  async function catalog() {
    if (!state.catalog) state.catalog = getJson(SONGS).then(body => rows(body, ['songs', 'items', 'data']));
    return state.catalog;
  }

  function songKey(song) {
    return clean(song?.song_key || song?.songKey || song?.key || song?.id);
  }

  async function identifySong(p, audio) {
    const songs = await catalog();
    const hinted = clean(p?.dataset?.songKey || p?.dataset?.currentSongKey || p?.dataset?.song);
    if (hinted) {
      const exact = songs.find(song => songKey(song) === hinted);
      if (exact) return exact;
    }
    const title = lower(p?.querySelector('[data-ptitle]')?.textContent);
    const artist = lower(p?.querySelector('[data-partist]')?.textContent);
    const byTitle = songs.find(song => lower(song?.display_title || song?.song_name || song?.title) === title && (!artist || lower(song?.artist || song?.artist_name) === artist));
    if (byTitle) return byTitle;
    const src = clean(audio?.currentSrc || audio?.src);
    if (src) return songs.find(song => clean(song?.audio_url || song?.audioUrl) === src) || null;
    return null;
  }

  function introSeconds(recipe) {
    const artwork = recipe?.artwork || recipe?.artwork_rules || {};
    if (artwork.start_with_artwork === false || artwork.startWithArtwork === false) return 0;
    const value = Number(artwork.start_duration_seconds ?? artwork.startDurationSeconds ?? DEFAULT_INTRO);
    return Number.isFinite(value) ? Math.max(0, Math.min(15, value)) : DEFAULT_INTRO;
  }

  async function loadClips(song, generation) {
    const key = songKey(song);
    const [recipeResult, directResult] = await Promise.allSettled([
      getJson(`${RECIPE}?song_key=${encodeURIComponent(key)}`),
      getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(key)}`)
    ]);
    if (generation !== state.generation) return;
    const recipe = recipeFrom(recipeResult.status === 'fulfilled' ? recipeResult.value : {});
    if (lower(recipe?.visual_mode || recipe?.visualMode) === 'artwork_only') {
      state.clips = [];
      return;
    }
    state.intro = introSeconds(recipe);
    const clips = selectVideos(directResult.status === 'fulfilled' ? directResult.value : {}, recipe?.song_assets || recipe?.songAssets || {}, 'song');
    const jobs = [];
    folderRecipes(recipe).forEach(folder => jobs.push((async () => {
      try {
        const body = await getJson(`${FOLDERS}/${encodeURIComponent(folder.__id)}/assets`);
        clips.push(...selectVideos(body, folder, `folder:${folder.__id}`));
      } catch (_) {}
    })()));
    borrowedRecipes(recipe).forEach(source => jobs.push((async () => {
      try {
        const body = await getJson(`${SONG_ASSETS}?song_key=${encodeURIComponent(source.__key)}`);
        clips.push(...selectVideos(body, source, `borrowed:${source.__key}`));
      } catch (_) {}
    })()));
    await Promise.allSettled(jobs);
    if (generation !== state.generation) return;
    state.clips = uniqueShuffle(clips);
    state.index = 0;
  }

  function removeRecoveryVideo() {
    if (!state.video) return;
    try { state.video.pause(); } catch (_) {}
    state.video.removeAttribute('src');
    try { state.video.load(); } catch (_) {}
    state.video.remove();
    state.video = null;
  }

  function startClip() {
    if (!state.player || !state.audio || state.audio.paused || state.audio.ended || !state.clips.length) return;
    removeRecoveryVideo();
    const stage = stageFor(state.player);
    if (!stage) return;
    const clip = state.clips[state.index % state.clips.length];
    if (!clip) return;
    const video = document.createElement('video');
    video.dataset.desktopVecEmergency = 'true';
    video.className = 'v2-desktop-vec-emergency-video';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;inset:0;z-index:40;width:100%;height:100%;object-fit:contain;object-position:center center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;';
    video.src = clip.url;
    state.video = video;
    stage.appendChild(video);

    const show = () => {
      if (video !== state.video) return;
      video.style.setProperty('opacity', '1', 'important');
      video.style.setProperty('visibility', 'visible', 'important');
      if (state.player) {
        state.player.dataset.desktopVecRecovery = 'playing';
        state.player.dataset.desktopVecRecoveryUrl = clip.url;
      }
    };
    video.addEventListener('playing', show, { once: true });
    video.addEventListener('ended', () => {
      if (video !== state.video) return;
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
    const play = () => {
      if (video !== state.video || state.audio?.paused || state.audio?.ended) return;
      video.play().catch(() => {});
    };
    ['loadeddata', 'canplay'].forEach(name => video.addEventListener(name, play, { once: true }));
    play();
    setTimeout(play, 100);
    setTimeout(play, 350);
  }

  async function resetForCurrent(p, audio) {
    if (state.loading) return;
    state.loading = true;
    const generation = ++state.generation;
    try {
      const song = await identifySong(p, audio);
      const key = songKey(song);
      if (!key || generation !== state.generation) return;
      state.songKey = key;
      state.player = p;
      state.audio = audio;
      state.failed = new Set();
      removeRecoveryVideo();
      await loadClips(song, generation);
      if (p) {
        p.dataset.desktopVecRecovery = state.clips.length ? 'ready' : 'no-clips';
        p.dataset.desktopVecRecoveryClipCount = String(state.clips.length);
      }
    } catch (error) {
      if (p) {
        p.dataset.desktopVecRecovery = 'error';
        p.dataset.desktopVecRecoveryReason = error?.message || 'unknown';
      }
    } finally {
      if (generation === state.generation) state.loading = false;
    }
  }

  async function tick() {
    const p = player();
    const audio = audioFor(p);
    if (!p || !audio) return;
    state.player = p;
    state.audio = audio;

    const hinted = clean(p.dataset.songKey || p.dataset.currentSongKey || p.dataset.song);
    const title = lower(p.querySelector('[data-ptitle]')?.textContent);
    const signature = hinted || `${title}|${clean(audio.currentSrc || audio.src)}`;
    if (!state.songKey || (hinted && hinted !== state.songKey) || (!hinted && state.signature !== signature)) {
      state.signature = signature;
      await resetForCurrent(p, audio);
      return;
    }

    if (audio.paused || audio.ended) {
      if (state.video && !state.video.paused) state.video.pause();
      return;
    }

    if (nativeVideoPlaying(p)) {
      removeRecoveryVideo();
      p.dataset.desktopVecRecovery = 'native-video-ok';
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
    } else {
      tick().catch(() => {});
    }
  });

  const timer = setInterval(() => tick().catch(() => {}), POLL_MS);
  tick().catch(() => {});

  window.StashboxDesktopVecVideoRecovery20260815 = Object.freeze({
    state: () => ({ songKey: state.songKey, clipCount: state.clips.length, playing: Boolean(state.video && !state.video.paused), url: state.video?.currentSrc || state.video?.src || '' }),
    refresh: () => { state.songKey = ''; state.catalog = null; tick().catch(() => {}); },
    stop: () => { clearInterval(timer); removeRecoveryVideo(); }
  });
})();