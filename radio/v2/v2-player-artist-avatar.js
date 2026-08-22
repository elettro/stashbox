(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const cache = new Map();
  let requestId = 0;
  let scheduled = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const slug = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox';

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function imageMarkup(url, alt) {
    const safeUrl = clean(url) || FALLBACK;
    const safeAlt = clean(alt) || 'Artist profile image';
    const image = document.createElement('img');
    image.src = safeUrl;
    image.alt = safeAlt;
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      if (image.src.endsWith(FALLBACK)) return;
      image.src = FALLBACK;
    }, { once: true });
    return image;
  }

  function replaceImage(target, url, artistName) {
    if (!target || !url) return;
    const existing = target.querySelector('img');
    const absolute = new URL(url, location.href).href;
    if (existing?.src === absolute) return;
    target.replaceChildren(imageMarkup(url, artistName));
    target.dataset.artistProfileImage = absolute;
  }

  function currentPlayer() {
    const player = app.querySelector('[data-player]');
    return player && !player.hidden ? player : null;
  }

  function temporaryFallback(player, artistName) {
    const mini = player.querySelector('[data-avatar]');
    const rail = player.querySelector('[data-li-artist-image]');
    const currentImage = mini?.querySelector('img')?.src || player.querySelector('[data-backdrop]')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] || FALLBACK;
    if (rail && !rail.querySelector('img')) replaceImage(rail, currentImage, artistName);
  }

  async function resolveArtist(artistName) {
    const cacheKey = normalize(artistName);
    if (!cacheKey) return null;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const pending = (async () => {
      const directKey = slug(artistName);
      try {
        const body = await json(`${API}/radio/artists/${encodeURIComponent(directKey)}`);
        if (body?.artist) return body.artist;
      } catch (_) {}

      try {
        const body = await json(`${API}/radio/artists?q=${encodeURIComponent(artistName)}&limit=25`);
        const artists = Array.isArray(body) ? body : (body.artists || body.items || body.data || []);
        const target = normalize(artistName);
        return artists.find(artist => (
          normalize(artist.name) === target ||
          normalize(artist.artist_key) === target ||
          normalize(artist.slug) === slug(artistName)
        )) || artists[0] || null;
      } catch (_) {
        return null;
      }
    })();

    cache.set(cacheKey, pending);
    const result = await pending;
    cache.set(cacheKey, result);
    return result;
  }

  async function sync() {
    const player = currentPlayer();
    if (!player) return;

    const artistName = clean(player.querySelector('[data-partist]')?.textContent);
    if (!artistName) return;

    temporaryFallback(player, artistName);
    const currentRequest = ++requestId;
    const artist = await resolveArtist(artistName);
    if (currentRequest !== requestId || currentPlayer() !== player) return;

    const profileImage = clean(artist?.profile_image_url);
    if (!profileImage) return;

    replaceImage(player.querySelector('[data-avatar]'), profileImage, artist.name || artistName);
    replaceImage(player.querySelector('[data-li-artist-image]'), profileImage, artist.name || artistName);
    player.dataset.artistProfileKey = clean(artist.artist_key || artist.slug || slug(artistName));
    player.dataset.artistProfileImage = profileImage;
  }

  function schedule() {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(sync, 20);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev]')) schedule();
  }, true);

  window.addEventListener('stashbox:artist-profile-updated', event => {
    const name = clean(event.detail?.artistName);
    if (name) cache.delete(normalize(name));
    schedule();
  });

  schedule();
})();
