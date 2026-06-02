import React, { useCallback, useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

import { createRadioSupabaseClient, SUPABASE_TABLES } from './supabaseClient.js';

const SECTIONS = [
  { key: 'Reggae', emoji: '🌴', color: '#3ecf6e' }, { key: 'Rock', emoji: '🎸', color: '#f0a500' },
  { key: 'Blues', emoji: '🎷', color: '#50a0ff' }, { key: 'Funk', emoji: '🕺', color: '#e05c2a' },
  { key: 'Electronic', emoji: '⚡', color: '#50dcdc' }, { key: 'Spanish', emoji: '💃', color: '#ff6496' },
  { key: 'Calypso', emoji: '🥁', color: '#ffc050' }, { key: 'Soul', emoji: '🎤', color: '#c88cff' },
  { key: 'Pop', emoji: '🎵', color: '#ff9080' }, { key: 'Other', emoji: '🎶', color: '#999' }
];

const h = React.createElement;
const clean = value => String(value || '').trim().replace(/^"|"$/g, '');
const fixDropbox = url => url ? url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '') : '';
const sectionFor = genre => SECTIONS.find(s => s.key.toLowerCase() === String(genre || '').toLowerCase())?.key || 'Other';
const has = value => String(value || '').trim().length > 0;
const RADIO_REACT_SOURCE_PAGE = '/stashbox/radio/react/';
const MAX_PRODUCT_RECOMMENDATIONS = 50;
const SESSION_STORAGE_KEY = 'stashbox-radio-react-session-id';
const DUPLICATE_ERROR_CODES = new Set(['23505']);
const PLAY_EVENT_TYPES = new Set(['play', 'pause', 'skip', 'complete', 'next_click', 'random_click', 'video_open']);
const OPTIONAL_METRIC_ERROR_CODES = new Set(['42P01', 'PGRST106', 'PGRST205']);
const SHEET_CSV_URLS = [
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRyXI6d_QbtM2UalaiSYcDKpvgnLi-QsqYfx9hCbqM8vpbK_gUITEQffoyKiYQoeXuKeW_qBkrexMqN/pub?gid=0&single=true&output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRyXI6d_QbtM2UalaiSYcDKpvgnLi-QsqYfx9hCbqM8vpbK_gUITEQffoyKiYQoeXuKeW_qBkrexMqN/pub?single=true&output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRyXI6d_QbtM2UalaiSYcDKpvgnLi-QsqYfx9hCbqM8vpbK_gUITEQffoyKiYQoeXuKeW_qBkrexMqN/pub?single=true&output=csv&sheet=Radio'
];

function shouldIgnoreOptionalMetricError(error) {
  return OPTIONAL_METRIC_ERROR_CODES.has(error?.code) || String(error?.message || '').toLowerCase().includes('does not exist');
}

function getBrowserSessionId() {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
}

function normalizeSong(row, index) {
  const genre = clean(row.genre);
  return {
    id: row.id,
    title: clean(row.title) || 'Untitled Stashbox Track',
    album: clean(row.album) || 'Stashbox Radio',
    artist: clean(row.artist),
    genre,
    sectionKey: sectionFor(genre),
    audioUrl: fixDropbox(clean(row.audio_url)),
    imageUrl: fixDropbox(clean(row.artwork_url)),
    videoUrl: clean(row.video_url),
    videoLink: clean(row.video_url),
    notes: clean(row.description),
    sortOrder: Number(row.sort_order) || index,
    createdAt: row.created_at || '',
    idx: row.id || `song-${index}`
  };
}

async function fetchSupabaseSongs() {
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songs)
    .select('id,title,artist,album,genre,audio_url,artwork_url,video_url,description,is_active,sort_order,created_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message || 'Unable to fetch songs from Supabase.');
  return (Array.isArray(data) ? data : []).map(normalizeSong);
}

