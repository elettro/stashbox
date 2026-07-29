(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio/dev/v2/')) return;

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

  function activePlayer() {
    return [...document.querySelectorAll('[data-player]')].find(player => (
      !player.hidden && getComputedStyle(player).display !== 'none' && getComputedStyle(player).visibility !== 'hidden'
    )) || null;
  }

  function currentIdentity(player) {
    return {
      title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player?.querySelector('[data-partist]')?.textContent)
    };
  }

  function findSong(songs, title, artist) {
    const titleKey = normalize(title);
    const artistKey = normalize(artist);
    return songs.find(song => normalize(song.title) === titleKey && (!artistKey || normalize(song.artist) === artistKey))
      || songs.find(song => normalize(song.title) === titleKey)
      || null;
  }

  function applyBackdrop(player, selected) {
    const backdrop = player?.querySelector('[data-backdrop]');
    if (backdrop) {
      backdrop.style.backgroundImage = `url("${selected.url.replaceAll('"', '%22')}")`;
      backdrop.style.backgroundPosition = 'center';
      backdrop.style.backgroundRepeat = 'no-repeat';
      backdrop.style.backgroundSize = 'cover';
      backdrop.dataset.songArtworkRequestedRatio = selected.requested;
      backdrop.dataset.songArtworkSourceRatio = selected.source || '';
      backdrop.dataset.responsiveArtworkUrl = selected.url;
    }

    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const activeMedia = stage?.querySelector('.v2-mobile-vec-media.is-active');
    if (stage && !activeMedia) {
      stage.style.backgroundImage = `url("${selected.url.replaceAll('"', '%22')}")`;
      stage.style.backgroundPosition = 'center';
      stage.style.backgroundRepeat = 'no-repeat';
      stage.style.backgroundSize = 'cover';
      stage.dataset.songArtworkRequestedRatio = selected.requested;
      stage.dataset.songArtworkSourceRatio = selected.source || '';
    }
  }

  async function applyForSong(player, songKey, identityToken = '') {
    const token = ++applyToken;
    const media = await artworkMedia(songKey);
    if (token !== applyToken) return null;
    const current = activePlayer();
    if (!current || current !== player) return null;
    if (identityToken) {
      const identity = currentIdentity(current);
      if (`${normalize(identity.title)}|${normalize(identity.artist)}` !== identityToken) return null;
    }
    const selected = chooseArtwork(media);
    applyBackdrop(current, selected);
    return selected;
  }

  async function applyResponsiveArtwork() {
    const player = activePlayer();
    if (!player) return;
    const identity = currentIdentity(player);
    if (!identity.title) return;
    const identityToken = `${normalize(identity.title)}|${normalize(identity.artist)}`;
    try {
      const songs = await catalog();
      const song = findSong(songs, identity.title, identity.artist);
      if (!song) return;
      await applyForSong(player, song.key, identityToken);
    } catch (error) {
      console.warn('[V2 song artwork] Responsive player artwork unavailable.', error?.message || error);
    }
  }

  function scheduleApply() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(applyResponsiveArtwork, 45);
  }

  window.addEventListener('stashbox:vec-asset-change', async event => {
    const asset = event?.detail?.asset || {};
    const songKey = clean(event?.detail?.songKey);
    if (!songKey || clean(asset.source) !== 'official-artwork') return;
    const player = activePlayer();
    if (!player) return;
    try {
      const selected = await applyForSong(player, songKey);
      const officialImage = player.querySelector('[data-mobile-vec-stage] .v2-mobile-vec-media.is-active');
      if (selected?.url && officialImage?.tagName === 'IMG') {
        officialImage.src = selected.url;
        officialImage.dataset.responsiveArtworkRatio = selected.source || selected.requested;
      }
    } catch (error) {
      console.warn('[V2 song artwork] Official artwork ratio switch failed.', error?.message || error);
    }
  });

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  window.addEventListener('resize', scheduleApply, { passive: true });
  window.addEventListener('orientationchange', scheduleApply, { passive: true });
  document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
  scheduleApply();
})();
