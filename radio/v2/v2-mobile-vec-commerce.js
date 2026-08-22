(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const SONG_ASSETS_URL = `${API}/radio/vec/song-assets`;
  const FOLDERS_URL = `${API}/radio/visuals/folders`;
  const SHOP_URL = 'https://stashbox.ai/products.json?limit=250';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MOBILE = window.matchMedia('(max-width: 699px)');
  const CLIP_PRODUCT_LIFETIME_MS = 22000;
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const bagIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>';
  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixUrl = value => clean(value).replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const state = {
    songs: [],
    songMap: new Map(),
    currentKey: '',
    currentRun: 0,
    sequence: [],
    index: 0,
    timer: 0,
    safetyTimer: 0,
    activeMedia: null,
    products: null,
    productsPromise: null,
    commerceTimer: 0,
    commerceCountdown: 0,
    poll: 0
  };

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    return Boolean(tokens().accessToken);
  }

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
  }

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function rows(data, names) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const name of names) if (Array.isArray(data?.[name])) return data[name];
    return [];
  }

  function parseUrls(value) {
    if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
    if (!value) return [];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parseUrls(parsed);
      } catch (_) {}
      return [...new Set(trimmed.split(/[\n,]+/).map(clean).filter(Boolean))];
    }
    return [];
  }

  function normalizeSong(row, index) {
    const key = clean(row.song_key || row.songKey || row.id || `song-${index}`);
    return {
      key,
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      art: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.image_url) || FALLBACK_ART,
      raw: row
    };
  }

  async function loadSongs() {
    if (state.songs.length) return state.songs;
    const body = await json(SONGS_URL);
    state.songs = rows(body, ['songs', 'items', 'data']).map(normalizeSong).filter(song => song.key);
    state.songMap = new Map(state.songs.map(song => [song.key, song]));
    return state.songs;
  }

  function currentPlayer() {
    return app.querySelector('[data-player]');
  }

  function playerIsOpen(player) {
    return Boolean(player && !player.hidden && getComputedStyle(player).display !== 'none');
  }

  function currentSongFromPlayer(player) {
    const title = normalize(player?.querySelector('[data-ptitle]')?.textContent);
    const artist = normalize(player?.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    return state.songs.find(song => normalize(song.title) === title && (!artist || normalize(song.artist) === artist))
      || state.songs.find(song => normalize(song.title) === title)
      || null;
  }

  function normalizeProductUrls(asset) {
    return parseUrls(
      asset?.shopify_product_urls ??
      asset?.shopifyProductUrls ??
      asset?.shopify_product_url ??
      asset?.shopifyProductUrl ??
      asset?.product_urls ??
      asset?.productUrls ??
      []
    );
  }

  function assetType(asset) {
    const value = clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type).toLowerCase();
    return value === 'clip' || value === 'video' || value.startsWith('video/') ? 'clip' : 'image';
  }

  function normalizeAsset(asset, source, folder = null) {
    if (!asset || typeof asset !== 'object') return null;
    const url = fixUrl(asset.public_url || asset.url || asset.asset_url || asset.src || asset.file_url || asset.s3_url);
    if (!url) return null;
    const status = clean(asset.status).toLowerCase();
    if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || asset.hidden === true || asset.deleted === true) return null;
    const id = clean(asset.id || asset.asset_id || asset.s3_key || asset.key || url);
    return {
      id,
      key: id,
      type: assetType(asset),
      url,
      source,
      folderId: clean(asset.folder_id || asset.folderId || folder?.folder_id || folder?.visual_folder_id || source),
      folderName: clean(asset.folder_name || asset.folderName || folder?.folder_name || folder?.name || source),
      durationSeconds: Math.max(1, Number(asset.duration_seconds || asset.durationSeconds || 0) || 0),
      alt: clean(asset.alt_text || asset.altText || asset.file_name || asset.name || asset.title || 'Song visual'),
      productUrls: normalizeProductUrls(asset)
    };
  }

  function idSet(values) {
    return new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean));
  }

  function includeByRecipe(assets, part = {}) {
    const activeImages = idSet(part.active_image_ids || part.activeImageIds);
    const activeClips = idSet(part.active_clip_ids || part.activeClipIds);
    const excludedImages = idSet(part.excluded_image_ids || part.excludedImageIds);
    const excludedClips = idSet(part.excluded_clip_ids || part.excludedClipIds);
    const hasActive = activeImages.size || activeClips.size;
    return assets.filter(asset => {
      const isClip = asset.type === 'clip';
      const active = isClip ? activeClips : activeImages;
      const excluded = isClip ? excludedClips : excludedImages;
      if (excluded.has(asset.id) || excluded.has(asset.key) || excluded.has(asset.url)) return false;
      if (!hasActive) return true;
      return active.has(asset.id) || active.has(asset.key) || active.has(asset.url);
    });
  }

  function dedupe(assets) {
    const seen = new Set();
    return assets.filter(asset => {
      const key = clean(asset.id || asset.url).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shuffle(assets) {
    const result = [...assets];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function recipeFrom(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function enabledFolders(recipe) {
    return (Array.isArray(recipe?.folders) ? recipe.folders : []).filter(folder => folder?.enabled !== false && clean(folder?.status).toLowerCase() !== 'hidden');
  }

  function borrowedSources(recipe) {
    const candidates = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (Array.isArray(candidate?.sources)) return candidate.sources;
      if (Array.isArray(candidate?.songs)) return candidate.songs;
    }
    return [];
  }

  async function fetchSongAssets(songKey, source = 'song') {
    const body = await json(`${SONG_ASSETS_URL}?song_key=${encodeURIComponent(songKey)}`);
    return rows(body, ['assets', 'items', 'data']).map(asset => normalizeAsset(asset, source)).filter(Boolean);
  }

  async function fetchFolderAssets(folder) {
    const folderId = clean(folder.folder_id || folder.visual_folder_id || folder.id);
    if (!folderId) return [];
    const body = await json(`${FOLDERS_URL}/${encodeURIComponent(folderId)}/assets`);
    const assets = rows(body, ['assets', 'items', 'data']).map(asset => normalizeAsset(asset, `folder:${folderId}`, folder)).filter(Boolean);
    return includeByRecipe(assets, folder);
  }

  async function loadVec(song, run) {
    const [recipeBody, songAssets] = await Promise.all([
      json(`${RECIPE_URL}?song_key=${encodeURIComponent(song.key)}`).catch(() => ({})),
      fetchSongAssets(song.key).catch(() => [])
    ]);
    if (run !== state.currentRun) return;

    const recipe = recipeFrom(recipeBody);
    const folderEntries = enabledFolders(recipe);
    const folderGroups = await Promise.all(folderEntries.map(folder => fetchFolderAssets(folder).catch(() => [])));
    if (run !== state.currentRun) return;

    const borrowedGroups = await Promise.all(borrowedSources(recipe).filter(source => source?.enabled !== false).map(async source => {
      const sourceKey = clean(source.song_key || source.source_song_key || source.key || source.id);
      if (!sourceKey) return [];
      const assets = await fetchSongAssets(sourceKey, `borrowed:${sourceKey}`).catch(() => []);
      return includeByRecipe(assets, source);
    }));
    if (run !== state.currentRun) return;

    const artwork = {
      id: `artwork:${song.key}`,
      key: `artwork:${song.key}`,
      type: 'image',
      url: song.art,
      source: 'official-artwork',
      durationSeconds: Math.max(2, Number(recipe?.artwork?.start_duration_seconds || recipe?.artwork_rules?.start_duration_seconds || 4) || 4),
      alt: `${song.title} artwork`,
      productUrls: []
    };

    const visualMode = clean(recipe?.visual_mode || recipe?.visualMode).toLowerCase();
    if (visualMode === 'artwork_only') {
      startSequence(song, recipe, [artwork], run, 'Artwork Only');
      return;
    }

    const all = dedupe([
      ...includeByRecipe(songAssets, recipe?.song_assets || recipe?.songAssets || {}),
      ...folderGroups.flat(),
      ...borrowedGroups.flat()
    ]);

    const manual = Array.isArray(recipe?.manual_sequence) ? recipe.manual_sequence : (Array.isArray(recipe?.sequence) ? recipe.sequence : []);
    const orderMode = clean(recipe?.shuffle?.order_mode || recipe?.shuffle_rules?.order_mode || recipe?.order_mode).toLowerCase();
    let sequence = [];

    if (orderMode === 'manual' && manual.length) {
      const byId = new Map(all.flatMap(asset => [[asset.id, asset], [asset.key, asset], [asset.url, asset]]));
      sequence = manual.map((entry, index) => {
        const id = clean(entry.asset_id || entry.assetId || entry.asset_key || entry.assetKey);
        const isArtwork = clean(entry.source_kind || entry.sourceKind).toLowerCase() === 'artwork' || id === 'official-artwork';
        const asset = isArtwork ? artwork : byId.get(id);
        if (!asset) return null;
        return { ...asset, durationSeconds: Math.max(1, Number(entry.duration_seconds || entry.durationSeconds || asset.durationSeconds || 4)) };
      }).filter(Boolean);
    } else {
      const clips = all.filter(asset => asset.type === 'clip');
      const images = all.filter(asset => asset.type !== 'clip');
      const bag = shuffle(clips.length ? clips : images);
      const startWithArtwork = recipe?.artwork?.start_with_artwork !== false && recipe?.artwork_rules?.start_with_artwork !== false;
      sequence = startWithArtwork ? [artwork, ...bag] : bag;
    }

    if (!sequence.length) sequence = [artwork];
    startSequence(song, recipe, sequence, run, sequence.some(asset => asset.type === 'clip') ? 'VEC Visuals' : 'VEC Images');
  }

  function ensureStage(player, label) {
    let stage = player.querySelector('[data-mobile-vec-stage]');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'v2-mobile-vec-stage';
      stage.dataset.mobileVecStage = 'true';
      stage.innerHTML = '<span class="v2-mobile-vec-status" data-mobile-vec-status><i></i><b>VEC</b></span>';
      player.prepend(stage);
    }
    const status = stage.querySelector('[data-mobile-vec-status] b');
    if (status) status.textContent = label;
    player.classList.add('is-mobile-vec-active');
    return stage;
  }

  function ensureCommerce(player) {
    let tray = player.querySelector('[data-vec-clip-commerce]');
    if (!tray) {
      tray = document.createElement('section');
      tray.className = 'v2-vec-clip-commerce';
      tray.dataset.vecClipCommerce = 'true';
      tray.setAttribute('aria-live', 'polite');
      player.appendChild(tray);
    }
    return tray;
  }

  function clearPlayback() {
    clearTimeout(state.timer);
    clearTimeout(state.safetyTimer);
    state.timer = 0;
    state.safetyTimer = 0;
    if (state.activeMedia) {
      try { state.activeMedia.pause?.(); } catch (_) {}
      state.activeMedia.remove();
      state.activeMedia = null;
    }
  }

  function stopVec({ remove = false } = {}) {
    state.currentRun += 1;
    state.currentKey = '';
    state.sequence = [];
    state.index = 0;
    clearPlayback();
    hideClipCommerce(true);
    const player = currentPlayer();
    player?.classList.remove('is-mobile-vec-active');
    if (remove) player?.querySelector('[data-mobile-vec-stage]')?.remove();
  }

  function startSequence(song, recipe, sequence, run, label) {
    if (run !== state.currentRun) return;
    const player = currentPlayer();
    if (!playerIsOpen(player)) return;
    state.sequence = sequence;
    state.index = 0;
    ensureStage(player, label);
    ensureCommerce(player);
    renderAsset(song, recipe, run);
  }

  function scheduleNext(song, recipe, run, milliseconds) {
    clearTimeout(state.timer);
    if (state.sequence.length <= 1) return;
    state.timer = window.setTimeout(() => {
      if (run !== state.currentRun) return;
      state.index = (state.index + 1) % state.sequence.length;
      renderAsset(song, recipe, run);
    }, milliseconds);
  }

  function renderAsset(song, recipe, run) {
    if (run !== state.currentRun) return;
    const player = currentPlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const asset = state.sequence[state.index];
    if (!player || !stage || !asset) return;

    clearPlayback();
    const previous = [...stage.querySelectorAll('img,video')];
    const media = document.createElement(asset.type === 'clip' ? 'video' : 'img');
    media.src = asset.url;
    media.className = 'v2-mobile-vec-media';
    media.setAttribute('aria-label', asset.alt || 'VEC visual');
    state.activeMedia = media;
    stage.appendChild(media);

    requestAnimationFrame(() => media.classList.add('is-active'));
    window.setTimeout(() => previous.forEach(node => node.remove()), 500);

    window.dispatchEvent(new CustomEvent('stashbox:vec-asset-change', { detail: { songKey: song.key, asset } }));
    if (asset.type === 'clip' && asset.productUrls.length) showClipCommerce(song, asset);

    if (asset.type === 'clip') {
      media.muted = true;
      media.defaultMuted = true;
      media.volume = 0;
      media.playsInline = true;
      media.autoplay = true;
      media.preload = 'auto';
      media.setAttribute('muted', '');
      media.setAttribute('playsinline', '');
      media.onended = () => {
        if (run !== state.currentRun) return;
        state.index = (state.index + 1) % state.sequence.length;
        renderAsset(song, recipe, run);
      };
      media.onerror = media.onstalled = () => scheduleNext(song, recipe, run, 900);
      media.play().catch(() => {});
      state.safetyTimer = window.setTimeout(() => {
        if (run !== state.currentRun) return;
        state.index = (state.index + 1) % state.sequence.length;
        renderAsset(song, recipe, run);
      }, Math.max(12000, Math.min(60000, (asset.durationSeconds || 45) * 1000)));
    } else {
      const duration = Math.max(2500, Math.min(15000, (asset.durationSeconds || recipe?.render?.still_image_duration_seconds || recipe?.render_settings?.still_image_duration_seconds || 6) * 1000));
      scheduleNext(song, recipe, run, duration);
    }
  }

  function productHandle(url) {
    try {
      const parts = new URL(url, location.origin).pathname.split('/').filter(Boolean);
      const index = parts.findIndex(part => part.toLowerCase() === 'products');
      return clean(index >= 0 ? parts[index + 1] : parts.at(-1));
    } catch (_) {
      return clean(String(url).split('/').filter(Boolean).at(-1));
    }
  }

  async function loadProducts() {
    if (state.products) return state.products;
    if (!state.productsPromise) {
      state.productsPromise = json(SHOP_URL).then(body => rows(body, ['products']).map(product => ({
        handle: clean(product.handle),
        title: clean(product.title || 'Shop this clip'),
        image: clean(product.images?.[0]?.src || product.featured_image || ''),
        price: product.variants?.[0]?.price ? `$${Number(product.variants[0].price).toFixed(2)}` : 'Shop now',
        url: `https://stashbox.ai/products/${encodeURIComponent(clean(product.handle))}`
      }))).catch(() => []);
    }
    state.products = await state.productsPromise;
    return state.products;
  }

  async function showClipCommerce(song, asset) {
    const player = currentPlayer();
    if (!player || !asset.productUrls.length) return;
    const tray = ensureCommerce(player);
    const pool = await loadProducts();
    if (state.currentKey !== song.key) return;

    const products = asset.productUrls.slice(0, 8).map((url, index) => {
      const handle = productHandle(url);
      const match = pool.find(product => normalize(product.handle) === normalize(handle));
      return match || {
        handle,
        title: 'Shop this clip',
        image: '',
        price: 'View product',
        url: url || `https://stashbox.ai/products/${encodeURIComponent(handle)}`,
        generic: true,
        index
      };
    });
    if (!products.length) return;

    clearTimeout(state.commerceTimer);
    clearInterval(state.commerceCountdown);
    const seconds = Math.round(CLIP_PRODUCT_LIFETIME_MS / 1000);
    tray.innerHTML = `<header class="v2-vec-clip-commerce-head"><strong>${bagIcon}<span>Shop the Clip</span></strong><button type="button" data-vec-commerce-close>Closes in <b data-vec-commerce-seconds>${seconds}</b>s</button></header><div class="v2-vec-clip-commerce-row">${products.map(product => `<a class="v2-vec-clip-product" href="${esc(product.url)}" target="_blank" rel="noopener" data-vec-product-click="${esc(product.url)}"><span>${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.title)}">` : '<b>SHOP</b>'}</span><b>${esc(product.title)}</b><small>${esc(product.price)}</small></a>`).join('')}</div>`;
    tray.classList.add('is-open');
    player.classList.add('vec-clip-commerce-active');

    let remaining = seconds;
    state.commerceCountdown = window.setInterval(() => {
      remaining -= 1;
      const node = tray.querySelector('[data-vec-commerce-seconds]');
      if (node) node.textContent = Math.max(0, remaining);
    }, 1000);
    state.commerceTimer = window.setTimeout(() => hideClipCommerce(), CLIP_PRODUCT_LIFETIME_MS);
  }

  function hideClipCommerce(immediate = false) {
    clearTimeout(state.commerceTimer);
    clearInterval(state.commerceCountdown);
    state.commerceTimer = 0;
    state.commerceCountdown = 0;
    const player = currentPlayer();
    const tray = player?.querySelector('[data-vec-clip-commerce]');
    tray?.classList.remove('is-open');
    player?.classList.remove('vec-clip-commerce-active');
    if (immediate && tray) tray.innerHTML = '';
  }

  function trackProductClick(url) {
    const song = state.songMap.get(state.currentKey);
    if (!song) return;
    fetch(`${API}/radio/track`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'product_click',
        action: 'product_click',
        song_key: song.key,
        display_title: song.title,
        artist: song.artist,
        product_url: url,
        source: 'v2_vec_clip'
      })
    }).catch(() => {});
  }

  async function tick() {
    const player = currentPlayer();
    if (!MOBILE.matches || !loggedIn() || !playerIsOpen(player)) {
      if (state.currentKey) stopVec({ remove: false });
      return;
    }

    await loadSongs().catch(() => []);
    const song = currentSongFromPlayer(player);
    if (!song || song.key === state.currentKey) return;

    state.currentRun += 1;
    const run = state.currentRun;
    state.currentKey = song.key;
    state.sequence = [];
    state.index = 0;
    clearPlayback();
    hideClipCommerce(true);
    loadVec(song, run).catch(error => {
      console.warn('[V2 Mobile VEC]', error.message || error);
      if (run !== state.currentRun) return;
      startSequence(song, {}, [{ id:`artwork:${song.key}`, key:`artwork:${song.key}`, type:'image', url:song.art, durationSeconds:0, alt:`${song.title} artwork`, productUrls:[] }], run, 'Artwork');
    });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-vec-commerce-close]')) {
      event.preventDefault();
      hideClipCommerce();
      return;
    }
    const product = event.target.closest('[data-vec-product-click]');
    if (product) trackProductClick(product.dataset.vecProductClick || product.href);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.activeMedia?.tagName === 'VIDEO') state.activeMedia.pause();
    else if (!document.hidden && state.activeMedia?.tagName === 'VIDEO' && playerIsOpen(currentPlayer())) state.activeMedia.play().catch(() => {});
  });

  if (typeof MOBILE.addEventListener === 'function') MOBILE.addEventListener('change', () => tick());
  state.poll = window.setInterval(() => tick().catch(() => {}), 500);
  tick().catch(() => {});
})();