async function fetchSheetCSV() {
  let lastError = null;

  for (const url of SHEET_CSV_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      if (text && text.trim()) return text;
      throw new Error('Empty CSV response');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to fetch the published radio sheet.');
}

function parseCSVRows(csv) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function normalizeSheetSong(columns, index) {
  const genre = clean(columns[3]);
  return {
    id: null,
    title: clean(columns[0]) || 'Untitled Stashbox Track',
    album: clean(columns[1]) || 'Stashbox Radio',
    artist: clean(columns[2]),
    genre,
    sectionKey: sectionFor(genre),
    audioUrl: fixDropbox(clean(columns[6])),
    imageUrl: fixDropbox(clean(columns[8])),
    videoUrl: clean(columns[9]),
    videoLink: clean(columns[9]),
    notes: clean(columns[10]),
    sortOrder: index,
    createdAt: clean(columns[4]),
    idx: `sheet-song-${index}`
  };
}

function parseSheetSongs(csv) {
  const rows = parseCSVRows(csv).filter(row => row.some(column => clean(column)));
  return rows
    .slice(1)
    .map(normalizeSheetSong)
    .filter(song => song.title && song.title !== 'Untitled Stashbox Track');
}

async function fetchSheetSongs() {
  const csv = await fetchSheetCSV();
  return parseSheetSongs(csv);
}

async function fetchRadioSongs() {
  try {
    return { tracks: await fetchSupabaseSongs(), source: 'supabase', fallbackReason: '' };
  } catch (error) {
    console.warn('Unable to load Supabase songs. Falling back to the published radio sheet.', error.message || error);
    return {
      tracks: await fetchSheetSongs(),
      source: 'sheet',
      fallbackReason: error.message || 'Supabase is unavailable.'
    };
  }
}

async function fetchLikeRows(songIds) {
  if (!songIds.length) return [];
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songLikes)
    .select('song_id,session_id')
    .in('song_id', songIds);

  if (error) throw new Error(error.message || 'Unable to fetch song likes from Supabase.');
  return Array.isArray(data) ? data : [];
}

async function fetchPlayRows(songIds) {
  if (!songIds.length) return [];
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songPlayEvents)
    .select('song_id')
    .eq('event_type', 'play')
    .in('song_id', songIds);

  if (error) {
    if (shouldIgnoreOptionalMetricError(error)) return [];
    throw new Error(error.message || 'Unable to fetch song play counts from Supabase.');
  }
  return Array.isArray(data) ? data : [];
}

async function fetchShareCountRows(songIds) {
  if (!songIds.length) return [];
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songShareCounts)
    .select('song_id,share_count')
    .in('song_id', songIds);

  if (error) {
    if (shouldIgnoreOptionalMetricError(error)) return [];
    throw new Error(error.message || 'Unable to fetch song share counts from Supabase.');
  }
  return Array.isArray(data) ? data : [];
}

async function insertSongLike(songId, sessionId) {
  const supabase = createRadioSupabaseClient();
  return supabase
    .from(SUPABASE_TABLES.songLikes)
    .insert({ song_id: songId, session_id: sessionId });
}

async function insertSongPlayEvent(songId, sessionId, eventType) {
  if (!songId || !PLAY_EVENT_TYPES.has(eventType)) return;
  const supabase = createRadioSupabaseClient();
  const { error } = await supabase
    .from(SUPABASE_TABLES.songPlayEvents)
    .insert({
      song_id: songId,
      session_id: sessionId,
      event_type: eventType,
      source_page: RADIO_REACT_SOURCE_PAGE
    });

  if (error && !shouldIgnoreOptionalMetricError(error)) console.warn('Unable to record song play event.', error.message || error);
}

async function insertSongShareEvent(songId, sessionId, shareUrl, shareMethod) {
  if (!songId || !shareUrl) return;
  const supabase = createRadioSupabaseClient();
  const { error } = await supabase
    .from(SUPABASE_TABLES.songShareEvents)
    .insert({
      song_id: songId,
      session_id: sessionId,
      event_type: 'share_click',
      source_page: RADIO_REACT_SOURCE_PAGE,
      share_url: shareUrl,
      share_method: shareMethod || null
    });

  if (error && !shouldIgnoreOptionalMetricError(error)) console.warn('Unable to record song share event.', error.message || error);
}

async function insertProductClickEvent(selected, product, sessionId) {
  const supabase = createRadioSupabaseClient();
  const { error } = await supabase
    .from(SUPABASE_TABLES.productClickEvents)
    .insert({
      song_id: selected?.id || null,
      product_id: product?.id || null,
      session_id: sessionId,
      product_url: product?.url || '',
      source_page: RADIO_REACT_SOURCE_PAGE
    });

  if (error && !shouldIgnoreOptionalMetricError(error)) console.warn('Unable to record product click event.', error.message || error);
}

