(() => {
  'use strict';

  if (window.__stashboxDesktopShareIsolationLoaded) return;
  window.__stashboxDesktopShareIsolationLoaded = true;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const SHARE_ROOT = '/radio/dev/v2/';
  const SHARE_SOURCE = 'radio_dev_v2_desktop_copy_link';
  const desktopQuery = window.matchMedia('(min-width: 900px)');
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let toastTimer = 0;

  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const countValue = value => Math.max(0, Number.parseInt(String(value ?? '0').replace(/[^0-9-]/g, ''), 10) || 0);

  function rows(data) {
    if (typeof data?.body === 'string') {
      try { data = JSON.parse(data.body); } catch (_) {}
    }
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'rows', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  function normalizeSong(row) {
    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id),
      title: clean(row.display_title || row.title || row.song_name),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      shares: Math.max(0, Number(row.total_shares ?? row.shares ?? row.share_count ?? 0) || 0)
    };
  }

  function player() {
    const p = app.querySelector('[data-player]');
    return p && !p.hidden ? p : null;
  }

  function songElements() {
    return [...app.querySelectorAll('[data-song]')];
  }

  function resolveCurrentKey() {
    const p = player();
    if (!p) return '';
    const like = p.querySelector('[data-like]');
    const share = p.querySelector('[data-share]');
    const explicit = clean(
      p.dataset.currentSongKey ||
      p.dataset.songKey ||
      like?.dataset.currentSongKey ||
      like?.dataset.likeSongKey ||
      share?.dataset.currentSongKey ||
      share?.dataset.songKey
    );
    if (explicit && !explicit.startsWith('ui:')) return explicit;

    const queryKey = clean(new URLSearchParams(location.search).get('song'));
    if (queryKey && songElements().some(node => clean(node.dataset.song) === queryKey)) return queryKey;

    const title = clean(p.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(p.querySelector('[data-partist]')?.textContent);
    if (!title) return '';
    const exact = songElements().find(node => {
      const cardTitle = clean(node.querySelector('h3')?.textContent || node.querySelector('strong')?.textContent);
      const cardArtist = clean(node.querySelector('p')?.textContent || node.querySelector('small')?.textContent);
      return cardTitle === title && (!artist || cardArtist === artist || cardArtist.includes(artist));
    });
    const titleOnly = exact || songElements().find(node => clean(node.querySelector('h3')?.textContent || node.querySelector('strong')?.textContent) === title);
    return clean(titleOnly?.dataset.song);
  }

  function findShareButton() {
    const p = player();
    if (!p) return null;
    return [...p.querySelectorAll('[data-share]')].find(button => button.getClientRects().length) || p.querySelector('[data-share]');
  }

  function ensureCount(button) {
    if (!button) return null;
    let count = button.querySelector('[data-shares]');
    if (!count) {
      count = document.createElement('strong');
      count.setAttribute('data-shares', '');
      count.className = 'v2-share-count';
      count.textContent = '0';
      button.appendChild(count);
    }
    return count;
  }

  function currentSong() {
    const p = player();
    if (!p) return null;
    const key = resolveCurrentKey();
    if (!key) return null;

    const known = songs.find(song => song.key === key);
    if (known) return known;

    const button = findShareButton();
    return {
      key,
      title: clean(p.querySelector('[data-ptitle]')?.textContent),
      artist: clean(p.querySelector('[data-partist]')?.textContent || 'Stashbox'),
      shares: countValue(ensureCount(button)?.textContent)
    };
  }

  function paintCurrentCount() {
    const button = findShareButton();
    const song = currentSong();
    if (!button) return;
    button.dataset.desktopShareIsolation = 'true';
    button.setAttribute('title', 'Copy song link (C)');
    button.setAttribute('aria-label', song ? `Copy link for ${song.title || 'this song'}. ${song.shares} shares` : 'Copy song link');
    const count = ensureCount(button);
    if (count && song) count.textContent = String(song.shares);
  }

  function songUrl(song) {
    const url = new URL(SHARE_ROOT, location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function ensureToast() {
    let toast = document.querySelector('[data-desktop-share-toast]');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.setAttribute('data-desktop-share-toast', '');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.className = 'desktop-share-toast';
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(text) {
    const toast = ensureToast();
    window.clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1400);
  }

  function fallbackCopy(value) {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    input.remove();
    return copied;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }
    return fallbackCopy(value);
  }

  function persistShare(song) {
    if (!song?.key) return;
    const sessionId = `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        song_key: song.key,
        event_type: 'share',
        session_id: sessionId,
        display_title: song.title,
        artist: song.artist,
        source: SHARE_SOURCE
      }),
      keepalive: true
    }).catch(() => {});
  }

  async function handleShare(button) {
    const song = currentSong();
    if (!button || !song?.key) {
      showToast('Share unavailable');
      return false;
    }

    song.shares = Math.max(0, Number(song.shares || 0)) + 1;
    const known = songs.find(item => item.key === song.key);
    if (known && known !== song) known.shares = song.shares;
    ensureCount(button).textContent = String(song.shares);
    button.setAttribute('aria-label', `Copy link for ${song.title || 'this song'}. ${song.shares} shares`);
    persistShare(song);

    const copied = await copyText(songUrl(song));
    showToast(copied ? 'URL copied' : 'Copy failed');
    return copied;
  }

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  document.addEventListener('click', event => {
    if (!desktopQuery.matches) return;
    const button = event.target.closest('#v2App [data-player] [data-share]');
    if (!button || !player()?.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleShare(button);
  }, true);

  document.addEventListener('keydown', event => {
    if (!desktopQuery.matches || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (String(event.key || '').toLowerCase() !== 'c') return;
    const button = findShareButton();
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleShare(button);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 900px) {
      .v2-player [data-share] { display:inline-flex !important; align-items:center !important; gap:7px !important; }
      .v2-player [data-share] .v2-share-count { display:inline-block; font-size:13px; line-height:1; pointer-events:none; }
      .desktop-share-toast {
        position:fixed;
        left:50%;
        bottom:28px;
        z-index:40000;
        transform:translate(-50%, 8px);
        padding:9px 14px;
        border:1px solid rgba(255,255,255,.16);
        border-radius:999px;
        background:rgba(10,12,15,.96);
        color:#fff;
        font:700 12px/1 Karla,Arial,sans-serif;
        opacity:0;
        pointer-events:none;
        transition:opacity .14s ease, transform .14s ease;
      }
      .desktop-share-toast.is-visible { opacity:1; transform:translate(-50%, 0); }
    }
  `;
  document.head.appendChild(style);

  function loadSongs() {
    return fetch(`${SONGS_URL}?limit=500&desktop_share=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(payload => {
        songs = rows(payload).map(normalizeSong).filter(song => song.key);
        paintCurrentCount();
      })
      .catch(() => paintCurrentCount());
  }

  loadSongs();
  [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000].forEach(delay => window.setTimeout(paintCurrentCount, delay));
  window.setInterval(paintCurrentCount, 750);
  window.addEventListener('stashbox:v2-current-song', () => window.setTimeout(paintCurrentCount, 0));
})();
