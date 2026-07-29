(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/dev/')) return;
  if (window.location.pathname.includes('/radio/dev/v2/')) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const PLACEHOLDER = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const cache = new Map();
  let catalogPromise = null;
  let scheduled = 0;
  let applyToken = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const fixDropbox = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function rows(data) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  async function catalog() {
    if (!catalogPromise) {
      catalogPromise = getJson(SONGS_URL).then(data => rows(data).map((row, index) => ({
        key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
        title: clean(row.display_title || row.song_name || row.title),
        artist: clean(row.artist || row.artist_name || 'Stashbox')
      })).filter(song => song.key && song.title));
    }
    return catalogPromise;
  }

  async function artworkMedia(songKey) {
    if (!cache.has(songKey)) {
      cache.set(songKey, getJson(`${API}/radio/songs/${encodeURIComponent(songKey)}/artwork-images`)
        .then(data => data?.media || {})
        .catch(error => {
          cache.delete(songKey);
          throw error;
        }));
    }
    return cache.get(songKey);
  }

  function requestedRatio(width = window.innerWidth) {
    if (width < 700) return '9x16';
    if (width >= 1800) return '21x9';
    return '16x9';
  }

  function fallbackOrder(ratio) {
    if (ratio === '9x16') return ['9x16', '4x5', '3x4', '1x1'];
    if (ratio === '21x9') return ['21x9', '16x9', '1x1'];
    return ['16x9', '21x9', '1x1'];
  }

  function imageMap(media) {
    return {
      '1x1': fixDropbox(media?.artwork_images?.['1x1'] || media?.song_artwork_1x1_url || media?.song_artwork_url),
      '16x9': fixDropbox(media?.artwork_images?.['16x9'] || media?.song_artwork_16x9_url),
      '9x16': fixDropbox(media?.artwork_images?.['9x16'] || media?.song_artwork_9x16_url),
      '3x4': fixDropbox(media?.artwork_images?.['3x4'] || media?.song_artwork_3x4_url),
      '4x5': fixDropbox(media?.artwork_images?.['4x5'] || media?.song_artwork_4x5_url),
      '21x9': fixDropbox(media?.artwork_images?.['21x9'] || media?.song_artwork_21x9_url)
    };
  }

  function chooseArtwork(media) {
    const requested = requestedRatio();
    const images = imageMap(media);
    const source = fallbackOrder(requested).find(ratio => images[ratio]) || '';
    return {
      requested,
      source,
      url: source ? images[source] : PLACEHOLDER
    };
  }

  function currentPlayer() {
    const player = document.querySelector('.panel.player[aria-label="Selected song player"]');
    if (!player) return null;
    const media = player.querySelector('.player-media');
    const poster = media?.querySelector(':scope > img:not(.song-visual-asset)');
    if (!media || !poster) return null;
    if (media.classList.contains('enhanced-visual-media')) return null;
    if (media.querySelector('.song-visual-asset, video, iframe, .youtube-player-frame')) return null;
    return {
      player,
      media,
      poster,
      title: clean(player.querySelector('.player-title-row h2')?.textContent),
      artist: clean(player.querySelector('.player-info .meta strong')?.textContent)
    };
  }

  function findSong(songs, title, artist) {
    const titleKey = normalize(title);
    const artistKey = normalize(artist);
    return songs.find(song => normalize(song.title) === titleKey && (!artistKey || normalize(song.artist) === artistKey))
      || songs.find(song => normalize(song.title) === titleKey)
      || null;
  }

  function applyFrame(media, requested, source) {
    media.dataset.songArtworkRequestedRatio = requested;
    media.dataset.songArtworkSourceRatio = source || '';
    media.style.aspectRatio = requested.replace('x', ' / ');
    media.style.overflow = 'hidden';
  }

  async function preload(url) {
    if (!url || url === PLACEHOLDER) return;
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
  }

  async function applyResponsiveArtwork() {
    const target = currentPlayer();
    if (!target?.title) return;
    const token = ++applyToken;
    try {
      const songs = await catalog();
      const song = findSong(songs, target.title, target.artist);
      if (!song) return;
      const media = await artworkMedia(song.key);
      if (token !== applyToken) return;
      const current = currentPlayer();
      if (!current || normalize(current.title) !== normalize(target.title)) return;
      const selected = chooseArtwork(media);
      if (!selected.url) return;
      if (current.poster.dataset.responsiveArtworkUrl !== selected.url) {
        await preload(selected.url).catch(() => {});
        if (token !== applyToken) return;
        current.poster.src = selected.url;
        current.poster.dataset.responsiveArtworkUrl = selected.url;
        current.poster.dataset.responsiveArtworkRatio = selected.source || selected.requested;
        current.poster.style.display = '';
        current.poster.style.width = '100%';
        current.poster.style.height = '100%';
        current.poster.style.objectFit = 'cover';
        current.poster.style.objectPosition = 'center';
      }
      applyFrame(current.media, selected.requested, selected.source);
    } catch (error) {
      console.warn('[Song artwork] Responsive player artwork unavailable.', error?.message || error);
    }
  }

  function scheduleApply() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(applyResponsiveArtwork, 40);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', scheduleApply, { passive: true });
  window.addEventListener('orientationchange', scheduleApply, { passive: true });
  document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
  scheduleApply();
})();
