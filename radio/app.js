import React, { useCallback, useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import { flushSync } from 'https://esm.sh/react-dom@18.3.1';

const API_ROOT_URL = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const SONGS_API_URL = `${API_ROOT_URL}/radio/songs`;
const TRACKING_API_URL = `${API_ROOT_URL}/radio/track`;
const PUBLIC_ADS_API_URL = `${API_ROOT_URL}/radio/ads`;
const PUBLIC_ADS_API_URLS = [PUBLIC_ADS_API_URL, `${API_ROOT_URL}/ads`];
const PUBLIC_AD_SETTINGS_API_URLS = [`${API_ROOT_URL}/radio/ad-settings`, `${API_ROOT_URL}/ad-settings`];
const SESSION_STORAGE_KEY = 'stashbox-radio-rds-session-id';
const VIEW_MODE_STORAGE_KEY = 'stashbox_radio_view_mode';
const DEFAULT_FILTER = 'ALL';
const DEFAULT_SORT = 'latest';
const DEFAULT_VIEW_MODE = 'visual';
const PRODUCT_POOL_LIMIT = 200;
const MEDIA_SESSION_ARTWORK_SIZES = [96, 128, 192, 256, 512];
const APP_FALLBACK_ARTWORK_URL = '/images/branding/stashbox-logo-transparent-rastacolors.png';
const COMPLETION_THRESHOLD = 0.95;
const MIN_PARTIAL_SECONDS = 5;
const QUALIFIED_PLAY_SECONDS = 10;
const TRACKING_DEDUPE_MS = 2000;
const UNTITLED_STASHBOX_TRACK = 'Untitled Stashbox Track';
const MEDIA_SESSION_DEFAULT_ALBUM = 'Stashbox Radio';
const RADIO_SHARE_URL = 'https://stashbox.com/radio/';
const songKeyFromUrl = new URLSearchParams(window.location.search).get('song') || '';

const ADS_STATS_STORAGE_KEY = 'stashbox_radio_ad_events';
const AD_FREQUENCY_WEIGHTS = { low: 1, medium: 3, high: 6 };
const DEFAULT_AD_SETTINGS = { ads_enabled: true, break_method: 'count', ads_per_break: 1, target_ad_seconds: 30, break_interval: 1 };
const FALLBACK_AD_DURATION_SECONDS = 15;
const DEFAULT_TARGET_AD_SECONDS = DEFAULT_AD_SETTINGS.target_ad_seconds;
const SECTIONS = [
  { key: 'Reggae', emoji: '🌴', color: '#3ecf6e' }, { key: 'Rock', emoji: '🎸', color: '#f0a500' },
  { key: 'Blues', emoji: '🎷', color: '#50a0ff' }, { key: 'Funk', emoji: '🕺', color: '#e05c2a' },
  { key: 'Electronic', emoji: '⚡', color: '#50dcdc' }, { key: 'Spanish', emoji: '💃', color: '#ff6496' },
  { key: 'Calypso', emoji: '🥁', color: '#ffc050' }, { key: 'Soul', emoji: '🎤', color: '#c88cff' },
  { key: 'Pop', emoji: '🎵', color: '#ff9080' }, { key: 'Other', emoji: '🎶', color: '#999' }
];

const PREFERRED_MOOD_FILTERS = ['Happy', 'Chill', 'Uplifting', 'Funny', 'Sexy', 'Spiritual', 'Emotional', 'Party', 'Nostalgic', 'Energetic', 'Relaxed', 'Dark', 'Romantic', 'Trippy'];
const MOOD_FILTERS = [DEFAULT_FILTER, ...PREFERRED_MOOD_FILTERS];
const SORT_OPTIONS = [
  { key: 'latest', label: 'Latest' },
  { key: 'random', label: 'Random' },
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
const SHARE_COUNT_FIELDS = ['shares', 'share_count', 'total_shares', 'shareCount', 'totalShares', 'share_events'];
const LIKE_COUNT_FIELDS = ['likes', 'like_count', 'total_likes', 'likeCount', 'totalLikes'];
const PLAY_COUNT_FIELDS = ['total_plays', 'plays', 'play_count', 'play_starts', 'totalPlays', 'full_play_count', 'fullPlayCount'];
function countPatchHasAny(patch = {}, fields = []) {
  return fields.some(field => Object.prototype.hasOwnProperty.call(patch, field));
}
const formatSkipCountdown = seconds => `:${String(Math.max(0, Number(seconds) || 0)).padStart(2, '0')}`;
const fixDropbox = url => url ? url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '') : '';
const has = value => clean(value).length > 0;
const bool = value => value === true || value === 1 || String(value ?? '').toLowerCase() === 'true' || String(value ?? '').toLowerCase() === '1';


function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function normalizeAd(row) {
  if (!row) return null;
  const title = clean(row.internal_title || row.title || row.ad_title || row.name || 'Stashbox Radio Ad');
  const description = clean(row.internal_description || row.description || row.ad_description || row.notes);
  const mediaUrl = fixDropbox(clean(row.mediaUrl || row.media_url || row.video_url || row.videoUrl || row.ad_url || row.adUrl || row.file_url || row.fileUrl || row.s3_url || row.s3Url));
  const clickUrl = clean(row.clickUrl || row.click_url || row.click_video_url || row.cta_url || row.ctaUrl || row.url);
  const frequency = clean(row.frequency || 'medium').toLowerCase() || 'medium';
  const active = (bool(row.active) || clean(row.status).toLowerCase() === 'active' || bool(row.is_active)) && !bool(row.hidden);
  const id = clean(row.id || row.ad_id || row.adId || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

  return {
    ...row,
    itemType: 'video_ad',
    type: 'video_ad',
    id,
    title,
    description,
    mediaUrl,
    clickUrl,
    frequency,
    artist: clean(row.artist || row.artist_targeting || row.artistTargeting),
    genre: clean(row.genre || row.genre_targeting || row.genreTargeting),
    mood: clean(row.mood || row.mood_targeting || row.moodTargeting),
    durationSeconds: Number(row.durationSeconds ?? row.duration_seconds ?? row.duration ?? 0) || 0,
    internal_title: title,
    internal_description: description,
    ad_type: clean(row.ad_type || 'Station Promo'),
    media_type: clean(row.media_type || (isAudioAdUrl(mediaUrl) ? 'Audio' : 'Video')) || 'Video',
    media_url: mediaUrl,
    thumbnail_url: clean(row.thumbnail_url || row.thumbnailUrl || row.poster_image_url || row.posterImageUrl),
    poster_image_url: clean(row.thumbnail_url || row.thumbnailUrl || row.poster_image_url || row.posterImageUrl),
    cta_label: clean(row.cta_label || row.ctaLabel || (clickUrl ? 'Learn More' : '')),
    cta_url: clickUrl,
    active,
    skip_enabled: row.no_skipping !== undefined ? !bool(row.no_skipping) : (row.skip_enabled === undefined ? true : bool(row.skip_enabled)),
    skip_after_seconds: Math.max(0, Number(row.skip_after_seconds ?? row.skipAfterSeconds ?? 0) || 0),
    max_plays_per_session: Math.max(1, Number(row.max_plays_per_session ?? row.maxPlaysPerSession ?? 99) || 99),
    start_date: clean(row.start_date || row.startDate),
    end_date: clean(row.end_date || row.endDate)
  };
}

function isDateEligible(ad, today = new Date()) {
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ad.start_date) {
    const start = new Date(`${ad.start_date}T00:00:00`).getTime();
    if (Number.isFinite(start) && todayOnly < start) return false;
  }
  if (ad.end_date) {
    const end = new Date(`${ad.end_date}T23:59:59`).getTime();
    if (Number.isFinite(end) && today.getTime() > end) return false;
  }
  return true;
}

function isAudioAdUrl(url) {
  return /\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/i.test(clean(url));
}

function adFrequencyKey(ad) {
  const value = clean(ad?.frequency).toLowerCase();
  return AD_FREQUENCY_WEIGHTS[value] ? value : 'medium';
}

function weightedRandomAd(ads) {
  const pool = ads.flatMap(ad => Array(Math.max(1, AD_FREQUENCY_WEIGHTS[adFrequencyKey(ad)] || AD_FREQUENCY_WEIGHTS.medium)).fill(ad));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}


function normalizeAdSettings(settings = {}) {
  const adsPerBreak = [1, 2, 3, 4, 5].includes(Number(settings.ads_per_break)) ? Number(settings.ads_per_break) : DEFAULT_AD_SETTINGS.ads_per_break;
  const targetAdSeconds = [15, 30, 45, 60, 90].includes(Number(settings.target_ad_seconds)) ? Number(settings.target_ad_seconds) : DEFAULT_AD_SETTINGS.target_ad_seconds;
  const breakInterval = [1, 2, 3].includes(Number(settings.break_interval)) ? Number(settings.break_interval) : DEFAULT_AD_SETTINGS.break_interval;
  return {
    ads_enabled: Object.prototype.hasOwnProperty.call(settings, 'ads_enabled') ? Boolean(settings.ads_enabled) : DEFAULT_AD_SETTINGS.ads_enabled,
    break_method: settings.break_method === 'seconds' ? 'seconds' : 'count',
    ads_per_break: adsPerBreak,
    target_ad_seconds: targetAdSeconds,
    break_interval: breakInterval
  };
}

function normalizeSettingsResponse(data) {
  if (typeof data?.body === 'string') {
    try { return normalizeSettingsResponse(JSON.parse(data.body)); } catch (_) { return DEFAULT_AD_SETTINGS; }
  }
  return normalizeAdSettings(data?.settings || data || DEFAULT_AD_SETTINGS);
}

async function loadPublicAdSettings() {
  let lastError = null;
  for (const endpoint of PUBLIC_AD_SETTINGS_API_URLS) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!response.ok) throw new Error((data && (data.error || data.message)) || `Ad settings API returned HTTP ${response.status}`);
      return normalizeSettingsResponse(data);
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('Ad settings load failed, using safe defaults', lastError?.message || lastError);
  return normalizeAdSettings(DEFAULT_AD_SETTINGS);
}

function estimatedAdDurationSeconds(ad) {
  const duration = Number(ad?.durationSeconds ?? ad?.duration_seconds ?? 0);
  return Number.isFinite(duration) && duration > 0 ? duration : FALLBACK_AD_DURATION_SECONDS;
}

function recordAdEvent(ad, eventType, { song = null, sessionId = '', extra = {} } = {}) {
  if (!ad?.id) return;
  const event = {
    ad_id: ad.id,
    ad_title: ad.internal_title || ad.title || '',
    event_type: eventType,
    timestamp: new Date().toISOString(),
    song_context: song ? {
      song_key: song.songKey || song.song_key || '',
      title: song.title || song.display_title || song.song_name || '',
      artist: song.artist || ''
    } : null,
    session_id: sessionId,
    user_agent: navigator.userAgent || '',
    ...extra
  };
  const events = readJsonStorage(ADS_STATS_STORAGE_KEY, []);
  events.push(event);
  writeJsonStorage(ADS_STATS_STORAGE_KEY, events.slice(-1000));
}

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
const normalizeCount = (row, fields) => Math.max(0, ...fields.map(field => countValue(row?.[field])));
const normalizeShareCount = row => normalizeCount(row, SHARE_COUNT_FIELDS);
const normalizeLikeCount = row => normalizeCount(row, LIKE_COUNT_FIELDS);
const normalizePlayCount = row => normalizeCount(row, PLAY_COUNT_FIELDS);
const YOUTUBE_ORIGIN = 'https://elettro.github.io';

function getBrowserSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : `rds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch (_) {
    return `rds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const likes = normalizeLikeCount(row);
  const totalPlays = normalizePlayCount(row);
  const fullPlayCount = countValue(firstDefined(row, ['full_play_count', 'full_plays']));
  const partialPlayCount = countValue(firstDefined(row, ['partial_play_count', 'partial_plays']));
  const skipCount = countValue(firstDefined(row, ['skip_count', 'skips']));
  const shares = normalizeShareCount(row);
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
    mood: clean(firstDefined(row, ['mood', 'primary_mood'])),
    moodTags: parseStringList(firstDefined(row, ['mood_tags', 'moods'])),
    sectionKey: sectionFor(genre),
    audioUrl: hasAudio ? fixDropbox(clean(row.audio_url)) : '',
    resolved_artwork_url: normalizedSongArtworkUrl(row),
    song_artwork_url: fixDropbox(clean(row.song_artwork_url || row.songArtworkUrl)),
    artwork_url: fixDropbox(clean(row.artwork_url || row.artworkUrl)),
    cover_art_url: fixDropbox(clean(row.cover_art_url || row.coverArtUrl)),
    imageUrl: normalizedSongArtworkUrl(row),
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


function normalizeAdsResponse(data) {
  if (typeof data?.body === 'string') {
    try { return normalizeAdsResponse(JSON.parse(data.body)); } catch (_) { return []; }
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.ads)) return data.ads;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function fetchAdsFromEndpoint(endpoint) {
  const response = await fetch(endpoint, { cache: 'no-store' });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  if (!response.ok) throw new Error((data && (data.error || data.message)) || `Ads API returned HTTP ${response.status}`);
  return normalizeAdsResponse(data);
}

