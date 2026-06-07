import React, { useCallback, useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import { flushSync } from 'https://esm.sh/react-dom@18.3.1';

const SONGS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/radio/songs';
const TRACKING_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/radio/track';
const SESSION_STORAGE_KEY = 'stashbox-radio-rds-dev-session-id';
const VIEW_MODE_STORAGE_KEY = 'stashbox_radio_view_mode';
const PRODUCT_POOL_LIMIT = 200;
const COMPLETION_THRESHOLD = 0.95;
const MIN_PARTIAL_SECONDS = 5;
const QUALIFIED_PLAY_SECONDS = 10;
const TRACKING_DEDUPE_MS = 2000;
const UNTITLED_STASHBOX_TRACK = 'Untitled Stashbox Track';
const songKeyFromUrl = new URLSearchParams(window.location.search).get('song') || '';

const SECTIONS = [
  { key: 'Reggae', emoji: '🌴', color: '#3ecf6e' }, { key: 'Rock', emoji: '🎸', color: '#f0a500' },
  { key: 'Blues', emoji: '🎷', color: '#50a0ff' }, { key: 'Funk', emoji: '🕺', color: '#e05c2a' },
  { key: 'Electronic', emoji: '⚡', color: '#50dcdc' }, { key: 'Spanish', emoji: '💃', color: '#ff6496' },
  { key: 'Calypso', emoji: '🥁', color: '#ffc050' }, { key: 'Soul', emoji: '🎤', color: '#c88cff' },
  { key: 'Pop', emoji: '🎵', color: '#ff9080' }, { key: 'Other', emoji: '🎶', color: '#999' }
];

const GENRE_FILTERS = ['ALL', ...SECTIONS.map(section => section.key)];
const ALBUM_FILTERS = ['ALL', 'Exclusive', 'Stashbox Does Dylan', 'Stashbox Radio', 'Thank You Giorgio'];
const SORT_OPTIONS = [
  { key: 'latest', label: 'Latest' },
  { key: 'most-played', label: 'Most Played' },
  { key: 'most-liked', label: 'Most Liked' },
  { key: 'genre', label: 'Genre' },
  { key: 'most-shared', label: 'Most Shared' },
  { key: 'most-engaged', label: 'Most Engaged' },
  { key: 'videos-first', label: 'Videos First' },
  { key: 'artist', label: 'Artist' }
];

const h = React.createElement;
const recentTrackingEvents = new Map();
const specificProductCache = new Map();
let storeProductsPromise = null;
let cachedStoreProducts = null;
const clean = value => String(value ?? '').trim().replace(/^"|"$/g, '');
const fixDropbox = url => url ? url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '') : '';
const has = value => clean(value).length > 0;
const bool = value => value === true || value === 1 || String(value ?? '').toLowerCase() === 'true' || String(value ?? '').toLowerCase() === '1';

function isVideoOnlyTrack(song) {
  const releaseFormat = String(song?.release_format || song?.raw?.release_format || '').toLowerCase().replace(/\s+/g, '_');
  const videoLink = song?.video_link || song?.video_url || song?.videoUrl || song?.videoLink || song?.raw?.video_link || song?.raw?.video_url || song?.raw?.videoUrl;
  const audioUrl = song?.audio_url || song?.audioUrl || song?.raw?.audio_url || song?.raw?.audioUrl;
  return Boolean(
    song &&
    (
      song.videoOnly === true ||
      releaseFormat === 'video_only' ||
      (has(videoLink) && !has(audioUrl))
    )
  );
}
const sectionFor = genre => SECTIONS.find(s => s.key.toLowerCase() === clean(genre).toLowerCase())?.key || 'Other';
const countValue = value => Math.max(0, Number(value) || 0);
const YOUTUBE_ORIGIN = 'https://elettro.github.io';

function getBrowserSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : `rds-dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch (_) {
    return `rds-dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getDeviceType() {
  const ua = navigator.userAgent || '';
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function parseStringList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
    } catch (_) {}
    return trimmed.split(/[\n,]+/).map(clean).filter(Boolean);
  }
  return [];
}

function firstDefined(row, names) {
  for (const name of names) if (row?.[name] !== undefined && row?.[name] !== null && clean(row[name])) return row[name];
  return '';
}

function normalizedAlbumName(row) {
  if (!row) return '';
  if (Object.prototype.hasOwnProperty.call(row, 'album_name')) return clean(row.album_name);
  return clean(firstDefined(row, ['album', 'album_title', 'release_title']));
}

function normalizeSong(row, index) {
  const displayTitle = clean(row?.display_title);
  const songName = clean(row?.song_name);
  const title = displayTitle || songName || UNTITLED_STASHBOX_TRACK;
  const genre = clean(firstDefined(row, ['genre', 'primary_genre', 'section']));
  const hasAudio = has(row.audio_url);
  const hasVideo = has(row.video_link || row.video_url || row.videoUrl);
  const videoOnly = bool(row.video_only) || isVideoOnlyTrack(row);
  const rawKey = firstDefined(row, ['song_key', 'key', 'slug', 'id', 'track_id']);
  const likes = countValue(firstDefined(row, ['likes', 'like_count', 'total_likes']));
  const totalPlays = countValue(firstDefined(row, ['total_plays', 'plays', 'play_count', 'play_starts']));
  const fullPlayCount = countValue(firstDefined(row, ['full_play_count', 'full_plays']));
  const partialPlayCount = countValue(firstDefined(row, ['partial_play_count', 'partial_plays']));
  const skipCount = countValue(firstDefined(row, ['skip_count', 'skips']));
  const shares = countValue(firstDefined(row, ['shares', 'share_count', 'total_shares']));
  const shareLinkVisits = countValue(firstDefined(row, ['share_link_visits', 'share_visits']));
  const videoClicks = countValue(firstDefined(row, ['video_clicks', 'video_click_count', 'total_video_clicks']));
  const productClicks = countValue(firstDefined(row, ['product_clicks', 'product_click_count', 'total_product_clicks']));
  return {
    raw: row,
    id: clean(rawKey) || `rds-song-${index}`,
    song_key: clean(rawKey) || `rds-song-${index}`,
    songKey: clean(rawKey) || `rds-song-${index}`,
    display_title: displayTitle,
    song_name: songName,
    title,
    album: normalizedAlbumName(row),
    artist: clean(firstDefined(row, ['artist', 'artist_name', 'band'])) || 'Stashbox',
    genre,
    sectionKey: sectionFor(genre),
    audioUrl: hasAudio ? fixDropbox(clean(row.audio_url)) : '',
    imageUrl: fixDropbox(clean(row.resolved_artwork_url || row.artwork_url || row.image_url || row.cover_url)),
    videoLink: clean(row.video_link || row.video_url || row.videoUrl),
    release_format: clean(row.release_format),
    releaseFormat: clean(row.release_format),
    likes,
    total_plays: totalPlays,
    totalPlays,
    full_play_count: fullPlayCount,
    fullPlayCount,
    partial_play_count: partialPlayCount,
    partialPlayCount,
    skip_count: skipCount,
    skipCount,
    shares,
    share_link_visits: shareLinkVisits,
    shareLinkVisits,
    video_clicks: videoClicks,
    videoClicks,
    product_clicks: productClicks,
    productClicks,
    created_at: clean(row.created_at),
    createdAt: clean(row.created_at),
    updated_at: clean(row.updated_at),
    updatedAt: clean(row.updated_at),
    apiOrder: index,
    hasAudio,
    hasVideo,
    videoOnly,
    showWatchVideo: hasVideo && (bool(row.show_watch_video) || !videoOnly),
    publicTrackNote: bool(row.show_public_note) ? clean(row.public_track_note) : '',
    publicVideoNote: clean(row.public_video_note),
    videoSetlist: clean(row.video_setlist),
    notes: bool(row.show_public_note) ? clean(row.public_track_note) : '',
    specificProductUrls: parseStringList(row.specific_product_urls),
    sortOrder: Number(row.sort_order ?? row.display_order ?? index) || index,
    idx: clean(rawKey) || `rds-song-${index}`
  };
}

function createSongsApiError(message, { endpoint = SONGS_API_URL, responseOkFailed = false, data = null } = {}) {
  const error = new Error(message);
  error.endpoint = endpoint;
  error.responseOkFailed = responseOkFailed;
  error.apiError = data?.error || '';
  return error;
}

async function fetchRadioSongs() {
  console.log("Fetching songs from:", SONGS_API_URL);
  let response;
  let data;

  try {
    response = await fetch(SONGS_API_URL, { cache: 'no-store' });
  } catch (error) {
    throw createSongsApiError(error.message || 'Failed to fetch songs from the RDS API.');
  }

  try {
    data = await response.json();
  } catch (error) {
    throw createSongsApiError(error.message || 'Unable to parse Songs API response as JSON.', { responseOkFailed: !response.ok });
  }

  console.log("Songs API response:", data);

  if (!response.ok) {
    throw createSongsApiError(`Songs API returned HTTP ${response.status}`, { responseOkFailed: true, data });
  }

  if (data?.success === false) {
    throw createSongsApiError(data.error || 'Songs API returned success: false.', { data });
  }

  if (!Array.isArray(data?.songs) || data.songs.length === 0) {
    throw createSongsApiError('No songs returned from API.', { data });
  }

  return data.songs.map(normalizeSong).filter(song => song.title).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function sendTrackingEvent(song, eventType, sessionId, extra = {}) {
  if (!song?.songKey || !eventType) return null;
  const dedupeKey = `${song.songKey}:${eventType}`;
  const now = Date.now();
  const lastSentAt = recentTrackingEvents.get(dedupeKey) || 0;
  if (now - lastSentAt < TRACKING_DEDUPE_MS) {
    console.log('[Stashbox Radio Dev] duplicate tracking event suppressed', { song_key: song.songKey, event_type: eventType });
    return null;
  }
  recentTrackingEvents.set(dedupeKey, now);
  const payload = {
    song_key: song.songKey,
    event_type: eventType,
    session_id: sessionId,
    device_type: getDeviceType(),
    referrer: document.referrer || '',
    ...extra
  };
  Object.keys(payload).forEach(key => (payload[key] === undefined || payload[key] === null || payload[key] === '') && delete payload[key]);
  console.log('[Stashbox Radio Dev] tracking payload', payload);
  try {
    const response = await fetch(TRACKING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch (_) {}
    console.log('[Stashbox Radio Dev] tracking API response', { status: response.status, ok: response.ok, body });
    return { response, body };
  } catch (error) {
    console.warn('[Stashbox Radio Dev] tracking API error', error.message || error);
    return null;
  }
}

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(clean(url));
}

function getYouTubeId(url) {
  const value = clean(url);
  if (!value) return '';
  try {
    const parsed = new URL(value, window.location.href);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host.includes('youtube.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
      return parts.pop() || '';
    }
    if (host.includes('youtu.be')) return parts[0] || '';
  } catch (_) {}
  return /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : '';
}

function youtubeEmbed(url, { autoplay = true } = {}) {
  const value = clean(url);
  console.log('[Stashbox Radio Dev] video_link being converted', value);
  if (!value) return '';
  const id = getYouTubeId(value);
  if (!id) return '';
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    enablejsapi: '1',
    origin: YOUTUBE_ORIGIN
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
}

function youtubePlayerVars({ autoplay = true } = {}) {
  return {
    autoplay: autoplay ? 1 : 0,
    rel: 0,
    enablejsapi: 1,
    origin: YOUTUBE_ORIGIN
  };
}

let youtubeIframeApiPromise = null;
function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;
  youtubeIframeApiPromise = new Promise(resolve => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return youtubeIframeApiPromise;
}

function canPlayTrack(track) {
  if (!track) return false;
  const hasAudioUrl = track.hasAudio && has(track.audioUrl) && !track.videoOnly;
  const hasVideoUrl = track.hasVideo && has(track.videoLink);
  return hasAudioUrl || hasVideoUrl;
}

function youtubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : '';
}

