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
const SESSION_STORAGE_KEY = 'stashbox-radio-react-session-id';
const DUPLICATE_ERROR_CODES = new Set(['23505']);
const PLAY_EVENT_TYPES = new Set(['play', 'pause', 'skip', 'complete', 'next_click', 'random_click', 'video_open']);
const OPTIONAL_METRIC_ERROR_CODES = new Set(['42P01', 'PGRST106', 'PGRST205']);

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
  const res = await fetch('https://stashbox.ai/products.json?limit=250');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const shaped = (Array.isArray(data.products) ? data.products : []).map(productShape);
  return rotateBySeed(shaped, selected?.title).slice(0, 8);
}

async function fetchLinkedProducts(selected) {
  if (!selected?.id) return [];
  const supabase = createRadioSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.songProducts)
    .select('id,song_id,product_id,priority,products:product_id(id,title,image_url,product_url,price,collection,is_active)')
    .eq('song_id', selected.id)
    .order('priority', { ascending: true });

  if (error) return [];
  return (Array.isArray(data) ? data : [])
    .filter(link => link.products && link.products.is_active !== false)
    .map(supabaseProductShape)
    .filter(product => product.url || product.title);
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

function App() {
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [sessionId] = useState(getBrowserSessionId);
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const products = useProducts(selected);
  const { likeCounts, likedSongIds, likeSong } = useSongLikes(tracks, sessionId);

  const recordSongEvent = useCallback(eventType => {
    insertSongPlayEvent(selected?.id, sessionId, eventType);
  }, [selected?.id, sessionId]);

  useEffect(() => {
    fetchSupabaseSongs().then(parsed => {
      setTracks(parsed);
      setSelected(parsed[0] || null);
      setStatus('ready');
    }).catch(err => { setError(err.message); setStatus('error'); });
  }, []);

  useEffect(() => {
    window.currentTrack = selected;
    window.dispatchEvent(new CustomEvent('stashbox:trackchange', { detail: { track: selected } }));
  }, [selected]);

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

  function handleProductClick(product) {
    insertProductClickEvent(selected, product, sessionId);
  }

  if (status === 'loading') return h('section', { className: 'loading-shell', 'aria-live': 'polite' }, h('img', { src: '/images/branding/stashbox-logo-transparent-rastacolors.png', alt: 'Stashbox', className: 'loading-logo' }), h('p', null, 'Loading active songs from Supabase…'));
  if (status === 'error') return h('section', { className: 'error', role: 'alert' }, h('strong', null, 'ERROR'), h('p', null, error), h('p', null, 'The production /radio/ page has not been changed.'));

  return h('div', { className: 'radio-app' },
    h('section', { className: 'hero' },
      h('div', { className: 'hero-card' },
        h('p', { className: 'kicker' }, 'Free browser station'),
        h('h1', null, 'Stashbox Radio'),
        h('p', { className: 'hero-copy' }, `${tracks.length} tracks, videos, genre filters, song likes, and song-based merch picks in a cleaner React preview using the Supabase test database.`),
        h('div', { className: 'hero-actions' },
          h('a', { className: 'tiny-link', href: '/radio/' }, 'Open classic radio'),
          h('a', { className: 'tiny-link', href: 'https://stashbox.ai/collections/stashbox', target: '_blank', rel: 'noopener noreferrer' }, 'Shop merch')
        )
      ),
      h(Player, {
        selected,
        audioRef,
        playerRef,
        videoOpen,
        openVideo,
        closeVideo,
        products,
        onPrevious: () => shiftTrack(-1, 'skip'),
        onNext: () => shiftTrack(1, 'next_click'),
        onProductClick: handleProductClick,
        likeCount: likeCounts[selected?.id] || 0,
        hasLiked: likedSongIds.has(selected?.id),
        onLike: () => likeSong(selected?.id)
      })
    ),
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
    tracks.length ? (filtered.length ? h('div', { className: 'sections' }, SECTIONS.map(section => grouped[section.key]?.length ? h(SongSection, { key: section.key, section, tracks: grouped[section.key], selected, chooseSong, likeCounts, likedSongIds, onLike: likeSong }) : null)) : h('div', { className: 'empty' }, 'No tracks match this search/filter combination.')) : h('div', { className: 'empty' }, 'No active songs are in the Supabase songs table yet. Add active tracks and they will appear here automatically.')
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

function Player({ selected, audioRef, playerRef, videoOpen, openVideo, closeVideo, products, onPrevious, onNext, onProductClick, likeCount, hasLiked, onLike }) {
  if (!selected) return h('aside', { className: 'panel player player-empty', ref: playerRef }, h('p', null, 'Choose a song to start the preview player.'));
  const section = SECTIONS.find(s => s.key === selected.sectionKey) || SECTIONS[SECTIONS.length - 1];
  const videoSrc = youtubeEmbed(selected.videoLink || selected.videoUrl);
  return h('aside', { className: 'panel player', ref: playerRef, tabIndex: -1, 'aria-label': 'Selected song player' },
    h('div', { className: 'player-grid' },
      h('div', { className: 'art' }, selected.imageUrl ? h('img', { src: selected.imageUrl, alt: `${selected.title} artwork`, onError: e => { e.currentTarget.style.display = 'none'; } }) : h('div', { className: 'art-fallback' }, selected.title)),
      h('div', null,
        h('p', { className: 'kicker' }, 'Now selected'),
        h('div', { className: 'player-title-row' },
          h('h2', null, selected.title),
          h(LikeButton, { count: likeCount, active: hasLiked, onLike })
        ),
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
  return h('section', { className: 'merch', 'aria-label': 'Product recommendations' },
    h('div', { className: 'merch-head' }, h('div', null, h('p', { className: 'kicker' }, 'Stashbox merch'), h('div', { className: 'merch-title' }, 'Shop This Track')), h('span', { className: 'count' }, products.length ? `${products.length} items` : 'Loading merch…')),
    products.length ? h('div', { className: 'products' }, products.map(product => h('a', { key: product.url, className: 'product', href: product.url, target: '_blank', rel: 'noopener noreferrer', onClick: () => onProductClick?.(product) },
      h('div', { className: 'product-img' }, product.image ? h('img', { src: product.image, alt: product.title, loading: 'lazy', onError: e => { e.currentTarget.remove(); } }) : 'SB'),
      h('div', { className: 'product-name' }, product.title),
      h('div', { className: 'product-price' }, product.price || 'Shop on Stashbox.ai')
    ))) : h('p', { className: 'notes' }, 'Recommendations will appear here when the Stashbox shop feed is available.')
  );
}

function SongSection({ section, tracks, selected, chooseSong, likeCounts, likedSongIds, onLike }) {
  return h('section', null,
    h('h3', { className: 'section-title', style: { color: section.color } }, `${section.emoji} ${section.key}`),
    h('div', { className: 'song-grid' }, tracks.map(track => h('button', { key: track.idx, type: 'button', className: `song-card ${selected?.idx === track.idx ? 'active' : ''}`, onClick: () => chooseSong(track) },
      h('span', { className: 'thumb' }, track.imageUrl ? h('img', { src: track.imageUrl, alt: '', loading: 'lazy', onError: e => { e.currentTarget.remove(); } }) : section.emoji),
      h('span', { className: 'song-card-body' },
        h('span', { className: 'song-card-title-row' },
          h('span', { className: 'song-title' }, track.title),
          h(LikeButton, { count: likeCounts[track.id] || 0, active: likedSongIds.has(track.id), onLike: () => onLike(track.id), compact: true })
        ),
        h('span', { className: 'song-artist' }, track.artist || 'Stashbox'),
        track.album ? h('span', { className: 'song-album' }, track.album) : null,
        h('span', { className: 'badges' }, has(track.audioUrl) ? h('span', { className: 'badge' }, 'Audio') : null, has(track.videoLink || track.videoUrl) ? h('span', { className: 'badge video' }, 'Video') : null)
      )
    )))
  );
}

createRoot(document.getElementById('root')).render(h(App));