async function loadActiveAds() {
  let lastError = null;
  for (const endpoint of PUBLIC_ADS_API_URLS) {
    try {
      const activeAds = (await fetchAdsFromEndpoint(endpoint))
        .map(normalizeAd)
        .filter(ad => ad && ad.active && has(ad.mediaUrl) && isDateEligible(ad));
      if (activeAds.length) console.log(`Loaded ${activeAds.length} active ads from RDS`);
      else console.log('No active ads available');
      return activeAds;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('Ad load failed, continuing without ads', lastError?.message || lastError);
  return [];
}

async function sendAdTrackingEvent(ad, eventType) {
  if (!ad?.id || !eventType) return null;
  const payload = {
    ad_id: ad.id,
    ad_title: ad.title || ad.internal_title || '',
    event_type: eventType,
    page: 'production',
    source: 'public_player'
  };
  if (eventType === 'ad_skip') {
    console.log('[Stashbox Radio] sending ad_skip tracking event', payload);
  } else {
    console.log('[Stashbox Radio] sending ad tracking event', payload);
  }
  try {
    const response = await fetch(TRACKING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    });
    let body = '';
    try {
      body = await response.text();
    } catch (error) {
      body = `[unable to read response body: ${error.message || error}]`;
    }
    if (eventType === 'ad_skip') {
      console.log('[Stashbox Radio] ad_skip tracking response', {
        status: response.status,
        ok: response.ok,
        body
      });
    } else {
      console.log('[Stashbox Radio] ad tracking response', {
        status: response.status,
        ok: response.ok,
        body
      });
    }
    if (!response.ok) console.warn('[Stashbox Radio] ad tracking rejected', { event_type: eventType, status: response.status });
    return response;
  } catch (error) {
    console.warn('[Stashbox Radio] ad tracking failed', error.message || error);
    return null;
  }
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
  const songKey = clean(song?.songKey || song?.song_key || song?.raw?.song_key || song?.id || song?.raw?.id);
  if (!songKey || !eventType) return null;
  const dedupeKey = `${songKey}:${eventType}`;
  const now = Date.now();
  const lastSentAt = recentTrackingEvents.get(dedupeKey) || 0;
  if (now - lastSentAt < TRACKING_DEDUPE_MS) {
    console.log('[Stashbox Radio] duplicate tracking event suppressed', { song_key: songKey, event_type: eventType });
    return null;
  }
  recentTrackingEvents.set(dedupeKey, now);
  const payload = {
    song_key: songKey,
    song_id: clean(song?.song_id || song?.songId || song?.raw?.song_id || song?.raw?.songId || song?.id || song?.raw?.id || songKey),
    id: clean(song?.id || song?.raw?.id || songKey),
    display_title: getSongTitle(song),
    song_name: clean(song?.song_name || song?.raw?.song_name || getSongTitle(song)),
    artist: getSongArtist(song),
    event_type: eventType,
    session_id: sessionId,
    device_type: getDeviceType(),
    referrer: document.referrer || '',
    page: 'production',
    source: 'public_player',
    ...extra
  };
  Object.keys(payload).forEach(key => (payload[key] === undefined || payload[key] === null || payload[key] === '') && delete payload[key]);
  if (eventType === 'like') {
    console.log('[Stashbox Radio] sending like event', payload);
  } else {
    console.log('[Stashbox Radio] tracking payload', payload);
  }
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
    if (eventType === 'like') {
      console.log('[Stashbox Radio] like event response', { status: response.status, ok: response.ok, body });
    } else {
      console.log('[Stashbox Radio] tracking API response', { status: response.status, ok: response.ok, body });
    }
    return { response, body };
  } catch (error) {
    if (eventType === 'like') console.warn('[Stashbox Radio] like event error', error.message || error);
    else console.warn('[Stashbox Radio] tracking API error', error.message || error);
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
  console.log('[Stashbox Radio] video_link being converted', value);
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


function normalizedSongArtworkUrl(track) {
  if (!track) return '';
  return fixDropbox(clean(
    track.resolved_artwork_url ||
    track.resolvedArtworkUrl ||
    track.song_artwork_url ||
    track.songArtworkUrl ||
    track.artwork_url ||
    track.artworkUrl ||
    track.cover_art_url ||
    track.coverArtUrl ||
    track.imageUrl ||
    track.image_url ||
    track.cover_url ||
    track.coverUrl ||
    track.raw?.resolved_artwork_url ||
    track.raw?.song_artwork_url ||
    track.raw?.artwork_url ||
    track.raw?.cover_art_url ||
    track.raw?.image_url ||
    track.raw?.cover_url
  ));
}

function firstMediaSessionArtworkUrl(track) {
  return normalizedSongArtworkUrl(track)
    || youtubeThumbnail(track?.videoLink)
    || APP_FALLBACK_ARTWORK_URL;
}

function buildMediaSessionArtwork(track) {
  const artworkUrl = firstMediaSessionArtworkUrl(track);
  if (!artworkUrl) return [];
  return MEDIA_SESSION_ARTWORK_SIZES.map(size => ({
    src: artworkUrl,
    sizes: `${size}x${size}`
  }));
}

function mediaSessionAlbumName(track) {
  const mediaAlbum = clean(track?.raw?.album_name);
  return mediaAlbum || MEDIA_SESSION_DEFAULT_ALBUM;
}

function buildMediaSessionMetadata(track) {
  if (!track) return null;
  return {
    title: clean(track.display_title) || clean(track.song_name) || clean(track.title) || UNTITLED_STASHBOX_TRACK,
    artist: clean(track.artist),
    album: mediaSessionAlbumName(track),
    artwork: buildMediaSessionArtwork(track)
  };
}

function updateMediaSessionMetadata(track) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  const metadata = buildMediaSessionMetadata(track);
  if (!metadata) return;
  navigator.mediaSession.metadata = new MediaMetadata(metadata);
}

function setMediaSessionPlaybackState(state) {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = state; } catch (_) {}
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
function formatAdTime(seconds) { const value = Number(seconds); const safe = Number.isFinite(value) ? Math.max(0, value) : 0; const minutes = Math.floor(safe / 60); const secs = Math.floor(safe % 60).toString().padStart(2, '0'); return `${minutes}:${secs}`; }
function formatRemainingAdTime(seconds) { const value = Number(seconds); const safe = Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0; return formatAdTime(safe); }
function formatTrackCount(trackCount, isLoading) { if (isLoading) return 'LOADING TRACKS'; return `${trackCount} ${trackCount === 1 ? 'TRACK' : 'TRACKS'}`; }
function filterLabel(value) { return value === 'ALL' ? 'All' : value; }
function albumMatches(trackAlbum, selectedAlbum) { if (selectedAlbum === DEFAULT_FILTER) return true; const a = clean(trackAlbum).toLowerCase(); const b = clean(selectedAlbum).toLowerCase(); return a === b || a.includes(b); }
function artistMatches(trackArtist, selectedArtist) { return selectedArtist === DEFAULT_FILTER || clean(trackArtist).toLowerCase() === clean(selectedArtist).toLowerCase(); }
function moodMatches(track, selectedMood) {
  if (selectedMood === DEFAULT_FILTER) return true;
  const selected = clean(selectedMood).toLowerCase();
  return getTrackMoods(track).some(value => clean(value).toLowerCase() === selected);
}
function flagValueIsTrue(value) {
  if (value === true || value === 1) return true;
  const normalized = clean(value).toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}
function flagValueIsFalse(value) {
  if (value === false || value === 0) return true;
  const normalized = clean(value).toLowerCase();
  return ['false', '0', 'no', 'n', 'off'].includes(normalized);
}
function anyFlagIsTrue(row, names) {
  return names.some(name => Object.prototype.hasOwnProperty.call(row || {}, name) && flagValueIsTrue(row[name]));
}
function anyFlagIsFalse(row, names) {
  return names.some(name => Object.prototype.hasOwnProperty.call(row || {}, name) && flagValueIsFalse(row[name]));
}
function hasBlockedPublicStatus(row) {
  const status = clean(firstDefined(row, ['status', 'song_status', 'visibility', 'public_status'])).toLowerCase();
  return ['hidden', 'archived', 'inactive', 'test', 'draft', 'private', 'admin', 'admin-only', 'admin_only'].includes(status);
}
function isActivePublicSong(track) {
  const row = track?.raw || {};
  if (!canPlayTrack(track)) return false;
  if (hasBlockedPublicStatus(row)) return false;
  if (anyFlagIsTrue(row, ['hidden', 'is_hidden', 'hide', 'hide_public', 'archived', 'is_archived', 'inactive', 'is_inactive', 'test', 'is_test', 'test_track', 'admin_only', 'adminOnly', 'is_admin_only'])) return false;
  if (anyFlagIsFalse(row, ['active', 'is_active', 'enabled', 'is_enabled', 'public', 'is_public', 'show_public', 'public_visible', 'visible_public'])) return false;
  return true;
}
function getTrackMoods(track) {
  return [
    clean(track?.mood),
    ...parseStringList(track?.moodTags),
    ...parseStringList(track?.raw?.mood_tags),
    clean(track?.raw?.mood)
  ].map(clean).filter(Boolean);
}
function getRealAlbumName(track) {
  return clean(track?.raw?.album_name);
}
function uniqueDisplayValues(tracks, getValue) {
  const values = new Map();
  tracks.forEach(track => {
    const value = clean(getValue(track));
    if (!value) return;
    const key = value.toLowerCase();
    if (!values.has(key)) values.set(key, value);
  });
  return [...values.values()];
}
function buildGenreFilters(tracks) {
  const genres = uniqueDisplayValues(tracks, track => track.sectionKey || sectionFor(track.genre));
  const reggae = genres.find(value => value.toLowerCase() === 'reggae');
  const others = genres
    .filter(value => value.toLowerCase() !== 'reggae')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [DEFAULT_FILTER, ...(reggae ? [reggae] : []), ...others];
}
function buildAlbumFilters(tracks) {
  return [DEFAULT_FILTER, ...uniqueDisplayValues(tracks, getRealAlbumName)
    .filter(albumName => albumName.toLowerCase() !== 'stashbox radio')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
}
function getFilterArtistName(track) {
  return clean(firstDefined(track?.raw, ['artist', 'artist_name', 'band'])) || clean(track?.artist);
}
function buildArtistFilters(tracks) {
  const priorityArtists = ['Stashbox', 'The Ras Box'];
  const counts = new Map();

  tracks.forEach(track => {
    const artist = getFilterArtistName(track);
    if (!artist) return;
    const key = artist.toLowerCase();
    const current = counts.get(key) || { artist, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });

  const pinned = priorityArtists.filter(name => counts.has(name.toLowerCase()));
  const pinnedKeys = new Set(priorityArtists.map(name => name.toLowerCase()));
  const others = [...counts.values()]
    .filter(({ artist }) => !pinnedKeys.has(artist.toLowerCase()))
    .sort((a, b) => (b.count - a.count) || a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }));

  return [DEFAULT_FILTER, ...pinned, ...others.map(({ artist }) => artist)];
}
function buildMoodFilters(tracks) {
  const moods = uniqueDisplayValues(tracks.flatMap(getTrackMoods), value => value);
  const preferredKeys = new Set(PREFERRED_MOOD_FILTERS.map(moodName => moodName.toLowerCase()));
  const byKey = new Map(moods.map(moodName => [moodName.toLowerCase(), moodName]));
  const preferred = PREFERRED_MOOD_FILTERS.filter(moodName => byKey.has(moodName.toLowerCase()));
  const otherMoods = moods
    .filter(moodName => !preferredKeys.has(moodName.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [DEFAULT_FILTER, ...preferred, ...otherMoods];
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
  return normalizeShareCount(song) || normalizeShareCount(song?.raw);
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

function buildGroupedSongSections(songs, sortKey) {
  if (sortKey !== 'genre' && sortKey !== 'artist') return [];
  const isGenreGroup = sortKey === 'genre';
  const groups = new Map();

  songs.forEach(track => {
    const groupName = isGenreGroup ? getSongGenre(track) : getSongArtist(track);
    const title = clean(groupName) || (isGenreGroup ? 'Other' : 'Unknown Artist');
    const groupKey = normalizeSortText(title) || title;
    const existing = groups.get(groupKey) || { title, tracks: [] };
    existing.tracks.push(track);
    groups.set(groupKey, existing);
  });

  return [...groups.values()]
    .filter(group => group.tracks.length > 0)
    .sort((a, b) => {
      const rankA = isGenreGroup ? genreRank(a.title) : artistRank(a.title);
      const rankB = isGenreGroup ? genreRank(b.title) : artistRank(b.title);
      return compareText(rankA, rankB);
    })
    .map(group => {
      const displaySection = isGenreGroup
        ? (SECTIONS.find(section => section.key.toLowerCase() === sectionFor(group.title).toLowerCase()) || SECTIONS[SECTIONS.length - 1])
        : { key: group.title, emoji: '🎤', color: '#f0a500' };
      const tracks = [...group.tracks].sort((a, b) => compareText(getSongTitle(a), getSongTitle(b)) || ((a.idx ?? 0) - (b.idx ?? 0)));
      return {
        key: `${sortKey}-${normalizeSortText(group.title)}`,
        section: { ...displaySection, key: group.title },
        tracks
      };
    });
}


function getSortLabel(sortKey) {
  return SORT_OPTIONS.find(option => option.key === sortKey)?.label || 'Latest';
}

function getListContextTitle({ query, artist, genre, album, mood, videoOnly, sortKey }) {
  if (sortKey === 'random') return getSortLabel(sortKey);
  const searchQuery = clean(query);
  if (searchQuery) return `Search: ${searchQuery}`;
  if (artist !== DEFAULT_FILTER) return artist;
  if (genre !== DEFAULT_FILTER) return genre;
  if (album !== DEFAULT_FILTER) return album;
  if (mood !== DEFAULT_FILTER) return mood;
  if (videoOnly) return 'Songs With Videos';
  return getSortLabel(sortKey);
}

function isVideoFocusedList({ videoOnly, sortKey }) {
  return Boolean(videoOnly || sortKey === 'videos-first');
}

function shuffleTracks(tracks) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function getRandomSortTrackKey(track) {
  return clean(track?.songKey || track?.song_key || track?.id || track?.idx);
}

function orderSongsByRandomKeys(songs, randomKeys) {
  if (!Array.isArray(randomKeys) || !randomKeys.length) return songs;
  const byKey = new Map(songs.map(song => [getRandomSortTrackKey(song), song]));
  const ordered = randomKeys.map(key => byKey.get(key)).filter(Boolean);
  const orderedKeys = new Set(ordered.map(getRandomSortTrackKey));
  const remaining = songs.filter(song => !orderedKeys.has(getRandomSortTrackKey(song)));
  return [...ordered, ...remaining];
}

function SongListContextRow({ title, onShuffle, disabled = false, notice = '' }) {
  return h('div', { className: 'song-list-context-wrap' },
    h('div', { className: 'song-list-context-row', 'aria-label': 'Current song list context' },
      h('h3', { className: 'song-list-context-title' }, title),
      h('button', { className: 'song-list-shuffle-button', type: 'button', onClick: onShuffle, disabled }, 'Shuffle All')
    ),
    notice ? h('p', { className: 'song-list-shuffle-notice', 'aria-live': 'polite' }, notice) : null
  );
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
    return stored === 'list' ? 'list' : DEFAULT_VIEW_MODE;
  } catch (_) {
    return DEFAULT_VIEW_MODE;
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

function isSyntheticSongKey(value) {
  return /^rds-song-\d+$/.test(clean(value));
}
function getSongShareKey(song) {
  const rawSongKey = clean(song?.raw?.song_key || song?.raw?.key || song?.raw?.slug || song?.raw?.id || song?.raw?.track_id);
  if (rawSongKey) return rawSongKey;
  const normalizedSongKey = clean(song?.song_key || song?.songKey || song?.id);
  return isSyntheticSongKey(normalizedSongKey) ? '' : normalizedSongKey;
}
function getShareUrl(song) {
  const shareUrl = new URL(RADIO_SHARE_URL);
  const songKey = getSongShareKey(song);
  if (songKey) shareUrl.searchParams.set('song', songKey);
  return shareUrl.toString();
}
function matchesSongDeepLink(track, songKey) {
  const target = clean(songKey);
  if (!target) return false;
  return [track?.song_key, track?.songKey, track?.id, track?.raw?.song_key, track?.raw?.id, track?.raw?.key, track?.raw?.slug, track?.raw?.track_id]
    .some(value => clean(value) === target);
}
async function copyTextToClipboard(text) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text); const input = document.createElement('textarea'); input.value = text; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove(); }

function RadioControlBar({ trackCount, isLoading = false, query, onQueryChange, genre, onGenreChange, genreFilters = [DEFAULT_FILTER], album, onAlbumChange, albumFilters = [DEFAULT_FILTER], artist, onArtistChange, artistFilters = [DEFAULT_FILTER], mood, onMoodChange, moodFilters = MOOD_FILTERS, videoOnly = false, onToggleVideos, onShuffle, onReset, disableVideoFilter = false, disableShuffle = false }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchAreaRef = useRef(null);
  const filterDrawerId = 'radioHeaderFilterDrawer';

  useEffect(() => {
    if (!headerSearchOpen) return undefined;
    const focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus?.());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [headerSearchOpen]);

  useEffect(() => {
    if (!headerSearchOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setHeaderSearchOpen(false);
        searchInputRef.current?.blur?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [headerSearchOpen]);

  useEffect(() => {
    if (!headerSearchOpen) return undefined;
    const handlePointerDown = event => {
      if (searchAreaRef.current?.contains(event.target)) return;
      setHeaderSearchOpen(false);
      searchInputRef.current?.blur?.();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [headerSearchOpen]);

  const openHeaderSearch = () => {
    setHeaderSearchOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  const closeHeaderSearch = () => {
    setHeaderSearchOpen(false);
    searchInputRef.current?.blur?.();
  };
  const renderFilterRow = (label, filters, selected, onChange) => h('div', { className: 'stashbox-filter-row', 'aria-label': `${label} filters` },
    h('b', null, `${label}:`),
    filters.map(filter => h('button', {
      key: `${label}-${filter}`,
      className: `stashbox-filter-pill ${selected === filter ? 'active' : ''}`,
      type: 'button',
      onClick: () => onChange(filter),
      disabled: isLoading,
      'aria-pressed': selected === filter
    }, filterLabel(filter)))
  );

  return h('header', { className: `stashbox-radio-header ${filtersOpen ? 'filters-open' : 'filters-closed'} ${headerSearchOpen ? 'header-search-open' : 'header-search-closed'}`, 'aria-label': 'Stashbox Radio header and filters' },
    h('div', { className: 'stashbox-compact-top' },
      h('div', { className: 'stashbox-brand-block', 'aria-label': 'Stashbox Radio' },
        h('a', { className: 'stashbox-brand-home-link', href: 'https://stashbox.com/', 'aria-label': 'Stashbox homepage' },
          h('p', { className: 'stashbox-tagline' }, 'LISTEN. WATCH. SHOP. SHARE.'),
          h('h1', null, h('span', null, 'STASHBOX'), h('span', { className: 'stashbox-radio-word' }, ' RADIO'))
        ),
        h('p', { className: 'stashbox-track-count', 'aria-live': 'polite' }, formatTrackCount(trackCount, isLoading))
      ),
      h('div', { className: 'stashbox-right-stack' },
        h('div', { className: 'stashbox-action-row', 'aria-label': 'Header actions' },
          h('div', { ref: searchAreaRef, className: `stashbox-header-search-area ${headerSearchOpen ? 'open' : 'closed'}` },
            h('label', { className: 'stashbox-search' },
              h('span', null, 'Search'),
              h('input', { ref: searchInputRef, id: 'stashboxHeaderSearchInput', type: 'search', placeholder: 'Song, album, artist...', value: query, onChange: event => onQueryChange(event.target.value), disabled: isLoading, autoComplete: 'off', 'aria-label': 'Search songs', onFocus: openHeaderSearch })
            ),
            h('button', { className: 'stashbox-search-close', type: 'button', onClick: closeHeaderSearch, disabled: isLoading, 'aria-label': 'Close search', title: 'Close search' }, '×'),
            h('button', { className: `stashbox-header-btn stashbox-mobile-search-trigger ${headerSearchOpen ? 'active' : ''}`, type: 'button', onClick: openHeaderSearch, disabled: isLoading, 'aria-label': 'Open search', 'aria-expanded': headerSearchOpen, 'aria-controls': 'stashboxHeaderSearchInput' }, '🔍')
          ),
          h('button', { className: 'stashbox-header-btn stashbox-filter-toggle', type: 'button', onClick: () => setFiltersOpen(current => !current), disabled: isLoading, 'aria-expanded': filtersOpen, 'aria-controls': filterDrawerId }, filtersOpen ? 'FILTERS ▴' : 'FILTERS ▾'),
          h('button', { className: `stashbox-header-btn stashbox-video ${videoOnly ? 'active' : ''}`, type: 'button', onClick: onToggleVideos, disabled: disableVideoFilter, 'aria-pressed': videoOnly }, 'Songs With Videos'),
          h('button', { className: 'stashbox-header-btn stashbox-shuffle', type: 'button', onClick: onShuffle, disabled: disableShuffle }, 'Shuffle All'),
          h('button', { className: 'stashbox-header-btn stashbox-utility', type: 'button', onClick: () => { onReset?.(); closeHeaderSearch(); }, disabled: isLoading, 'aria-label': 'Reset browsing filters' }, h('span', { className: 'reset-label-desktop' }, 'Reset Filters'), h('span', { className: 'reset-label-mobile' }, 'Reset'))
        )
      )
    ),
    h('section', { id: filterDrawerId, className: 'stashbox-filter-drawer', 'aria-label': 'Radio filters', 'aria-hidden': !filtersOpen, 'data-state': filtersOpen ? 'open' : 'closed' },
      h('div', { className: 'stashbox-filter-stack' },
        renderFilterRow('Genre', genreFilters, genre, onGenreChange),
        renderFilterRow('Album', albumFilters, album, onAlbumChange),
        renderFilterRow('Artist', artistFilters, artist, onArtistChange),
        renderFilterRow('Mood', moodFilters, mood, onMoodChange)
      )
    )
  );
}


function isSpacebarEvent(event) {
  return event?.code === 'Space' || event?.key === ' ';
}

function shouldIgnoreGlobalSpacebar(event) {
  const activeElement = event?.target instanceof Element ? event.target : document.activeElement;
  if (!activeElement) return false;
  if (activeElement.closest?.('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="searchbox"]')) return true;
  return false;
}

function toggleNativeMediaElement(media) {
  if (!media) return false;
  if (media.paused || media.ended) {
    media.play?.().catch?.(error => console.warn('[radio] playback error: unable to play media from keyboard.', error.message || error));
    return true;
  }
  media.pause?.();
  return true;
}

function App() {
  const sessionId = useMemo(getBrowserSessionId, []);
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState(DEFAULT_FILTER);
  const [album, setAlbum] = useState(DEFAULT_FILTER);
  const [artist, setArtist] = useState(DEFAULT_FILTER);
  const [mood, setMood] = useState(DEFAULT_FILTER);
  const [videoOnly, setVideoOnly] = useState(false);
  const [sortKey, setSortKey] = useState(DEFAULT_SORT);
  const [randomSortKeys, setRandomSortKeys] = useState([]);
  const [randomSortSourceKey, setRandomSortSourceKey] = useState('');
  const [songViewMode, setSongViewMode] = useState(getInitialSongViewMode);
  const [mediaMode, setMediaMode] = useState('idle');
  const [activeVideoEmbedUrl, setActiveVideoEmbedUrl] = useState('');
  const [likeCounts, setLikeCounts] = useState({});
  const [playCounts, setPlayCounts] = useState({});
  const [shareCounts, setShareCounts] = useState({});
  const [likedSongIds, setLikedSongIds] = useState(() => new Set());
  const likeSaveInFlightIdsRef = useRef(new Set());
  const [copiedSongId, setCopiedSongId] = useState(null);
  const [activeShuffleQueue, setActiveShuffleQueue] = useState([]);
  const [activeShuffleIndex, setActiveShuffleIndex] = useState(0);
  const [activeShuffleSourceKey, setActiveShuffleSourceKey] = useState('');
  const [isShuffleQueueActive, setIsShuffleQueueActive] = useState(false);
  const [shuffleNotice, setShuffleNotice] = useState('');
  const [autoPlayRequest, setAutoPlayRequest] = useState(null);
  const [playerMessage, setPlayerMessage] = useState('');
  const [activeAds, setActiveAds] = useState([]);
  const [adSettings, setAdSettings] = useState(() => normalizeAdSettings(DEFAULT_AD_SETTINGS));
  const [currentAd, setCurrentAd] = useState(null);
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [lastPlayedAdId, setLastPlayedAdId] = useState(null);
  const selectedRef = useRef(null);
  const playbackRef = useRef({ currentSongKey: null, startedAt: 0, hasStarted: false, secondsPlayed: 0, duration: 0, hasCompleted: false, mode: 'idle' });
  const currentPlayInstanceRef = useRef(null);
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const hasHandledVideoEndRef = useRef(false);
  const mediaIsPlayingRef = useRef(false);
  const adPlayCountsRef = useRef({});
  const adBreakCompletedCountRef = useRef(0);
  const currentAdBreakQueueRef = useRef([]);
  const currentAdBreakActiveQueueRef = useRef([]);
  const currentAdBreakTotalRef = useRef(0);
  const currentAdBreakCurrentIndexRef = useRef(0);
  const currentAdBreakMethodRef = useRef('count');
  const currentAdBreakTargetSecondsRef = useRef(DEFAULT_TARGET_AD_SECONDS);
  const currentAdBreakCompletedSecondsRef = useRef(0);
  const currentAdBreakCurrentTimeRef = useRef(0);
  const currentAdBreakStartedAtRef = useRef(0);
  const currentAdBreakHideLogKeyRef = useRef('');
  const [adBreakDisplay, setAdBreakDisplay] = useState(null);
  const [adBreakMuted, setAdBreakMuted] = useState(false);
  const adDurationMemoryRef = useRef({});
  const pendingAdNextSongRef = useRef(null);
  const videoCleanupInProgressRef = useRef(false);
  const isAdPlayingRef = useRef(false);
  const handledAdEndRef = useRef(false);
  const products = useProducts(currentAd ? null : selected);

  const selectedSong = selected || tracks[0] || null;
  useEffect(() => {
    selectedRef.current = selectedSong;
    if (!selectedSong) return;
    console.log('[Stashbox Radio] selectedSong', selectedSong);
    console.log("Counts loaded from API", {
      song_key: selectedSong.song_key,
      total_plays: selectedSong.total_plays,
      likes: selectedSong.likes,
      shares: selectedSong.shares
    });
    const nextLikes = getSongLikes(selectedSong);
    const nextPlays = getSongPlays(selectedSong);
    const nextShares = getSongShares(selectedSong);
    setLikeCounts(prev => ({ ...prev, [selectedSong.songKey]: Math.max(Number(prev[selectedSong.songKey] || 0), nextLikes) }));
    setPlayCounts(prev => ({ ...prev, [selectedSong.songKey]: Math.max(Number(prev[selectedSong.songKey] || 0), nextPlays) }));
    setShareCounts(prev => ({ ...prev, [selectedSong.songKey]: Math.max(Number(prev[selectedSong.songKey] || 0), nextShares) }));
  }, [selectedSong]);

  useEffect(() => {
    updateMediaSessionMetadata(selectedSong);
  }, [selectedSong?.idx, selectedSong?.display_title, selectedSong?.song_name, selectedSong?.title, selectedSong?.artist, selectedSong?.raw?.album_name, selectedSong?.resolved_artwork_url, selectedSong?.song_artwork_url, selectedSong?.artwork_url, selectedSong?.cover_art_url, selectedSong?.imageUrl, selectedSong?.videoLink]);

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
  useEffect(() => { console.log('[Stashbox Radio] mediaMode', mediaMode); }, [mediaMode]);
  useEffect(() => { console.log('[Stashbox Radio] activeVideoEmbedUrl', activeVideoEmbedUrl); }, [activeVideoEmbedUrl]);
  useEffect(() => { isAdPlayingRef.current = isAdPlaying; }, [isAdPlaying]);
  useEffect(() => {
    let alive = true;
    loadActiveAds().then(nextAds => { if (alive) setActiveAds(nextAds); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    loadPublicAdSettings().then(nextSettings => { if (alive) setAdSettings(nextSettings); });
    return () => { alive = false; };
  }, []);
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
      setLikeCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, getSongLikes(track)])));
      setPlayCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, getSongPlays(track)])));
      setShareCounts(Object.fromEntries(nextTracks.map(track => [track.songKey, getSongShares(track)])));
      console.log('[Stashbox Radio] count values loaded from API', nextTracks.map(track => ({ song_key: track.songKey, title: track.title, total_plays: track.total_plays, full_play_count: track.full_play_count, partial_play_count: track.partial_play_count, skip_count: track.skip_count, likes: track.likes, shares: track.shares, share_link_visits: track.share_link_visits, video_clicks: track.video_clicks, product_clicks: track.product_clicks })));
      const urlSelectedSong = songKeyFromUrl
        ? nextTracks.find(track => matchesSongDeepLink(track, songKeyFromUrl))
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

  const activePublicTracks = useMemo(() => tracks.filter(isActivePublicSong), [tracks]);
  const genreFilters = useMemo(() => buildGenreFilters(activePublicTracks), [activePublicTracks]);
  const albumFilters = useMemo(() => buildAlbumFilters(activePublicTracks), [activePublicTracks]);
  const artistFilters = useMemo(() => buildArtistFilters(activePublicTracks), [activePublicTracks]);
  const moodFilters = useMemo(() => buildMoodFilters(activePublicTracks), [activePublicTracks]);

  const filtered = useMemo(() => activePublicTracks.filter(track => {
    const q = query.trim().toLowerCase();
    const queryMatch = !q || [track.title, track.artist, track.album, track.genre, track.mood, track.publicTrackNote, ...parseStringList(track.moodTags)].some(value => clean(value).toLowerCase().includes(q));
    return queryMatch && (genre === DEFAULT_FILTER || track.sectionKey === genre) && albumMatches(track.album, album) && artistMatches(track.artist, artist) && moodMatches(track, mood) && (!videoOnly || track.hasVideo);
  }), [activePublicTracks, query, genre, album, artist, mood, videoOnly]);

  const randomFilterSourceKey = useMemo(() => JSON.stringify({
    query: clean(query),
    genre,
    album,
    artist,
    mood,
    videoOnly,
    songKeys: filtered.map(getRandomSortTrackKey)
  }), [query, genre, album, artist, mood, videoOnly, filtered]);
  const baseSortedFiltered = useMemo(() => sortSongs(filtered, sortKey === 'random' ? DEFAULT_SORT : sortKey, { likeCounts, playCounts, shareCounts }), [filtered, sortKey, likeCounts, playCounts, shareCounts]);
  const sortedFiltered = useMemo(() => sortKey === 'random' ? orderSongsByRandomKeys(baseSortedFiltered, randomSortKeys) : baseSortedFiltered, [baseSortedFiltered, randomSortKeys, sortKey]);
  const shuffleSourceKey = useMemo(() => JSON.stringify({ query: clean(query), genre, album, artist, mood, videoOnly, sortKey }), [query, genre, album, artist, mood, videoOnly, sortKey]);
  const listContextTitle = useMemo(() => getListContextTitle({ query, artist, genre, album, mood, videoOnly, sortKey }), [query, artist, genre, album, mood, videoOnly, sortKey]);
  const videoFocusedList = useMemo(() => isVideoFocusedList({ videoOnly, sortKey }), [videoOnly, sortKey]);

  useEffect(() => {
    if (sortKey !== 'random') {
      setRandomSortKeys([]);
      setRandomSortSourceKey('');
      return;
    }
    if (randomSortSourceKey === randomFilterSourceKey) return;
    setRandomSortKeys(shuffleTracks(filtered.map(getRandomSortTrackKey)));
    setRandomSortSourceKey(randomFilterSourceKey);
  }, [filtered, randomFilterSourceKey, randomSortSourceKey, sortKey]);

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, songViewMode); } catch (_) {}
  }, [songViewMode]);

  const playableFiltered = useMemo(() => sortedFiltered.filter(canPlayTrack), [sortedFiltered]);
  const playbackList = useMemo(() => isShuffleQueueActive ? activeShuffleQueue : playableFiltered, [activeShuffleQueue, isShuffleQueueActive, playableFiltered]);

  useEffect(() => {
    if (!isShuffleQueueActive || !activeShuffleSourceKey || activeShuffleSourceKey === shuffleSourceKey) return;
    setActiveShuffleQueue([]);
    setActiveShuffleIndex(0);
    setActiveShuffleSourceKey('');
    setIsShuffleQueueActive(false);
  }, [activeShuffleSourceKey, isShuffleQueueActive, shuffleSourceKey]);

  const groupedSongSections = useMemo(() => buildGroupedSongSections(sortedFiltered, sortKey), [sortedFiltered, sortKey]);
  const isGroupedSongView = sortKey === 'genre' || sortKey === 'artist';


  function getEligibleAdsForBreak() {
    const eligible = activeAds.filter(ad => (
      adSettings.ads_enabled &&
      ad.active &&
      has(ad.mediaUrl) &&
      isDateEligible(ad) &&
      (adPlayCountsRef.current[ad.id] || 0) < ad.max_plays_per_session
    ));
    console.log(`[Stashbox Radio] Eligible ads for break: ${eligible.length}`);
    if (!eligible.length) console.log('[Stashbox Radio] No active ads available for completed item');
    return eligible;
  }

  function pickWeightedAdForBreak(availableAds, usedIds = new Set()) {
    if (!availableAds.length) return null;
    const uniquePool = availableAds.filter(ad => !usedIds.has(ad.id));
    const candidates = uniquePool.length ? uniquePool : availableAds;
    return weightedRandomAd(candidates);
  }

  function buildAdBreakQueue() {
    const eligible = getEligibleAdsForBreak();
    if (!eligible.length) return [];
    const settings = normalizeAdSettings(adSettings);
    const queue = [];
    const usedIds = new Set();

    if (settings.break_method === 'seconds') {
      let accumulatedSeconds = 0;
      while (accumulatedSeconds < settings.target_ad_seconds && queue.length < 20) {
        const nextAd = pickWeightedAdForBreak(eligible, usedIds);
        if (!nextAd) break;
        queue.push(nextAd);
        usedIds.add(nextAd.id);
        accumulatedSeconds += Number(adDurationMemoryRef.current[nextAd.id] || nextAd.durationSeconds || estimatedAdDurationSeconds(nextAd));
        if (usedIds.size >= eligible.length) usedIds.clear();
      }
      console.log(`[Stashbox Radio] Built seconds ad break: ${queue.length} ads, estimated ${accumulatedSeconds}s target ${settings.target_ad_seconds}s`);
      return queue;
    }

    const requestedCount = settings.ads_per_break;
    while (queue.length < requestedCount) {
      const nextAd = pickWeightedAdForBreak(eligible, usedIds);
      if (!nextAd) break;
      queue.push(nextAd);
      usedIds.add(nextAd.id);
      if (usedIds.size >= eligible.length) usedIds.clear();
    }
    console.log(`[Stashbox Radio] Built count ad break: ${queue.length} ads requested ${requestedCount}`);
    return queue;
  }

  function getCurrentAdBreakHideReason(ad = currentAd) {
    const breakMethod = currentAdBreakMethodRef.current;
    if (!ad) return 'no active ad';
    if (!currentAdBreakActiveQueueRef.current.length && !currentAdBreakQueueRef.current.length) return 'missing queue';
    if (!Number(currentAdBreakCurrentIndexRef.current)) return 'missing current index';
    if (breakMethod !== 'count' && breakMethod !== 'seconds') return 'unknown break method';
    return '';
  }

  function logAdBreakDisplayHidden(reason, ad = currentAd) {
    if (!reason) return;
    const key = `${ad?.id || 'no-ad'}:${currentAdBreakCurrentIndexRef.current || 0}:${reason}`;
    if (currentAdBreakHideLogKeyRef.current === key) return;
    currentAdBreakHideLogKeyRef.current = key;
    console.log('[Stashbox Radio] ad break display hidden', { reason });
  }

  function getCurrentAdBreakDisplay(ad = currentAd) {
    const hideReason = getCurrentAdBreakHideReason(ad);
    if (hideReason) {
      logAdBreakDisplayHidden(hideReason, ad);
      return null;
    }

    const method = currentAdBreakMethodRef.current === 'seconds' ? 'seconds' : 'count';
    const currentAdNumber = Math.max(0, Number(currentAdBreakCurrentIndexRef.current) || 0);
    const queuedTotal = Number(currentAdBreakActiveQueueRef.current.length) || Number(currentAdBreakTotalRef.current) || 0;
    const totalAds = Math.max(0, queuedTotal);
    const targetSeconds = Number.isFinite(Number(currentAdBreakTargetSecondsRef.current)) && Number(currentAdBreakTargetSecondsRef.current) > 0
      ? Number(currentAdBreakTargetSecondsRef.current)
      : DEFAULT_TARGET_AD_SECONDS;
    const completedAdBreakSeconds = Math.max(0, Number(currentAdBreakCompletedSecondsRef.current) || 0);
    const currentAdCurrentTime = Math.max(0, Number(currentAdBreakCurrentTimeRef.current) || 0);
    const elapsedSeconds = Math.max(0, completedAdBreakSeconds + currentAdCurrentTime);
    const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);

    if (!currentAdNumber || !totalAds) {
      logAdBreakDisplayHidden(!totalAds ? 'missing queue' : 'missing current index', ad);
      return null;
    }

    return {
      method,
      breakMethod: method,
      currentAdNumber,
      totalAds,
      totalAdsInBreak: totalAds,
      targetSeconds,
      targetAdSeconds: targetSeconds,
      completedAdBreakSeconds,
      currentAdCurrentTime,
      elapsedSeconds,
      elapsedAdBreakSeconds: elapsedSeconds,
      remainingSeconds
    };
  }

  function resetCurrentAdBreakDisplay() {
    currentAdBreakQueueRef.current = [];
    currentAdBreakActiveQueueRef.current = [];
    currentAdBreakTotalRef.current = 0;
    currentAdBreakCurrentIndexRef.current = 0;
    currentAdBreakMethodRef.current = 'count';
    currentAdBreakTargetSecondsRef.current = DEFAULT_TARGET_AD_SECONDS;
    currentAdBreakCompletedSecondsRef.current = 0;
    currentAdBreakCurrentTimeRef.current = 0;
    currentAdBreakStartedAtRef.current = 0;
    currentAdBreakHideLogKeyRef.current = '';
    setAdBreakDisplay(null);
    setAdBreakMuted(false);
  }

  function startAdFromQueue(nextAd, nextSong) {
    if (!nextAd) return false;
    pendingAdNextSongRef.current = nextSong || pendingAdNextSongRef.current || null;
    currentAdBreakCurrentIndexRef.current = Math.min(
      Math.max(1, Number(currentAdBreakCurrentIndexRef.current || 0) + 1),
      Math.max(1, Number(currentAdBreakTotalRef.current) || 1)
    );
    currentAdBreakCurrentTimeRef.current = 0;
    currentAdBreakStartedAtRef.current = Date.now();
    currentAdBreakHideLogKeyRef.current = '';
    const nextDisplay = getCurrentAdBreakDisplay(nextAd);
    setAdBreakDisplay(nextDisplay);
    adPlayCountsRef.current[nextAd.id] = (adPlayCountsRef.current[nextAd.id] || 0) + 1;
    handledAdEndRef.current = false;
    setCurrentAd(nextAd);
    setIsAdPlaying(true);
    setLastPlayedAdId(nextAd.id);
    setPlayerMessage('Sponsored message. Song playback will continue after this ad break.');
    setAutoPlayRequest(null);
    setMediaMode('idle');
    setActiveVideoEmbedUrl('');
    return true;
  }

  function maybeStartAdBeforeNextSong(nextSong, currentSong, { allowAfterCompletedVideo = false } = {}) {
    if (isAdPlayingRef.current || currentAd || (mediaMode === 'video' && !allowAfterCompletedVideo)) return false;
    if (!adSettings.ads_enabled) {
      console.log('[Stashbox Radio] Ads disabled by public ad settings.');
      return false;
    }
    if (!nextSong) return false;
    if (nextSong?.idx && currentSong?.idx && nextSong.idx === currentSong.idx) return false;

    adBreakCompletedCountRef.current += 1;
    const breakInterval = normalizeAdSettings(adSettings).break_interval;
    if (adBreakCompletedCountRef.current < breakInterval) {
      console.log(`[Stashbox Radio] Ad break skipped by interval ${adBreakCompletedCountRef.current}/${breakInterval}`);
      return false;
    }
    adBreakCompletedCountRef.current = 0;

    console.log('[Stashbox Radio] Ad break required after completed item');
    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
    }
    const queue = buildAdBreakQueue();
    if (!queue.length) return false;
    const settings = normalizeAdSettings(adSettings);
    currentAdBreakQueueRef.current = queue.slice(1);
    currentAdBreakActiveQueueRef.current = queue.slice();
    currentAdBreakTotalRef.current = queue.length;
    currentAdBreakCurrentIndexRef.current = 0;
    currentAdBreakMethodRef.current = settings.break_method === 'seconds' ? 'seconds' : 'count';
    currentAdBreakTargetSecondsRef.current = Number.isFinite(Number(settings.target_ad_seconds)) && Number(settings.target_ad_seconds) > 0
      ? Number(settings.target_ad_seconds)
      : DEFAULT_TARGET_AD_SECONDS;
    currentAdBreakCompletedSecondsRef.current = 0;
    currentAdBreakCurrentTimeRef.current = 0;
    currentAdBreakStartedAtRef.current = Date.now();
    setAdBreakMuted(false);
    return startAdFromQueue(queue[0], nextSong);
  }

  async function continueAfterAd(eventType = 'ad_complete', adOverride = null, watchedSeconds = 0) {
    const completedAd = adOverride || currentAd;
    if (!completedAd || handledAdEndRef.current) return;
    handledAdEndRef.current = true;
    if (currentAdBreakMethodRef.current === 'seconds') {
      const watched = Math.max(0, Number(watchedSeconds) || Number(currentAdBreakCurrentTimeRef.current) || 0);
      currentAdBreakCompletedSecondsRef.current = Math.max(0, currentAdBreakCompletedSecondsRef.current + watched);
      currentAdBreakCurrentTimeRef.current = 0;
    }
    if (eventType) {
      recordAdEvent(completedAd, eventType, { song: pendingAdNextSongRef.current || selectedSong, sessionId });
      await sendAdTrackingEvent(completedAd, eventType);
    }

    const nextQueuedAd = currentAdBreakQueueRef.current.shift();
    if (nextQueuedAd) {
      startAdFromQueue(nextQueuedAd, pendingAdNextSongRef.current || null);
      return;
    }

    const nextSong = pendingAdNextSongRef.current || resolveAdjacentPlayableSong(1, selectedSong);
    pendingAdNextSongRef.current = null;
    resetCurrentAdBreakDisplay();
    setCurrentAd(null);
    setIsAdPlaying(false);
    setAdBreakMuted(false);
    try { if (audioRef.current) audioRef.current.muted = false; } catch (_) {}
    setPlayerMessage('');
    if (nextSong) selectTrack(nextSong, { autoStart: true, preferVideo: videoFocusedList && nextSong.hasVideo });
  }

  function handleAdDurationKnown(ad, durationSeconds) {
    if (!ad?.id) return;
    const duration = Number(durationSeconds);
    if (Number.isFinite(duration) && duration > 0) {
      adDurationMemoryRef.current[ad.id] = duration;
    }
  }

  function handleAdStarted(ad) {
    console.log(`Ad started: ${ad?.title || 'Untitled ad'}`);
    const nextDisplay = getCurrentAdBreakDisplay(ad);
    setAdBreakDisplay(nextDisplay);
    if (nextDisplay) {
      console.log('[Stashbox Radio] ad break display', {
        breakMethod: nextDisplay.method,
        currentAdNumber: nextDisplay.currentAdNumber,
        totalAdsInBreak: nextDisplay.totalAds,
        targetAdSeconds: nextDisplay.targetSeconds,
        completedAdBreakSeconds: nextDisplay.completedAdBreakSeconds
      });
    }
    recordAdEvent(ad, 'ad_start', { song: pendingAdNextSongRef.current || selectedSong, sessionId });
    sendAdTrackingEvent(ad, 'ad_start');
  }

  function handleAdProgress(ad, currentTimeSeconds = 0) {
    if (!ad || ad.id !== currentAd?.id) return;
    const nextCurrentTime = Math.max(0, Number(currentTimeSeconds) || 0);
    if (Math.floor(nextCurrentTime) === Math.floor(currentAdBreakCurrentTimeRef.current)) return;
    currentAdBreakCurrentTimeRef.current = nextCurrentTime;
    if (currentAdBreakMethodRef.current === 'seconds') setAdBreakDisplay(getCurrentAdBreakDisplay(ad));
  }

  function handleAdSkipped(ad, watchedSeconds = 0) {
    const skippedAd = ad || currentAd;
    console.log(`Ad skipped: ${skippedAd?.title || 'Untitled ad'}`);
    continueAfterAd('ad_skip', skippedAd, watchedSeconds);
  }

  function handleAdCompleted(ad, watchedSeconds = 0) {
    const completedAd = ad || currentAd;
    console.log(`Ad completed: ${completedAd?.title || 'Untitled ad'}`);
    continueAfterAd('ad_complete', completedAd, watchedSeconds);
  }

  function handleAdCtaClicked(ad) {
    recordAdEvent(ad, 'ad_click', { song: pendingAdNextSongRef.current || selectedSong, sessionId });
    sendAdTrackingEvent(ad, 'ad_click');
  }

  function handleAdBlocked(ad) {
    console.warn(`[Stashbox Radio] Ad autoplay blocked or skipped by browser restriction: ${ad?.title || 'Untitled ad'}`);
    continueAfterAd('blocked_or_autoplay_skipped', ad, 0);
  }

  function handleAdError(ad, errorMessage = '') {
    console.warn('[Stashbox Radio] ad playback failed; continuing to next song.', errorMessage);
    recordAdEvent(ad, 'ad_error', { song: pendingAdNextSongRef.current || selectedSong, sessionId, extra: { error_message: errorMessage } });
    continueAfterAd(null, ad, 0);
  }

  function resetRadioFilters() {
    setQuery('');
    setGenre(DEFAULT_FILTER);
    setAlbum(DEFAULT_FILTER);
    setArtist(DEFAULT_FILTER);
    setMood(DEFAULT_FILTER);
    setVideoOnly(false);
    setSortKey(DEFAULT_SORT);
    setRandomSortKeys([]);
    setRandomSortSourceKey('');
    setActiveShuffleQueue([]);
    setActiveShuffleIndex(0);
    setActiveShuffleSourceKey('');
    setIsShuffleQueueActive(false);
    setShuffleNotice('');
  }

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
    updateMediaSessionMetadata(song);
    setMediaSessionPlaybackState('playing');
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

    console.log('[radio] current playback mode before switch:', mediaMode);
    console.log('[radio] selected song title:', nextSong?.title);
    console.log('[radio] youtube iframe exists before switch:', Boolean(youtubeIframes.length));
    console.log('[radio] youtube player object exists before switch:', Boolean(youtubePlayer));
    console.log('[radio] audio currently playing before switch:', Boolean(audio && !audio.paused && !audio.ended));

    if (mediaMode !== 'video' && !youtubePlayer && !youtubeIframes.length && !directVideo) return;

    videoCleanupInProgressRef.current = true;
    console.log('[radio] resetting video mode');

    try {
      if (typeof youtubePlayer?.stopVideo === 'function') youtubePlayer.stopVideo();
    } catch (error) {
      console.warn('[radio] youtube stopVideo failed:', error.message || error);
    }

    try {
      if (typeof youtubePlayer?.pauseVideo === 'function') youtubePlayer.pauseVideo();
    } catch (error) {
      console.warn('[radio] youtube pauseVideo failed:', error.message || error);
    }

    try {
      if (typeof youtubePlayer?.destroy === 'function') youtubePlayer.destroy();
    } catch (error) {
      console.warn('[radio] youtube destroy failed:', error.message || error);
    }

    try {
      if (directVideo) {
        directVideo.pause?.();
        directVideo.removeAttribute('src');
        directVideo.load?.();
      }
    } catch (error) {
      console.warn('[radio] direct video cleanup failed:', error.message || error);
    }

    try {
      youtubeIframes.forEach(iframe => {
        try { iframe.src = ''; } catch (_) {}
        iframe.remove();
      });
    } catch (error) {
      console.warn('[radio] iframe cleanup failed:', error.message || error);
    }

    youtubePlayerRef.current = null;
    mediaIsPlayingRef.current = false;
    setActiveVideoEmbedUrl('');
    setMediaMode('idle');
    setAutoPlayRequest(null);
    document.body.classList.remove('video-active', 'is-video-playing');

    console.log('[radio] video reset complete');
  }

  function selectTrack(track, { autoStart = false, preferVideo = false } = {}) {
    if (!track) return;
    resetVideoPlaybackBeforeSongSwitch(track);
    console.log('[radio] rendering selected song:', track?.title);
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
      console.log('[radio] selected song render finished:', track?.title);
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
      console.warn('[radio] Audio element was not ready after song card tap:', track.title);
      window.requestAnimationFrame(() => {
        videoCleanupInProgressRef.current = false;
        playerRef.current?.focus?.();
      });
      return;
    }

    try { audio.pause(); } catch (_) {}
    try { audio.currentTime = 0; } catch (_) {}
    try { audio.load?.(); } catch (_) {}

    console.log('[Stashbox Radio] audio_url being played from song card tap', track.audioUrl);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(error => {
        console.warn('[radio] Audio play failed after song card tap:', error.message || error);
      });
    }

    window.requestAnimationFrame(() => {
      videoCleanupInProgressRef.current = false;
      playerRef.current?.focus?.();
      console.log('[radio] selected song render finished:', track?.title);
    });
  }

  function chooseSong(track) {
    console.log('[radio] song selected:', track?.title);
    if (!track) return;
    setActiveShuffleQueue([]);
    setActiveShuffleIndex(0);
    setActiveShuffleSourceKey('');
    setIsShuffleQueueActive(false);
    setShuffleNotice('');
    setCurrentAd(null);
    setIsAdPlaying(false);
    pendingAdNextSongRef.current = null;
    finishPlayback('play_partial');
    resetVideoPlaybackBeforeSongSwitch(track);

    const currentAudio = audioRef.current;
    if (currentAudio) {
      try { currentAudio.pause(); } catch (error) { console.warn('[radio] Unable to pause current audio before song card tap:', error.message || error); }
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
    if (isShuffleQueueActive && activeShuffleQueue.length === 1) return activeShuffleQueue[0];
    if (playbackList.length === 1) {
      return playbackList[0].idx === song?.idx ? null : playbackList[0];
    }
    const currentIndex = isShuffleQueueActive
      ? Math.max(0, activeShuffleQueue.findIndex(track => track.idx === song?.idx))
      : playbackList.findIndex(track => track.idx === song?.idx);
    const startIndex = currentIndex >= 0 ? currentIndex : (direction > 0 ? -1 : playbackList.length);
    for (let step = 1; step <= playbackList.length; step += 1) {
      const candidateIndex = startIndex + (direction * step);
      if (!allowWrap && (candidateIndex < 0 || candidateIndex >= playbackList.length)) return null;
      const wrappedIndex = ((candidateIndex % playbackList.length) + playbackList.length) % playbackList.length;
      const next = playbackList[wrappedIndex];
      if (next && (isShuffleQueueActive || next.idx !== song?.idx)) return next;
    }
    return null;
  }

  function getNextShuffleQueueItem(direction, song = selectedSong) {
    if (!isShuffleQueueActive || !activeShuffleQueue.length) return null;
    const currentIndex = activeShuffleQueue.findIndex(track => track.idx === song?.idx);
    const startIndex = currentIndex >= 0 ? currentIndex : activeShuffleIndex;
    const nextIndex = ((startIndex + direction) % activeShuffleQueue.length + activeShuffleQueue.length) % activeShuffleQueue.length;
    return { track: activeShuffleQueue[nextIndex], index: nextIndex };
  }

  function shiftTrack(direction, { autoStart = false, finishType = 'play_partial', forcedSong = null, preferVideo = false } = {}) {
    if (!playbackList.length) return;
    const queuedNext = getNextShuffleQueueItem(direction, forcedSong || selectedSong);
    const next = queuedNext?.track || resolveAdjacentPlayableSong(direction, forcedSong || selectedSong);
    if (!next) return;
    if (queuedNext) setActiveShuffleIndex(queuedNext.index);
    finishPlayback(finishType, forcedSong);
    selectTrack(next, { autoStart, preferVideo });
  }

  function safelyCleanupYouTubeBeforeNext(nextSong = null) {
    resetVideoPlaybackBeforeSongSwitch(nextSong);
  }

  function handleManualNext() {
    const currentSong = selectedSong;
    console.log("Manual next clicked while mediaMode:", mediaMode);
    console.log("Current video song:", currentSong?.song_key);
    const queuedNext = getNextShuffleQueueItem(1, currentSong);
    const nextSong = queuedNext?.track || resolveAdjacentPlayableSong(1, currentSong);
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

    if (queuedNext) setActiveShuffleIndex(queuedNext.index);
    if (currentSong) sendTrackingEvent(currentSong, 'skip', sessionId);
    finishPlayback('play_partial', currentSong);
    setPlayerMessage('');
    setActiveVideoEmbedUrl('');
    setMediaMode('idle');
    setSelected(nextSong);
    setAutoPlayRequest(wasPlaying ? { idx: nextSong.idx, requestedAt: Date.now(), preferVideo: videoFocusedList && nextSong.hasVideo } : null);
    console.log("Selected next song after video cleanup:", nextSong?.song_key);
    console.log("Player shell should stay mounted");
    window.requestAnimationFrame(() => {
      videoCleanupInProgressRef.current = false;
      playerRef.current?.focus?.();
      console.log('[radio] selected song render finished:', nextSong?.title);
    });
  }

  function handleVideoEnded(song = selectedSong, { preferVideo = true } = {}) {
    const endedSong = song || selectedRef.current;
    if (hasHandledVideoEndRef.current) return;
    hasHandledVideoEndRef.current = true;
    console.log("Video ended for:", endedSong?.song_key);
    finishPlayback('play_full', endedSong);
    const queuedNext = getNextShuffleQueueItem(1, endedSong);
    const currentIndex = playbackList.findIndex(track => track.idx === endedSong?.idx);
    const nextSong = queuedNext?.track || (currentIndex >= 0
      ? (playbackList.length > 1 ? playbackList[(currentIndex + 1) % playbackList.length] : null)
      : (playbackList[0] || null));
    if (queuedNext) setActiveShuffleIndex(queuedNext.index);
    console.log("Next song after video end:", nextSong?.song_key);
    setMediaMode('idle');
    setActiveVideoEmbedUrl('');
    if (maybeStartAdBeforeNextSong(nextSong, endedSong, { allowAfterCompletedVideo: true })) return;
    if (nextSong) {
      setSelected(nextSong);
      setAutoPlayRequest({ idx: nextSong.idx, requestedAt: Date.now(), preferVideo: preferVideo || (videoFocusedList && nextSong.hasVideo) });
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
    console.log("YouTube ended for:", endedSong?.song_key);
    finishPlayback('play_full', endedSong);
    const queuedNext = getNextShuffleQueueItem(1, endedSong);
    const currentIndex = playbackList.findIndex(track => track.idx === endedSong?.idx);
    const nextSong = queuedNext?.track || (currentIndex >= 0
      ? (playbackList.length > 1 ? playbackList[(currentIndex + 1) % playbackList.length] : null)
      : (playbackList[0] || null));
    if (queuedNext) setActiveShuffleIndex(queuedNext.index);
    setMediaMode('idle');
    setActiveVideoEmbedUrl('');
    if (maybeStartAdBeforeNextSong(nextSong, endedSong, { allowAfterCompletedVideo: true })) return;
    if (nextSong) setSelected(nextSong);
    setAutoPlayRequest(nextSong ? { idx: nextSong.idx, requestedAt: Date.now(), preferVideo: videoFocusedList && nextSong.hasVideo } : null);
    window.requestAnimationFrame(() => playerRef.current?.focus?.());
  }

  function autoAdvanceFromEnded(song = selectedSong, { preferVideo = false } = {}) {
    finishPlayback('play_full', song);
    if (!playbackList.length) return;
    const queuedNext = getNextShuffleQueueItem(1, song);
    const currentIndex = Math.max(0, playbackList.findIndex(track => track.idx === song?.idx));
    const nextIndex = (currentIndex + 1) % playbackList.length;
    const next = queuedNext?.track || playbackList[nextIndex];
    if (!next) return;
    if (queuedNext) setActiveShuffleIndex(queuedNext.index);
    console.log("Next autoplay item:", next.song_key);
    if (maybeStartAdBeforeNextSong(next, song)) return;
    selectTrack(next, { autoStart: true, preferVideo: preferVideo || (videoFocusedList && next.hasVideo) });
  }

  useEffect(() => {
    if (!autoPlayRequest || autoPlayRequest.idx !== selectedSong?.idx) return undefined;
    const shouldPlayVideo = selectedSong?.hasVideo && (autoPlayRequest.preferVideo || selectedSong.videoOnly || !selectedSong.hasAudio);
    if (!shouldPlayVideo) return undefined;
    const startTimer = window.setTimeout(() => {
      const embedUrl = youtubeEmbed(selectedSong.videoLink);
      if (!embedUrl) {
        console.warn('[Stashbox Radio] unable to auto-start next video; keeping player visible', selectedSong.song_key);
        setAutoPlayRequest(null);
        return;
      }
      setActiveVideoEmbedUrl(`${embedUrl}&auto_advance=${Date.now()}`);
      setMediaMode('video');
    }, 0);
    return () => window.clearTimeout(startTimer);
  }, [autoPlayRequest, selectedSong]);

  function pickRandomTrack(sourceTracks = playableFiltered) {
    const requestedSource = Array.isArray(sourceTracks) ? sourceTracks : playableFiltered;
    const shuffleSource = requestedSource.filter(canPlayTrack);
    if (!shuffleSource.length) {
      setShuffleNotice('No songs available to shuffle.');
      setPlayerMessage('No songs available to shuffle.');
      return;
    }
    finishPlayback('play_partial');
    const shuffled = shuffleTracks(shuffleSource);
    const next = shuffled[0];
    setActiveShuffleQueue(shuffled);
    setActiveShuffleIndex(0);
    setActiveShuffleSourceKey(shuffleSourceKey);
    setIsShuffleQueueActive(true);
    setShuffleNotice('');
    selectTrack(next, { autoStart: true, preferVideo: (videoFocusedList && next.hasVideo) || isVideoOnlyTrack(next) || !next.hasAudio });
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


  function toggleActiveAdPlaybackFromKeyboard() {
    if (!currentAd) return false;
    const media = playerRef.current?.querySelector?.('.ad-player audio, .ad-player video, audio.ad-audio, video.ad-video');
    return toggleNativeMediaElement(media);
  }

  function toggleActiveVideoPlaybackFromKeyboard() {
    const directVideo = playerRef.current?.querySelector?.('.player-media video');
    if (directVideo) return toggleNativeMediaElement(directVideo);

    const youtubePlayer = youtubePlayerRef.current;
    if (mediaIsPlayingRef.current && typeof youtubePlayer?.pauseVideo === 'function') {
      try {
        youtubePlayer.pauseVideo();
        setMediaSessionPlaybackState('paused');
        return true;
      } catch (error) {
        console.warn('[radio] Spacebar video pause failed.', error.message || error);
        return false;
      }
    }

    if (typeof youtubePlayer?.playVideo === 'function') {
      try {
        youtubePlayer.playVideo();
        setMediaSessionPlaybackState('playing');
        return true;
      } catch (error) {
        console.warn('[radio] Spacebar video play failed.', error.message || error);
        return false;
      }
    }

    return false;
  }

  function togglePlayPauseFromKeyboard() {
    if (currentAd) {
      toggleActiveAdPlaybackFromKeyboard();
      return;
    }

    const primaryPlayPauseButton = playerRef.current?.querySelector?.('.play-toggle:not([disabled])');
    if (primaryPlayPauseButton) {
      primaryPlayPauseButton.click();
      return;
    }

    if (mediaMode === 'video') {
      if (toggleActiveVideoPlaybackFromKeyboard()) return;
      if (selectedSong?.hasVideo && !activeVideoEmbedUrl) openVideo({ startPlayback: true });
      return;
    }

    const audio = audioRef.current;
    if (!audio || !selectedSong?.hasAudio || !has(selectedSong?.audioUrl)) return;
    toggleNativeMediaElement(audio);
  }

  useEffect(() => {
    const handleGlobalKeyDown = event => {
      if (event.defaultPrevented || !isSpacebarEvent(event) || event.repeat || shouldIgnoreGlobalSpacebar(event)) return;
      event.preventDefault();
      togglePlayPauseFromKeyboard();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;

    const playHandler = () => {
      updateMediaSessionMetadata(selectedRef.current || selectedSong);
      if (mediaMode === 'video') {
        const youtubePlayer = youtubePlayerRef.current;
        try {
          if (typeof youtubePlayer?.playVideo === 'function') {
            youtubePlayer.playVideo();
            setMediaSessionPlaybackState('playing');
            return;
          }
        } catch (error) {
          console.warn('[radio] Media Session video play handler failed.', error.message || error);
        }
      }
      const audio = audioRef.current;
      if (audio) audio.play().then(() => setMediaSessionPlaybackState('playing')).catch(error => console.warn('[radio] Media Session play handler failed.', error.message || error));
    };

    const pauseHandler = () => {
      if (mediaMode === 'video') {
        const youtubePlayer = youtubePlayerRef.current;
        try {
          if (typeof youtubePlayer?.pauseVideo === 'function') youtubePlayer.pauseVideo();
        } catch (error) {
          console.warn('[radio] Media Session video pause handler failed.', error.message || error);
        }
      }
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      setMediaSessionPlaybackState('paused');
    };

    const setHandler = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
    };

    setHandler('play', playHandler);
    setHandler('pause', pauseHandler);
    setHandler('previoustrack', () => shiftTrack(-1, { autoStart: true, preferVideo: videoFocusedList && selectedRef.current?.hasVideo }));
    setHandler('nexttrack', handleManualNext);

    return () => {
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('previoustrack', null);
      setHandler('nexttrack', null);
    };
  }, [handleManualNext, mediaMode, shiftTrack, videoFocusedList, selectedSong]);

  function updateSongCount(songKey, counts = {}) {
    if (!songKey) return;
    const hasLikePatch = countPatchHasAny(counts, LIKE_COUNT_FIELDS);
    const hasPlayPatch = countPatchHasAny(counts, PLAY_COUNT_FIELDS);
    const hasSharePatch = countPatchHasAny(counts, SHARE_COUNT_FIELDS);
    const patchedLikes = hasLikePatch ? countValue(firstDefined(counts, LIKE_COUNT_FIELDS)) : undefined;
    const patchedPlays = hasPlayPatch ? countValue(firstDefined(counts, PLAY_COUNT_FIELDS)) : undefined;
    const patchedShares = hasSharePatch ? countValue(firstDefined(counts, SHARE_COUNT_FIELDS)) : undefined;

    const mergeCountsForSong = existingSong => {
      const currentLikes = getSongLikes(existingSong, likeCounts);
      const currentPlays = getSongPlays(existingSong, playCounts);
      const currentShares = getSongShares(existingSong, shareCounts);
      const likes = hasLikePatch ? patchedLikes : currentLikes;
      const plays = hasPlayPatch ? patchedPlays : currentPlays;
      const shares = hasSharePatch ? patchedShares : currentShares;
      return {
        likes,
        like_count: likes,
        total_likes: likes,
        total_plays: plays,
        plays,
        play_count: plays,
        shares,
        share_count: shares,
        shareCount: shares,
        total_shares: shares,
        totalShares: shares,
        share_events: shares
      };
    };

    setTracks(prevTracks => prevTracks.map(track => {
      if (!matchesSongDeepLink(track, songKey)) return track;
      const nextCounts = mergeCountsForSong(track);
      return {
        ...track,
        ...nextCounts,
        raw: {
          ...track.raw,
          ...nextCounts
        }
      };
    }));

    setSelected(current => {
      if (!current || !matchesSongDeepLink(current, songKey)) return current;
      const nextCounts = mergeCountsForSong(current);
      return {
        ...current,
        ...nextCounts,
        raw: {
          ...current.raw,
          ...nextCounts
        }
      };
    });

    if (hasLikePatch) {
      setLikeCounts(prev => ({ ...prev, [songKey]: patchedLikes }));
    }
    if (hasPlayPatch) {
      setPlayCounts(prev => ({ ...prev, [songKey]: patchedPlays }));
    }
    if (hasSharePatch) {
      setShareCounts(prev => ({ ...prev, [songKey]: patchedShares }));
    }
  }

  function likeSong(song) {
    const songKey = clean(song?.songKey || song?.song_key || song?.raw?.song_key || song?.id || song?.raw?.id);
    const songId = clean(song?.song_id || song?.songId || song?.raw?.song_id || song?.raw?.songId || song?.id || song?.raw?.id);
    if (!song || !songKey || likedSongIds.has(songKey) || likeSaveInFlightIdsRef.current.has(songKey)) return;
    likeSaveInFlightIdsRef.current.add(songKey);
    sendTrackingEvent(song, 'like', sessionId, {
      song_key: songKey,
      song_id: songId || songKey,
      id: songId || songKey,
      display_title: getSongTitle(song),
      song_name: clean(song.song_name || song.raw?.song_name || getSongTitle(song)),
      artist: getSongArtist(song),
      page: 'production',
      source: 'public_player'
    }).then(result => {
      if (!result?.response?.ok) {
        console.warn('[Stashbox Radio] like event was not saved; leaving persisted like count unchanged', { song_key: songKey, result });
        return;
      }
      setLikedSongIds(prev => new Set(prev).add(songKey));
      const responseLikes = firstDefined(result?.body, LIKE_COUNT_FIELDS);
      const currentLikes = getSongLikes(song, likeCounts);
      if (responseLikes !== undefined && responseLikes !== '') {
        updateSongCount(songKey, { likes: Math.max(currentLikes + 1, countValue(responseLikes)) });
      } else {
        updateSongCount(songKey, { likes: currentLikes + 1 });
      }
    }).catch(error => {
      console.warn('[Stashbox Radio] like event save failed', { song_key: songKey, error: error?.message || error });
    }).finally(() => {
      likeSaveInFlightIdsRef.current.delete(songKey);
    });
  }

  async function shareSong(song) {
    if (!song) return;
    const shareUrl = getShareUrl(song);
    const songTitle = getSongTitle(song);
    const artist = getSongArtist(song);
    const shareData = { title: `${songTitle} by ${artist}`, text: 'Listen on Stashbox Radio', url: shareUrl };
    console.log('[Stashbox Radio] share song url', shareUrl);
    const showCopiedFeedback = () => {
      setCopiedSongId(song.idx);
      setPlayerMessage('Song link copied');
      window.setTimeout(() => {
        setCopiedSongId(current => current === song.idx ? null : current);
        setPlayerMessage(current => current === 'Song link copied' ? '' : current);
      }, 1800);
    };
    const copyShareUrl = async () => {
      await copyTextToClipboard(shareUrl);
      console.log('[Stashbox Radio] copied song url', shareUrl);
      showCopiedFeedback();
    };
    const songKey = clean(song?.songKey || song?.song_key || song?.raw?.song_key || song?.id || song?.raw?.id);
    sendTrackingEvent(song, 'share', sessionId, {
      song_key: songKey,
      song_id: clean(song?.song_id || song?.songId || song?.raw?.song_id || song?.raw?.songId || song?.id || song?.raw?.id || songKey),
      id: clean(song?.id || song?.raw?.id || songKey),
      display_title: songTitle,
      song_name: clean(song.song_name || song.raw?.song_name || songTitle),
      artist,
      share_url: shareUrl,
      page: 'production',
      source: 'public_player'
    }).then(result => {
      if (!result?.response?.ok) {
        console.warn('[Stashbox Radio] share event was not saved; leaving persisted share count unchanged', { song_key: songKey, result });
        return;
      }
      const responseShares = firstDefined(result?.body, SHARE_COUNT_FIELDS);
      const currentShares = getSongShares(song, shareCounts);
      if (responseShares !== undefined && responseShares !== '') {
        updateSongCount(songKey, { shares: Math.max(currentShares + 1, countValue(responseShares)) });
      } else {
        updateSongCount(songKey, { shares: currentShares + 1 });
      }
    }).catch(error => {
      console.warn('[Stashbox Radio] share event save failed', { song_key: songKey, error: error?.message || error });
    });
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        console.log('[Stashbox Radio] shared song url', shareUrl);
      } else {
        await copyShareUrl();
      }
    } catch (shareError) {
      if (shareError?.name === 'AbortError') return;
      console.warn('Unable to share song. Copying song URL instead.', shareError.message || shareError);
      try {
        await copyShareUrl();
      } catch (copyError) {
        console.warn('Unable to copy song URL.', copyError.message || copyError);
      }
    }
  }

  function handleProductClick(product) { sendTrackingEvent(selectedSong, 'product_click', sessionId, { product_url: product?.url || '' }); }

  if (status === 'loading') return h('div', { className: 'radio-app' }, h(RadioControlBar, { trackCount: tracks.length, isLoading: true, query, onQueryChange: setQuery, genre, onGenreChange: setGenre, genreFilters, album, onAlbumChange: setAlbum, albumFilters, artist, onArtistChange: setArtist, artistFilters, mood, onMoodChange: setMood, moodFilters, videoOnly, onToggleVideos: () => setVideoOnly(current => !current), onShuffle: pickRandomTrack, onReset: resetRadioFilters, disableVideoFilter: true, disableShuffle: true }), h('section', { className: 'loading-shell', 'aria-live': 'polite' }, h('img', { src: '/images/branding/stashbox-logo-transparent-rastacolors.png', alt: 'Stashbox', className: 'loading-logo' }), h('p', null, 'Loading songs from the AWS RDS API…')));
  if (status === 'error') return h('section', { className: 'error', role: 'alert' },
    h('strong', null, 'ERROR'),
    h('p', null, `Endpoint: ${error.endpoint || SONGS_API_URL}`),
    h('p', null, `Error: ${error.message || 'Unable to load songs from the RDS API.'}`),
    h('p', null, `response.ok failed: ${error.responseOkFailed ? 'yes' : 'no'}`),
    h('p', null, 'The production /radio/ page has not been changed.')
  );

  return h('div', { className: 'radio-app' },
    h(RadioControlBar, { trackCount: tracks.length, query, onQueryChange: setQuery, genre, onGenreChange: setGenre, genreFilters, album, onAlbumChange: setAlbum, albumFilters, artist, onArtistChange: setArtist, artistFilters, mood, onMoodChange: setMood, moodFilters, videoOnly, onToggleVideos: () => setVideoOnly(current => !current), onShuffle: pickRandomTrack, onReset: resetRadioFilters, disableVideoFilter: !tracks.some(track => track.hasVideo), disableShuffle: !filtered.length }),
    h('div', { className: 'radio-interface' },
      currentAd ? h(AdPlayer, { ad: currentAd, playerRef, adBreakDisplay, adBreakMuted, onToggleAdMute: () => setAdBreakMuted(value => !value), onStarted: handleAdStarted, onProgress: handleAdProgress, onCompleted: handleAdCompleted, onSkipped: handleAdSkipped, onBlocked: handleAdBlocked, onCtaClicked: handleAdCtaClicked, onError: handleAdError, onDurationKnown: handleAdDurationKnown }) : h(Player, { selected: selectedSong, audioRef, playerRef, youtubePlayerRef, mediaMode, activeVideoEmbedUrl, openVideo, closeVideo, products, playerMessage, onPrevious: () => shiftTrack(-1, { autoStart: mediaIsPlayingRef.current, preferVideo: videoFocusedList && selectedSong?.hasVideo }), onNext: handleManualNext, onShuffle: pickRandomTrack, onProductClick: handleProductClick, likeCount: getSongLikes(selectedSong, likeCounts), playCount: getSongPlays(selectedSong, playCounts), shareCount: getSongShares(selectedSong, shareCounts), hasLiked: likedSongIds.has(selectedSong?.songKey), onLike: () => likeSong(selectedSong), onShare: () => shareSong(selectedSong), shareCopied: copiedSongId === selectedSong?.idx, onAudioStart: () => { setMediaMode('audio'); trackPlaybackStart(selectedSong, 'audio'); }, onAudioProgress: updatePlaybackPosition, onAudioPause: () => { setMediaSessionPlaybackState('paused'); pauseQualifiedPlayback(selectedSong); finishPlayback('play_partial'); }, onAudioComplete: () => { setMediaSessionPlaybackState('paused'); pauseQualifiedPlayback(selectedSong); autoAdvanceFromEnded(selectedSong); }, onVideoStart: () => { if (!videoCleanupInProgressRef.current) trackPlaybackStart(selectedSong, 'video'); }, onVideoProgress: updatePlaybackPosition, onVideoComplete: () => { if (videoCleanupInProgressRef.current) return; pauseQualifiedPlayback(selectedSong); handleVideoEnded(selectedSong, { preferVideo: true }); }, onYouTubeEnded: () => { if (videoCleanupInProgressRef.current) return; pauseQualifiedPlayback(selectedSong); handleYouTubeEnded(selectedSong); }, onPlaybackStatusChange: isActive => { mediaIsPlayingRef.current = isActive; setMediaSessionPlaybackState(isActive ? 'playing' : 'paused'); if (!isActive) pauseQualifiedPlayback(selectedSong); }, autoPlayRequest }),
      h('main', { className: 'radio-main' },
        h('section', { className: 'list-head' }, h('h2', null, 'Song List'), h('div', { className: 'list-actions' }, h(SortControl, { sortKey, onSortChange: setSortKey }), h('div', { className: 'count' }, `${sortedFiltered.length} of ${tracks.length} tracks`), h(SongViewToggle, { viewMode: songViewMode, onViewModeChange: setSongViewMode }))),
        !isGroupedSongView ? h(SongListContextRow, { title: listContextTitle, onShuffle: () => pickRandomTrack(), disabled: !playableFiltered.length, notice: shuffleNotice }) : (shuffleNotice ? h('p', { className: 'song-list-shuffle-notice song-list-shuffle-notice-grouped', 'aria-live': 'polite' }, shuffleNotice) : null),
        tracks.length ? (sortedFiltered.length ? h('div', { className: 'sections' }, isGroupedSongView
          ? groupedSongSections.map(group => h(SongSection, { key: group.key, section: group.section, tracks: group.tracks, selected: selectedSong, chooseSong, onShuffle: () => pickRandomTrack(group.tracks), likeCounts, playCounts, shareCounts, likedSongIds, onLike: likeSong, onShare: shareSong, copiedSongId, viewMode: songViewMode }))
          : h(SongSection, { key: 'sorted-songs', section: { key: SORT_OPTIONS.find(option => option.key === sortKey)?.label || 'Songs', emoji: '🎧', color: '#f0a500' }, tracks: sortedFiltered, selected: selectedSong, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike: likeSong, onShare: shareSong, copiedSongId, viewMode: songViewMode, showHeader: false })
        ) : h('div', { className: 'empty' }, 'No tracks match this search/filter combination.')) : h('div', { className: 'empty' }, 'No songs were returned by the RDS API yet.')
      )
    )
  );
}