function rotateBySeed(items, seed) {
  if (!items.length) return items;
  let hash = 0;
  String(seed || '').split('').forEach(ch => { hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0; });
  const offset = Math.abs(hash) % items.length;
  return items.slice(offset).concat(items.slice(0, offset));
}

function productUrlHandle(url) {
  const rawUrl = clean(url).split('?')[0].split('#')[0].replace(/\/$/, '');
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const productIndex = parts.findIndex(part => part.toLowerCase() === 'products');
    return productIndex >= 0 ? clean(parts[productIndex + 1]) : clean(parts.pop());
  } catch (_) {
    const parts = rawUrl.split('/').filter(Boolean);
    const productIndex = parts.findIndex(part => part.toLowerCase() === 'products');
    return productIndex >= 0 ? clean(parts[productIndex + 1]) : clean(parts.pop());
  }
}

function productHandleKey(handle) { return clean(handle).toLowerCase(); }

function normalizeProductUrl(url) {
  try {
    const parsed = new URL(clean(url), window.location.href);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch (_) {
    return clean(url).split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase();
  }
}

function normalizeShopifyProductUrl(url, handle = '') {
  const cleanUrl = clean(url);
  if (cleanUrl.startsWith('//')) return `https:${cleanUrl}`;
  if (cleanUrl.startsWith('/')) return `https://stashbox.ai${cleanUrl}`;
  return cleanUrl || `https://stashbox.ai/products/${handle}`;
}

function normalizeShopifyImage(rawImage) {
  const image = typeof rawImage === 'object' && rawImage !== null ? (rawImage.src || rawImage.url || '') : rawImage;
  const cleanImage = clean(image);
  if (!cleanImage) return '';
  if (cleanImage.startsWith('//')) return `https:${cleanImage}`;
  if (cleanImage.startsWith('/')) return `https://stashbox.ai${cleanImage}`;
  return cleanImage;
}

function formatShopifyPrice(value, { cents = false } = {}) {
  if (value === undefined || value === null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const dollars = cents ? numeric / 100 : numeric;
  return `$${dollars.toFixed(2)}`;
}

function productShape(product) {
  const variant = product.variants?.[0];
  const handle = clean(product.handle);
  const rawImage = product.images?.[0]?.src || product.images?.[0] || product.featured_image;
  const image = normalizeShopifyImage(rawImage);
  const url = normalizeShopifyProductUrl(product.url, handle);
  const onlineStoreUrl = normalizeShopifyProductUrl(product.onlineStoreUrl || product.online_store_url, handle);
  const slug = clean(product.slug);
  return {
    id: product.id || handle || null,
    handle,
    slug,
    onlineStoreUrl,
    title: product.title || 'Stashbox Product',
    url,
    image,
    price: formatShopifyPrice(variant?.price)
  };
}

function productFromUrl(url, index, matchedProduct = null) {
  const cleanUrl = clean(url);
  if (matchedProduct) {
    return {
      ...matchedProduct,
      id: `specific-${index}-${matchedProduct.id || matchedProduct.handle || cleanUrl}`,
      url: cleanUrl || matchedProduct.url,
      specific: true,
      unresolved: false
    };
  }
  const handle = productUrlHandle(cleanUrl);
  const fallbackTitle = handle || 'Featured product';
  const title = decodeURIComponent(fallbackTitle).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { id: `specific-${index}-${cleanUrl}`, handle, title: title || 'Featured product', url: cleanUrl, image: '', price: 'Specific product link', specific: true, unresolved: true };
}

function productMatchesHandle(product, handle) {
  const key = productHandleKey(handle);
  if (!key || !product) return false;
  const productHandle = productHandleKey(product.handle);
  const productSlug = productHandleKey(product.slug);
  if (productHandle === key || productSlug === key) return true;
  return [product.url, product.onlineStoreUrl].some(productUrl => {
    const normalized = normalizeProductUrl(productUrl);
    return normalized.endsWith(`/products/${key}`) || productHandleKey(productUrlHandle(productUrl)) === key;
  });
}

function findProductInPoolByHandle(pool, handle) {
  return pool.find(product => productMatchesHandle(product, handle)) || null;
}

async function fetchSpecificProduct(url, index, handle) {
  const cacheKey = productHandleKey(handle);
  if (!cacheKey) return null;
  if (!specificProductCache.has(cacheKey)) {
    specificProductCache.set(cacheKey, fetch(`https://stashbox.ai/products/${encodeURIComponent(handle)}.js`).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const productJson = await res.json();
      console.log("Specific product resolved from Shopify .js:", productJson);
      const rawImage = productJson.featured_image || productJson.images?.[0];
      const image = normalizeShopifyImage(rawImage);
      const price = formatShopifyPrice(productJson.price, { cents: true });
      return {
        id: productJson.id || handle,
        handle: clean(productJson.handle) || handle,
        title: clean(productJson.title) || 'Stashbox Product',
        url: clean(url),
        image,
        price,
        specific: true,
        unresolved: false
      };
    }).catch(error => {
      specificProductCache.delete(cacheKey);
      throw error;
    }));
  }
  const product = await specificProductCache.get(cacheKey);
  console.log("Specific product resolved from Shopify .js:", product || null);
  return product ? { ...product, id: `specific-${index}-${product.id || handle || clean(url)}`, url: clean(url) || product.url, specific: true } : null;
}

async function fetchFallbackProducts() {
  if (cachedStoreProducts) return cachedStoreProducts;
  if (!storeProductsPromise) {
    console.log("Product pool limit:", PRODUCT_POOL_LIMIT);
    storeProductsPromise = fetch(`https://stashbox.ai/products.json?limit=${PRODUCT_POOL_LIMIT}`).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const seen = new Set();
      const storeProducts = [];
      const feedProducts = Array.isArray(data.products) ? data.products : [];
      for (const feedProduct of feedProducts) {
        const product = productShape(feedProduct);
        const dedupeKey = productHandleKey(product.handle) || normalizeProductUrl(product.url);
        if (!product.url || !dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        storeProducts.push(product);
        if (storeProducts.length >= PRODUCT_POOL_LIMIT) break;
      }
      cachedStoreProducts = storeProducts;
      console.log("Loaded store product count:", storeProducts.length);
      return storeProducts;
    }).catch(error => {
      storeProductsPromise = null;
      throw error;
    });
  }
  return storeProductsPromise;
}

function dedupeProductList(products) {
  const seen = new Set();
  return products.filter(product => {
    const keys = [productHandleKey(product.handle), normalizeProductUrl(product.url), normalizeProductUrl(product.onlineStoreUrl)].filter(Boolean);
    const duplicate = keys.some(key => seen.has(key));
    if (duplicate) return false;
    keys.forEach(key => seen.add(key));
    return true;
  });
}

function useProducts(selected) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    let alive = true;
    setProducts([]);
    async function loadProducts() {
      if (!selected) return [];
      let fallback = [];
      try {
        fallback = rotateBySeed(await fetchFallbackProducts(), selected?.title).slice(0, PRODUCT_POOL_LIMIT);
      } catch (error) {
        console.warn('Unable to load fallback products.', error.message || error);
      }
      const specific = [];
      for (const [index, url] of selected.specificProductUrls.entries()) {
        console.log("Specific product URL:", url);
        const handle = productUrlHandle(url);
        console.log("Extracted product handle:", handle);
        const matchedProduct = findProductInPoolByHandle(fallback, handle)
          || fallback.find(product => normalizeProductUrl(product.url) === normalizeProductUrl(url) || normalizeProductUrl(product.onlineStoreUrl) === normalizeProductUrl(url));
        if (matchedProduct) {
          console.log("Specific product resolved from pool:", matchedProduct);
          specific.push(productFromUrl(url, index, matchedProduct));
          continue;
        }
        try {
          const fetched = handle ? await fetchSpecificProduct(url, index, handle) : null;
          if (fetched) {
            specific.push(fetched);
          } else {
            specific.push(productFromUrl(url, index));
          }
        } catch (error) {
          console.log("Specific product resolved from Shopify .js:", null);
          specific.push(productFromUrl(url, index));
        }
      }
      return dedupeProductList(specific.concat(fallback)).slice(0, PRODUCT_POOL_LIMIT);
    }
    loadProducts().then(next => { if (alive) setProducts(next); });
    return () => { alive = false; };
  }, [selected?.idx]);
  return products;
}

function formatPlayCount(count) { const value = Math.max(0, Number(count) || 0); return `${value} ${value === 1 ? 'play' : 'plays'}`; }
function formatShareCount(count) { const value = Math.max(0, Number(count) || 0); return `${value} ${value === 1 ? 'share' : 'shares'}`; }
function formatPlayerPlayCount(count) { const value = Math.max(0, Number(count) || 0); return `${value} ${value === 1 ? 'Play' : 'Plays'}`; }
function formatPlayerShareText(count) { const value = Math.max(0, Number(count) || 0); return value ? `Share ${value}` : 'Share'; }
function formatTime(seconds) { const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0; const minutes = Math.floor(safe / 60); const secs = Math.floor(safe % 60).toString().padStart(2, '0'); return `${minutes}:${secs}`; }
function formatTrackCount(trackCount, isLoading) { if (isLoading) return 'LOADING TRACKS'; return `${trackCount} ${trackCount === 1 ? 'TRACK' : 'TRACKS'}`; }
function filterLabel(value) { return value === 'ALL' ? 'All' : value; }
function albumMatches(trackAlbum, selectedAlbum) { if (selectedAlbum === 'ALL') return true; const a = clean(trackAlbum).toLowerCase(); const b = selectedAlbum.toLowerCase(); return a === b || a.includes(b); }
function artistMatches(trackArtist, selectedArtist) { return selectedArtist === 'ALL' || clean(trackArtist).toLowerCase() === clean(selectedArtist).toLowerCase(); }
function buildArtistFilters(tracks) {
  const counts = new Map();
  tracks.forEach(track => {
    const artist = clean(track.artist) || 'Stashbox';
    counts.set(artist, (counts.get(artist) || 0) + 1);
  });
  const pinned = ['Stashbox', 'The Ras Box'].filter(name => counts.has(name));
  const pinnedKeys = new Set(pinned.map(name => name.toLowerCase()));
  const others = [...counts.entries()]
    .filter(([artist]) => !pinnedKeys.has(artist.toLowerCase()))
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  return ['ALL', ...pinned, ...others.map(([artist]) => artist)];
}


