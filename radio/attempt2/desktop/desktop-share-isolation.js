(() => {
  'use strict';

  if (window.__stashboxDesktopShareIsolationLoaded) return;
  window.__stashboxDesktopShareIsolationLoaded = true;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let statusTimer = 0;

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

  function ensureCopyStatus(button) {
    if (!button) return null;
    let status = button.querySelector('[data-share-copy-status]');
    if (!status) {
      status = document.createElement('span');
      status.setAttribute('data-share-copy-status', '');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      status.className = 'v2-share-copy-status';
      button.appendChild(status);
    }
    return status;
  }

  function paintCurrentCount() {
    const button = findShareButton();
    const song = currentSong();
    if (!button || !song) return;
    const count = ensureCount(button);
    if (!count) return;
    count.textContent = String(song.shares);
    button.setAttribute('title', 'Copy song link (C)');
    button.setAttribute('aria-label', `Copy link for ${song.title}. ${song.shares} shares`);
  }

  function songUrl(song) {
    const url = new URL('/radio/attempt2/', location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function showCopyStatus(button, text) {
    const status = ensureCopyStatus(button);
    if (!status) return;
    window.clearTimeout(statusTimer);
    status.textContent = text;
    status.classList.add('is-visible');
    statusTimer = window.setTimeout(() => {
      if (!status.isConnected) return;
      status.classList.remove('is-visible');
      window.setTimeout(() => {
        if (status.isConnected && !status.classList.contains('is-visible')) status.textContent = '';
      }, 180);
    }, 1400);
  }

  function copyText(value, button) {
    const copied = () => showCopyStatus(button, 'URL copied');

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
    clone.setAttribute('title', 'Copy song link (C)');
    clone.setAttribute('aria-label', 'Copy song link');
    ensureCount(clone);
    ensureCopyStatus(clone);
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

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function onShareHotkey(event) {
    if (!matchMedia('(min-width: 900px)').matches || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (String(event.key || '').toLowerCase() !== 'c') return;

    replaceShareButton();
    const button = findShareButton();
    if (!button || button.dataset.desktopShareIsolation !== 'true') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.click();
  }

  document.addEventListener('keydown', onShareHotkey, true);

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
      .v2-player [data-share] .v2-share-copy-status {
        display:inline-block;
        max-width:0;
        overflow:hidden;
        color:#b9f6ce;
        font:700 11px/1 Karla,Arial,sans-serif;
        white-space:nowrap;
        opacity:0;
        transform:translateX(-3px);
        transition:max-width .18s ease, opacity .14s ease, transform .18s ease;
        pointer-events:none;
      }
      .v2-player [data-share] .v2-share-copy-status.is-visible {
        max-width:72px;
        opacity:1;
        transform:translateX(0);
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

  window.setInterval(() => {
    replaceShareButton();
    paintCurrentCount();
  }, 500);
})();