function PlayIcon({ className = 'play-icon' }) { return h('span', { className, 'aria-hidden': true }); }
function PauseIcon() { return h('span', { className: 'pause-icon', 'aria-hidden': true }, h('span', null), h('span', null)); }
function PlayCount({ count }) { return h('span', { className: 'play-count', title: `${Number(count) || 0} recorded plays` }, h(PlayIcon, { className: 'play-count-icon' }), h('span', null, formatPlayCount(count))); }
function ShareCount({ count }) { return h('span', { className: 'share-count', title: `${Number(count) || 0} recorded shares` }, h('span', { 'aria-hidden': true }, '↗'), h('span', null, formatShareCount(count))); }
function ShareButton({ onShare, copied = false, compact = false }) { return h('button', { className: `share-button ${compact ? 'compact' : ''}`, type: 'button', onClick: event => { event.stopPropagation(); onShare?.(); }, 'aria-live': copied ? 'polite' : undefined }, copied ? 'Song link copied' : 'Share'); }
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


function AdPlayer({ ad, playerRef, adBreakDisplay, adBreakMuted = false, onToggleAdMute, onStarted, onProgress, onCompleted, onSkipped, onBlocked, onCtaClicked, onError, onDurationKnown }) {
  const mediaRef = useRef(null);
  const isAdClearingRef = useRef(false);
  const skipAfter = Math.max(0, Number(ad?.skip_after_seconds) || 0);
  const [canSkip, setCanSkip] = useState(!ad?.skip_enabled || skipAfter <= 0);
  const [skipCountdown, setSkipCountdown] = useState(skipAfter);
  const [started, setStarted] = useState(false);
  const [needsManualPlay, setNeedsManualPlay] = useState(false);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const [adCurrentTime, setAdCurrentTime] = useState(0);
  const [adDuration, setAdDuration] = useState(0);
  const mediaUrl = ad?.mediaUrl || ad?.media_url || '';
  const isAudio = isAudioAdUrl(mediaUrl) || clean(ad?.media_type).toLowerCase() === 'audio';
  const adMuteLabel = adBreakMuted ? 'Unmute ad audio' : 'Mute ad audio';

  const applyAdMutedState = media => {
    const target = media || mediaRef.current;
    if (!target) return;
    target.muted = adBreakMuted;
    target.volume = adBreakMuted ? 0 : 1;
  };

  useEffect(() => {
    const initialCanSkip = !ad?.skip_enabled || skipAfter <= 0;
    isAdClearingRef.current = false;
    setCanSkip(initialCanSkip);
    setSkipCountdown(skipAfter);
    setStarted(false);
    setNeedsManualPlay(false);
    setIsAdPaused(false);
    setAdCurrentTime(0);
    setAdDuration(0);
    window.setTimeout(() => applyAdMutedState(), 0);
    if (initialCanSkip) return undefined;

    let remainingSeconds = skipAfter;
    const timer = window.setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      setSkipCountdown(remainingSeconds);
      if (remainingSeconds <= 0) {
        setCanSkip(true);
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [ad?.id, ad?.skip_enabled, skipAfter]);

  useEffect(() => {
    playerRef.current?.focus?.();
  }, [ad?.id, playerRef]);

  useEffect(() => {
    applyAdMutedState();
  }, [adBreakMuted, ad?.id]);

  useEffect(() => {
    if (!ad) return undefined;
    console.log(`Ad player mounted: ${ad.title || ad.internal_title || 'Untitled ad'}`);
    console.log(`Ad media URL: ${mediaUrl}`);
    return undefined;
  }, [ad?.id, mediaUrl]);

  useEffect(() => {
    if (!ad) return undefined;
    const syncPausedState = () => {
      if (document.visibilityState !== 'visible') return;
      const media = mediaRef.current;
      setIsAdPaused(Boolean(media && media.paused && !media.ended));
    };
    document.addEventListener('visibilitychange', syncPausedState);
    return () => document.removeEventListener('visibilitychange', syncPausedState);
  }, [ad?.id]);

  useEffect(() => {
    if (!ad || isAudio || !mediaUrl) return undefined;
    let cancelled = false;
    let startTimer = null;
    const video = mediaRef.current;
    if (!video?.play) return undefined;

    const safePlayAdVideo = async () => {
      let startedPlayback = false;
      const markStarted = () => { startedPlayback = true; };
      video.addEventListener('playing', markStarted, { once: true });
      applyAdMutedState(video);
      console.log('Ad video play attempted');
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === 'function') await playPromise;
      } catch (error) {
        video.removeEventListener('playing', markStarted);
        console.warn('[ads] ad autoplay blocked, advancing', error);
        return false;
      }
      await new Promise(resolve => { startTimer = window.setTimeout(resolve, 1800); });
      video.removeEventListener('playing', markStarted);
      if (!startedPlayback && video.paused) {
        console.warn('[ads] ad did not start, advancing');
        return false;
      }
      return true;
    };

    safePlayAdVideo().then(didStart => {
      if (cancelled || didStart) return;
      isAdClearingRef.current = true;
      setNeedsManualPlay(false);
      setIsAdPaused(false);
      try { video.pause(); } catch (_) {}
      onBlocked?.(ad);
    });

    return () => {
      cancelled = true;
      if (startTimer) window.clearTimeout(startTimer);
    };
  }, [ad?.id, isAudio, mediaUrl]);

  if (!ad) return null;

  const getWatchedSeconds = () => {
    const media = mediaRef.current;
    const current = Number.isFinite(media?.currentTime) ? media.currentTime : adCurrentTime;
    const duration = Number.isFinite(media?.duration) ? media.duration : adDuration;
    if (Number.isFinite(duration) && duration > 0 && media?.ended) return Math.max(0, duration);
    return Math.max(0, Number(current) || 0);
  };

  const completeAd = () => {
    const watchedSeconds = getWatchedSeconds();
    isAdClearingRef.current = true;
    setIsAdPaused(false);
    try { mediaRef.current?.pause?.(); } catch (_) {}
    onCompleted?.(ad, watchedSeconds);
  };

  const skipAd = () => {
    console.log("[Stashbox Radio] Skip Ad clicked", ad?.id, ad?.title);
    isAdClearingRef.current = true;
    setIsAdPaused(false);
    try { mediaRef.current?.pause?.(); } catch (_) {}
    const watchedSeconds = getWatchedSeconds();
    try { if (mediaRef.current) mediaRef.current.currentTime = 0; } catch (_) {}
    onSkipped?.(ad, watchedSeconds);
  };

  const clickCta = () => {
    onCtaClicked?.(ad);
    window.open(ad.clickUrl || ad.cta_url, '_blank', 'noopener,noreferrer');
  };

  const skipAdLabel = canSkip ? 'Skip Ad' : `Skip in ${formatSkipCountdown(skipCountdown)}`;
  const adTitle = clean(ad.public_title || ad.title || ad.internal_title || ad.ad_title) || 'Sponsored Message';
  const adDescription = clean(ad.description || ad.public_description);
  const adProgress = Number.isFinite(adDuration) && adDuration > 0 ? Math.min(100, Math.max(0, (adCurrentTime / adDuration) * 100)) : 0;
  const breakMethod = adBreakDisplay?.method === 'seconds' || adBreakDisplay?.breakMethod === 'seconds' ? 'seconds' : 'count';
  const currentAdNumber = Math.max(0, Number(adBreakDisplay?.currentAdNumber) || 0);
  const totalAdsInBreak = Math.max(0, Number(adBreakDisplay?.totalAds ?? adBreakDisplay?.totalAdsInBreak) || 0);
  const targetAdSeconds = Number.isFinite(Number(adBreakDisplay?.targetSeconds ?? adBreakDisplay?.targetAdSeconds)) && Number(adBreakDisplay?.targetSeconds ?? adBreakDisplay?.targetAdSeconds) > 0
    ? Number(adBreakDisplay?.targetSeconds ?? adBreakDisplay?.targetAdSeconds)
    : DEFAULT_TARGET_AD_SECONDS;
  const completedAdBreakSeconds = Math.max(0, Number(adBreakDisplay?.completedAdBreakSeconds) || 0);
  const fallbackRemainingAdBreakSeconds = Math.max(0, targetAdSeconds - completedAdBreakSeconds - adCurrentTime);
  const displayRemainingAdBreakSeconds = Number.isFinite(Number(adBreakDisplay?.remainingSeconds))
    ? Math.max(0, Number(adBreakDisplay.remainingSeconds))
    : fallbackRemainingAdBreakSeconds;
  const remainingAdBreakSeconds = Math.min(displayRemainingAdBreakSeconds, fallbackRemainingAdBreakSeconds);
  const adBreakIndicatorText = currentAdNumber && totalAdsInBreak
    ? (breakMethod === 'seconds' ? `Ads: ${formatRemainingAdTime(remainingAdBreakSeconds)} left` : `Ad ${currentAdNumber} of ${totalAdsInBreak}`)
    : '';

  const updateAdDuration = media => {
    const nextDuration = Number.isFinite(media?.duration) ? Math.max(0, media.duration) : 0;
    setAdDuration(nextDuration);
    if (nextDuration > 0) onDurationKnown?.(ad, nextDuration);
  };

  const updateAdTime = event => {
    const media = event?.currentTarget;
    const currentTime = Number.isFinite(media?.currentTime) ? Math.max(0, media.currentTime) : 0;
    setAdCurrentTime(currentTime);
    onProgress?.(ad, currentTime);
    updateAdDuration(media);
  };

  const updateAdMetadata = event => {
    updateAdDuration(event?.currentTarget);
  };

  const startAd = () => {
    if (!isAudio) console.log('Ad video playing');
    setNeedsManualPlay(false);
    setIsAdPaused(false);
    if (started) return;
    setStarted(true);
    onStarted?.(ad);
  };

  const handleAdPause = event => {
    if (isAdClearingRef.current) return;
    const media = event?.currentTarget;
    setIsAdPaused(Boolean(media && !media.ended));
  };

  const resumeCurrentAd = () => {
    const media = mediaRef.current;
    if (!media?.play || !ad || !media.paused || media.ended) return;
    const attemptPlay = media.play();
    if (attemptPlay?.then) {
      attemptPlay.then(() => {
        setNeedsManualPlay(false);
        setIsAdPaused(false);
      }).catch(error => {
        console.warn('[Stashbox Radio] ad resume blocked', error);
        setIsAdPaused(true);
      });
    } else {
      setNeedsManualPlay(false);
      setIsAdPaused(false);
    }
  };

  const handleAdMediaClick = () => {
    const media = mediaRef.current;
    if (media?.paused && !media.ended) resumeCurrentAd();
  };

  const playAd = () => {
    const media = mediaRef.current;
    if (!media?.play) return;
    media.muted = false;
    console.log('Ad video play attempted');
    const attemptPlay = media.play();
    if (attemptPlay?.then) {
      attemptPlay.then(() => {
        setNeedsManualPlay(false);
        setIsAdPaused(false);
      }).catch(error => {
        console.warn('Ad video autoplay failed:', error);
        setNeedsManualPlay(true);
        setIsAdPaused(true);
      });
    } else {
      setNeedsManualPlay(false);
      setIsAdPaused(false);
    }
  };

  return h('aside', { className: 'panel player ad-player', ref: playerRef, tabIndex: -1, 'aria-label': 'Advertisement' },
    h('div', { className: 'player-media ad-player-media', onClick: handleAdMediaClick },
      h('button', {
        type: 'button',
        className: 'ad-mute-button',
        'aria-label': adMuteLabel,
        title: adMuteLabel,
        'aria-pressed': adBreakMuted,
        onClick: event => {
          event.preventDefault();
          event.stopPropagation();
          onToggleAdMute?.();
        }
      }, adBreakMuted ? '🔇 Muted' : '🔊 Audio'),
      isAudio
        ? h('div', { className: 'ad-audio-shell' },
          ad.poster_image_url || ad.thumbnail_url ? h('img', { src: ad.poster_image_url || ad.thumbnail_url, alt: `${ad.title} artwork`, onError: e => { e.currentTarget.style.display = 'none'; } }) : h('div', { className: 'art-fallback' }, ad.title || 'Ad'),
          h('audio', {
            ref: mediaRef,
            className: 'ad-audio',
            src: mediaUrl,
            controls: false,
            preload: 'auto',
            autoPlay: true,
            muted: adBreakMuted,
            onLoadedData: event => applyAdMutedState(event.currentTarget),
            onPlay: startAd,
            onPause: handleAdPause,
            onLoadedMetadata: updateAdMetadata,
            onDurationChange: updateAdMetadata,
            onTimeUpdate: updateAdTime,
            onEnded: completeAd,
            onError: event => onError?.(ad, event?.currentTarget?.error?.message || 'Audio ad failed to load or play.')
          })
        )
        : h('video', {
          ref: mediaRef,
          className: 'ad-video',
          src: mediaUrl,
          poster: ad.poster_image_url || ad.thumbnail_url || undefined,
          controls: false,
          playsInline: true,
          autoPlay: true,
          muted: adBreakMuted,
          onLoadedData: event => applyAdMutedState(event.currentTarget),
          onPlay: startAd,
          onPause: handleAdPause,
          onLoadedMetadata: updateAdMetadata,
          onDurationChange: updateAdMetadata,
          onTimeUpdate: updateAdTime,
          onEnded: () => { console.log('Ad video ended'); completeAd(); },
          onError: event => onError?.(ad, event?.currentTarget?.error?.message || 'Video ad failed to load or play.')
        }),
      false && isAdPaused ? h('div', { className: 'ad-resume-overlay', 'aria-hidden': false },
        h('button', {
          type: 'button',
          className: 'ad-resume-button',
          onClick: event => {
            event.preventDefault();
            event.stopPropagation();
            resumeCurrentAd();
          }
        }, 'Tap to resume ad')
      ) : null
    ),
    null,
    h('div', { className: 'player-bar ad-player-bar' },
      h('div', { className: 'player-controls ad-player-controls' },
        h('div', { className: 'player-controls-layout ad-player-controls-layout' },
          h('div', { className: 'player-info ad-info ad-info-block' },
            h('div', { className: 'ad-title-text' }, adTitle),
            adDescription ? h('div', { className: 'ad-description-text' }, adDescription) : null
          ),
          h('div', { className: 'player-controls-actions ad-actions' },
            h('div', { className: 'ad-controls-center-group' },
              h('span', { className: 'ad-time-display', 'aria-live': 'polite' }, `${formatAdTime(adCurrentTime)} / ${formatAdTime(adDuration)}`),
              (ad.cta_label && (ad.clickUrl || ad.cta_url)) ? h(PlayerPill, { className: 'cta-pill ad-cta-button', onClick: clickCta }, ad.cta_label) : null,
              h('button', {
                type: 'button',
                className: 'player-pill skip-ad-pill ad-skip-button',
                onClick: event => {
                  event.preventDefault();
                  event.stopPropagation();
                  skipAd();
                },
                disabled: !canSkip
              }, skipAdLabel),
              adBreakIndicatorText ? h('span', { className: `ad-break-indicator ad-break-indicator--${breakMethod}`, 'aria-live': 'polite' }, adBreakIndicatorText) : null,
              h('span', { className: 'player-stat-pill ad-label-pill ad-badge' }, 'Ad')
            )
          ),
          h('div', { className: 'ad-progress', role: 'progressbar', 'aria-label': 'Ad progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(adProgress) },
            h('div', { className: 'ad-progress-fill', style: { width: `${adProgress}%` } })
          )
        )
      )
    )
  );
}

function Player({ selected, audioRef, playerRef, youtubePlayerRef: externalYoutubePlayerRef, mediaMode, activeVideoEmbedUrl, openVideo, closeVideo, products, playerMessage = '', onPrevious, onNext, onShuffle, onProductClick, likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied, onAudioStart, onAudioProgress, onAudioPause, onAudioComplete, onVideoStart, onVideoProgress, onVideoComplete, onYouTubeEnded, onPlaybackStatusChange, autoPlayRequest, onAdStarted, onAdCompleted, onAdSkipped, onAdCtaClicked, onAdError, onAdDurationKnown }) {
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
  const artworkUrl = normalizedSongArtworkUrl(selected);
  const posterImage = artworkUrl || (selectedIsVideoOnly ? youtubeThumbnail(selected.videoLink) : '');
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
    let disposed = false;
    let retryTimer = null;
    let playAttempts = 0;
    const startNextAudio = () => {
      if (disposed || audioRef.current !== audio) return;
      playAttempts += 1;
      try { audio.autoplay = true; } catch (_) {}
      console.log('[Stashbox Radio] auto-playing next audio_url', selected.audioUrl);
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(error => {
          if (disposed) return;
          console.warn('[radio] playback error: unable to auto-play next audio.', error.message || error);
          if (playAttempts < 3) retryTimer = window.setTimeout(startNextAudio, 250);
        });
      }
    };
    const playTimer = window.setTimeout(startNextAudio, 0);
    return () => {
      disposed = true;
      window.clearTimeout(playTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
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
      videoFrameRef.current.play?.().catch?.(error => console.warn('[radio] playback error: unable to play selected video.', error.message || error));
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
      console.log('[Stashbox Radio] audio_url being played', selected.audioUrl);
      audio.play().catch(error => console.warn('[radio] playback error: unable to play selected audio.', error.message || error));
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
              h('h2', null, selected.title)
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
            h(PlayerPill, { className: 'share-pill', onClick: onShare, 'aria-live': shareCopied ? 'polite' : undefined }, shareCopied ? 'Song link copied' : formatPlayerShareText(shareCount)),
            canCloseVideo || canWatchVideo ? h(PlayerPill, { className: 'video-pill', onClick: isVideoMode ? handleCloseVideo : openVideo }, isVideoMode ? 'Close Video' : h(React.Fragment, null, h(PlayIcon, { className: 'video-play-icon' }), 'Watch Video')) : null,
            h(PlayerPill, { className: 'transport-pill shuffle-pill', onClick: onShuffle, 'aria-label': 'Shuffle songs' }, '⇄')
          ),
          h('div', { className: 'player-mobile-main-controls', 'aria-label': 'Mobile playback controls' },
            h(LikeButton, { count: likeCount, active: hasLiked, onLike }),
            h(PlayerPill, { className: 'transport-pill', onClick: onPrevious, 'aria-label': 'Previous song' }, '‹'),
            h(PlayerPill, { className: 'transport-pill play-toggle', onClick: togglePlayback, disabled: !canUsePrimaryPlay, 'aria-pressed': isVideoMode ? isVideoPlaying : isPlaying, 'aria-label': (isVideoMode ? isVideoPlaying : isPlaying) ? 'Pause song' : 'Play song' }, (isVideoMode ? isVideoPlaying : isPlaying) ? h(PauseIcon) : h(PlayIcon)),
            h(PlayerPill, { className: 'transport-pill', onClick: onNext, 'aria-label': 'Next song' }, '›'),
            h(PlayerPill, { className: 'share-pill', onClick: onShare, 'aria-live': shareCopied ? 'polite' : undefined }, shareCopied ? 'Song link copied' : formatPlayerShareText(shareCount))
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
    hasAudio && mediaMode !== 'video' ? h(React.Fragment, null, h('audio', { className: 'audio native-audio', ref: audioRef, src: selected.audioUrl, controls: false, controlsList: 'nodownload', disableRemotePlayback: true, preload: 'auto', autoPlay: Boolean(autoPlayRequest && autoPlayRequest.idx === selected.idx && mediaMode !== 'video'), onContextMenu: event => event.preventDefault(), onLoadedMetadata: syncAudioState, onCanPlay: () => { syncAudioState(); if (autoPlayRequest && autoPlayRequest.idx === selected.idx && mediaMode !== 'video') audioRef.current?.play?.().catch?.(error => console.warn('[radio] playback error: unable to continue playback on canplay.', error.message || error)); }, onTimeUpdate: syncAudioState, onPlay: () => { syncAudioState(); onAudioStart?.(); }, onPause: () => { syncAudioState(); if (!audioRef.current?.ended) onAudioPause?.(); }, onEnded: () => { syncAudioState(); onAudioComplete?.(); }, onDurationChange: syncAudioState }), h('div', { className: 'player-timeline' }, h('span', { className: 'timecode' }, formatTime(currentTime)), h('input', { className: 'scrubber', type: 'range', min: '0', max: duration || 0, step: '0.1', value: duration ? Math.min(currentTime, duration) : 0, onInput: seekAudio, onChange: seekAudio, 'aria-label': 'Audio timeline', style: { '--progress': `${progress}%` } }), h('span', { className: 'timecode end' }, formatTime(duration)))) : h('p', { className: 'notes no-audio-note' }, selectedIsVideoOnly ? 'This is a video-only record. Use the main play button to start the YouTube player.' : 'No audio URL is available for this track.'),
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
  return normalizedSongArtworkUrl(track) || youtubeThumbnail(track?.videoLink) || APP_FALLBACK_ARTWORK_URL;
}

function SongSection({ section, tracks, selected, chooseSong, onShuffle, likeCounts, playCounts, shareCounts, likedSongIds, onLike, onShare, copiedSongId, viewMode = 'list', showHeader = true }) {
  const isVisual = viewMode === 'visual';
  const canShuffleSection = typeof onShuffle === 'function' && tracks.some(canPlayTrack);
  const sectionHeader = !showHeader ? null : (onShuffle
    ? h('div', { className: 'song-section-header' },
      h('h3', { className: 'song-section-title' }, section.key),
      h('button', { className: 'song-list-shuffle-button', type: 'button', onClick: onShuffle, disabled: !canShuffleSection, 'aria-label': `Shuffle all songs in ${section.key}` }, 'Shuffle All')
    )
    : h('div', { className: 'section-title' }, h('span', null, section.emoji), h('h3', null, section.key), h('span', { className: 'count' }, tracks.length)));
  return h('section', { className: `song-section song-section-${viewMode}`, style: { '--section-color': section.color } },
    sectionHeader,
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