function normalizeSortText(value) { return clean(value).toLowerCase(); }
function compareText(a, b) { return normalizeSortText(a).localeCompare(normalizeSortText(b), undefined, { sensitivity: 'base' }); }
function getSongTitle(song) { return clean(song?.title || song?.display_title || song?.song_name || song?.raw?.display_title || song?.raw?.song_name || UNTITLED_STASHBOX_TRACK); }
function getSongGenre(song) { return clean(song?.genre || song?.raw?.genre || song?.raw?.primary_genre || song?.sectionKey || 'Other'); }
function getSongArtist(song) { return clean(song?.artist || song?.raw?.artist || song?.raw?.artist_name || song?.raw?.band || 'Stashbox'); }
function getSongPlays(song, playCounts = {}) {
  const counted = playCounts?.[song?.songKey];
  if (counted !== undefined && counted !== null) return Number(counted || 0);
  return Number((firstDefined(song, ['total_plays', 'play_starts', 'full_play_count', 'totalPlays', 'fullPlayCount']) || firstDefined(song?.raw, ['total_plays', 'play_starts', 'full_play_count', 'plays', 'play_count', 'full_plays'])) || 0);
}
function getSongLikes(song, likeCounts = {}) {
  const counted = likeCounts?.[song?.songKey];
  if (counted !== undefined && counted !== null) return Number(counted || 0);
  return Number((firstDefined(song, ['likes', 'like_count', 'total_likes']) || firstDefined(song?.raw, ['likes', 'like_count', 'total_likes'])) || 0);
}
function getSongShares(song, shareCounts = {}) {
  const counted = shareCounts?.[song?.songKey];
  if (counted !== undefined && counted !== null) return Number(counted || 0);
  return Number((firstDefined(song, ['shares', 'share_count', 'total_shares']) || firstDefined(song?.raw, ['shares', 'share_count', 'total_shares'])) || 0);
}
function getSongEngagement(song, counts = {}) {
  return Number(getSongLikes(song, counts.likeCounts) || 0)
    + Number(getSongShares(song, counts.shareCounts) || 0)
    + Number((song?.video_clicks || song?.videoClicks || song?.raw?.video_clicks || song?.raw?.video_click_count || song?.raw?.total_video_clicks) || 0)
    + Number((song?.product_clicks || song?.productClicks || song?.raw?.product_clicks || song?.raw?.product_click_count || song?.raw?.total_product_clicks) || 0);
}
function newestSongDate(song) {
  const value = clean(song?.created_at || song?.createdAt || song?.raw?.created_at) || clean(song?.updated_at || song?.updatedAt || song?.raw?.updated_at);
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
function genreRank(genreName) { return normalizeSortText(genreName) === 'reggae' ? '0' : `1-${normalizeSortText(genreName)}`; }
function artistRank(artistName) {
  const normalized = normalizeSortText(artistName);
  if (normalized === 'stashbox') return '0';
  if (normalized === 'the ras box') return '1';
  return `2-${normalized}`;
}
function sortSongs(songs, sortKey = 'latest', counts = {}) {
  const originalOrder = new Map(songs.map((song, index) => [song.idx, index]));
  const ordered = [...songs];
  const stable = (a, b, result) => result || ((originalOrder.get(a.idx) ?? 0) - (originalOrder.get(b.idx) ?? 0));

  ordered.sort((a, b) => {
    if (sortKey === 'most-played') return stable(a, b, Number(getSongPlays(b, counts.playCounts) || 0) - Number(getSongPlays(a, counts.playCounts) || 0));
    if (sortKey === 'most-liked') return stable(a, b, Number(getSongLikes(b, counts.likeCounts) || 0) - Number(getSongLikes(a, counts.likeCounts) || 0));
    if (sortKey === 'genre') return stable(a, b, compareText(genreRank(getSongGenre(a)), genreRank(getSongGenre(b))) || compareText(getSongTitle(a), getSongTitle(b)));
    if (sortKey === 'most-shared') return stable(a, b, Number(getSongShares(b, counts.shareCounts) || 0) - Number(getSongShares(a, counts.shareCounts) || 0));
    if (sortKey === 'most-engaged') return stable(a, b, Number(getSongEngagement(b, counts) || 0) - Number(getSongEngagement(a, counts) || 0));
    if (sortKey === 'videos-first') return stable(a, b, Number(Boolean(b?.videoLink || b?.hasVideo)) - Number(Boolean(a?.videoLink || a?.hasVideo)) || compareText(getSongTitle(a), getSongTitle(b)));
    if (sortKey === 'artist') return stable(a, b, compareText(artistRank(getSongArtist(a)), artistRank(getSongArtist(b))) || compareText(getSongTitle(a), getSongTitle(b)));
    const dateDelta = newestSongDate(b) - newestSongDate(a);
    return stable(a, b, dateDelta);
  });

  return ordered;
}

function SortControl({ sortKey, onSortChange }) {
  return h('label', { className: 'sort-control' },
    h('span', { className: 'sort-control-label' }, 'Sort by'),
    h('select', { className: 'sort-select', value: sortKey, onChange: event => onSortChange(event.target.value), 'aria-label': 'Sort songs by' },
      SORT_OPTIONS.map(option => h('option', { key: option.key, value: option.key }, option.label))
    )
  );
}

function getInitialSongViewMode() {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === 'visual' ? 'visual' : 'list';
  } catch (_) {
    return 'list';
  }
}

function SongViewToggle({ viewMode, onViewModeChange }) {
  const modes = [
    { key: 'list', label: 'List view', icon: h(ListViewIcon) },
    { key: 'visual', label: 'Visual view', icon: h(VisualViewIcon) }
  ];
  return h('div', { className: 'view-toggle', role: 'group', 'aria-label': 'Song card view' },
    modes.map(mode => h('button', {
      key: mode.key,
      type: 'button',
      className: `view-toggle-button ${viewMode === mode.key ? 'active' : ''}`,
      'aria-label': mode.label,
      'aria-pressed': viewMode === mode.key,
      title: mode.label,
      onClick: () => onViewModeChange(mode.key)
    }, mode.icon))
  );
}

function ListViewIcon() {
  return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' },
    h('path', { d: 'M8 6h13M8 12h13M8 18h13' }),
    h('path', { d: 'M3 6h.01M3 12h.01M3 18h.01' })
  );
}

function VisualViewIcon() {
  return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' },
    h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
    h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
    h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
    h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 })
  );
}

function getShareUrl(song) { const shareUrl = new URL(window.location.href); shareUrl.searchParams.set('song', song?.songKey || song?.idx || ''); shareUrl.hash = ''; return shareUrl.toString(); }
async function copyTextToClipboard(text) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text); const input = document.createElement('textarea'); input.value = text; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove(); }

function RadioControlBar({ trackCount, isLoading = false, query, onQueryChange, genre, onGenreChange, album, onAlbumChange, artist, onArtistChange, artistFilters = ['ALL'], videoOnly = false, onToggleVideos, onShuffle, disableVideoFilter = false, disableShuffle = false }) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileFiltersClosing, setMobileFiltersClosing] = useState(false);
  const closeFiltersTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchToggleRef = useRef(null);

  const closeMobileSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setMobileSearchOpen(false);
  }, []);
  const isMobileSearchViewport = useCallback(() => window.matchMedia('(max-width: 767px)').matches, []);

  useEffect(() => {
    if (mobileSearchOpen) searchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => () => {
    if (closeFiltersTimerRef.current) window.clearTimeout(closeFiltersTimerRef.current);
  }, []);

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;

    const handleOutsidePointerDown = event => {
      if (!isMobileSearchViewport()) return;
      const target = event.target;
      if (searchPanelRef.current?.contains(target) || searchToggleRef.current?.contains(target)) return;
      closeMobileSearch();
    };

    const handleEscapeKey = event => {
      if (!isMobileSearchViewport() || event.key !== 'Escape') return;
      closeMobileSearch();
      searchToggleRef.current?.focus();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [closeMobileSearch, isMobileSearchViewport, mobileSearchOpen]);

  const openMobileSearch = event => {
    event.stopPropagation();
    setMobileSearchOpen(true);
  };

  const toggleMobileFilters = () => {
    if (closeFiltersTimerRef.current) {
      window.clearTimeout(closeFiltersTimerRef.current);
      closeFiltersTimerRef.current = null;
    }

    if (mobileFiltersOpen) {
      setMobileFiltersOpen(false);
      setMobileFiltersClosing(true);
      closeFiltersTimerRef.current = window.setTimeout(() => {
        setMobileFiltersClosing(false);
        closeFiltersTimerRef.current = null;
      }, 240);
    } else {
      setMobileFiltersClosing(false);
      setMobileFiltersOpen(true);
    }
  };

  const filtersAreActive = genre !== 'ALL' || album !== 'ALL' || artist !== 'ALL' || videoOnly;
  const mobileFiltersLabel = filtersAreActive ? 'Filters •' : 'Filters';

  return h('nav', { className: `radio-control-bar ${mobileSearchOpen ? 'mobile-search-is-open' : ''} ${mobileFiltersOpen ? 'mobile-filters-is-open' : ''}`, 'aria-label': 'Stashbox radio filters' },
    h('div', { className: 'radio-control-scroll' },
      h('div', { className: 'radio-control-brand' },
        h('div', { className: 'radio-control-brand-copy' },
          h('a', { className: 'radio-control-logo', href: '/radio/dev/', 'aria-label': 'Stashbox Radio RDS Dev' }, 'STASHBOX'),
          h('span', { className: 'radio-control-count', 'aria-live': 'polite' }, formatTrackCount(trackCount, isLoading))
        ),
        h('div', { className: 'radio-mobile-actions' },
          h('button', { className: `mobile-filters-toggle ${filtersAreActive ? 'active' : ''}`, type: 'button', onClick: toggleMobileFilters, disabled: isLoading, 'aria-expanded': mobileFiltersOpen, 'aria-controls': 'mobileFilterPanel' }, mobileFiltersLabel),
          h('button', { ref: searchToggleRef, className: `mobile-search-toggle ${query ? 'active' : ''}`, type: 'button', onPointerDown: event => event.stopPropagation(), onClick: openMobileSearch, disabled: isLoading, 'aria-label': 'Open song search', 'aria-expanded': mobileSearchOpen }, '🔍')
        )
      ),
      h('div', { id: 'mobileFilterPanel', className: `mobile-filter-panel ${mobileFiltersOpen ? 'is-open' : ''} ${mobileFiltersClosing ? 'is-closing' : ''}` },
        h('div', { className: 'radio-filter-row genre-filter-row', 'aria-label': 'Genre filters' }, GENRE_FILTERS.map(filter => h('button', { key: `genre-${filter}`, className: `radio-filter-pill ${genre === filter ? 'active' : ''}`, type: 'button', onClick: () => onGenreChange(filter), disabled: isLoading, 'aria-pressed': genre === filter }, filterLabel(filter)))),
        h('div', { className: 'radio-filter-row album-filter-row', 'aria-label': 'Album filters' }, h('span', { className: 'radio-filter-label' }, 'Album'), ALBUM_FILTERS.map(filter => h('button', { key: `album-${filter}`, className: `radio-filter-pill ${album === filter ? 'active' : ''}`, type: 'button', onClick: () => onAlbumChange(filter), disabled: isLoading, 'aria-pressed': album === filter }, filterLabel(filter)))),
        h('div', { className: 'radio-filter-row artist-filter-row', 'aria-label': 'Artist filters' }, artistFilters.map(filter => h('button', { key: `artist-${filter}`, className: `radio-filter-pill ${artist === filter ? 'active' : ''}`, type: 'button', onClick: () => onArtistChange(filter), disabled: isLoading, 'aria-pressed': artist === filter }, filterLabel(filter)))),
        h('div', { className: 'mobile-filter-actions', 'aria-label': 'Radio quick actions' },
          h('button', { className: `button video-filter-button ${videoOnly ? 'active' : ''}`, type: 'button', onClick: onToggleVideos, disabled: disableVideoFilter, 'aria-pressed': videoOnly }, 'Songs with Videos'),
          h('button', { className: 'button accent', type: 'button', onClick: onShuffle, disabled: disableShuffle }, 'Shuffle All')
        )
      ),
      h('div', { ref: searchPanelRef, className: `radio-control-search mobile-search-panel ${mobileSearchOpen ? 'open' : ''}`, onPointerDown: event => event.stopPropagation() },
        h('input', { ref: searchInputRef, className: 'radio-top-search', type: 'search', placeholder: 'Search...', value: query, onChange: event => onQueryChange(event.target.value), disabled: isLoading, 'aria-label': 'Search songs' }),
        h('button', { className: 'mobile-search-close', type: 'button', onClick: closeMobileSearch, 'aria-label': 'Close song search' }, '×')
      )
    )
  );
}