function youtubeEmbed(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  let id = '';
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtube.com')) id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    if (parsed.hostname.includes('youtu.be')) id = parsed.pathname.split('/').filter(Boolean)[0];
  } catch (_) {}
  return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1` : value;
}

function rotateBySeed(items, seed) {
  if (!items.length) return items;
  let hash = 0;
  String(seed || '').split('').forEach(ch => { hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0; });
  const offset = Math.abs(hash) % items.length;
  return items.slice(offset).concat(items.slice(0, offset));
}

function productShape(product) {
  const variant = product.variants?.[0];
  const rawImage = product.images?.[0]?.src || product.featured_image || '';
  const image = typeof rawImage === 'string' && rawImage.startsWith('//') ? `https:${rawImage}` : rawImage;
  return {
    id: null,
    title: product.title || 'Stashbox Product',
    url: `https://stashbox.ai/products/${product.handle || ''}`,
    image,
    price: variant?.price ? `$${Number(variant.price).toFixed(2)}` : ''
  };
}

function supabaseProductShape(link) {
  const product = link.products || link.product || link;
  return {
    id: clean(product.id) || clean(link.product_id),
    title: clean(product.title) || 'Stashbox Product',
    url: clean(product.product_url),
    image: clean(product.image_url),
    price: clean(product.price),
    collection: clean(product.collection),
    priority: Number(link.priority) || 0
  };
}

