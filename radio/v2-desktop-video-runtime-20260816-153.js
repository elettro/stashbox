(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoRuntime20260816) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS = `${API}/radio/songs`;
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const RECIPE = `${API}/radio/vec/recipe`;
  const FOLDERS = `${API}/radio/visuals/folders`;
  const FIT_KEY = 'stashbox_desktop_video_fit';
  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const normalize = value => lower(value).replace(/\s+/g, ' ');
  const state = { songKey: '', clips: [], video: null, timer: 0, loading: false, fitMode: 'fit', catalog: [], catalogLoaded: false, lastLoadAt: 0 };

  try {
    const savedFitMode = localStorage.getItem(FIT_KEY);
    state.fitMode = savedFitMode === 'fill' ? 'fill' : 'fit';
  } catch (_) {
    state.fitMode = 'fit';
  }

  const player = () => [...document.querySelectorAll('#v2App [data-player]')].find(node => {
    if (node.hidden || !node.isConnected) return false;
    const css = getComputedStyle(node);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }) || null;
  const audio = p => p?.querySelector('[data-audio]') || [...document.querySelectorAll('#v2App audio')].find(a => !a.paused && !a.ended) || null;
  const urlSongKey = () => { try { return clean(new URL(location.href).searchParams.get('song')); } catch (_) { return ''; } };

  function unwrap(value) {
    if (typeof value?.body === 'string') { try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; } }
    return value;
  }
  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }
  function arrays(value) {
    value = unwrap(value);
    if (Array.isArray(value)) return value;
    const out = [];
    if (!value || typeof value !== 'object') return out;
    for (const key of ['assets', 'items', 'results', 'data', 'clips']) {
      const list = value[key];
      if (Array.isArray(list)) out.push(...list);
      else if (list && typeof list === 'object') out.push(...arrays(list));
    }
    return out;
  }
  function assetUrl(asset) {
    return clean(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url || asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }
  function isVideo(asset) {
    const type = lower(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.asset_kind || asset?.file_type || asset?.kind);
    return type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }
  function active(asset) {
    const status = lower(asset?.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status) && asset?.hidden !== true && asset?.deleted !== true && asset?.active !== false;
  }
  function clipsFrom(body) {
    const seen = new Set();
    return arrays(body).filter(asset => asset && typeof asset === 'object' && active(asset) && isVideo(asset)).map(asset => ({
      id: clean(asset.id || asset.asset_id || asset.assetId || asset.s3_key || asset.key || assetUrl(asset)),
      url: assetUrl(asset)
    })).filter(clip => clip.url && !seen.has(clip.url.toLowerCase()) && seen.add(clip.url.toLowerCase()));
  }
  function folderEntries(recipeBody) {
    const recipe = unwrap(recipeBody)?.recipe || unwrap(recipeBody)?.vec_recipe || unwrap(recipeBody)?.data?.recipe || unwrap(recipeBody)?.data || unwrap(recipeBody) || {};
    const groups = [recipe.folders, recipe.approved_folders, recipe.approvedFolders, recipe.selected_folders, recipe.selectedFolders, recipe.visual_folders, recipe.visualFolders];
    const seen = new Set();
    const out = [];
    groups.forEach(group => (Array.isArray(group) ? group : []).forEach(folder => {
      if (!folder || folder.enabled === false || lower(folder.status) === 'hidden') return;
      const id = clean(folder.folder_id || folder.visual_folder_id || folder.folderId || folder.id || folder.key);
      if (id && !seen.has(id)) { seen.add(id); out.push(id); }
    }));
    return out;
  }
  async function loadCatalog() {
    if (state.catalogLoaded) return state.catalog;
    state.catalogLoaded = true;
    try {
      const body = await json(SONGS);
      const rows = Array.isArray(body) ? body : body?.songs || body?.items || body?.data || [];
      state.catalog = rows.map(row => ({
        key: clean(row.song_key || row.id),
        title: normalize(row.display_title || row.song_name || row.title),
        artist: normalize(row.artist || row.artist_name),
        audio: clean(row.audio_url || row.resolved_audio_url || row.file_url)
      })).filter(row => row.key);
    } catch (_) { state.catalogLoaded = false; state.catalog = []; }
    return state.catalog;
  }
  function basename(url) {
    try { return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || '').toLowerCase(); }
    catch (_) { return clean(url).split(/[/?#]/).filter(Boolean).pop()?.toLowerCase() || ''; }
  }
  async function resolveSongKey(p, a) {
    const direct = clean(p?.dataset?.songKey || p?.dataset?.currentSongKey || p?.dataset?.song || '');
    if (direct) return direct;
    const activeCard = document.querySelector('#v2App [data-song].is-playing, #v2App [data-song][aria-current="true"]');
    const activeKey = clean(activeCard?.dataset?.song);
    if (activeKey) return activeKey;
    const fromUrl = urlSongKey();
    if (fromUrl) return fromUrl;
    const catalog = await loadCatalog();
    if (!catalog.length) return '';
    const audioSrc = clean(a?.currentSrc || a?.src);
    if (audioSrc) {
      const srcBase = basename(audioSrc);
      const byAudio = catalog.find(item => item.audio && (item.audio === audioSrc || basename(item.audio) === srcBase));
      if (byAudio) return byAudio.key;
    }
    const title = normalize(p?.querySelector('[data-ptitle]')?.textContent);
    const artist = normalize(p?.querySelector('[data-partist]')?.textContent);
    if (title) {
      const byMeta = catalog.find(item => item.title === title && (!artist || !item.artist || item.artist === artist)) || catalog.find(item => item.title === title);
      if (byMeta) return byMeta.key;
    }
    return '';
  }
  function mergeClips(next) {
    if (!Array.isArray(next) || !next.length) return false;
    const seen = new Set(state.clips.map(clip => clip.url.toLowerCase()));
    let added = false;
    next.forEach(clip => {
      const key = clean(clip?.url).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      state.clips.push(clip);
      added = true;
    });
    if (added) state.clips.sort(() => Math.random() - 0.5);
    return added;
  }
  function tryStartVideo() {
    const p = player();
    const a = audio(p);
    if (!p || !a || a.paused || a.ended || !state.clips.length) return;
    showRescue(p, a);
  }
  async function loadClips(songKey) {
    if (!songKey || state.loading) return;
    state.loading = true;
    state.lastLoadAt = Date.now();
    const directPromise = json(`${SONG_ASSETS}?song_key=${encodeURIComponent(songKey)}`);
    const recipePromise = json(`${RECIPE}?song_key=${encodeURIComponent(songKey)}`);
    try {
      const directBody = await directPromise.catch(() => null);
      if (songKey !== state.songKey) return;
      if (directBody && mergeClips(clipsFrom(directBody))) tryStartVideo();

      const recipeBody = await recipePromise.catch(() => null);
      if (songKey !== state.songKey || !recipeBody) return;
      const folders = folderEntries(recipeBody);
      await Promise.allSettled(folders.map(id =>
        json(`${FOLDERS}/${encodeURIComponent(id)}/assets`).then(body => {
          if (songKey !== state.songKey) return;
          if (mergeClips(clipsFrom(body))) tryStartVideo();
        })
      ));
    } finally { state.loading = false; }
  }
  function removeVideo() {
    if (!state.video) return;
    try { state.video.pause(); } catch (_) {}
    state.video.remove(); state.video = null;
  }
  function saveFitMode() {
    try { localStorage.setItem(FIT_KEY, state.fitMode); } catch (_) {}
  }
  function applyFitMode(p = player()) {
    if (!p) return;
    const fit = state.fitMode === 'fit' ? 'contain' : 'cover';
    p.dataset.desktopVideoFit = state.fitMode;
    p.querySelectorAll('[data-mobile-vec-stage] video, video[data-desktop-minimal-rescue="true"]').forEach(video => {
      video.style.setProperty('object-fit', fit, 'important');
      video.style.setProperty('object-position', 'center center', 'important');
    });
    const button = p.querySelector('[data-desktop-rescue-fit-toggle]');
    if (button) {
      button.textContent = state.fitMode === 'fit' ? 'FIT' : 'FILL';
      button.dataset.mode = state.fitMode;
      button.setAttribute('aria-pressed', state.fitMode === 'fit' ? 'true' : 'false');
      button.title = state.fitMode === 'fit'
        ? 'FIT: shows the entire video with no cropping. Click for FILL.'
        : 'FILL: fills the player and may crop the video. Click for FIT.';
      button.setAttribute('aria-label', button.title);
    }
  }
  function toggleFitMode() {
    state.fitMode = state.fitMode === 'fit' ? 'fill' : 'fit';
    saveFitMode();
    applyFitMode(player());
  }
  function installFitButton(p = player()) {
    const row = p?.querySelector('.v2-artist-row');
    if (!row) return;
    let button = row.querySelector('[data-desktop-rescue-fit-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.desktopRescueFitToggle = 'true';
      button.className = 'v2-desktop-video-fit-toggle';
      button.style.cssText = 'margin-left:auto;min-width:46px;height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(5,6,7,.5);color:#fff;font:700 10px/1 Karla,Arial,sans-serif;letter-spacing:.08em;cursor:pointer;flex:0 0 auto;position:relative;z-index:20;pointer-events:auto;';
      const more = row.querySelector('.v2-li-song-more');
      if (more) row.insertBefore(button, more); else row.appendChild(button);
    }
    applyFitMode(p);
  }
  function visibleVideo(p) {
    return [...(p?.querySelectorAll('[data-mobile-vec-stage] video') || [])].some(video => {
      if (video === state.video) return !video.paused && video.readyState >= 2;
      if (video.paused || video.ended || video.readyState < 2) return false;
      const css = getComputedStyle(video);
      return css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity || 1) > 0.05;
    });
  }
  function showRescue(p, a) {
    if (!p || !a || a.paused || a.ended || !state.clips.length || visibleVideo(p)) return;
    const stage = p.querySelector('[data-mobile-vec-stage]');
    if (!stage) return;
    removeVideo();
    const clip = state.clips[Math.floor(Math.random() * state.clips.length)];
    const video = document.createElement('video');
    state.video = video;
    video.dataset.desktopMinimalRescue = 'true'; video.muted = true; video.defaultMuted = true; video.volume = 0; video.autoplay = true; video.playsInline = true; video.preload = 'auto'; video.disablePictureInPicture = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.style.cssText = `position:absolute;inset:0;z-index:6;width:100%;height:100%;object-fit:${state.fitMode === 'fit' ? 'contain' : 'cover'};object-position:center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;`;
    video.src = clip.url; stage.appendChild(video);
    const reveal = () => { if (video !== state.video) return; video.style.setProperty('opacity', '1', 'important'); video.style.setProperty('visibility', 'visible', 'important'); p.dataset.desktopVideoRescueState = 'playing'; applyFitMode(p); };
    video.addEventListener('playing', reveal, { once: true });
    video.addEventListener('ended', () => { removeVideo(); window.setTimeout(() => showRescue(player(), audio(player())), 120); }, { once: true });
    video.addEventListener('error', () => { state.clips = state.clips.filter(item => item.url !== clip.url); removeVideo(); window.setTimeout(() => showRescue(player(), audio(player())), 150); }, { once: true });
    const play = () => { if (video === state.video && !a.paused && !a.ended) video.play().catch(() => {}); };
    video.addEventListener('canplay', play, { once: true }); play();
  }
  async function refresh(force = false) {
    const p = player(); const a = audio(p);
    if (!p || !a) return;
    installFitButton(p); applyFitMode(p);
    const key = await resolveSongKey(p, a);
    if (key && key !== state.songKey) {
      state.songKey = key; p.dataset.songKey = key; state.clips = []; removeVideo(); loadClips(key);
    } else if (key && (force || (!state.clips.length && Date.now() - state.lastLoadAt > 4000))) {
      state.songKey = key; loadClips(key);
    }
    if (!a.paused && !a.ended && a.currentTime >= 0.15) showRescue(p, a);
  }
  document.addEventListener('click', event => {
    const fitToggle = event.target.closest?.('[data-desktop-rescue-fit-toggle]');
    if (fitToggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleFitMode();
      return;
    }
    const song = event.target.closest?.('#v2App [data-song]'); const key = clean(song?.dataset?.song); if (!key) return;
    const p = player(); if (p) p.dataset.songKey = key; state.songKey = key; state.clips = []; removeVideo(); loadClips(key); window.setTimeout(() => refresh(true), 50);
  }, true);
  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    refresh(true); window.setTimeout(() => refresh(true), 250); window.setTimeout(() => refresh(false), 750);
  }, true);
  document.addEventListener('pause', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    if (state.video && !state.video.paused) state.video.pause();
  }, true);
  state.timer = window.setInterval(() => refresh(false), 750);
  loadCatalog(); refresh(false);
  window.StashboxDesktopVideoRuntime20260816 = Object.freeze({
    refresh: () => refresh(true),
    clipCount: () => state.clips.length,
    songKey: () => state.songKey,
    fitMode: () => state.fitMode,
    setFitMode: mode => {
      state.fitMode = mode === 'fill' ? 'fill' : 'fit';
      saveFitMode();
      applyFitMode(player());
    },
    stop: () => { window.clearInterval(state.timer); removeVideo(); }
  });
})();