function RadioHeader({ videoOnly = false, onToggleVideos, onShuffle, disableVideoFilter = false, disableShuffle = false }) {
  return h('header', { className: 'page-heading radio-hero-header' },
    h('p', { className: 'page-subtitle mobile-hide-hero' }, 'Listen. Watch. Shop. Share.'),
    h('div', { className: 'radio-title-row' },
      h('h1', { className: 'mobile-hide-hero' }, 'STASHBOX RADIO'),
      h('div', { className: 'radio-title-actions mobile-outside-actions', 'aria-label': 'Radio quick actions' },
        h('button', { className: `button video-filter-button ${videoOnly ? 'active' : ''}`, type: 'button', onClick: onToggleVideos, disabled: disableVideoFilter, 'aria-pressed': videoOnly }, 'Songs with Videos'),
        h('button', { className: 'button accent', type: 'button', onClick: onShuffle, disabled: disableShuffle }, 'Shuffle All')
      )
    )
  );
}

function App() {
  const sessionId = useMemo(getBrowserSessionId, []);
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [album, setAlbum] = useState('ALL');
  const [artist, setArtist] = useState('ALL');
  const [videoOnly, setVideoOnly] = useState(false);
  const [sortKey, setSortKey] = useState('latest');
  const [songViewMode, setSongViewMode] = useState(getInitialSongViewMode);
  const [mediaMode, setMediaMode] = useState('idle');
  const [activeVideoEmbedUrl, setActiveVideoEmbedUrl] = useState('');
  const [likeCounts, setLikeCounts] = useState({});
  const [playCounts, setPlayCounts] = useState({});
  const [shareCounts, setShareCounts] = useState({});
  const [likedSongIds, setLikedSongIds] = useState(() => new Set());
  const [copiedSongId, setCopiedSongId] = useState(null);
  const [shuffleOrder, setShuffleOrder] = useState([]);
  const [shuffleActive, setShuffleActive] = useState(false);
  const [autoPlayRequest, setAutoPlayRequest] = useState(null);
  const [playerMessage, setPlayerMessage] = useState('');
  const selectedRef = useRef(null);
  const playbackRef = useRef({ currentSongKey: null, startedAt: 0, hasStarted: false, secondsPlayed: 0, duration: 0, hasCompleted: false, mode: 'idle' });
  const currentPlayInstanceRef = useRef(null);
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const hasHandledVideoEndRef = useRef(false);
  const mediaIsPlayingRef = useRef(false);
  const videoCleanupInProgressRef = useRef(false);
  const products = useProducts(selected);

  const selectedSong = selected || tracks[0] || null;
  useEffect(() => {
    selectedRef.current = selectedSong;
    if (!selectedSong) return;
    console.log('[Stashbox Radio Dev] selectedSong', selectedSong);
    console.log("Counts loaded from API", {
      song_key: selectedSong.song_key,
      total_plays: selectedSong.total_plays,
      likes: selectedSong.likes,
      shares: selectedSong.shares
    });
    setLikeCounts(prev => ({ ...prev, [selectedSong.songKey]: selectedSong.likes || 0 }));
    setPlayCounts(prev => ({ ...prev, [selectedSong.songKey]: selectedSong.total_plays || 0 }));
    setShareCounts(prev => ({ ...prev, [selectedSong.songKey]: selectedSong.shares || 0 }));
  }, [selectedSong]);

  useEffect(() => {
    if (!selectedSong?.songKey) {
      currentPlayInstanceRef.current = null;
      return;
    }
    currentPlayInstanceRef.current = {
      songKey: selectedSong.songKey,
      instanceId: `${selectedSong.songKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      listenedSeconds: 0,
      playStartSent: false,
      lastTickAt: null,
      isPlaying: false
    };
  }, [selectedSong?.idx, selectedSong?.songKey]);
  useEffect(() => { console.log('[Stashbox Radio Dev] mediaMode', mediaMode); }, [mediaMode]);
  useEffect(() => { console.log('[Stashbox Radio Dev] activeVideoEmbedUrl', activeVideoEmbedUrl); }, [activeVideoEmbedUrl]);
  useEffect(() => { hasHandledVideoEndRef.current = false; }, [selectedSong?.idx, activeVideoEmbedUrl]);
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    };
  }, [selectedSong?.idx]);

  useEffect(() => {
    let alive = true;
    fetchRadioSongs().then(nextTracks => {
      if (!alive) return;
      setTracks(nextTracks);
      setLikeCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, track.likes || 0])));
      setPlayCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, track.total_plays || 0])));
      setShareCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, track.shares || 0])));
      console.log('[Stashbox Radio Dev] count values loaded from API', nextTracks.map(track => ({ song_key: track.songKey, title: track.title, total_plays: track.total_plays, full_play_count: track.full_play_count, partial_play_count: track.partial_play_count, skip_count: track.skip_count, likes: track.likes, shares: track.shares, share_link_visits: track.share_link_visits, video_clicks: track.video_clicks, product_clicks: track.product_clicks })));
      const urlSelectedSong = songKeyFromUrl
        ? nextTracks.find(track => track.song_key === songKeyFromUrl)
        : null;
      if (songKeyFromUrl) {
        console.log("Opening song from URL:", songKeyFromUrl);
      }
      setSelected(current => current || urlSelectedSong || nextTracks[0] || null);
      setStatus('ready');
    }).catch(loadError => {
      if (!alive) return;
      setError({
        endpoint: loadError.endpoint || SONGS_API_URL,
        message: loadError.apiError || loadError.message || 'Unable to load songs from the RDS API.',
        responseOkFailed: Boolean(loadError.responseOkFailed)
      });
      setStatus('error');
    });
    return () => { alive = false; };
  }, []);

  const artistFilters = useMemo(() => buildArtistFilters(tracks), [tracks]);

  const filtered = useMemo(() => tracks.filter(track => {
    const q = query.trim().toLowerCase();
    const queryMatch = !q || [track.title, track.artist, track.album, track.genre, track.publicTrackNote].some(value => clean(value).toLowerCase().includes(q));
    return queryMatch && (genre === 'ALL' || track.sectionKey === genre) && albumMatches(track.album, album) && artistMatches(track.artist, artist) && (!videoOnly || track.hasVideo);
  }), [tracks, query, genre, album, artist, videoOnly]);

  const sortedFiltered = useMemo(() => sortSongs(filtered, sortKey, { likeCounts, playCounts, shareCounts }), [filtered, sortKey, likeCounts, playCounts, shareCounts]);

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, songViewMode); } catch (_) {}
  }, [songViewMode]);

  const playableFiltered = useMemo(() => sortedFiltered.filter(canPlayTrack), [sortedFiltered]);
  const playbackList = useMemo(() => {
    if (!shuffleActive) return playableFiltered;
    const byIdx = new Map(playableFiltered.map(track => [track.idx, track]));
    const ordered = shuffleOrder.map(idx => byIdx.get(idx)).filter(Boolean);
    const orderedIds = new Set(ordered.map(track => track.idx));
    return ordered.concat(playableFiltered.filter(track => !orderedIds.has(track.idx)));
  }, [playableFiltered, shuffleActive, shuffleOrder]);

  const grouped = useMemo(() => sortedFiltered.reduce((groups, track) => { const key = track.sectionKey || 'Other'; (groups[key] ||= []).push(track); return groups; }, {}), [sortedFiltered]);

  const sendQualifiedPlayStart = useCallback((song, instance) => {
    // play_start is delayed until 10 seconds of actual playback to avoid inflated play counts from pause/resume.
    if (!song || !instance || instance.playStartSent || instance.songKey !== song.songKey) return;
    instance.playStartSent = true;
    sendTrackingEvent(song, 'play_start', sessionId).then(result => {
      if (result?.response?.ok) setPlayCounts(prev => ({ ...prev, [song.songKey]: (prev[song.songKey] ?? song.total_plays ?? 0) + 1 }));
    });
  }, [sessionId]);

  const accumulateQualifiedPlayback = useCallback((song) => {
    const instance = currentPlayInstanceRef.current;
    if (!song || !instance || instance.songKey !== song.songKey || !instance.isPlaying) return;
    const now = Date.now();
    if (instance.lastTickAt) {
      const elapsed = Math.max(0, (now - instance.lastTickAt) / 1000);
      instance.listenedSeconds += Math.min(elapsed, 2);
    }
    instance.lastTickAt = now;
    if (!instance.playStartSent && instance.listenedSeconds >= QUALIFIED_PLAY_SECONDS) {
      sendQualifiedPlayStart(song, instance);
    }
  }, [sendQualifiedPlayStart]);

  const pauseQualifiedPlayback = useCallback((song) => {
    accumulateQualifiedPlayback(song);
    const instance = currentPlayInstanceRef.current;
    if (!song || !instance || instance.songKey !== song.songKey) return;
    instance.isPlaying = false;
    instance.lastTickAt = null;
  }, [accumulateQualifiedPlayback]);

  const trackPlaybackStart = useCallback((song, mode = 'audio') => {
    if (!song) return;
    const state = playbackRef.current;
    if (!(state.hasStarted && state.currentSongKey === song.songKey && state.mode === mode)) {
      playbackRef.current = { currentSongKey: song.songKey, startedAt: Date.now(), hasStarted: true, secondsPlayed: 0, duration: 0, hasCompleted: false, mode };
    }
    const instance = currentPlayInstanceRef.current;
    if (instance?.songKey === song.songKey) {
      instance.isPlaying = true;
      instance.lastTickAt = null;
    }
  }, []);

  const updatePlaybackPosition = useCallback((secondsPlayed, duration) => {
    const state = playbackRef.current;
    const song = selectedRef.current;
    if (state.hasStarted) {
      playbackRef.current = { ...state, secondsPlayed: Math.max(state.secondsPlayed || 0, Number(secondsPlayed) || 0), duration: Number(duration) || state.duration || 0 };
    }
    accumulateQualifiedPlayback(song);
  }, [accumulateQualifiedPlayback]);

  const finishPlayback = useCallback((eventType = 'play_partial', forcedSong = null) => {
    const state = playbackRef.current;
    const song = forcedSong || selectedRef.current;
    pauseQualifiedPlayback(song);
    if (!state.hasStarted || state.hasCompleted || !song || state.currentSongKey !== song.songKey) return;
    const elapsed = state.mode === 'video' ? Math.max(state.secondsPlayed || 0, (Date.now() - state.startedAt) / 1000) : (state.secondsPlayed || 0);
    const duration = state.duration || 0;
    const full = eventType === 'play_full' || (duration && elapsed / duration >= COMPLETION_THRESHOLD);
    const finalType = full ? 'play_full' : eventType;
    playbackRef.current = { ...state, hasCompleted: true, hasStarted: false, secondsPlayed: elapsed, duration };
    if (finalType === 'play_partial' && elapsed < MIN_PARTIAL_SECONDS) return;
    const completion = duration ? Math.min(100, Math.round((elapsed / duration) * 100)) : undefined;
    sendTrackingEvent(song, finalType, sessionId, { seconds_played: Math.round(elapsed), completion_percent: completion });
  }, [sessionId, pauseQualifiedPlayback]);

  useEffect(() => {
    const flush = () => finishPlayback('play_partial');
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); flush(); };
  }, [finishPlayback]);

  // Always tear down active video before changing songs so stale YouTube iframe state cannot hide or break the player shell.
  function resetVideoPlaybackBeforeSongSwitch(nextSong = null) {
    const playerShell = playerRef.current;
    const audio = audioRef.current;
    const youtubePlayer = youtubePlayerRef.current;
    const youtubeIframes = Array.from(playerShell?.querySelectorAll?.('iframe[src*="youtube"], iframe[src*="youtu.be"]') || []);
    const directVideo = playerShell?.querySelector?.('video') || null;

    console.log('[radio-dev] current playback mode before switch:', mediaMode);
    console.log('[radio-dev] selected song title:', nextSong?.title);
    console.log('[radio-dev] youtube iframe exists before switch:', Boolean(youtubeIframes.length));
    console.log('[radio-dev] youtube player object exists before switch:', Boolean(youtubePlayer));
    console.log('[radio-dev] audio currently playing before switch:', Boolean(audio && !audio.paused && !audio.ended));

    if (mediaMode !== 'video' && !youtubePlayer && !youtubeIframes.length && !directVideo) return;

    videoCleanupInProgressRef.current = true;
    console.log('[radio-dev] resetting video mode');

    try {
      if (typeof youtubePlayer?.stopVideo === 'function') youtubePlayer.stopVideo();
    } catch (error) {
      console.warn('[radio-dev] youtube stopVideo failed:', error.message || error);
    }

    try {
      if (typeof youtubePlayer?.pauseVideo === 'function') youtubePlayer.pauseVideo();
    } catch (error) {
      console.warn('[radio-dev] youtube pauseVideo failed:', error.message || error);
    }

    try {
      if (typeof youtubePlayer?.destroy === 'function') youtubePlayer.destroy();
    } catch (error) {
      console.warn('[radio-dev] youtube destroy failed:', error.message || error);
    }

    try {
      if (directVideo) {
        directVideo.pause?.();
        directVideo.removeAttribute('src');
        directVideo.load?.();
      }
    } catch (error) {
      console.warn('[radio-dev] direct video cleanup failed:', error.message || error);
    }

    try {
      youtubeIframes.forEach(iframe => {
        try { iframe.src = ''; } catch (_) {}
        iframe.remove();
      });
    } catch (error) {
      console.warn('[radio-dev] iframe cleanup failed:', error.message || error);
    }

    youtubePlayerRef.current = null;
    mediaIsPlayingRef.current = false;
    setActiveVideoEmbedUrl('');
    setMediaMode('idle');
    setAutoPlayRequest(null);
    document.body.classList.remove('video-active', 'is-video-playing');

    console.log('[radio-dev] video reset complete');
  }

  function selectTrack(track, { autoStart = false, preferVideo = false } = {}) {
    if (!track) return;
    resetVideoPlaybackBeforeSongSwitch(track);
    console.log('[radio-dev] rendering selected song:', track?.title);
    const shouldStartVideo = Boolean(autoStart && preferVideo && track.hasVideo);
    const embedUrl = shouldStartVideo ? youtubeEmbed(track.videoLink) : '';
    setPlayerMessage('');
    setSelected(track);
    setMediaMode(embedUrl ? 'video' : 'idle');
    setActiveVideoEmbedUrl(embedUrl);
    setAutoPlayRequest(autoStart ? { idx: track.idx, requestedAt: Date.now(), preferVideo: shouldStartVideo } : null);
    window.requestAnimationFrame(() => {
      videoCleanupInProgressRef.current = false;
      playerRef.current?.focus?.();
      console.log('[radio-dev] selected song render finished:', track?.title);
    });
  }

  function playSelectedSongAudioFromCardTap(track) {
    if (!track) return;
    const audio = audioRef.current;
    const hasPlayableAudio = track.hasAudio && has(track.audioUrl) && !isVideoOnlyTrack(track);

    if (!hasPlayableAudio) {
      setAutoPlayRequest(null);
      setPlayerMessage(track.hasVideo ? 'Video-only track selected. Tap the main play button to start the video.' : 'No audio URL is available for this track.');
      window.requestAnimationFrame(() => {
        videoCleanupInProgressRef.current = false;
        playerRef.current?.focus?.();
      });
      return;
    }

    if (!audio) {
      console.warn('[radio-dev] Audio element was not ready after song card tap:', track.title);
      window.requestAnimationFrame(() => {
        videoCleanupInProgressRef.current = false;
        playerRef.current?.focus?.();
      });
      return;
    }

    try { audio.pause(); } catch (_) {}
    try { audio.currentTime = 0; } catch (_) {}
    try { audio.load?.(); } catch (_) {}

    console.log('[Stashbox Radio Dev] audio_url being played from song card tap', track.audioUrl);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(error => {
        console.warn('[radio-dev] Audio play failed after song card tap:', error.message || error);
      });
    }

    window.requestAnimationFrame(() => {
      videoCleanupInProgressRef.current = false;
      playerRef.current?.focus?.();
      console.log('[radio-dev] selected song render finished:', track?.title);
    });
  }

  function chooseSong(track) {
    console.log('[radio-dev] song selected:', track?.title);
    if (!track) return;
    finishPlayback('play_partial');
    resetVideoPlaybackBeforeSongSwitch(track);

    const currentAudio = audioRef.current;
    if (currentAudio) {
      try { currentAudio.pause(); } catch (error) { console.warn('[radio-dev] Unable to pause current audio before song card tap:', error.message || error); }
      try { currentAudio.currentTime = 0; } catch (_) {}
    }

    flushSync(() => {
      setPlayerMessage('');
      setSelected(track);
      setMediaMode('idle');
      setActiveVideoEmbedUrl('');
      setAutoPlayRequest(null);
    });

    playSelectedSongAudioFromCardTap(track);
  }

  function resolveAdjacentPlayableSong(direction, song = selectedSong, { allowWrap = true } = {}) {
    if (!playbackList.length) return null;
    if (playbackList.length === 1) {
      return playbackList[0].idx === song?.idx ? null : playbackList[0];
    }
    const currentIndex = playbackList.findIndex(track => track.idx === song?.idx);
    const startIndex = currentIndex >= 0 ? currentIndex : (direction > 0 ? -1 : playbackList.length);
    for (let step = 1; step <= playbackList.length; step += 1) {
      const candidateIndex = startIndex + (direction * step);
      if (!allowWrap && (candidateIndex < 0 || candidateIndex >= playbackList.length)) return null;
      const next = playbackList[((candidateIndex % playbackList.length) + playbackList.length) % playbackList.length];
      if (next && next.idx !== song?.idx) return next;
    }
    return null;
  }

  function shiftTrack(direction, { autoStart = false, finishType = 'play_partial', forcedSong = null } = {}) {
    if (!playbackList.length) return;
    const next = resolveAdjacentPlayableSong(direction, forcedSong || selectedSong);
    if (!next) return;
    finishPlayback(finishType, forcedSong);
    selectTrack(next, { autoStart });
  }

  function safelyCleanupYouTubeBeforeNext(nextSong = null) {
    resetVideoPlaybackBeforeSongSwitch(nextSong);
  }

  function handleManualNext() {
    const currentSong = selectedSong;
    console.log("Manual next clicked while mediaMode:", mediaMode);
    console.log("Current video song:", currentSong?.song_key);
    const nextSong = resolveAdjacentPlayableSong(1, currentSong);
    console.log("Resolved next song before cleanup:", nextSong?.song_key);
    const audio = audioRef.current;
    const audioWasPlaying = Boolean(audio && !audio.paused && !audio.ended);
    const videoWasPlaying = mediaMode === 'video' && mediaIsPlayingRef.current;
    const wasPlaying = audioWasPlaying || videoWasPlaying;
    console.log("Was playing before next:", wasPlaying);

    if (!nextSong) {
      setPlayerMessage('No next playable song is available.');
      console.log("Player shell should stay mounted");
      window.requestAnimationFrame(() => playerRef.current?.focus?.());
      return;
    }

    if (audio) {
      try { audio.pause(); } catch (error) { console.warn('Unable to pause current audio safely before manual next.', error.message || error); }
      try { audio.currentTime = 0; } catch (_) {}
    }

    if (mediaMode === 'video') safelyCleanupYouTubeBeforeNext(nextSong);

    if (currentSong) sendTrackingEvent(currentSong, 'skip', sessionId);
    finishPlayback('play_partial', currentSong);
    setPlayerMessage('');
    setActiveVideoEmbedUrl('');
    setMediaMode('idle');
    setSelected(nextSong);
    setAutoPlayRequest(wasPlaying ? { idx: nextSong.idx, requestedAt: Date.now(), preferVideo: false } : null);
    console.log("Selected next song after video cleanup:", nextSong?.song_key);
    console.log("Player shell should stay mounted");
    window.requestAnimationFrame(() => {
      videoCleanupInProgressRef.current = false;
      playerRef.current?.focus?.();
      console.log('[radio-dev] selected song render finished:', nextSong?.title);
    });
  }

  function handleVideoEnded(song = selectedSong, { preferVideo = true } = {}) {
    const endedSong = song || selectedRef.current;
    if (hasHandledVideoEndRef.current) return;
    hasHandledVideoEndRef.current = true;
    console.log("Video ended for:", endedSong?.song_key);
    finishPlayback('play_full', endedSong);
    const currentIndex = playbackList.findIndex(track => track.idx === endedSong?.idx);
    const nextSong = currentIndex >= 0
      ? (playbackList.length > 1 ? playbackList[(currentIndex + 1) % playbackList.length] : null)
      : (playbackList[0] || null);
    console.log("Next song after video end:", nextSong?.song_key);
    setMediaMode('idle');
    setActiveVideoEmbedUrl('');
    if (nextSong) {
      setSelected(nextSong);
      setAutoPlayRequest({ idx: nextSong.idx, requestedAt: Date.now(), preferVideo });
    } else {
      setAutoPlayRequest(null);
    }
    console.log("Keeping player visible after video end");
    window.requestAnimationFrame(() => playerRef.current?.focus?.());
  }

  function handleYouTubeEnded(song = selectedSong) {
    const endedSong = song || selectedRef.current;
    if (hasHandledVideoEndRef.current) return;
    hasHandledVideoEndRef.current = true;
    console.log("YouTube ended without auto-advance for:", endedSong?.song_key);
    finishPlayback('play_full', endedSong);
    setAutoPlayRequest(null);
    window.requestAnimationFrame(() => playerRef.current?.focus?.());
  }

  function autoAdvanceFromEnded(song = selectedSong, { preferVideo = false } = {}) {
    finishPlayback('play_full', song);
    if (!playbackList.length) return;
    const currentIndex = Math.max(0, playbackList.findIndex(track => track.idx === song?.idx));
    const next = playbackList[(currentIndex + 1) % playbackList.length];
    if (!next) return;
    console.log("Next autoplay item:", next.song_key);
    selectTrack(next, { autoStart: true, preferVideo });
  }

  useEffect(() => {
    if (!autoPlayRequest || autoPlayRequest.idx !== selectedSong?.idx) return undefined;
    const shouldPlayVideo = selectedSong?.hasVideo && (autoPlayRequest.preferVideo || selectedSong.videoOnly || !selectedSong.hasAudio);
    if (!shouldPlayVideo) return undefined;
    const startTimer = window.setTimeout(() => {
      const embedUrl = youtubeEmbed(selectedSong.videoLink);
      if (!embedUrl) {
        console.warn('[Stashbox Radio Dev] unable to auto-start next video; keeping player visible', selectedSong.song_key);
        setAutoPlayRequest(null);
        return;
      }
      setActiveVideoEmbedUrl(`${embedUrl}&auto_advance=${Date.now()}`);
      setMediaMode('video');
    }, 0);
    return () => window.clearTimeout(startTimer);
  }, [autoPlayRequest, selectedSong]);

  function pickRandomTrack() {
    if (!playableFiltered.length) return;
    finishPlayback('play_partial');
    const shuffled = [...playableFiltered].sort(() => Math.random() - 0.5);
    const candidates = shuffled.filter(track => track.idx !== selectedSong?.idx);
    const next = candidates[0] || shuffled[0];
    setShuffleOrder(shuffled.map(track => track.idx));
    setShuffleActive(true);
    selectTrack(next);
  }

  function openVideo({ startPlayback = false } = {}) {
    if (!selectedSong?.hasVideo) return;
    const embedUrl = youtubeEmbed(selectedSong.videoLink);
    if (!embedUrl) return;
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    setActiveVideoEmbedUrl(embedUrl);
    setMediaMode('video');
    sendTrackingEvent(selectedSong, 'video_click', sessionId);
    setAutoPlayRequest(startPlayback || selectedSong.videoOnly ? { idx: selectedSong.idx, requestedAt: Date.now() } : null);
  }

  function closeVideo() {
    const currentVideoSong = selectedRef.current || selectedSong;
    if (isVideoOnlyTrack(currentVideoSong)) {
      const embedUrl = currentVideoSong?.hasVideo ? youtubeEmbed(currentVideoSong.videoLink) : '';
      if (embedUrl) setActiveVideoEmbedUrl(current => current || embedUrl);
      setMediaMode('video');
      return;
    }
    finishPlayback('play_partial');

    const player = youtubePlayerRef.current;
    if (player) {
      try {
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
      } catch (error) {
        console.warn('Unable to pause YouTube player safely while closing video.', error.message || error);
      }
      try {
        if (typeof player.destroy === 'function') player.destroy();
      } catch (error) {
        console.warn('Unable to destroy YouTube player safely while closing video.', error.message || error);
      }
      youtubePlayerRef.current = null;
    }

    setActiveVideoEmbedUrl('');
    setMediaMode(selectedSong?.hasAudio ? 'audio' : 'idle');
    setAutoPlayRequest(null);
    window.requestAnimationFrame(() => playerRef.current?.focus?.());
  }

  function likeSong(song) {
    if (!song || likedSongIds.has(song.songKey)) return;
    sendTrackingEvent(song, 'like', sessionId).then(result => {
      if (!result?.response?.ok) return;
      setLikedSongIds(prev => new Set(prev).add(song.songKey));
      setLikeCounts(prev => ({ ...prev, [song.songKey]: (prev[song.songKey] ?? song.likes ?? 0) + 1 }));
    });
  }

  async function shareSong(song) {
    if (!song) return;
    const shareUrl = getShareUrl(song);
    const shareData = { title: `${song.title} · Stashbox Radio`, text: song.publicTrackNote || `Listen to ${song.title} on Stashbox Radio.`, url: shareUrl };
    sendTrackingEvent(song, 'share', sessionId).then(result => {
      if (result?.response?.ok) setShareCounts(prev => ({ ...prev, [song.songKey]: (prev[song.songKey] ?? song.shares ?? 0) + 1 }));
    });
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await copyTextToClipboard(shareUrl); setCopiedSongId(song.idx); window.setTimeout(() => setCopiedSongId(current => current === song.idx ? null : current), 1800); }
    } catch (shareError) { if (shareError?.name !== 'AbortError') console.warn('Unable to share song.', shareError.message || shareError); }
  }

  function handleProductClick(product) { sendTrackingEvent(selectedSong, 'product_click', sessionId, { product_url: product?.url || '' }); }

  if (status === 'loading') return h('div', { className: 'radio-app' }, h(RadioControlBar, { trackCount: tracks.length, isLoading: true, query, onQueryChange: setQuery, genre, onGenreChange: setGenre, album, onAlbumChange: setAlbum, artist, onArtistChange: setArtist, artistFilters, videoOnly, onToggleVideos: () => setVideoOnly(current => !current), onShuffle: pickRandomTrack, disableVideoFilter: true, disableShuffle: true }), h(RadioHeader, { disableVideoFilter: true, disableShuffle: true }), h('section', { className: 'loading-shell', 'aria-live': 'polite' }, h('img', { src: '/images/branding/stashbox-logo-transparent-rastacolors.png', alt: 'Stashbox', className: 'loading-logo' }), h('p', null, 'Loading songs from the AWS RDS API…')));
  if (status === 'error') return h('section', { className: 'error', role: 'alert' },
    h('strong', null, 'ERROR'),
    h('p', null, `Endpoint: ${error.endpoint || SONGS_API_URL}`),
    h('p', null, `Error: ${error.message || 'Unable to load songs from the RDS API.'}`),
    h('p', null, `response.ok failed: ${error.responseOkFailed ? 'yes' : 'no'}`),
    h('p', null, 'The production /radio/ page has not been changed.')
  );

  return h('div', { className: 'radio-app' },
    h(RadioControlBar, { trackCount: tracks.length, query, onQueryChange: setQuery, genre, onGenreChange: setGenre, album, onAlbumChange: setAlbum, artist, onArtistChange: setArtist, artistFilters, videoOnly, onToggleVideos: () => setVideoOnly(current => !current), onShuffle: pickRandomTrack, disableVideoFilter: !tracks.some(track => track.hasVideo), disableShuffle: !filtered.length }),
    h(RadioHeader, { videoOnly, onToggleVideos: () => setVideoOnly(current => !current), onShuffle: pickRandomTrack, disableVideoFilter: !tracks.some(track => track.hasVideo), disableShuffle: !filtered.length }),
    h('div', { className: 'radio-interface' },
      h(Player, { selected: selectedSong, audioRef, playerRef, youtubePlayerRef, mediaMode, activeVideoEmbedUrl, openVideo, closeVideo, products, playerMessage, onPrevious: () => shiftTrack(-1), onNext: handleManualNext, onShuffle: pickRandomTrack, onProductClick: handleProductClick, likeCount: likeCounts[selectedSong?.songKey] || 0, playCount: playCounts[selectedSong?.songKey] || 0, shareCount: shareCounts[selectedSong?.songKey] || 0, hasLiked: likedSongIds.has(selectedSong?.songKey), onLike: () => likeSong(selectedSong), onShare: () => shareSong(selectedSong), shareCopied: copiedSongId === selectedSong?.idx, onAudioStart: () => { setMediaMode('audio'); trackPlaybackStart(selectedSong, 'audio'); }, onAudioProgress: updatePlaybackPosition, onAudioPause: () => { pauseQualifiedPlayback(selectedSong); finishPlayback('play_partial'); }, onAudioComplete: () => { pauseQualifiedPlayback(selectedSong); autoAdvanceFromEnded(selectedSong); }, onVideoStart: () => { if (!videoCleanupInProgressRef.current) trackPlaybackStart(selectedSong, 'video'); }, onVideoProgress: updatePlaybackPosition, onVideoComplete: () => { if (videoCleanupInProgressRef.current) return; pauseQualifiedPlayback(selectedSong); handleVideoEnded(selectedSong, { preferVideo: true }); }, onYouTubeEnded: () => { if (videoCleanupInProgressRef.current) return; pauseQualifiedPlayback(selectedSong); handleYouTubeEnded(selectedSong); }, onPlaybackStatusChange: isActive => { mediaIsPlayingRef.current = isActive; if (!isActive) pauseQualifiedPlayback(selectedSong); }, autoPlayRequest }),
      h('main', { className: 'radio-main' },
        h('section', { className: 'list-head' }, h('h2', null, 'Song List'), h('div', { className: 'list-actions' }, h(SortControl, { sortKey, onSortChange: setSortKey }), h('div', { className: 'count' }, `${sortedFiltered.length} of ${tracks.length} tracks`), h(SongViewToggle, { viewMode: songViewMode, onViewModeChange: setSongViewMode }))),
        tracks.length ? (sortedFiltered.length ? h('div', { className: 'sections' }, sortKey === 'genre'
          ? SECTIONS.map(section => grouped[section.key]?.length ? h(SongSection, { key: section.key, section, tracks: grouped[section.key], selected: selectedSong, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike: likeSong, onShare: shareSong, copiedSongId, viewMode: songViewMode }) : null)
          : h(SongSection, { key: 'sorted-songs', section: { key: SORT_OPTIONS.find(option => option.key === sortKey)?.label || 'Songs', emoji: '🎧', color: '#f0a500' }, tracks: sortedFiltered, selected: selectedSong, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike: likeSong, onShare: shareSong, copiedSongId, viewMode: songViewMode })
        ) : h('div', { className: 'empty' }, 'No tracks match this search/filter combination.')) : h('div', { className: 'empty' }, 'No songs were returned by the RDS API yet.')
      )
    )
  );
}

function PlayIcon({ className = 'play-icon' }) { return h('span', { className, 'aria-hidden': true }); }
function PauseIcon() { return h('span', { className: 'pause-icon', 'aria-hidden': true }, h('span', null), h('span', null)); }
function PlayCount({ count }) { return h('span', { className: 'play-count', title: `${Number(count) || 0} recorded plays` }, h(PlayIcon, { className: 'play-count-icon' }), h('span', null, formatPlayCount(count))); }
function ShareCount({ count }) { return h('span', { className: 'share-count', title: `${Number(count) || 0} recorded shares` }, h('span', { 'aria-hidden': true }, '↗'), h('span', null, formatShareCount(count))); }
function ShareButton({ onShare, copied = false, compact = false }) { return h('button', { className: `share-button ${compact ? 'compact' : ''}`, type: 'button', onClick: event => { event.stopPropagation(); onShare?.(); }, 'aria-live': copied ? 'polite' : undefined }, copied ? 'Link copied' : 'Share'); }
function ThumbsUpIcon() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' },
    h('path', { d: 'M7 10v11' }),
    h('path', { d: 'M15 5.5 14 10h5.6a2 2 0 0 1 2 2.3l-1.1 7a2 2 0 0 1-2 1.7H7' }),
    h('path', { d: 'M7 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3' }),
    h('path', { d: 'M14 10V4a2 2 0 0 0-2-2l-5 8' })
  );
}
function LikeButton({ count, active, onLike, compact = false }) { return h('button', { className: `like-button ${active ? 'active' : ''} ${compact ? 'compact' : ''}`, type: 'button', 'aria-label': 'Like this track', title: 'Like this track', 'aria-pressed': active, onClick: event => { event.stopPropagation(); if (!active) onLike?.(); }, disabled: active }, h(ThumbsUpIcon), h('span', null, count || 0)); }
function SongActions({ likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied, compact = false }) { return h('span', { className: `song-actions ${compact ? 'compact' : ''}` }, h(LikeButton, { count: likeCount, active: hasLiked, onLike, compact }), h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'), h(PlayCount, { count: playCount }), h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'), h(ShareCount, { count: shareCount }), h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'), h(ShareButton, { onShare, copied: shareCopied, compact })); }
function PlayerPill({ className = '', children, ...props }) { return h('button', { type: 'button', className: `player-pill ${className}`.trim(), ...props }, children); }

function Player({ selected, audioRef, playerRef, youtubePlayerRef: externalYoutubePlayerRef, mediaMode, activeVideoEmbedUrl, openVideo, closeVideo, products, playerMessage = '', onPrevious, onNext, onShuffle, onProductClick, likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied, onAudioStart, onAudioProgress, onAudioPause, onAudioComplete, onVideoStart, onVideoProgress, onVideoComplete, onYouTubeEnded, onPlaybackStatusChange, autoPlayRequest }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoFrameRef = useRef(null);
  const youtubeMountRef = useRef(null);
  const localYoutubePlayerRef = useRef(null);
  const youtubePlayerRef = externalYoutubePlayerRef || localYoutubePlayerRef;
  const hasHandledVideoEndRef = useRef(false);
  const onVideoStartRef = useRef(onVideoStart);
  const onVideoCompleteRef = useRef(onVideoComplete);
  const onYouTubeEndedRef = useRef(onYouTubeEnded);
  useEffect(() => { onVideoStartRef.current = onVideoStart; }, [onVideoStart]);
  useEffect(() => { onVideoCompleteRef.current = onVideoComplete; }, [onVideoComplete]);
  useEffect(() => { onYouTubeEndedRef.current = onYouTubeEnded; }, [onYouTubeEnded]);
  useEffect(() => { setIsPlaying(false); setIsVideoPlaying(false); setCurrentTime(0); setDuration(0); }, [selected?.idx]);
  useEffect(() => { if (mediaMode !== 'video') setIsVideoPlaying(false); }, [mediaMode]);
  if (!selected) return h('aside', { className: 'panel player player-empty', ref: playerRef }, h('p', null, 'Choose a song to start the preview player.'));
  const section = SECTIONS.find(s => s.key === selected.sectionKey) || SECTIONS[SECTIONS.length - 1];
  const selectedIsVideoOnly = isVideoOnlyTrack(selected);
  const availableVideoEmbedUrl = selected.hasVideo ? youtubeEmbed(selected.videoLink) : '';
  const videoSrc = mediaMode === 'video' ? activeVideoEmbedUrl : '';
  const posterImage = selected.imageUrl || (selectedIsVideoOnly ? youtubeThumbnail(selected.videoLink) : '');
  const hasAudio = selected.hasAudio && has(selected.audioUrl) && !selectedIsVideoOnly;
  const hasVideo = selected.hasVideo && has(availableVideoEmbedUrl);
  const isVideoMode = mediaMode === 'video' && has(videoSrc);
  const directVideo = isVideoMode && isDirectVideoUrl(selected.videoLink);
  const youtubeVideo = isVideoMode && /youtube\.com\/embed/i.test(videoSrc);
  const canUsePrimaryPlay = isVideoMode ? hasVideo : hasAudio || (selectedIsVideoOnly && hasVideo);
  const canCloseVideo = isVideoMode && hasVideo && !selectedIsVideoOnly;
  const canWatchVideo = !isVideoMode && hasVideo && (selected.showWatchVideo || selectedIsVideoOnly);
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const playbackStartMs = useMemo(() => Date.now(), [selected?.idx, mediaMode, activeVideoEmbedUrl]);

  useEffect(() => { onPlaybackStatusChange?.(isVideoMode ? isVideoPlaying : isPlaying); }, [isPlaying, isVideoPlaying, isVideoMode, onPlaybackStatusChange]);

  useEffect(() => {
    if (!autoPlayRequest || autoPlayRequest.idx !== selected?.idx || mediaMode === 'video') return;
    const shouldAutoPlayVideo = selected?.hasVideo && (autoPlayRequest.preferVideo || selected.videoOnly || !selected.hasAudio);
    if (shouldAutoPlayVideo) return;
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    const playTimer = window.setTimeout(() => {
      console.log('[Stashbox Radio Dev] auto-playing next audio_url', selected.audioUrl);
      audio.play().catch(error => console.warn('[radio-dev] playback error: unable to auto-play next audio.', error.message || error));
    }, 0);
    return () => window.clearTimeout(playTimer);
  }, [autoPlayRequest, selected?.idx, selected?.audioUrl, mediaMode, hasAudio, audioRef]);

  useEffect(() => {
    hasHandledVideoEndRef.current = false;
    if (!isVideoMode || !youtubeVideo) return undefined;
    const videoId = getYouTubeId(selected.videoLink);
    if (!videoId) return undefined;
    let disposed = false;
    const destroyYoutubePlayer = () => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      console.log("Destroying YouTube player safely");
      try { player.stopVideo?.(); } catch (error) { console.warn('Unable to stop YouTube player safely.', error.message || error); }
      try {
        if (typeof player.destroy === 'function') player.destroy();
      } catch (error) {
        console.warn('Unable to destroy YouTube player safely.', error.message || error);
      }
      youtubePlayerRef.current = null;
    };
    destroyYoutubePlayer();
    loadYouTubeIframeApi().then(YT => {
      const youtubeMount = youtubeMountRef.current;
      if (disposed || !youtubeMount || !YT?.Player) return;
      const youtubePlayerHost = document.createElement('div');
      youtubeMount.replaceChildren(youtubePlayerHost);
      youtubePlayerRef.current = new YT.Player(youtubePlayerHost, {
        videoId,
        playerVars: youtubePlayerVars({ autoplay: true }),
        events: {
          onReady: event => {
            if (disposed) return;
            event.target?.playVideo?.();
          },
          onStateChange: event => {
            if (disposed) return;
            console.log("YouTube state changed:", event.data);
            const handleVideoEnded = () => {
              if (hasHandledVideoEndRef.current) return;
              hasHandledVideoEndRef.current = true;
              setIsVideoPlaying(false);
              console.log("YouTube ended for:", selected?.song_key);
              try {
                event.target?.stopVideo?.();
              } catch (error) {
                console.warn('Unable to stop YouTube player after ended event safely.', error.message || error);
              }
              try {
                onYouTubeEndedRef.current?.();
              } catch (error) {
                console.warn('Unable to handle YouTube ended event safely.', error.message || error);
              }
            };
            if (event.data === YT.PlayerState.PLAYING || event.data === 1) {
              setIsVideoPlaying(true);
              onVideoStartRef.current?.();
            }
            if (event.data === YT.PlayerState.PAUSED || event.data === 2) setIsVideoPlaying(false);
            if (event.data === YT.PlayerState.ENDED || event.data === 0) handleVideoEnded();
          }
        }
      });
    });
    const progressTimer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      let current = 0;
      let total = 0;
      try { current = Number(player?.getCurrentTime?.()) || (Date.now() - playbackStartMs) / 1000; } catch (_) { current = (Date.now() - playbackStartMs) / 1000; }
      try { total = Number(player?.getDuration?.()) || 0; } catch (_) {}
      onVideoProgress?.(current, total);
    }, 1000);
    return () => {
      disposed = true;
      window.clearInterval(progressTimer);
      destroyYoutubePlayer();
      youtubeMountRef.current?.replaceChildren();
    };
  }, [isVideoMode, youtubeVideo, onVideoProgress, playbackStartMs, selected?.idx, selected?.song_key, selected?.videoLink]);

  function sendVideoCommand(func) {
    if (!youtubeVideo) return false;
    const player = youtubePlayerRef.current;
    if (typeof player?.[func] !== 'function') return false;
    try {
      player[func]();
      return true;
    } catch (_) {
      return false;
    }
  }

  function playActiveVideo() {
    if (!isVideoMode) {
      openVideo?.({ startPlayback: true });
      setIsVideoPlaying(true);
      return true;
    }
    if (directVideo && videoFrameRef.current) {
      videoFrameRef.current.play?.().catch?.(error => console.warn('[radio-dev] playback error: unable to play selected video.', error.message || error));
      return true;
    }
    const sent = sendVideoCommand('playVideo');
    return sent;
  }

  function pauseActiveVideo() {
    if (directVideo && videoFrameRef.current) {
      videoFrameRef.current.pause?.();
      setIsVideoPlaying(false);
      return true;
    }
    const sent = sendVideoCommand('pauseVideo');
    if (sent) setIsVideoPlaying(false);
    return sent;
  }

  function toggleActiveVideo() {
    return isVideoPlaying ? pauseActiveVideo() : playActiveVideo();
  }

  const handleCloseVideo = () => {
    if (selectedIsVideoOnly) {
      closeVideo?.();
      return;
    }
    pauseActiveVideo();
    closeVideo?.();
  };

  const syncAudioState = () => { const audio = audioRef.current; if (!audio) return; const nextTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0; const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0; setCurrentTime(nextTime); setDuration(nextDuration); setIsPlaying(!audio.paused && !audio.ended); onAudioProgress?.(nextTime, nextDuration); };
  const togglePlayback = () => {
    if (isVideoMode) {
      toggleActiveVideo();
      return;
    }
    if (selectedIsVideoOnly && hasVideo) {
      playActiveVideo();
      return;
    }
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    if (audio.paused || audio.ended) {
      console.log('[Stashbox Radio Dev] audio_url being played', selected.audioUrl);
      audio.play().catch(error => console.warn('[radio-dev] playback error: unable to play selected audio.', error.message || error));
      return;
    }
    audio.pause();
  };

  const toggleMediaAreaPlayback = event => {
    if (event.target?.closest?.('iframe, video')) return;
    togglePlayback();
  };
  const seekAudio = event => { const audio = audioRef.current; if (!audio || !hasAudio) return; const nextTime = Number(event.target.value); audio.currentTime = nextTime; setCurrentTime(nextTime); onAudioProgress?.(nextTime, duration); };
  return h('aside', { className: 'panel player', ref: playerRef, tabIndex: -1, 'aria-label': 'Selected song player' },
    h('div', { className: 'player-media clickable-media', role: 'button', tabIndex: 0, title: 'Play or pause current track', 'aria-label': 'Play or pause current track', onClick: toggleMediaAreaPlayback, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePlayback(); } } }, isVideoMode && hasVideo ? (directVideo ? h('video', { key: videoSrc, ref: videoFrameRef, title: `${selected.title} video`, src: videoSrc, controls: true, playsInline: true, autoPlay: true, onPlay: () => { setIsVideoPlaying(true); onVideoStart?.(); }, onPause: () => setIsVideoPlaying(false), onTimeUpdate: event => onVideoProgress?.(event.currentTarget.currentTime, event.currentTarget.duration), onEnded: () => { setIsVideoPlaying(false); onVideoComplete?.(); } }) : h('div', { key: videoSrc, ref: youtubeMountRef, className: 'youtube-player-frame', title: `${selected.title} video`, 'aria-label': `${selected.title} YouTube video` })) : posterImage ? h('img', { src: posterImage, alt: `${selected.title} artwork`, onError: e => { e.currentTarget.style.display = 'none'; } }) : h('div', { className: 'art-fallback' }, selected.title)),
    h('div', { className: 'player-bar' },
      h('div', { className: 'player-controls', 'aria-label': 'Song and playback controls' },
        h('div', { className: 'player-controls-layout' },
          h('div', { className: 'player-info' },
            h('div', { className: 'player-title-row' },
              h('h2', null, selected.title),
              h('span', { className: 'player-stat-pill play-count-pill mobile-title-play-count', title: `${Number(playCount) || 0} recorded starts` }, h('span', null, formatPlayerPlayCount(playCount)))
            ),
            h('div', { className: 'meta' }, h('strong', null, selected.artist || 'Stashbox'), selected.album ? h('span', null, `· ${selected.album}`) : null, selected.videoOnly ? h('span', null, '· Video only') : null, h('span', { className: 'genre-tag', style: { color: section.color, backgroundColor: `${section.color}22` } }, selected.genre || selected.sectionKey)),
            selected.publicTrackNote ? h('p', { className: 'notes public-note compact-note' }, selected.publicTrackNote) : null
          ),
          h('div', { className: 'player-controls-center transport-controls', 'aria-label': 'Transport controls' },
            h(PlayerPill, { className: 'transport-pill', onClick: onPrevious, 'aria-label': 'Previous song' }, '‹'),
            h(PlayerPill, { className: 'transport-pill play-toggle', onClick: togglePlayback, disabled: !canUsePrimaryPlay, 'aria-pressed': isVideoMode ? isVideoPlaying : isPlaying, 'aria-label': (isVideoMode ? isVideoPlaying : isPlaying) ? 'Pause song' : 'Play song' }, (isVideoMode ? isVideoPlaying : isPlaying) ? h(PauseIcon) : h(PlayIcon)),
            h(PlayerPill, { className: 'transport-pill', onClick: onNext, 'aria-label': 'Next song' }, '›')
          ),
          h('div', { className: 'player-controls-actions' },
            h(LikeButton, { count: likeCount, active: hasLiked, onLike }),
            h('span', { className: 'player-stat-pill play-count-pill', title: `${Number(playCount) || 0} recorded starts` }, h(PlayIcon, { className: 'play-count-icon' }), h('span', null, formatPlayerPlayCount(playCount))),
            h(PlayerPill, { className: 'share-pill', onClick: onShare, 'aria-live': shareCopied ? 'polite' : undefined }, shareCopied ? 'Copied' : formatPlayerShareText(shareCount)),
            canCloseVideo || canWatchVideo ? h(PlayerPill, { className: 'video-pill', onClick: isVideoMode ? handleCloseVideo : openVideo }, isVideoMode ? 'Close Video' : h(React.Fragment, null, h(PlayIcon, { className: 'video-play-icon' }), 'Watch Video')) : null,
            h(PlayerPill, { className: 'transport-pill shuffle-pill', onClick: onShuffle, 'aria-label': 'Shuffle songs' }, '⇄')
          ),
          h('div', { className: 'player-mobile-main-controls', 'aria-label': 'Mobile playback controls' },
            h(LikeButton, { count: likeCount, active: hasLiked, onLike }),
            h(PlayerPill, { className: 'transport-pill', onClick: onPrevious, 'aria-label': 'Previous song' }, '‹'),
            h(PlayerPill, { className: 'transport-pill play-toggle', onClick: togglePlayback, disabled: !canUsePrimaryPlay, 'aria-pressed': isVideoMode ? isVideoPlaying : isPlaying, 'aria-label': (isVideoMode ? isVideoPlaying : isPlaying) ? 'Pause song' : 'Play song' }, (isVideoMode ? isVideoPlaying : isPlaying) ? h(PauseIcon) : h(PlayIcon)),
            h(PlayerPill, { className: 'transport-pill', onClick: onNext, 'aria-label': 'Next song' }, '›'),
            h(PlayerPill, { className: 'share-pill', onClick: onShare, 'aria-live': shareCopied ? 'polite' : undefined }, shareCopied ? 'Copied' : formatPlayerShareText(shareCount))
          ),
          !selectedIsVideoOnly && (canCloseVideo || canWatchVideo) ? h('div', { className: 'player-mobile-video-actions' },
            h(PlayerPill, { className: 'video-pill', onClick: isVideoMode ? handleCloseVideo : openVideo }, isVideoMode ? 'Close Video' : h(React.Fragment, null, h(PlayIcon, { className: 'video-play-icon' }), 'Watch Video'))
          ) : null
        )
      )
    ),
    playerMessage ? h('p', { className: 'notes player-message', 'aria-live': 'polite' }, playerMessage) : null,
    isVideoMode && selected.publicVideoNote ? h('p', { className: 'notes video-note' }, selected.publicVideoNote) : null,
    isVideoMode && selected.videoSetlist ? h('pre', { className: 'notes video-setlist' }, selected.videoSetlist) : null,
    hasAudio && mediaMode !== 'video' ? h(React.Fragment, null, h('audio', { key: selected.idx, className: 'audio native-audio', ref: audioRef, src: selected.audioUrl, controls: false, controlsList: 'nodownload', disableRemotePlayback: true, preload: 'metadata', onContextMenu: event => event.preventDefault(), onLoadedMetadata: syncAudioState, onTimeUpdate: syncAudioState, onPlay: () => { syncAudioState(); onAudioStart?.(); }, onPause: () => { syncAudioState(); if (!audioRef.current?.ended) onAudioPause?.(); }, onEnded: () => { syncAudioState(); onAudioComplete?.(); }, onDurationChange: syncAudioState }), h('div', { className: 'player-timeline' }, h('span', { className: 'timecode' }, formatTime(currentTime)), h('input', { className: 'scrubber', type: 'range', min: '0', max: duration || 0, step: '0.1', value: duration ? Math.min(currentTime, duration) : 0, onInput: seekAudio, onChange: seekAudio, 'aria-label': 'Audio timeline', style: { '--progress': `${progress}%` } }), h('span', { className: 'timecode end' }, formatTime(duration)))) : h('p', { className: 'notes no-audio-note' }, selectedIsVideoOnly ? 'This is a video-only record. Use the main play button to start the YouTube player.' : 'No audio URL is available for this track.'),
    h(ProductRecommendations, { products, onProductClick })
  );
}

function ProductRecommendations({ products, onProductClick }) {
  const carouselRef = useRef(null);
  const visibleProducts = useMemo(() => products.slice(0, PRODUCT_POOL_LIMIT), [products]);
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: true, canScroll: false });

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) {
      setScrollState({ atStart: true, atEnd: true, canScroll: false });
      return;
    }

    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    const nextState = {
      atStart: carousel.scrollLeft <= 1,
      atEnd: carousel.scrollLeft >= maxScrollLeft - 1,
      canScroll: maxScrollLeft > 1
    };
    setScrollState(previous => (
      previous.atStart === nextState.atStart && previous.atEnd === nextState.atEnd && previous.canScroll === nextState.canScroll
        ? previous
        : nextState
    ));
  }, []);

  useEffect(() => {
    updateScrollState();
    const carousel = carouselRef.current;
    if (!carousel) return undefined;

    carousel.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    let resizeObserver = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(carousel);
    }

    const stateFrame = window.requestAnimationFrame(updateScrollState);
    return () => {
      carousel.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      if (resizeObserver) resizeObserver.disconnect();
      window.cancelAnimationFrame(stateFrame);
    };
  }, [updateScrollState, visibleProducts.length]);

  const scrollProducts = useCallback(direction => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const productCards = Array.from(carousel.querySelectorAll('.product'));
    const carouselStyles = window.getComputedStyle(carousel);
    const gap = parseFloat(carouselStyles.columnGap || carouselStyles.gap) || 0;
    const measuredCardStep = productCards.length > 1
      ? productCards[1].offsetLeft - productCards[0].offsetLeft
      : 0;
    const cardWidth = productCards[0] ? productCards[0].getBoundingClientRect().width : 0;
    const cardStep = measuredCardStep || (cardWidth ? cardWidth + gap : 0);
    const scrollAmount = cardStep ? cardStep * 3 : carousel.clientWidth * 0.85;
    carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    window.requestAnimationFrame(updateScrollState);
  }, [updateScrollState]);

  return h('section', { className: 'merch', 'aria-label': 'Product recommendations' },
    h('div', { className: 'merch-head' },
      h('div', null, h('p', { className: 'kicker' }, 'Stashbox merch'), h('div', { className: 'merch-title' }, 'Shop This Track')),
      h('span', { className: 'count' }, visibleProducts.length ? `${visibleProducts.length} items` : 'Loading merch…')
    ),
    visibleProducts.length ? h('div', { className: 'products-shell' },
      h('button', { className: 'carousel-arrow carousel-arrow-left', type: 'button', 'aria-label': 'Previous products', disabled: !scrollState.canScroll || scrollState.atStart, onClick: () => scrollProducts(-1) }, '‹'),
      h('div', { className: 'products', ref: carouselRef },
        visibleProducts.map(product => h('a', { key: product.url || product.id || product.title, className: 'product', href: product.url, target: '_blank', rel: 'noopener noreferrer', draggable: false, onClick: () => onProductClick?.(product) },
          h('div', { className: `product-img ${product.unresolved ? 'product-img-link' : ''}` },
            product.image ? h('img', { src: product.image, alt: product.title, loading: 'lazy', decoding: 'async', draggable: false, onError: e => { e.currentTarget.remove(); } }) : (product.unresolved ? 'Link' : 'SB')
          ),
          h('div', { className: 'product-name' }, product.title),
          h('div', { className: 'product-price' }, product.price || (product.unresolved ? 'Open specific product link' : 'Shop on Stashbox.ai'))
        ))
      ),
      h('button', { className: 'carousel-arrow carousel-arrow-right', type: 'button', 'aria-label': 'Next products', disabled: !scrollState.canScroll || scrollState.atEnd, onClick: () => scrollProducts(1) }, '›')
    ) : h('p', { className: 'notes' }, 'Recommendations will appear here when the Stashbox shop feed is available.')
  );
}

function displayAlbumName(track) {
  const albumName = clean(track?.raw?.album_name ?? track?.album_name);
  return albumName && albumName.toLowerCase() !== 'stashbox radio' ? albumName : '';
}

function songArtworkUrl(track) {
  return track?.imageUrl || youtubeThumbnail(track?.videoLink) || '/images/branding/stashbox-logo-transparent-rastacolors.png';
}

function SongSection({ section, tracks, selected, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike, onShare, copiedSongId, viewMode = 'list' }) {
  const isVisual = viewMode === 'visual';
  return h('section', { className: `song-section song-section-${viewMode}`, style: { '--section-color': section.color } },
    h('div', { className: 'section-title' }, h('span', null, section.emoji), h('h3', null, section.key), h('span', { className: 'count' }, tracks.length)),
    h('div', { className: isVisual ? 'song-list song-list-visual' : 'song-list song-list-list' },
      tracks.map(track => {
        const isSelected = selected?.idx === track.idx;
        const albumName = displayAlbumName(track);
        const metaItems = isVisual
          ? [track.artist, track.genre || track.sectionKey].filter(Boolean)
          : [track.artist, albumName, track.genre || track.sectionKey].filter(Boolean);
        return h('article', {
          key: track.idx,
          className: `song-card song-card-${viewMode} ${isSelected ? 'active' : ''}`,
          onClick: () => chooseSong(track),
          tabIndex: 0,
          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseSong(track); } }
        },
          h('img', { className: 'song-artwork', src: songArtworkUrl(track), alt: `${track.title} artwork`, onError: e => { e.currentTarget.src = '/images/branding/stashbox-logo-transparent-rastacolors.png'; } }),
          h('div', { className: 'song-copy' },
            h('div', { className: 'song-title-row' },
              h('h4', null, track.title),
              !isVisual && track.hasVideo && track.showWatchVideo ? h('span', { className: 'video-badge' }, 'Video') : null,
              !isVisual && track.videoOnly ? h('span', { className: 'video-badge' }, 'Video only') : null
            ),
            h('div', { className: 'song-meta' }, metaItems.map((item, index) => h('span', { key: `${track.idx}-meta-${index}` }, item))),
            isVisual && track.videoOnly ? h('span', { className: 'video-badge video-badge-visual' }, 'Video only') : null,
            !isVisual && track.publicTrackNote ? h('p', { className: 'song-note' }, track.publicTrackNote) : null
          ),
          !isVisual ? h('div', { className: 'song-card-stats' }, h(SongActions, { compact: true, likeCount: getSongLikes(track, likeCounts), playCount: getSongPlays(track, playCounts), shareCount: getSongShares(track, shareCounts), hasLiked: likedSongIds.has(track.songKey), onLike: () => onLike(track), onShare: () => onShare(track), shareCopied: copiedSongId === track.idx })) : null,
          !isVisual ? h('button', { className: 'song-play', type: 'button', 'aria-label': `Select ${track.title}`, onClick: event => { event.stopPropagation(); chooseSong(track); } }, isSelected ? 'Playing' : 'Play') : null
        );
      })
    )
  );
}

createRoot(document.getElementById('root')).render(h(App));
