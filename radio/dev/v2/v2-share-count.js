(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const API_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  const state = {
    songs: [],
    loading: null,
    observer: null,
    refreshTimer: 0,
    lastMobileShareAt: 0,
    lastMobileShareKey: ''
  };

  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  const rows = data => {
    if (typeof data?.body === 'string') {
      try { data = JSON.parse(data.body); } catch (_) {}
    }
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'rows', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  };

  const normalizeSong = row => ({
    key: clean(row.song_key || row.songKey || row.song_id || row.id),
    title: clean(row.display_title || row.title || row.song_name),
    artist: clean(row.artist || row.artist_name || 'Stashbox'),
    shares: Number(row.total_shares ?? row.shares ?? row.share_count ?? 0) || 0
  });

  async function loadSongs(force = false) {
    if (state.loading && !force) return state.loading;
    state.loading = fetch(`${API_URL}?limit=500&share_count_ui=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`songs ${response.status}`)))
      .then(payload => {
        state.songs = rows(payload).map(normalizeSong);
        return state.songs;
      })
      .catch(() => state.songs)
      .finally(() => { state.loading = null; });
    return state.loading;
  }

  function currentSong() {
    const player = app.querySelector('.v2-player:not([hidden])') || app.querySelector('[data-player]:not([hidden])');
    if (!player) return null;

    const key = clean(player.dataset.songKey || player.getAttribute('data-song-key'));
    if (key) {
      const byKey = state.songs.find(song => song.key === key);
      if (byKey) return byKey;
    }

    const title = norm(player.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(player.querySelector('[data-partist]')?.textContent);
    if (!title) return null;

    return state.songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || state.songs.find(song => norm(song.title) === title)
      || null;
  }

  function getShareButton() {
    const player = app.querySelector('.v2-player:not([hidden])') || app.querySelector('[data-player]:not([hidden])');
    if (!player) return null;

    if (matchMedia('(max-width: 899px)').matches) {
      const railShare = player.querySelector('[data-li-share]');
      if (railShare) return railShare;
    }

    const buttons = [...player.querySelectorAll('[data-share]')];
    const visible = buttons.find(button => button.getClientRects().length && getComputedStyle(button).display !== 'none');
    return visible || buttons[0] || null;
  }

  function ensureCountNode() {
    const shareButton = getShareButton();
    if (!shareButton) return null;

    let count = shareButton.querySelector('[data-shares]');
    if (!count) {
      count = document.createElement('strong');
      count.setAttribute('data-shares', '');
      count.className = 'v2-share-count';
      count.textContent = '0';
    }

    if (matchMedia('(max-width: 899px)').matches) {
      const label = [...shareButton.children].find(child => child.tagName === 'SMALL') || null;
      if (label) {
        if (count.parentElement !== shareButton || count.nextElementSibling !== label) {
          shareButton.insertBefore(count, label);
        }
      } else if (count.parentElement !== shareButton) {
        shareButton.appendChild(count);
      }
    } else if (count.parentElement !== shareButton) {
      shareButton.appendChild(count);
    }

    return count;
  }

  function render() {
    const count = ensureCountNode();
    if (!count) return;
    const song = currentSong();
    const value = String(Math.max(0, Number(song?.shares || 0)));
    const aria = `${value} shares`;
    if (count.textContent !== value) count.textContent = value;
    if (count.getAttribute('aria-label') !== aria) count.setAttribute('aria-label', aria);
  }

  async function refresh(force = false) {
    await loadSongs(force);
    render();
  }

  function scheduleRefresh(delay = 900) {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refresh(true), delay);
  }

  function shareSessionId() {
    try {
      return crypto.randomUUID?.() || `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (_) {
      return `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  async function persistShare(song) {
    if (!song?.key) return false;
    const response = await fetch(TRACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        song_key: song.key,
        event_type: 'share',
        session_id: shareSessionId()
      })
    });
    if (!response.ok) throw new Error(`share track ${response.status}`);
    return true;
  }

  function countShare(song = currentSong()) {
    if (!song?.key) return;
    song.shares = Math.max(0, Number(song.shares || 0)) + 1;
    render();

    persistShare(song)
      .then(() => scheduleRefresh(900))
      .catch(error => {
        console.warn('[V2 Share] persistence failed; keeping optimistic count', error);
      });
  }

  function songShareUrl(song) {
    const url = new URL('/radio/dev/v2/', location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function sharePayload(song) {
    return {
      title: song?.title || 'Stashbox Radio',
      text: song?.artist ? `${song.title} — ${song.artist}` : (song?.title || 'Stashbox Radio'),
      url: songShareUrl(song)
    };
  }

  function closeDesktopSharePanel() {
    document.querySelector('[data-v2-desktop-share-panel]')?.remove();
  }

  function openDesktopSharePanel(song) {
    closeDesktopSharePanel();
    if (!song) return;

    const payload = sharePayload(song);
    const encodedUrl = encodeURIComponent(payload.url);
    const encodedText = encodeURIComponent(payload.text);
    const encodedSubject = encodeURIComponent(payload.title);

    const overlay = document.createElement('div');
    overlay.className = 'v2-desktop-share-overlay';
    overlay.setAttribute('data-v2-desktop-share-panel', '');
    overlay.innerHTML = `
      <div class="v2-desktop-share-card" role="dialog" aria-modal="true" aria-label="Share ${payload.title.replaceAll('"', '&quot;')}">
        <div class="v2-desktop-share-head">
          <div><small>SHARE SONG</small><strong>${payload.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</strong></div>
          <button type="button" data-share-close aria-label="Close share panel">×</button>
        </div>
        <div class="v2-desktop-share-actions">
          <button type="button" data-share-copy>Copy Link</button>
          <a href="mailto:?subject=${encodedSubject}&body=${encodedText}%0A${encodedUrl}">Email</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener">Facebook</a>
          <a href="https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}" target="_blank" rel="noopener">X</a>
        </div>
        <div class="v2-desktop-share-url">${payload.url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>
      </div>`;

    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-share-close]')) {
        closeDesktopSharePanel();
        return;
      }
      if (event.target.closest('[data-share-copy]')) {
        Promise.resolve(navigator.clipboard?.writeText?.(payload.url))
          .then(() => {
            const button = overlay.querySelector('[data-share-copy]');
            if (button) button.textContent = 'Copied';
          })
          .catch(() => {});
      }
    });

    document.body.appendChild(overlay);
    overlay.querySelector('[data-share-close]')?.focus();
  }

  function triggerNativeShare(song) {
    if (!song) return;
    const payload = sharePayload(song);
    try {
      if (typeof navigator.share === 'function') {
        Promise.resolve(navigator.share(payload)).catch(() => {});
        return;
      }
      if (navigator.clipboard?.writeText) {
        Promise.resolve(navigator.clipboard.writeText(payload.url)).catch(() => {});
      }
    } catch (_) {}
  }

  function acceptSingleMobileTap(song) {
    if (!song?.key) return false;
    const now = Date.now();
    if (state.lastMobileShareKey === song.key && now - state.lastMobileShareAt < 900) return false;
    state.lastMobileShareKey = song.key;
    state.lastMobileShareAt = now;
    return true;
  }

  const style = document.createElement('style');
  style.textContent = `
    .v2-share-count {
      min-width: 1ch;
      font: inherit;
      line-height: 1;
      text-align: center;
      pointer-events: none;
    }
    @media (max-width: 899px) {
      .v2-li-player-rail [data-li-share] .v2-share-count {
        display: block;
        margin: 2px 0 1px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        text-align: center;
      }
    }
    @media (min-width: 900px) {
      .v2-player [data-share] {
        display: inline-flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 7px !important;
      }
      .v2-player [data-share] .v2-share-count {
        display: inline-block;
        font-size: 13px;
      }
      .v2-desktop-share-overlay {
        position: fixed;
        inset: 0;
        z-index: 12000;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(0,0,0,.58);
      }
      .v2-desktop-share-card {
        width: min(470px, calc(100vw - 48px));
        padding: 20px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 22px;
        background: #101216;
        color: #fff;
        box-shadow: 0 24px 90px rgba(0,0,0,.6);
      }
      .v2-desktop-share-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .v2-desktop-share-head small {
        display: block;
        margin-bottom: 5px;
        color: #ff9f0a;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .1em;
      }
      .v2-desktop-share-head strong {
        display: block;
        font-size: 22px;
      }
      .v2-desktop-share-head button {
        width: 36px;
        height: 36px;
        flex: 0 0 auto;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 50%;
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }
      .v2-desktop-share-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-top: 20px;
      }
      .v2-desktop-share-actions button,
      .v2-desktop-share-actions a {
        min-height: 46px;
        display: grid;
        place-items: center;
        padding: 0 10px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        background: #171a20;
        color: #fff;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
      }
      .v2-desktop-share-url {
        margin-top: 14px;
        padding: 10px 12px;
        overflow: hidden;
        border-radius: 10px;
        background: rgba(255,255,255,.05);
        color: rgba(255,255,255,.58);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    const desktopShareButton = event.target.closest('#v2App [data-share]');
    if (desktopShareButton && matchMedia('(min-width: 900px)').matches) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const song = currentSong();
      countShare(song);
      openDesktopSharePanel(song);
      return;
    }

    const mobileRailShare = event.target.closest('#v2App [data-li-share]');
    if (mobileRailShare && matchMedia('(max-width: 899px)').matches) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const song = currentSong();
      if (!acceptSingleMobileTap(song)) return;
      triggerNativeShare(song);
      countShare(song);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDesktopSharePanel();
  });

  state.observer = new MutationObserver(() => render());
  state.observer.observe(app, { childList: true, subtree: true });

  refresh();
  window.addEventListener('pageshow', () => refresh(true));
  window.addEventListener('focus', () => refresh(true));
  window.addEventListener('resize', render, { passive: true });

  window.StashboxV2ShareCount = Object.freeze({ refresh: () => refresh(true) });
})();
