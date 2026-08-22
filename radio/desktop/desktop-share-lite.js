(() => {
  'use strict';

  if (window.__stashboxDesktopShareLiteLoaded) return;
  window.__stashboxDesktopShareLiteLoaded = true;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let menu = null;

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
    const key = clean(p.dataset.songKey || p.getAttribute('data-song-key'));
    if (key) {
      const byKey = songs.find(song => song.key === key);
      if (byKey) return byKey;
    }
    const title = norm(p.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(p.querySelector('[data-partist]')?.textContent);
    return songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || songs.find(song => norm(song.title) === title)
      || null;
  }

  function shareButton() {
    const p = player();
    if (!p) return null;
    return [...p.querySelectorAll('[data-share]')].find(button => button.getClientRects().length) || p.querySelector('[data-share]');
  }

  function countNode(create = true) {
    const button = shareButton();
    if (!button) return null;
    let node = button.querySelector('[data-shares]');
    if (!node && create) {
      node = document.createElement('strong');
      node.setAttribute('data-shares', '');
      node.className = 'v2-share-count';
      node.textContent = '0';
      button.appendChild(node);
    }
    return node;
  }

  function paintCount(song = currentSong()) {
    const node = countNode(true);
    if (!node || !song) return;
    node.textContent = String(song.shares);
    node.setAttribute('aria-label', `${song.shares} shares`);
  }

  function shareUrl(song) {
    const url = new URL('/radio/', location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function persistShare(song) {
    if (!song?.key) return;
    const sessionId = `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ song_key: song.key, event_type: 'share', session_id: sessionId }),
      keepalive: true
    }).catch(() => {});
  }

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
  }

  function copyText(value, button) {
    const done = () => {
      if (!button) return;
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { if (button.isConnected) button.textContent = original; }, 900);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => {});
      return;
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); } catch (_) {}
    input.remove();
  }

  function openMenu(button, song) {
    closeMenu();
    if (!button || !song) return;

    const url = shareUrl(song);
    const title = song.artist ? `${song.title} — ${song.artist}` : song.title;
    const rect = button.getBoundingClientRect();

    menu = document.createElement('div');
    menu.className = 'desktop-share-lite-menu';
    menu.innerHTML = `
      <button type="button" data-share-lite-copy>Copy Link</button>
      <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}">Email</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">X</a>`;

    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - 232, rect.right - 220))}px`;
    menu.style.top = `${Math.max(12, Math.min(window.innerHeight - 132, rect.bottom + 10))}px`;
    document.body.appendChild(menu);

    menu.addEventListener('click', event => {
      const copy = event.target.closest('[data-share-lite-copy]');
      if (copy) {
        event.preventDefault();
        copyText(url, copy);
      }
    });
  }

  function onShareClick(event) {
    if (!matchMedia('(min-width: 900px)').matches) return;

    // Local isolation only: keep this Share click out of the legacy app.onclick
    // navigator.share path without suppressing document/player clicks globally.
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const song = currentSong();
    if (!song) return;

    song.shares += 1;
    paintCount(song);
    persistShare(song);
    openMenu(button, song);
  }

  function bindShareButton() {
    if (!matchMedia('(min-width: 900px)').matches) return;
    const button = shareButton();
    if (!button || button.dataset.desktopShareLiteBound === 'true') return;
    button.dataset.desktopShareLiteBound = 'true';
    button.addEventListener('click', onShareClick, false);
    paintCount();
  }

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 900px) {
      .v2-player [data-share] { display:inline-flex !important; align-items:center !important; gap:7px !important; }
      .v2-player [data-share] .v2-share-count { display:inline-block; font-size:13px; line-height:1; pointer-events:none; }
      .desktop-share-lite-menu {
        position:fixed;
        z-index:20000;
        width:220px;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        padding:10px;
        border:1px solid rgba(255,255,255,.16);
        border-radius:14px;
        background:#111317;
        box-shadow:0 16px 45px rgba(0,0,0,.45);
      }
      .desktop-share-lite-menu a,
      .desktop-share-lite-menu button {
        min-height:38px;
        display:grid;
        place-items:center;
        border:1px solid rgba(255,255,255,.14);
        border-radius:9px;
        background:rgba(255,255,255,.06);
        color:#fff;
        text-decoration:none;
        font:inherit;
        font-size:12px;
        font-weight:800;
        cursor:pointer;
      }
    }
  `;
  document.head.appendChild(style);

  // Menu dismissal is ordinary bubble-phase handling; no capture listener and no
  // global propagation suppression.
  document.addEventListener('click', event => {
    if (!menu) return;
    if (event.target.closest('.desktop-share-lite-menu')) return;
    closeMenu();
  }, false);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });

  fetch(`${SONGS_URL}?limit=500&desktop_share_lite=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then(payload => { songs = rows(payload).map(normalizeSong); paintCount(); bindShareButton(); })
    .catch(() => {});

  // Recovery can replace player markup. Rebind cheaply without a MutationObserver.
  [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000].forEach(delay => {
    setTimeout(() => { bindShareButton(); paintCount(); }, delay);
  });
  setInterval(bindShareButton, 1000);
})();
