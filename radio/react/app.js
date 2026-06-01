import React, { useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18.3.1';
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
    title: product.title || 'Stashbox Product',
    url: `https://stashbox.ai/products/${product.handle || ''}`,
    image,
    price: variant?.price ? `$${Number(variant.price).toFixed(2)}` : ''
  };
}

function supabaseProductShape(link) {
  const product = link.products || link.product || link;
  return {
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

function App() {
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const products = useProducts(selected);

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

  function selectTrack(track, shouldScroll = true) {
    if (audioRef.current) audioRef.current.pause();
    setVideoOpen(false);
    setSelected(track);
    if (shouldScroll) scrollPlayerIntoView();
  }

  function chooseSong(track) {
    selectTrack(track);
  }

  function shiftTrack(direction) {
    if (!filtered.length) return;
    const currentIndex = Math.max(0, filtered.findIndex(track => track.idx === selected?.idx));
    const nextIndex = (currentIndex + direction + filtered.length) % filtered.length;
    selectTrack(filtered[nextIndex], false);
  }

  function openVideo() {
    if (audioRef.current) audioRef.current.pause();
    setVideoOpen(true);
    scrollPlayerIntoView();
  }

  function closeVideo() {
    setVideoOpen(false);
  }

  if (status === 'loading') return h('section', { className: 'loading-shell', 'aria-live': 'polite' }, h('img', { src: '/images/branding/stashbox-logo-transparent-rastacolors.png', alt: 'Stashbox', className: 'loading-logo' }), h('p', null, 'Loading active songs from Supabase…'));
  if (status === 'error') return h('section', { className: 'error', role: 'alert' }, h('strong', null, 'ERROR'), h('p', null, error), h('p', null, 'The production /radio/ page has not been changed.'));

  return h('div', { className: 'radio-app' },
    h('section', { className: 'hero' },
      h('div', { className: 'hero-card' },
        h('p', { className: 'kicker' }, 'Free browser station'),
        h('h1', null, 'Stashbox Radio'),
        h('p', { className: 'hero-copy' }, `${tracks.length} tracks, videos, genre filters, and song-based merch picks in a cleaner React preview using the Supabase test database.`),
        h('div', { className: 'hero-actions' },
          h('a', { className: 'tiny-link', href: '/radio/' }, 'Open classic radio'),
          h('a', { className: 'tiny-link', href: 'https://stashbox.ai/collections/stashbox', target: '_blank', rel: 'noopener noreferrer' }, 'Shop merch')
        )
      ),
      h(Player, { selected, audioRef, playerRef, videoOpen, openVideo, closeVideo, products, onPrevious: () => shiftTrack(-1), onNext: () => shiftTrack(1) })
    ),
    h('section', { 'aria-label': 'Search and filter songs' },
      h('div', { className: 'toolbar' },
        h('input', { className: 'search', type: 'search', placeholder: 'Search songs, artists, albums, genres…', value: query, onChange: e => setQuery(e.target.value) }),
        h('button', { className: 'button', type: 'button', onClick: () => { setQuery(''); setGenre('ALL'); } }, 'Reset filters')
      ),
      h('div', { className: 'chips', role: 'list', 'aria-label': 'Genre filters' }, genres.map(g => h('button', { key: g.key, className: `chip ${genre === g.key ? 'active' : ''}`, type: 'button', onClick: () => setGenre(g.key), style: genre === g.key ? { borderColor: g.color, color: g.color } : {} }, `${g.emoji} ${g.key === 'ALL' ? 'All' : g.key}`)))
    ),
    h('section', { className: 'list-head' }, h('h2', null, 'Song List'), h('div', { className: 'count' }, `${filtered.length} of ${tracks.length} tracks`)),
    tracks.length ? (filtered.length ? h('div', { className: 'sections' }, SECTIONS.map(section => grouped[section.key]?.length ? h(SongSection, { key: section.key, section, tracks: grouped[section.key], selected, chooseSong }) : null)) : h('div', { className: 'empty' }, 'No tracks match this search/filter combination.')) : h('div', { className: 'empty' }, 'No active songs are in the Supabase songs table yet. Add active tracks and they will appear here automatically.')
  );
}

function Player({ selected, audioRef, playerRef, videoOpen, openVideo, closeVideo, products, onPrevious, onNext }) {
  if (!selected) return h('aside', { className: 'panel player player-empty', ref: playerRef }, h('p', null, 'Choose a song to start the preview player.'));
  const section = SECTIONS.find(s => s.key === selected.sectionKey) || SECTIONS[SECTIONS.length - 1];
  const videoSrc = youtubeEmbed(selected.videoLink || selected.videoUrl);
  return h('aside', { className: 'panel player', ref: playerRef, tabIndex: -1, 'aria-label': 'Selected song player' },
    h('div', { className: 'player-grid' },
      h('div', { className: 'art' }, selected.imageUrl ? h('img', { src: selected.imageUrl, alt: `${selected.title} artwork`, onError: e => { e.currentTarget.style.display = 'none'; } }) : h('div', { className: 'art-fallback' }, selected.title)),
      h('div', null,
        h('p', { className: 'kicker' }, 'Now selected'),
        h('h2', null, selected.title),
        h('div', { className: 'meta' }, h('strong', null, selected.artist || 'Stashbox'), selected.album ? h('span', null, `· ${selected.album}`) : null, h('span', { className: 'genre-tag', style: { color: section.color, backgroundColor: `${section.color}22` } }, selected.genre || selected.sectionKey)),
        selected.notes ? h('p', { className: 'notes' }, selected.notes) : null,
        h('div', { className: 'now-playing' }, h('span', null, 'Now playing'), h('strong', null, selected.title)),
        has(selected.audioUrl) ? h('audio', { key: selected.idx, className: 'audio', ref: audioRef, src: selected.audioUrl, controls: true, preload: 'metadata' }) : h('p', { className: 'notes' }, 'No audio URL is available for this track.'),
        h('div', { className: 'mobile-controls', 'aria-label': 'Mobile player controls' },
          h('button', { className: 'button', type: 'button', onClick: onPrevious }, 'Previous'),
          h('button', { className: 'button', type: 'button', onClick: onNext }, 'Next')
        ),
        has(selected.videoLink || selected.videoUrl) ? h('div', { className: 'video-actions' },
          h('button', { className: 'button accent', type: 'button', onClick: openVideo }, videoOpen ? 'Restart / Focus Video' : 'Watch Video'),
          videoOpen ? h('button', { className: 'button', type: 'button', onClick: closeVideo }, 'Close Video') : null
        ) : null,
        videoOpen && videoSrc ? h('div', { className: 'video-wrap' }, h('iframe', { title: `${selected.title} video`, src: videoSrc, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullScreen: true })) : null
      )
    ),
    h(ProductRecommendations, { products })
  );
}

function ProductRecommendations({ products }) {
  return h('section', { className: 'merch', 'aria-label': 'Product recommendations' },
    h('div', { className: 'merch-head' }, h('div', null, h('p', { className: 'kicker' }, 'Stashbox merch'), h('div', { className: 'merch-title' }, 'Shop This Track')), h('span', { className: 'count' }, products.length ? `${products.length} items` : 'Loading merch…')),
    products.length ? h('div', { className: 'products' }, products.map(product => h('a', { key: product.url, className: 'product', href: product.url, target: '_blank', rel: 'noopener noreferrer' },
      h('div', { className: 'product-img' }, product.image ? h('img', { src: product.image, alt: product.title, loading: 'lazy', onError: e => { e.currentTarget.remove(); } }) : 'SB'),
      h('div', { className: 'product-name' }, product.title),
      h('div', { className: 'product-price' }, product.price || 'Shop on Stashbox.ai')
    ))) : h('p', { className: 'notes' }, 'Recommendations will appear here when the Stashbox shop feed is available.')
  );
}

function SongSection({ section, tracks, selected, chooseSong }) {
  return h('section', null,
    h('h3', { className: 'section-title', style: { color: section.color } }, `${section.emoji} ${section.key}`),
    h('div', { className: 'song-grid' }, tracks.map(track => h('button', { key: track.idx, type: 'button', className: `song-card ${selected?.idx === track.idx ? 'active' : ''}`, onClick: () => chooseSong(track) },
      h('span', { className: 'thumb' }, track.imageUrl ? h('img', { src: track.imageUrl, alt: '', loading: 'lazy', onError: e => { e.currentTarget.remove(); } }) : section.emoji),
      h('span', null,
        h('span', { className: 'song-title' }, track.title),
        h('span', { className: 'song-artist' }, track.artist || 'Stashbox'),
        track.album ? h('span', { className: 'song-album' }, track.album) : null,
        h('span', { className: 'badges' }, has(track.audioUrl) ? h('span', { className: 'badge' }, 'Audio') : null, has(track.videoLink || track.videoUrl) ? h('span', { className: 'badge video' }, 'Video') : null)
      )
    )))
  );
}

createRoot(document.getElementById('root')).render(h(App));