async function fetchFallbackProducts(selected) {
  const res = await fetch(`https://stashbox.ai/products.json?limit=${MAX_PRODUCT_RECOMMENDATIONS}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const shaped = (Array.isArray(data.products) ? data.products : []).map(productShape);
  return rotateBySeed(shaped, selected?.title).slice(0, MAX_PRODUCT_RECOMMENDATIONS);
}

async function fetchLinkedProducts(selected) {
  if (!selected?.id) return [];
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songProducts)
    .select('id,song_id,product_id,priority,products:product_id(id,title,image_url,product_url,price,collection,is_active)')
    .eq('song_id', selected.id)
    .order('priority', { ascending: true })
    .limit(MAX_PRODUCT_RECOMMENDATIONS);

  if (error) return [];
  return (Array.isArray(data) ? data : [])
    .filter(link => link.products && link.products.is_active !== false)
    .map(supabaseProductShape)
    .filter(product => product.url || product.title)
    .slice(0, MAX_PRODUCT_RECOMMENDATIONS);
}

function formatPlayCount(count) {
  const value = Math.max(0, Number(count) || 0);
  if (value >= 1000) {
    const compact = (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '');
    return `${compact}K plays`;
  }
  return `${value} ${value === 1 ? 'play' : 'plays'}`;
}

function formatShareCount(count) {
  const value = Math.max(0, Number(count) || 0);
  if (value >= 1000) {
    const compact = (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '');
    return `${compact}K shares`;
  }
  return `${value} ${value === 1 ? 'share' : 'shares'}`;
}

function getShareUrl(song) {
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('song', song?.id || song?.idx || '');
  shareUrl.hash = '';
  return shareUrl.toString();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function useProducts(selected) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    let alive = true;
    setProducts([]);

    async function loadProducts() {
      if (!selected) return [];
      const linkedProducts = await fetchLinkedProducts(selected);
      if (linkedProducts.length) return linkedProducts;
      return fetchFallbackProducts(selected);
    }

    loadProducts()
      .then(nextProducts => { if (alive) setProducts(nextProducts); })
      .catch(() => { if (alive) setProducts([]); });

    return () => { alive = false; };
  }, [selected?.id, selected?.title]);
  return products;
}

function useSongLikes(tracks, sessionId) {
  const [likeCounts, setLikeCounts] = useState({});
  const [likedSongIds, setLikedSongIds] = useState(() => new Set());
  const pendingLikeIds = useRef(new Set());

  useEffect(() => {
    let alive = true;
    const songIds = tracks.map(track => track.id).filter(Boolean);

    fetchLikeRows(songIds)
      .then(rows => {
        if (!alive) return;
        const nextCounts = {};
        const nextLiked = new Set();
        rows.forEach(row => {
          if (!row.song_id) return;
          nextCounts[row.song_id] = (nextCounts[row.song_id] || 0) + 1;
          if (row.session_id === sessionId) nextLiked.add(row.song_id);
        });
        setLikeCounts(nextCounts);
        setLikedSongIds(nextLiked);
      })
      .catch(error => console.warn('Unable to load song likes.', error.message || error));

    return () => { alive = false; };
  }, [tracks, sessionId]);

  const likeSong = useCallback(async songId => {
    if (!songId || likedSongIds.has(songId) || pendingLikeIds.current.has(songId)) return;

    pendingLikeIds.current.add(songId);
    setLikedSongIds(previous => new Set(previous).add(songId));
    setLikeCounts(previous => ({ ...previous, [songId]: (previous[songId] || 0) + 1 }));

    const { error } = await insertSongLike(songId, sessionId);
    if (!error) {
      pendingLikeIds.current.delete(songId);
      return;
    }

    pendingLikeIds.current.delete(songId);

    if (DUPLICATE_ERROR_CODES.has(error.code)) {
      setLikedSongIds(previous => new Set(previous).add(songId));
      return;
    }

    setLikedSongIds(previous => {
      const next = new Set(previous);
      next.delete(songId);
      return next;
    });
    setLikeCounts(previous => ({ ...previous, [songId]: Math.max(0, (previous[songId] || 1) - 1) }));
    console.warn('Unable to save song like.', error.message || error);
  }, [likedSongIds, sessionId]);

  return { likeCounts, likedSongIds, likeSong };
}

function useSongPlayCounts(tracks) {
  const [playCounts, setPlayCounts] = useState({});

  useEffect(() => {
    let alive = true;
    const songIds = tracks.map(track => track.id).filter(Boolean);

    fetchPlayRows(songIds)
      .then(rows => {
        if (!alive) return;
        const nextCounts = {};
        rows.forEach(row => {
          if (!row.song_id) return;
          nextCounts[row.song_id] = (nextCounts[row.song_id] || 0) + 1;
        });
        setPlayCounts(nextCounts);
      })
      .catch(error => console.warn('Unable to load song play counts.', error.message || error));

    return () => { alive = false; };
  }, [tracks]);

  const incrementPlayCount = useCallback(songId => {
    if (!songId) return;
    setPlayCounts(previous => ({ ...previous, [songId]: (previous[songId] || 0) + 1 }));
  }, []);

  return { playCounts, incrementPlayCount };
}

function useSongShareCounts(tracks) {
  const [shareCounts, setShareCounts] = useState({});

  useEffect(() => {
    let alive = true;
    const songIds = tracks.map(track => track.id).filter(Boolean);

    fetchShareCountRows(songIds)
      .then(rows => {
        if (!alive) return;
        const nextCounts = {};
        rows.forEach(row => {
          if (!row.song_id) return;
          nextCounts[row.song_id] = Number(row.share_count) || 0;
        });
        setShareCounts(nextCounts);
      })
      .catch(error => console.warn('Unable to load song share counts.', error.message || error));

    return () => { alive = false; };
  }, [tracks]);

  const incrementShareCount = useCallback(songId => {
    if (!songId) return;
    setShareCounts(previous => ({ ...previous, [songId]: (previous[songId] || 0) + 1 }));
  }, []);

  return { shareCounts, incrementShareCount };
}

function App() {
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState('supabase');
  const [fallbackReason, setFallbackReason] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [copiedSongId, setCopiedSongId] = useState(null);
  const [sessionId] = useState(getBrowserSessionId);
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const selectedSong = useMemo(() => {
    if (!tracks.length) return null;
    if (selected?.id) return tracks.find(track => String(track.id) === String(selected.id)) || tracks[0];
    if (selected?.idx) return tracks.find(track => String(track.idx) === String(selected.idx)) || tracks[0];
    return tracks[0];
  }, [tracks, selected?.id, selected?.idx]);
  const products = useProducts(selected);
  const { likeCounts, likedSongIds, likeSong } = useSongLikes(tracks, sessionId);
  const { playCounts, incrementPlayCount } = useSongPlayCounts(tracks);
  const { shareCounts, incrementShareCount } = useSongShareCounts(tracks);

  const recordSongEvent = useCallback(eventType => {
    if (eventType === 'play') incrementPlayCount(selected?.id);
    insertSongPlayEvent(selected?.id, sessionId, eventType);
  }, [incrementPlayCount, selected?.id, sessionId]);

  useEffect(() => {
    fetchRadioSongs().then(({ tracks: parsed, source, fallbackReason: nextFallbackReason }) => {
      const requestedSongId = new URLSearchParams(window.location.search).get('song');
      const requestedSong = requestedSongId ? parsed.find(track => String(track.id) === requestedSongId || String(track.idx) === requestedSongId) : null;
      setTracks(parsed);
      setSelected(previous => {
        const previousSong = previous?.id
          ? parsed.find(track => String(track.id) === String(previous.id))
          : previous?.idx
            ? parsed.find(track => String(track.idx) === String(previous.idx))
            : null;
        return previousSong || requestedSong || parsed[0] || null;
      });
      setDataSource(source);
      setFallbackReason(nextFallbackReason);
      setStatus('ready');
      if (requestedSong) scrollPlayerIntoView();
    }).catch(err => { setError(err.message); setStatus('error'); });
  }, []);

  useEffect(() => {
    setSelected(previous => {
      if (!tracks.length) return null;
      const previousSong = previous?.id
        ? tracks.find(track => String(track.id) === String(previous.id))
        : previous?.idx
          ? tracks.find(track => String(track.idx) === String(previous.idx))
          : null;
      return previousSong || tracks[0];
    });
  }, [tracks]);

  useEffect(() => {
    window.currentTrack = selectedSong;
    window.dispatchEvent(new CustomEvent('stashbox:trackchange', { detail: { track: selectedSong } }));
  }, [selectedSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selected?.id) return undefined;

    const onPlay = () => recordSongEvent('play');
    const onPause = () => {
      if (!audio.ended) recordSongEvent('pause');
    };
    const onEnded = () => recordSongEvent('complete');

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [recordSongEvent, selected?.idx, selected?.id]);

  const genres = useMemo(() => {
    const present = new Set(tracks.map(t => t.sectionKey));
    return [{ key: 'ALL', emoji: '♬', color: '#f0a500' }, ...SECTIONS.filter(s => present.has(s.key))];
  }, [tracks]);

  const filtered = useMemo(() => tracks.filter(track => {
    const genreMatch = genre === 'ALL' || track.sectionKey === genre;
    const haystack = [track.title, track.artist, track.album, track.genre, track.notes].join(' ').toLowerCase();
    return genreMatch && (!query || haystack.includes(query.toLowerCase()));
  }), [tracks, genre, query]);

  const grouped = useMemo(() => {
    const out = {};
    SECTIONS.forEach(s => { out[s.key] = []; });
    filtered.forEach(track => (out[track.sectionKey] || out.Other).push(track));
    return out;
  }, [filtered]);

  function scrollPlayerIntoView() {
    window.setTimeout(() => {
      if (!window.matchMedia('(max-width: 767px)').matches || !playerRef.current) return;
      const top = playerRef.current.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 80);
  }

  function selectTrack(track, shouldScroll = true, recordSkipOnPlaying = true) {
    if (audioRef.current) {
      if (recordSkipOnPlaying && !audioRef.current.paused && selected?.id) insertSongPlayEvent(selected.id, sessionId, 'skip');
      audioRef.current.pause();
    }
    setVideoOpen(false);
    setSelected(track);
    if (shouldScroll) scrollPlayerIntoView();
  }

  function chooseSong(track) {
    selectTrack(track);
  }

  function shiftTrack(direction, eventType = 'skip') {
    if (!filtered.length) return;
    if (eventType) recordSongEvent(eventType);
    const currentIndex = Math.max(0, filtered.findIndex(track => track.idx === selected?.idx));
    const nextIndex = (currentIndex + direction + filtered.length) % filtered.length;
    selectTrack(filtered[nextIndex], false, false);
  }

  function pickRandomTrack() {
    if (!filtered.length) return;
    recordSongEvent('random_click');
    const candidates = filtered.filter(track => track.idx !== selected?.idx);
    const pool = candidates.length ? candidates : filtered;
    selectTrack(pool[Math.floor(Math.random() * pool.length)], false, false);
  }

  function openVideo() {
    if (audioRef.current) audioRef.current.pause();
    recordSongEvent('video_open');
    setVideoOpen(true);
    scrollPlayerIntoView();
  }

  function closeVideo() {
    setVideoOpen(false);
  }

  async function shareSong(song) {
    if (!song?.id && !song?.idx) return;
    const shareUrl = getShareUrl(song);
    const shareMethod = navigator.share ? 'web_share_api' : 'clipboard_fallback';
    const shareData = {
      title: song.title,
      text: `Listen to ${song.title} by Stashbox on Stashbox Radio`,
      url: shareUrl
    };

    incrementShareCount(song.id);
    insertSongShareEvent(song.id, sessionId, shareUrl, shareMethod)
      .catch(error => console.warn('Unable to record song share event.', error.message || error));

    try {
      if (shareMethod === 'web_share_api') {
        await navigator.share(shareData);
        return;
      }
      await copyTextToClipboard(shareData.url);
      setCopiedSongId(song.id || song.idx);
      window.setTimeout(() => setCopiedSongId(current => current === (song.id || song.idx) ? null : current), 1800);
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Unable to share song.', error.message || error);
    }
  }

  function handleProductClick(product) {
    insertProductClickEvent(selected, product, sessionId);
  }

  if (status === 'loading') return h('section', { className: 'loading-shell', 'aria-live': 'polite' }, h('img', { src: '/images/branding/stashbox-logo-transparent-rastacolors.png', alt: 'Stashbox', className: 'loading-logo' }), h('p', null, 'Loading active songs from Supabase…'));
  if (status === 'error') return h('section', { className: 'error', role: 'alert' }, h('strong', null, 'ERROR'), h('p', null, error), h('p', null, 'The production /radio/ page has not been changed.'));

  return h('div', { className: 'radio-app' },
    h('header', { className: 'page-heading' },
      h('p', { className: 'page-subtitle' }, 'Listen. Watch. Shop. Share.'),
      h('h1', null, 'STASHBOX RADIO'),
      dataSource === 'sheet' ? h('p', { className: 'source-note', role: 'status' }, `Supabase is unavailable, so this preview is loaded from the published radio sheet. ${fallbackReason ? `Supabase error: ${fallbackReason}` : ''}`) : null
    ),
    h('div', { className: 'radio-interface' },
      h('main', { className: 'radio-main' },
        h('section', { 'aria-label': 'Search and filter songs' },
          h('div', { className: 'toolbar' },
            h('input', { className: 'search', type: 'search', placeholder: 'Search songs, artists, albums, genres…', value: query, onChange: e => setQuery(e.target.value) }),
            h('button', { className: 'button', type: 'button', onClick: () => { setQuery(''); setGenre('ALL'); } }, 'Reset filters')
          ),
          h('div', { className: 'chips', role: 'list', 'aria-label': 'Genre filters' }, genres.map(g => h('button', { key: g.key, className: `chip ${genre === g.key ? 'active' : ''}`, type: 'button', onClick: () => setGenre(g.key), style: genre === g.key ? { borderColor: g.color, color: g.color } : {} }, `${g.emoji} ${g.key === 'ALL' ? 'All' : g.key}`)))
        ),
        h('section', { className: 'list-head' },
          h('h2', null, 'Song List'),
          h('div', { className: 'list-actions' },
            h('button', { className: 'button', type: 'button', onClick: pickRandomTrack }, 'Random Song'),
            h('div', { className: 'count' }, `${filtered.length} of ${tracks.length} tracks`)
          )
        ),
        tracks.length ? (filtered.length ? h('div', { className: 'sections' }, SECTIONS.map(section => grouped[section.key]?.length ? h(SongSection, { key: section.key, section, tracks: grouped[section.key], selected: selectedSong, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike: likeSong, onShare: shareSong, copiedSongId }) : null)) : h('div', { className: 'empty' }, 'No tracks match this search/filter combination.')) : h('div', { className: 'empty' }, 'No active songs are in the Supabase songs table yet. Add active tracks and they will appear here automatically.')
      ),
      h(Player, {
        selected: selectedSong,
        audioRef,
        playerRef,
        videoOpen,
        openVideo,
        closeVideo,
        products,
        onPrevious: () => shiftTrack(-1, 'skip'),
        onNext: () => shiftTrack(1, 'next_click'),
        onProductClick: handleProductClick,
        likeCount: likeCounts[selectedSong?.id] || 0,
        playCount: playCounts[selectedSong?.id] || 0,
        shareCount: shareCounts[selectedSong?.id] || 0,
        hasLiked: likedSongIds.has(selectedSong?.id),
        onLike: () => likeSong(selectedSong?.id),
        onShare: () => shareSong(selectedSong),
        shareCopied: copiedSongId === (selectedSong?.id || selectedSong?.idx)
      })
    )
  );
}

function PlayCount({ count }) {
  return h('span', { className: 'play-count', title: `${Number(count) || 0} recorded plays` },
    h('span', { 'aria-hidden': true }, '▶'),
    h('span', null, formatPlayCount(count))
  );
}

function ShareCount({ count }) {
  return h('span', { className: 'share-count', title: `${Number(count) || 0} recorded shares` },
    h('span', { 'aria-hidden': true }, '↗'),
    h('span', null, formatShareCount(count))
  );
}

function ShareButton({ onShare, copied = false, compact = false }) {
  return h('button', {
    className: `share-button ${compact ? 'compact' : ''}`,
    type: 'button',
    onClick: event => {
      event.stopPropagation();
      onShare?.();
    },
    'aria-live': copied ? 'polite' : undefined
  }, copied ? 'Link copied' : 'Share');
}

function SongActions({ likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied, compact = false }) {
  return h('span', { className: `song-actions ${compact ? 'compact' : ''}` },
    h(LikeButton, { count: likeCount, active: hasLiked, onLike, compact }),
    h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'),
    h(PlayCount, { count: playCount }),
    h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'),
    h(ShareCount, { count: shareCount }),
    h('span', { className: 'song-actions-separator', 'aria-hidden': true }, '·'),
    h(ShareButton, { onShare, copied: shareCopied, compact })
  );
}

function LikeButton({ count, active, onLike, compact = false }) {
  return h('button', {
    className: `like-button ${active ? 'active' : ''} ${compact ? 'compact' : ''}`,
    type: 'button',
    'aria-pressed': active,
    onClick: event => {
      event.stopPropagation();
      if (!active) onLike?.();
    },
    disabled: active
  },
    h('span', { 'aria-hidden': true }, '👍'),
    h('span', null, count)
  );
}

function Player({ selected, audioRef, playerRef, videoOpen, openVideo, closeVideo, products, onPrevious, onNext, onProductClick, likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied }) {
  if (!selected) return h('aside', { className: 'panel player player-empty', ref: playerRef }, h('p', null, 'Choose a song to start the preview player.'));
  const section = SECTIONS.find(s => s.key === selected.sectionKey) || SECTIONS[SECTIONS.length - 1];
  const videoSrc = youtubeEmbed(selected.videoLink || selected.videoUrl);
  return h('aside', { className: 'panel player', ref: playerRef, tabIndex: -1, 'aria-label': 'Selected song player' },
    h('div', { className: 'player-grid' },
      h('div', { className: 'art' }, selected.imageUrl ? h('img', { src: selected.imageUrl, alt: `${selected.title} artwork`, onError: e => { e.currentTarget.style.display = 'none'; } }) : h('div', { className: 'art-fallback' }, selected.title)),
      h('div', null,
        h('p', { className: 'kicker' }, 'Now selected'),
        h('div', { className: 'player-title-row' },
          h('h2', null, selected.title)
        ),
        h(SongActions, { likeCount, playCount, shareCount, hasLiked, onLike, onShare, shareCopied }),
        h('div', { className: 'meta' }, h('strong', null, selected.artist || 'Stashbox'), selected.album ? h('span', null, `· ${selected.album}`) : null, h('span', { className: 'genre-tag', style: { color: section.color, backgroundColor: `${section.color}22` } }, selected.genre || selected.sectionKey)),
        selected.notes ? h('p', { className: 'notes' }, selected.notes) : null,
        h('div', { className: 'now-playing' }, h('span', null, 'Now playing'), h('strong', null, selected.title)),
        has(selected.audioUrl) ? h('audio', { key: selected.idx, className: 'audio', ref: audioRef, src: selected.audioUrl, controls: true, controlsList: 'nodownload', preload: 'metadata', onContextMenu: event => event.preventDefault() }) : h('p', { className: 'notes' }, 'No audio URL is available for this track.'),
        h('div', { className: 'mobile-controls', 'aria-label': 'Mobile player controls' },
          h('button', { className: 'button', type: 'button', onClick: onPrevious }, 'Previous'),
          h('button', { className: 'button', type: 'button', onClick: onNext }, 'Next Song')
        ),
        has(selected.videoLink || selected.videoUrl) ? h('div', { className: 'video-actions' },
          h('button', { className: 'button accent', type: 'button', onClick: openVideo }, videoOpen ? 'Restart / Focus Video' : 'Watch Video'),
          videoOpen ? h('button', { className: 'button', type: 'button', onClick: closeVideo }, 'Close Video') : null
        ) : null,
        videoOpen && videoSrc ? h('div', { className: 'video-wrap' }, h('iframe', { title: `${selected.title} video`, src: videoSrc, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullScreen: true })) : null
      )
    ),
    h(ProductRecommendations, { products, onProductClick })
  );
}

function ProductRecommendations({ products, onProductClick }) {
  const carouselRef = useRef(null);
  const visibleProducts = useMemo(() => products.slice(0, MAX_PRODUCT_RECOMMENDATIONS), [products]);
  const [carouselState, setCarouselState] = useState({ atStart: true, atEnd: true });
  const showArrows = visibleProducts.length >= 5;

  const updateCarouselState = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    setCarouselState({
      atStart: carousel.scrollLeft <= 1,
      atEnd: carousel.scrollLeft >= maxScrollLeft - 1
    });
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return undefined;
    carousel.scrollTo({ left: 0 });
    updateCarouselState();

    const handleScroll = () => updateCarouselState();
    const handleResize = () => updateCarouselState();
    carousel.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(carousel);

    return () => {
      carousel.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [updateCarouselState, visibleProducts]);

  const moveCarousel = direction => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction * carousel.clientWidth, behavior: 'smooth' });
  };

  const handleCarouselMouseDown = event => {
    if (event.button !== 0 || !carouselRef.current) return;
    dragStateRef.current = {
      active: true,
      startX: event.pageX,
      scrollLeft: carouselRef.current.scrollLeft
    };
    didDragCarouselRef.current = false;
    carouselRef.current.classList.add('dragging');
  };

  const handleCarouselMouseMove = event => {
    const carousel = carouselRef.current;
    const dragState = dragStateRef.current;
    if (!carousel || !dragState.active) return;

    const distance = event.pageX - dragState.startX;
    if (Math.abs(distance) > 3) {
      didDragCarouselRef.current = true;
      event.preventDefault();
    }

    carousel.scrollLeft = dragState.scrollLeft - distance;
    updateCarouselState();
  };

  const handleProductClick = (event, product) => {
    if (didDragCarouselRef.current) {
      event.preventDefault();
      didDragCarouselRef.current = false;
      return;
    }

    onProductClick?.(product);
  };

  return h('section', { className: 'merch', 'aria-label': 'Product recommendations' },
    h('div', { className: 'merch-head' }, h('div', null, h('p', { className: 'kicker' }, 'Stashbox merch'), h('div', { className: 'merch-title' }, 'Shop This Track')), h('span', { className: 'count' }, visibleProducts.length ? `${visibleProducts.length} items` : 'Loading merch…')),
    visibleProducts.length ? h('div', { className: 'products-shell' },
      showArrows ? h('button', { className: 'carousel-arrow carousel-arrow-left', type: 'button', 'aria-label': 'Show previous products', disabled: carouselState.atStart, onClick: () => moveCarousel(-1) }, '‹') : null,
      h('div', { className: 'products', ref: carouselRef, onMouseDown: handleCarouselMouseDown, onMouseMove: handleCarouselMouseMove, onMouseUp: endCarouselDrag, onMouseLeave: endCarouselDrag }, visibleProducts.map(product => h('a', { key: product.url || product.id || product.title, className: 'product', href: product.url, target: '_blank', rel: 'noopener noreferrer', draggable: false, onClick: event => handleProductClick(event, product) },
        h('div', { className: 'product-img' }, product.image ? h('img', { src: product.image, alt: product.title, loading: 'lazy', draggable: false, onError: e => { e.currentTarget.remove(); } }) : 'SB'),
        h('div', { className: 'product-name' }, product.title),
        h('div', { className: 'product-price' }, product.price || 'Shop on Stashbox.ai')
      ))),
      showArrows ? h('button', { className: 'carousel-arrow carousel-arrow-right', type: 'button', 'aria-label': 'Show more products', disabled: carouselState.atEnd, onClick: () => moveCarousel(1) }, '›') : null
    ) : h('p', { className: 'notes' }, 'Recommendations will appear here when the Stashbox shop feed is available.')
  );
}

function SongSection({ section, tracks, selected, chooseSong, likeCounts, playCounts, shareCounts, likedSongIds, onLike, onShare, copiedSongId }) {
  return h('section', null,
    h('h3', { className: 'section-title', style: { color: section.color } }, `${section.emoji} ${section.key}`),
    h('div', { className: 'song-grid' }, tracks.map(track => h('button', { key: track.idx, type: 'button', className: `song-card ${selected?.idx === track.idx ? 'active' : ''}`, onClick: () => chooseSong(track) },
      h('span', { className: 'thumb' }, track.imageUrl ? h('img', { src: track.imageUrl, alt: '', loading: 'lazy', onError: e => { e.currentTarget.remove(); } }) : section.emoji),
      h('span', { className: 'song-card-body' },
        h('span', { className: 'song-card-title-row' },
          h('span', { className: 'song-title' }, track.title)
        ),
        h(SongActions, { likeCount: likeCounts[track.id] || 0, playCount: playCounts[track.id] || 0, shareCount: shareCounts[track.id] || 0, hasLiked: likedSongIds.has(track.id), onLike: () => onLike(track.id), onShare: () => onShare(track), shareCopied: copiedSongId === (track.id || track.idx), compact: true }),
        h('span', { className: 'song-artist' }, track.artist || 'Stashbox'),
        track.album ? h('span', { className: 'song-album' }, track.album) : null,
        h('span', { className: 'badges' }, has(track.audioUrl) ? h('span', { className: 'badge' }, 'Audio') : null, has(track.videoLink || track.videoUrl) ? h('span', { className: 'badge video' }, 'Video') : null)
      )
    )))
  );
}

createRoot(document.getElementById('root')).render(h(App));
