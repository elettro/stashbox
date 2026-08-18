(() => {
  'use strict';

  if (window.__stashboxDesktopShareLiteLoaded) return;
  window.__stashboxDesktopShareLiteLoaded = true;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let panel = null;

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
    const url = new URL('/radio/dev/v2/', location.origin);
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

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
  }

  function openPanel(song) {
    closePanel();
    const url = shareUrl(song);
    const title = song?.artist ? `${song.title} — ${song.artist}` : (song?.title || 'Stashbox Radio');

    panel = document.createElement('div');
    panel.className = 'desktop-share-lite-panel';
    panel.innerHTML = `
      <div class="desktop-share-lite-card" role="dialog" aria-modal="true" aria-label="Share song">
        <button type="button" class="desktop-share-lite-close" data-share-lite-close aria-label="Close">×</button>
        <strong>Share ${escapeHtml(song?.title || 'this song')}</strong>
        <div class="desktop-share-lite-actions">
          <button type="button" data-share-lite-copy>Copy Link</button>
          <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}">Email</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">X</a>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.addEventListener('click', event => {
      if (event.target === panel || event.target.closest('[data-share-lite-close]')) {
        closePanel();
        return;
      }
      if (event.target.closest('[data-share-lite-copy]')) {
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {});
        else {
          const input = document.createElement('textarea');
          input.value = url;
          document.body.appendChild(input);
          input.select();
          try { document.execCommand('copy'); } catch (_) {}
          input.remove();
        }
        event.target.textContent = 'Copied';
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 900px) {
      .v2-player [data-share] { display:inline-flex !important; align-items:center !important; gap:7px !important; }
      .v2-player [data-share] .v2-share-count { display:inline-block; font-size:13px; line-height:1; pointer-events:none; }
      .desktop-share-lite-panel { position:fixed; inset:0; z-index:20000; display:grid; place-items:center; padding:24px; background:rgba(0,0,0,.55); }
      .desktop-share-lite-card { position:relative; width:min(440px,calc(100vw - 48px)); padding:28px; border:1px solid rgba(255,255,255,.16); border-radius:22px; background:#111317; color:#fff; box-shadow:0 24px 80px rgba(0,0,0,.55); }
      .desktop-share-lite-card > strong { display:block; margin:0 34px 20px 0; font-size:20px; }
      .desktop-share-lite-close { position:absolute; top:12px; right:14px; width:36px; height:36px; border:0; border-radius:50%; background:rgba(255,255,255,.08); color:#fff; font-size:26px; cursor:pointer; }
      .desktop-share-lite-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .desktop-share-lite-actions a,.desktop-share-lite-actions button { min-height:44px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.16); border-radius:12px; background:rgba(255,255,255,.06); color:#fff; text-decoration:none; font:inherit; font-weight:800; cursor:pointer; }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    if (!matchMedia('(min-width: 900px)').matches) return;
    const button = event.target.closest('#v2App [data-share]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const song = currentSong();
    if (!song) return;
    song.shares += 1;
    paintCount(song);
    persistShare(song);
    openPanel(song);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePanel();
  });

  fetch(`${SONGS_URL}?limit=500&desktop_share_lite=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then(payload => { songs = rows(payload).map(normalizeSong); paintCount(); })
    .catch(() => {});

  // Player markup is replaced when a song opens. A few finite checks are enough to
  // attach the count without a MutationObserver that can interfere with media playback.
  [250, 750, 1500, 3000].forEach(delay => setTimeout(() => paintCount(), delay));
})();
