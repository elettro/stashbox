(() => {
  'use strict';

  if (window.__stashboxDesktopShareIsolationLoaded) return;
  window.__stashboxDesktopShareIsolationLoaded = true;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let toast = null;

  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

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
    return app.querySelector('.v2-player:not([hidden])') || app.querySelector('[data-player]:not([hidden])');
  }

  function currentSong() {
    const p = player();
    if (!p) return null;

    const explicitKey = clean(p.dataset.songKey || p.getAttribute('data-song-key'));
    if (explicitKey) {
      const byKey = songs.find(song => song.key === explicitKey);
      if (byKey) return byKey;
    }

    const title = norm(p.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(p.querySelector('[data-partist]')?.textContent);
    if (!title) return null;

    return songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || songs.find(song => norm(song.title) === title)
      || null;
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

  function paintCurrentCount() {
    const button = findShareButton();
    const song = currentSong();
    if (!button || !song) return;
    const count = ensureCount(button);
    if (!count) return;
    count.textContent = String(song.shares);
    button.setAttribute('title', 'Copy song link');
    button.setAttribute('aria-label', `Copy link for ${song.title}. ${song.shares} shares`);
  }

  function songUrl(song) {
    const url = new URL('/radio/dev/v2/', location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function showToast(button, text) {
    if (toast) toast.remove();
    const rect = button.getBoundingClientRect();
    toast = document.createElement('div');
    toast.className = 'desktop-share-copy-toast';
    toast.textContent = text;
    toast.style.left = `${Math.max(12, Math.min(window.innerWidth - 130, rect.left + rect.width / 2 - 55))}px`;
    toast.style.top = `${Math.max(12, rect.top - 42)}px`;
    document.body.appendChild(toast);
    window.setTimeout(() => {
      toast?.remove();
      toast = null;
    }, 1200);
  }

  function copyText(value, button) {
    const copied = () => showToast(button, 'Copied Link');

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(copied).catch(() => fallbackCopy(value, copied));
      return;
    }
    fallbackCopy(value, copied);
  }

  function fallbackCopy(value, onSuccess) {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.appendChild(input);
    input.select();
    try {
      if (document.execCommand('copy')) onSuccess();
    } catch (_) {}
    input.remove();
  }

  function persistShare(song) {
    if (!song?.key) return;
    const sessionId = `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.setTimeout(() => {
      fetch(TRACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          song_key: song.key,
          event_type: 'share',
          session_id: sessionId,
          display_title: song.title,
          artist: song.artist,
          source: 'radio_dev_v2_desktop_copy_link'
        }),
        keepalive: true
      }).catch(() => {});
    }, 0);
  }

  function onShareClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const song = currentSong();
    if (!song) return;

    song.shares += 1;
    paintCurrentCount();
    copyText(songUrl(song), button);
    persistShare(song);
  }

  function replaceShareButton() {
    if (!matchMedia('(min-width: 900px)').matches) return;
    const original = findShareButton();
    if (!original) return;

    if (original.dataset.desktopShareIsolation === 'true') {
      paintCurrentCount();
      return;
    }

    const clone = original.cloneNode(true);
    clone.dataset.desktopShareIsolation = 'true';
    clone.setAttribute('title', 'Copy song link');
    clone.setAttribute('aria-label', 'Copy song link');
    ensureCount(clone);
    clone.addEventListener('click', onShareClick, false);
    original.replaceWith(clone);
    paintCurrentCount();
  }

  function loadSongs() {
    return fetch(`${SONGS_URL}?limit=500&desktop_share_copy=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(payload => {
        songs = rows(payload).map(normalizeSong).filter(song => song.key && song.title);
        replaceShareButton();
        paintCurrentCount();
      })
      .catch(() => {});
  }

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 900px) {
      .v2-player [data-share] {
        display:inline-flex !important;
        align-items:center !important;
        gap:7px !important;
      }
      .v2-player [data-share] .v2-share-count {
        display:inline-block;
        font-size:13px;
        line-height:1;
        pointer-events:none;
      }
      .desktop-share-copy-toast {
        position:fixed;
        z-index:22000;
        min-width:110px;
        padding:8px 11px;
        border-radius:999px;
        background:rgba(18,20,24,.96);
        border:1px solid rgba(255,255,255,.18);
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        color:#fff;
        font:700 12px/1.1 Karla,Arial,sans-serif;
        text-align:center;
        pointer-events:none;
      }
    }
  `;
  document.head.appendChild(style);

  loadSongs();

  [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000].forEach(delay => {
    window.setTimeout(() => {
      replaceShareButton();
      paintCurrentCount();
    }, delay);
  });

  // The player reuses the same markup as songs change. This lightweight sync keeps
  // the displayed number tied to the song currently shown without observing the DOM.
  window.setInterval(() => {
    replaceShareButton();
    paintCurrentCount();
  }, 500);
})();
