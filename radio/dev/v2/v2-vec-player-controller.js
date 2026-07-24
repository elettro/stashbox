(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS = `${API}/radio/songs`;
  const RECIPE = `${API}/radio/vec/recipe`;
  const SONG_ASSETS = `${API}/radio/vec/song-assets`;
  const FOLDERS = `${API}/radio/visuals/folders`;
  const SHOP = 'https://stashbox.ai/products.json?limit=250';
  const TOKENS = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const SHOP_MS = 22000;

  const bag = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>';
  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fix = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const state = {
    songs: [],
    map: new Map(),
    key: '',
    run: 0,
    sequence: [],
    index: 0,
    media: null,
    timer: 0,
    startupTimer: 0,
    safetyTimer: 0,
    products: null,
    productsPromise: null,
    shopTimer: 0,
    shopInterval: 0
  };

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) {}
    }
    return data;
  }

  function rows(data, keys) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  function loggedIn() {
    try {
      return Boolean(JSON.parse(localStorage.getItem(TOKENS) || 'null')?.accessToken);
    } catch (_) {
      return false;
    }
  }

  function players() {
    return [...app.querySelectorAll('[data-player]')];
  }

  function isOpen(currentPlayer) {
    return Boolean(
      currentPlayer &&
      !currentPlayer.hidden &&
      getComputedStyle(currentPlayer).display !== 'none' &&
      getComputedStyle(currentPlayer).visibility !== 'hidden'
    );
  }

  function player() {
    const all = players();
    return all.find(isOpen) || all.at(-1) || null;
  }

  function audio(currentPlayer) {
    return currentPlayer?.querySelector('[data-audio]') || null;
  }

  async function get(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) {}
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function urls(value) {
    if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
    if (!value || typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return urls(parsed);
    } catch (_) {}
    return [...new Set(value.split(/[\n,]+/).map(clean).filter(Boolean))];
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      art: fix(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.image_url) || FALLBACK,
      raw: row
    };
  }

  async function loadSongs() {
    if (state.songs.length) return;
    const body = await get(SONGS);
    state.songs = rows(body, ['songs', 'items', 'data'])
      .map(normalizeSong)
      .filter(item => item.key);
    state.map = new Map(state.songs.map(item => [item.key, item]));
  }

  function currentSong(currentPlayer) {
    const title = norm(currentPlayer?.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(currentPlayer?.querySelector('[data-partist]')?.textContent);
    return state.songs.find(item => (
      norm(item.title) === title && (!artist || norm(item.artist) === artist)
    )) || state.songs.find(item => norm(item.title) === title) || null;
  }

  function assetType(item) {
    const value = clean(
      item?.asset_type || item?.type || item?.media_type || item?.content_type || item?.mime_type
    ).toLowerCase();
    return value === 'clip' || value === 'video' || value.startsWith('video/') ? 'clip' : 'image';
  }

  function normalizeAsset(item, source, folder) {
    if (!item || typeof item !== 'object') return null;
    const url = fix(item.public_url || item.url || item.asset_url || item.src || item.file_url || item.s3_url);
    const status = clean(item.status).toLowerCase();
    if (
      !url ||
      ['hidden', 'deleted', 'archived', 'inactive'].includes(status) ||
      item.hidden === true ||
      item.deleted === true
    ) return null;

    const id = clean(item.id || item.asset_id || item.s3_key || item.key || url);
    return {
      id,
      key: id,
      type: assetType(item),
      url,
      source,
      folderId: clean(item.folder_id || item.folderId || folder?.folder_id || folder?.visual_folder_id || source),
      duration: Math.max(1, Number(item.duration_seconds || item.durationSeconds || 0) || 0),
      alt: clean(item.alt_text || item.altText || item.file_name || item.name || item.title || 'Song visual'),
      products: urls(
        item.shopify_product_urls ?? item.shopifyProductUrls ??
        item.shopify_product_url ?? item.shopifyProductUrl ??
        item.product_urls ?? item.productUrls ?? []
      )
    };
  }

  const idSet = value => new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean));

  function include(list, part = {}) {
    const activeImages = idSet(part.active_image_ids || part.activeImageIds);
    const activeClips = idSet(part.active_clip_ids || part.activeClipIds);
    const excludedImages = idSet(part.excluded_image_ids || part.excludedImageIds);
    const excludedClips = idSet(part.excluded_clip_ids || part.excludedClipIds);
    const restricted = activeImages.size || activeClips.size;

    return list.filter(item => {
      const active = item.type === 'clip' ? activeClips : activeImages;
      const excluded = item.type === 'clip' ? excludedClips : excludedImages;
      if (excluded.has(item.id) || excluded.has(item.key) || excluded.has(item.url)) return false;
      return !restricted || active.has(item.id) || active.has(item.key) || active.has(item.url);
    });
  }

  function unique(list) {
    const seen = new Set();
    return list.filter(item => {
      const key = clean(item.id || item.url).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shuffle(list) {
    const result = [...list];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function recipe(body) {
    body = unwrap(body) || {};
    return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
  }

  function folderList(currentRecipe) {
    return (Array.isArray(currentRecipe?.folders) ? currentRecipe.folders : [])
      .filter(folder => folder?.enabled !== false && clean(folder?.status).toLowerCase() !== 'hidden');
  }

  function borrowed(currentRecipe) {
    for (const candidate of [
      currentRecipe?.borrowed_song_assets,
      currentRecipe?.borrowed_sources,
      currentRecipe?.borrowedSongs,
      currentRecipe?.borrowed_songs
    ]) {
      if (Array.isArray(candidate)) return candidate;
      if (Array.isArray(candidate?.sources)) return candidate.sources;
      if (Array.isArray(candidate?.songs)) return candidate.songs;
    }
    return [];
  }

  async function songAssets(key, source = 'song') {
    const body = await get(`${SONG_ASSETS}?song_key=${encodeURIComponent(key)}`);
    return rows(body, ['assets', 'items', 'data'])
      .map(item => normalizeAsset(item, source))
      .filter(Boolean);
  }

  async function folderAssets(folder) {
    const id = clean(folder.folder_id || folder.visual_folder_id || folder.id);
    if (!id) return [];
    const body = await get(`${FOLDERS}/${encodeURIComponent(id)}/assets`);
    return include(
      rows(body, ['assets', 'items', 'data'])
        .map(item => normalizeAsset(item, `folder:${id}`, folder))
        .filter(Boolean),
      folder
    );
  }

  async function loadVec(currentSongItem, run) {
    const [recipeBody, directAssets] = await Promise.all([
      get(`${RECIPE}?song_key=${encodeURIComponent(currentSongItem.key)}`).catch(() => ({})),
      songAssets(currentSongItem.key).catch(() => [])
    ]);
    if (run !== state.run) return;

    const currentRecipe = recipe(recipeBody);
    const folderGroups = await Promise.all(
      folderList(currentRecipe).map(folder => folderAssets(folder).catch(() => []))
    );
    if (run !== state.run) return;

    const borrowedGroups = await Promise.all(
      borrowed(currentRecipe)
        .filter(source => source?.enabled !== false)
        .map(async source => {
          const key = clean(source.song_key || source.source_song_key || source.key || source.id);
          return key
            ? include(await songAssets(key, `borrowed:${key}`).catch(() => []), source)
            : [];
        })
    );
    if (run !== state.run) return;

    const artwork = {
      id: `artwork:${currentSongItem.key}`,
      key: `artwork:${currentSongItem.key}`,
      type: 'image',
      url: currentSongItem.art,
      source: 'official-artwork',
      duration: Math.max(
        2,
        Number(
          currentRecipe?.artwork?.start_duration_seconds ||
          currentRecipe?.artwork_rules?.start_duration_seconds ||
          4
        ) || 4
      ),
      alt: `${currentSongItem.title} artwork`,
      products: []
    };

    if (clean(currentRecipe?.visual_mode || currentRecipe?.visualMode).toLowerCase() === 'artwork_only') {
      start(currentSongItem, currentRecipe, [artwork], run, 'Artwork Only');
      return;
    }

    const all = unique([
      ...include(directAssets, currentRecipe?.song_assets || currentRecipe?.songAssets || {}),
      ...folderGroups.flat(),
      ...borrowedGroups.flat()
    ]);

    const manual = Array.isArray(currentRecipe?.manual_sequence)
      ? currentRecipe.manual_sequence
      : (Array.isArray(currentRecipe?.sequence) ? currentRecipe.sequence : []);
    const mode = clean(
      currentRecipe?.shuffle?.order_mode ||
      currentRecipe?.shuffle_rules?.order_mode ||
      currentRecipe?.order_mode
    ).toLowerCase();

    let sequence = [];
    if (mode === 'manual' && manual.length) {
      const byId = new Map(all.flatMap(item => [[item.id, item], [item.key, item], [item.url, item]]));
      sequence = manual.map(entry => {
        const id = clean(entry.asset_id || entry.assetId || entry.asset_key || entry.assetKey);
        const isArtwork = (
          clean(entry.source_kind || entry.sourceKind).toLowerCase() === 'artwork' ||
          id === 'official-artwork'
        );
        const item = isArtwork ? artwork : byId.get(id);
        return item ? {
          ...item,
          duration: Math.max(
            1,
            Number(entry.duration_seconds || entry.durationSeconds || item.duration || 4)
          )
        } : null;
      }).filter(Boolean);
    } else {
      const clips = all.filter(item => item.type === 'clip');
      const images = all.filter(item => item.type !== 'clip');
      const bagItems = shuffle(clips.length ? clips : images);
      const withArtwork = (
        currentRecipe?.artwork?.start_with_artwork !== false &&
        currentRecipe?.artwork_rules?.start_with_artwork !== false
      );
      sequence = withArtwork ? [artwork, ...bagItems] : bagItems;
    }

    if (!sequence.length) sequence = [artwork];
    start(
      currentSongItem,
      currentRecipe,
      sequence,
      run,
      sequence.some(item => item.type === 'clip') ? 'VEC Visuals' : 'VEC Images'
    );
  }

  function stage(currentPlayer, currentSongItem, label) {
    let element = currentPlayer.querySelector('[data-mobile-vec-stage]');
    if (!element) {
      element = document.createElement('div');
      element.className = 'v2-mobile-vec-stage';
      element.dataset.mobileVecStage = 'true';
      element.innerHTML = '<span class="v2-mobile-vec-status" data-mobile-vec-status><i></i><b>VEC</b></span>';
      currentPlayer.prepend(element);
    }
    element.style.background = `center/cover no-repeat url("${currentSongItem.art.replaceAll('"', '%22')}")`;
    const status = element.querySelector('[data-mobile-vec-status] b');
    if (status) status.textContent = label;
    currentPlayer.classList.add('is-mobile-vec-active', 'is-vec-active');
    return element;
  }

  function tray(currentPlayer) {
    let element = currentPlayer.querySelector('[data-vec-clip-commerce]');
    if (!element) {
      element = document.createElement('section');
      element.className = 'v2-vec-clip-commerce';
      element.dataset.vecClipCommerce = 'true';
      element.setAttribute('aria-live', 'polite');
      currentPlayer.appendChild(element);
    }
    return element;
  }

  function clearTimers() {
    clearTimeout(state.timer);
    clearTimeout(state.startupTimer);
    clearTimeout(state.safetyTimer);
    state.timer = 0;
    state.startupTimer = 0;
    state.safetyTimer = 0;
  }

  function remove(media) {
    if (!media) return;
    try { media.pause?.(); }
    catch (_) {}
    media.remove();
  }

  function vecVideos(currentPlayer = player()) {
    return [...(currentPlayer?.querySelectorAll('[data-mobile-vec-stage] video') || [])];
  }

  function pauseVideos(currentPlayer = player()) {
    const videos = vecVideos(currentPlayer);
    if (
      state.media?.tagName === 'VIDEO' &&
      state.media.isConnected &&
      !videos.includes(state.media)
    ) videos.push(state.media);

    videos.forEach(video => {
      if (video.paused) return;
      try { video.pause(); }
      catch (_) {}
    });

    if (currentPlayer) currentPlayer.dataset.vecTransportPaused = 'true';
  }

  function audioPlaying(currentPlayer) {
    const element = audio(currentPlayer);
    return Boolean(element && !element.paused && !element.ended);
  }

  function playVideo(currentPlayer, video) {
    if (!video?.isConnected || !audioPlaying(currentPlayer)) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const result = video.play();
    result?.catch?.(() => {});
  }

  function syncMasterTransport(currentPlayer = player()) {
    if (!currentPlayer) return;
    const element = audio(currentPlayer);
    if (!element || element.paused || element.ended) {
      pauseVideos(currentPlayer);
      return;
    }

    currentPlayer.dataset.vecTransportPaused = 'false';
    if (state.media?.tagName === 'VIDEO') playVideo(currentPlayer, state.media);
  }

  function clearAll() {
    clearTimers();
    players().forEach(currentPlayer => {
      currentPlayer
        .querySelectorAll('[data-mobile-vec-stage] img,[data-mobile-vec-stage] video')
        .forEach(remove);
    });
    state.media = null;
  }

  function stop(removeStage = false) {
    state.run += 1;
    state.key = '';
    state.sequence = [];
    state.index = 0;
    clearAll();
    hideShop(true);
    players().forEach(currentPlayer => {
      currentPlayer.classList.remove('is-mobile-vec-active', 'is-vec-active');
      if (removeStage) currentPlayer.querySelector('[data-mobile-vec-stage]')?.remove();
    });
  }

  function start(currentSongItem, currentRecipe, sequence, run, label) {
    if (run !== state.run) return;
    const currentPlayer = player();
    if (!isOpen(currentPlayer)) return;
    state.sequence = sequence;
    state.index = 0;
    stage(currentPlayer, currentSongItem, label);
    tray(currentPlayer);
    bindAudio(currentPlayer);
    render(currentSongItem, currentRecipe, run);
  }

  function next(currentSongItem, currentRecipe, run) {
    if (run !== state.run || state.sequence.length <= 1) return;
    state.index = (state.index + 1) % state.sequence.length;
    render(currentSongItem, currentRecipe, run);
  }

  function commit(media, previous) {
    if (!media.isConnected) return;
    media.classList.add('is-active');
    previous.forEach(item => item.classList.remove('is-active'));
    window.setTimeout(() => previous.forEach(remove), 500);
  }

  function render(currentSongItem, currentRecipe, run) {
    if (run !== state.run) return;
    const currentPlayer = player();
    const currentStage = currentPlayer?.querySelector('[data-mobile-vec-stage]');
    const item = state.sequence[state.index];
    if (!currentPlayer || !currentStage || !item) return;

    clearTimers();
    const previous = [...currentStage.querySelectorAll('.v2-mobile-vec-media')];
    const media = document.createElement(item.type === 'clip' ? 'video' : 'img');
    media.className = 'v2-mobile-vec-media';
    media.setAttribute('aria-label', item.alt || 'VEC visual');
    state.media = media;

    if (item.type === 'clip') {
      Object.assign(media, {
        muted: true,
        defaultMuted: true,
        volume: 0,
        playsInline: true,
        autoplay: false,
        preload: 'auto',
        poster: currentSongItem.art
      });
      media.setAttribute('muted', '');
      media.setAttribute('playsinline', '');
      media.src = item.url;
      currentStage.appendChild(media);

      let shown = false;
      const show = () => {
        if (shown || run !== state.run || media !== state.media) return;
        if (!audioPlaying(currentPlayer)) {
          pauseVideos(currentPlayer);
          return;
        }
        shown = true;
        commit(media, previous);
        if (item.products.length) showShop(currentSongItem, item);
        clearTimeout(state.startupTimer);
        const seconds = Number.isFinite(media.duration) && media.duration > 0
          ? media.duration + 3
          : Math.max(12, Math.min(120, item.duration || 45));
        state.safetyTimer = window.setTimeout(() => next(currentSongItem, currentRecipe, run), seconds * 1000);
      };

      media.addEventListener('playing', show, { once: true });
      ['loadeddata', 'canplay'].forEach(eventName => {
        media.addEventListener(eventName, () => playVideo(currentPlayer, media));
      });
      [['waiting', 250], ['stalled', 500]].forEach(([eventName, delay]) => {
        media.addEventListener(eventName, () => {
          window.setTimeout(() => playVideo(currentPlayer, media), delay);
        });
      });
      media.addEventListener('ended', () => next(currentSongItem, currentRecipe, run));
      media.addEventListener('error', () => {
        window.setTimeout(() => next(currentSongItem, currentRecipe, run), 900);
      }, { once: true });

      state.startupTimer = window.setTimeout(() => {
        if (run !== state.run || media !== state.media || shown) return;
        remove(media);
        state.media = previous.at(-1) || null;
        next(currentSongItem, currentRecipe, run);
      }, 10000);

      playVideo(currentPlayer, media);
    } else {
      media.src = item.url;
      currentStage.appendChild(media);
      const show = () => {
        if (run !== state.run || media !== state.media) return;
        commit(media, previous);
        const milliseconds = Math.max(
          2500,
          Math.min(
            15000,
            (
              item.duration ||
              currentRecipe?.render?.still_image_duration_seconds ||
              currentRecipe?.render_settings?.still_image_duration_seconds ||
              6
            ) * 1000
          )
        );
        state.timer = window.setTimeout(() => next(currentSongItem, currentRecipe, run), milliseconds);
      };
      if (media.complete) show();
      else media.addEventListener('load', show, { once: true });
      media.addEventListener('error', () => next(currentSongItem, currentRecipe, run), { once: true });
    }

    window.dispatchEvent(new CustomEvent('stashbox:vec-asset-change', {
      detail: { songKey: currentSongItem.key, asset: item }
    }));
  }

  function bindAudio(currentPlayer) {
    const element = audio(currentPlayer);
    if (!element || element.dataset.vecControllerBound === 'true') return;
    element.dataset.vecControllerBound = 'true';
    ['play', 'playing', 'pause', 'ended', 'emptied', 'abort'].forEach(eventName => {
      element.addEventListener(eventName, () => syncMasterTransport(currentPlayer));
    });
    syncMasterTransport(currentPlayer);
  }

  function handle(url) {
    try {
      const parts = new URL(url, location.origin).pathname.split('/').filter(Boolean);
      const index = parts.findIndex(part => part.toLowerCase() === 'products');
      return clean(index >= 0 ? parts[index + 1] : parts.at(-1));
    } catch (_) {
      return clean(String(url).split('/').filter(Boolean).at(-1));
    }
  }

  function productImage(product) {
    const candidate = product?.images?.[0] || product?.featured_image || product?.image || '';
    return typeof candidate === 'string'
      ? clean(candidate)
      : clean(candidate?.src || candidate?.url || candidate?.original_src || candidate?.preview_image?.src || '');
  }

  async function products() {
    if (state.products) return state.products;
    if (!state.productsPromise) {
      state.productsPromise = get(SHOP).then(body => rows(body, ['products']).map(product => ({
        handle: clean(product.handle),
        title: clean(product.title || 'Shop this clip'),
        image: productImage(product),
        price: product.variants?.[0]?.price
          ? `$${Number(product.variants[0].price).toFixed(2)}`
          : 'Shop now',
        url: `https://stashbox.ai/products/${encodeURIComponent(clean(product.handle))}`
      }))).catch(() => []);
    }
    state.products = await state.productsPromise;
    return state.products;
  }

  async function showShop(currentSongItem, item) {
    const currentPlayer = player();
    if (!currentPlayer || !item.products.length) return;
    const currentTray = tray(currentPlayer);
    const pool = await products();
    if (state.key !== currentSongItem.key || item !== state.sequence[state.index]) return;

    const list = item.products.slice(0, 8).map((url, index) => {
      const productHandle = handle(url);
      return pool.find(product => norm(product.handle) === norm(productHandle)) || {
        handle: productHandle,
        title: 'Shop this clip',
        image: '',
        price: 'View product',
        url: url || `https://stashbox.ai/products/${encodeURIComponent(productHandle)}`,
        index
      };
    });
    if (!list.length) return;

    clearTimeout(state.shopTimer);
    clearInterval(state.shopInterval);
    const seconds = Math.round(SHOP_MS / 1000);
    currentTray.innerHTML = `<header class="v2-vec-clip-commerce-head"><strong>${bag}<span>Shop the Clip</span></strong><button type="button" data-vec-commerce-close>Closes in <b data-vec-commerce-seconds>${seconds}</b>s</button></header><div class="v2-vec-clip-commerce-row">${list.map(product => `<a class="v2-vec-clip-product" href="${esc(product.url)}" target="_blank" rel="noopener" data-vec-product-click="${esc(product.url)}"><span>${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.title)}">` : '<b>SHOP</b>'}</span><b>${esc(product.title)}</b><small>${esc(product.price)}</small></a>`).join('')}</div>`;
    currentTray.classList.toggle('is-single-product', list.length === 1);
    currentTray.classList.toggle('is-multiple-products', list.length > 1);
    currentTray.classList.add('is-open');
    currentPlayer.classList.add('vec-clip-commerce-active');

    let remaining = seconds;
    state.shopInterval = window.setInterval(() => {
      remaining -= 1;
      const counter = currentTray.querySelector('[data-vec-commerce-seconds]');
      if (counter) counter.textContent = Math.max(0, remaining);
    }, 1000);
    state.shopTimer = window.setTimeout(() => hideShop(), SHOP_MS);
  }

  function hideShop(immediate = false) {
    clearTimeout(state.shopTimer);
    clearInterval(state.shopInterval);
    const currentPlayer = player();
    const currentTray = currentPlayer?.querySelector('[data-vec-clip-commerce]');
    currentTray?.classList.remove('is-open', 'is-single-product', 'is-multiple-products');
    currentPlayer?.classList.remove('vec-clip-commerce-active');
    if (immediate && currentTray) currentTray.innerHTML = '';
  }

  function track(url) {
    const currentSongItem = state.map.get(state.key);
    if (!currentSongItem) return;
    fetch(`${API}/radio/track`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'product_click',
        action: 'product_click',
        song_key: currentSongItem.key,
        display_title: currentSongItem.title,
        artist: currentSongItem.artist,
        product_url: url,
        source: 'v2_vec_clip'
      })
    }).catch(() => {});
  }

  async function tick() {
    const currentPlayer = player();
    if (!loggedIn() || !isOpen(currentPlayer)) {
      if (state.key) stop(true);
      return;
    }

    bindAudio(currentPlayer);
    syncMasterTransport(currentPlayer);
    await loadSongs().catch(() => []);
    const currentSongItem = currentSong(currentPlayer);
    if (!currentSongItem || currentSongItem.key === state.key) return;

    state.run += 1;
    const run = state.run;
    state.key = currentSongItem.key;
    state.sequence = [];
    state.index = 0;
    clearAll();
    hideShop(true);
    loadVec(currentSongItem, run).catch(error => {
      console.warn('[V2 VEC Controller]', error.message || error);
      if (run !== state.run) return;
      start(currentSongItem, {}, [{
        id: `artwork:${currentSongItem.key}`,
        key: `artwork:${currentSongItem.key}`,
        type: 'image',
        url: currentSongItem.art,
        duration: 0,
        alt: `${currentSongItem.title} artwork`,
        products: []
      }], run, 'Artwork');
    });
  }

  document.addEventListener('click', event => {
    const playButton = event.target.closest('[data-play]');
    if (playButton) {
      const currentPlayer = playButton.closest('[data-player]') || player();
      window.setTimeout(() => syncMasterTransport(currentPlayer), 0);
      window.setTimeout(() => syncMasterTransport(currentPlayer), 80);
      window.setTimeout(() => syncMasterTransport(currentPlayer), 220);
    }

    if (event.target.closest('[data-vec-commerce-close]')) {
      event.preventDefault();
      hideShop();
      return;
    }

    const product = event.target.closest('[data-vec-product-click]');
    if (product) track(product.dataset.vecProductClick || product.href);
  }, true);

  document.addEventListener('pause', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    const currentPlayer = event.target.closest('[data-player]') || player();
    if (currentPlayer) pauseVideos(currentPlayer);
  }, true);

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) {
      const currentPlayer = event.target.closest('[data-player]') || player();
      window.setTimeout(() => syncMasterTransport(currentPlayer), 0);
      return;
    }

    if (event.target instanceof HTMLVideoElement && event.target.closest('[data-mobile-vec-stage]')) {
      const currentPlayer = event.target.closest('[data-player]') || player();
      if (!audioPlaying(currentPlayer)) {
        try { event.target.pause(); }
        catch (_) {}
      }
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    const currentPlayer = player();
    if (document.hidden) pauseVideos(currentPlayer);
    else syncMasterTransport(currentPlayer);
  });

  window.setInterval(() => {
    const currentPlayer = player();
    const element = audio(currentPlayer);
    if (currentPlayer && (!element || element.paused || element.ended)) pauseVideos(currentPlayer);
  }, 200);

  window.setInterval(() => tick().catch(() => {}), 500);
  tick().catch(() => {});
})();