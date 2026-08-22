(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoMinimalRescue20260815) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const RECIPE = `${API}/radio/vec/recipe`;
  const FOLDERS = `${API}/radio/visuals/folders`;
  const FIT_KEY = 'stashbox_desktop_video_fit';
  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const state = { songKey: '', clips: [], video: null, timer: 0, loading: false, fitMode: 'fill' };

  try { state.fitMode = localStorage.getItem(FIT_KEY) === 'fit' ? 'fit' : 'fill'; } catch (_) {}

  function player() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => {
      if (node.hidden || !node.isConnected) return false;
      const css = getComputedStyle(node);
      return css.display !== 'none' && css.visibility !== 'hidden';
    }) || null;
  }

  function audio(p) {
    return p?.querySelector('[data-audio]') || [...document.querySelectorAll('#v2App audio')].find(a => !a.paused && !a.ended) || null;
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
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
    return clean(
      asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url ||
      asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url
    ).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  }

  function isVideo(asset) {
    const type = lower(
      asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type ||
      asset?.asset_kind || asset?.file_type || asset?.kind
    );
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
    })).filter(clip => {
      if (!clip.url) return false;
      const key = clip.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function folderEntries(recipeBody) {
    const recipe = unwrap(recipeBody)?.recipe || unwrap(recipeBody)?.vec_recipe || unwrap(recipeBody)?.data?.recipe || unwrap(recipeBody)?.data || unwrap(recipeBody) || {};
    const groups = [recipe.folders, recipe.approved_folders, recipe.approvedFolders, recipe.selected_folders, recipe.selectedFolders, recipe.visual_folders, recipe.visualFolders];
    const seen = new Set();
    const out = [];
    groups.forEach(group => (Array.isArray(group) ? group : []).forEach(folder => {
      if (!folder || folder.enabled === false || lower(folder.status) === 'hidden') return;
      const id = clean(folder.folder_id || folder.visual_folder_id || folder.folderId || folder.id || folder.key);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    }));
    return out;
  }

  async function loadClips(songKey) {
    if (!songKey || state.loading) return;
    state.loading = true;
    try {
      const [directResult, recipeResult] = await Promise.allSettled([
        json(`${SONG_ASSETS}?song_key=${encodeURIComponent(songKey)}`),
        json(`${RECIPE}?song_key=${encodeURIComponent(songKey)}`)
      ]);
      if (songKey !== state.songKey) return;
      let clips = directResult.status === 'fulfilled' ? clipsFrom(directResult.value) : [];
      if (recipeResult.status === 'fulfilled') {
        const folders = folderEntries(recipeResult.value);
        const folderResults = await Promise.allSettled(folders.map(id => json(`${FOLDERS}/${encodeURIComponent(id)}/assets`)));
        if (songKey !== state.songKey) return;
        folderResults.forEach(result => {
          if (result.status === 'fulfilled') clips.push(...clipsFrom(result.value));
        });
      }
      const seen = new Set();
      state.clips = clips.filter(clip => {
        const key = clip.url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort(() => Math.random() - 0.5);
    } finally {
      state.loading = false;
    }
  }

  function removeVideo() {
    if (!state.video) return;
    try { state.video.pause(); } catch (_) {}
    state.video.remove();
    state.video = null;
  }

  function applyFitMode(p = player()) {
    if (!p) return;
    const fit = state.fitMode === 'fit' ? 'contain' : 'cover';
    p.querySelectorAll('[data-mobile-vec-stage] video').forEach(video => {
      video.style.setProperty('object-fit', fit, 'important');
      video.style.setProperty('object-position', 'center center', 'important');
    });
    const button = p.querySelector('[data-desktop-rescue-fit-toggle]');
    if (button) {
      button.textContent = state.fitMode === 'fit' ? 'FIT' : 'FILL';
      button.title = state.fitMode === 'fit' ? 'Show full video with no cropping' : 'Fill viewer area';
      button.setAttribute('aria-label', state.fitMode === 'fit' ? 'Switch to fill video' : 'Switch to fit full video');
    }
  }

  function installFitButton(p = player()) {
    const row = p?.querySelector('.v2-artist-row');
    if (!row || row.querySelector('[data-desktop-rescue-fit-toggle]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.desktopRescueFitToggle = 'true';
    button.className = 'v2-desktop-video-fit-toggle';
    button.style.cssText = 'margin-left:auto;min-width:46px;height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(5,6,7,.5);color:#fff;font:700 10px/1 Karla,Arial,sans-serif;letter-spacing:.08em;cursor:pointer;flex:0 0 auto;';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      state.fitMode = state.fitMode === 'fit' ? 'fill' : 'fit';
      try { localStorage.setItem(FIT_KEY, state.fitMode); } catch (_) {}
      applyFitMode(p);
    });
    const more = row.querySelector('.v2-li-song-more');
    if (more) row.insertBefore(button, more);
    else row.appendChild(button);
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
    video.dataset.desktopMinimalRescue = 'true';
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = `position:absolute;inset:0;z-index:6;width:100%;height:100%;object-fit:${state.fitMode === 'fit' ? 'contain' : 'cover'};object-position:center;background:#050607;pointer-events:none;opacity:0;visibility:hidden;`;
    video.src = clip.url;
    stage.appendChild(video);
    const reveal = () => {
      if (video !== state.video) return;
      video.style.setProperty('opacity', '1', 'important');
      video.style.setProperty('visibility', 'visible', 'important');
      p.dataset.desktopVideoRescueState = 'playing';
      applyFitMode(p);
    };
    video.addEventListener('playing', reveal, { once: true });
    video.addEventListener('ended', () => {
      removeVideo();
      window.setTimeout(() => showRescue(player(), audio(player())), 250);
    }, { once: true });
    video.addEventListener('error', () => {
      state.clips = state.clips.filter(item => item.url !== clip.url);
      removeVideo();
      window.setTimeout(() => showRescue(player(), audio(player())), 250);
    }, { once: true });
    const play = () => { if (video === state.video && !a.paused && !a.ended) video.play().catch(() => {}); };
    video.addEventListener('canplay', play, { once: true });
    play();
  }

  function currentSongKey(p) {
    return clean(p?.dataset?.songKey || p?.dataset?.currentSongKey || p?.dataset?.song || '');
  }

  async function refresh(force = false) {
    const p = player();
    const a = audio(p);
    if (!p || !a) return;
    installFitButton(p);
    applyFitMode(p);
    const key = currentSongKey(p);
    if (key && (force || key !== state.songKey)) {
      state.songKey = key;
      state.clips = [];
      removeVideo();
      await loadClips(key);
    }
    if (!a.paused && !a.ended && a.currentTime >= 3) showRescue(p, a);
  }

  document.addEventListener('click', event => {
    const song = event.target.closest?.('#v2App [data-song]');
    const key = clean(song?.dataset?.song);
    if (!key) return;
    const p = player();
    if (p) p.dataset.songKey = key;
    state.songKey = key;
    state.clips = [];
    removeVideo();
    window.setTimeout(() => refresh(true), 250);
  }, true);

  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    window.setTimeout(() => refresh(false), 150);
  }, true);

  document.addEventListener('pause', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    if (state.video && !state.video.paused) state.video.pause();
  }, true);

  state.timer = window.setInterval(() => refresh(false), 1000);
  refresh(false);

  window.StashboxDesktopVideoMinimalRescue20260815 = Object.freeze({
    refresh: () => refresh(true),
    clipCount: () => state.clips.length,
    fitMode: () => state.fitMode,
    stop: () => { window.clearInterval(state.timer); removeVideo(); }
  });
})();
