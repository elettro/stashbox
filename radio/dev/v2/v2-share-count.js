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
    lastMobileShareKey: '',
    desktopOptimistic: new Map()
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

  function reconcileDesktopOptimistic(nextSongs) {
    for (const song of nextSongs) {
      const pending = state.desktopOptimistic.get(song.key);
      if (!pending) continue;
      const confirmed = Math.max(0, Number(song.shares || 0) - Number(pending.baseline || 0));
      if (confirmed <= 0) continue;
      pending.pending = Math.max(0, Number(pending.pending || 0) - confirmed);
      pending.baseline = Number(song.shares || 0);
      if (pending.pending <= 0) state.desktopOptimistic.delete(song.key);
      else state.desktopOptimistic.set(song.key, pending);
    }
  }

  async function loadSongs(force = false) {
    if (state.loading && !force) return state.loading;
    state.loading = fetch(`${API_URL}?limit=500&share_count_ui=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`songs ${response.status}`)))
      .then(payload => {
        const nextSongs = rows(payload).map(normalizeSong);
        reconcileDesktopOptimistic(nextSongs);
        state.songs = nextSongs;
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
        if (count.parentElement !== shareButton || count.nextElementSibling !== label) shareButton.insertBefore(count, label);
      } else if (count.parentElement !== shareButton) {
        shareButton.appendChild(count);
      }
    } else if (count.parentElement !== shareButton) {
      shareButton.appendChild(count);
    }

    return count;
  }

  function displayedShares(song) {
    if (!song) return 0;
    const optimistic = state.desktopOptimistic.get(song.key);
    return Math.max(0, Number(song.shares || 0) + Number(optimistic?.pending || 0));
  }

  function render() {
    const count = ensureCountNode();
    if (!count) return;
    const song = currentSong();
    const value = String(displayedShares(song));
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

  function countMobileShare(song = currentSong()) {
    if (!song?.key) return;
    song.shares = Math.max(0, Number(song.shares || 0)) + 1;
    render();
    persistShare(song)
      .then(() => scheduleRefresh(900))
      .catch(error => console.warn('[V2 Share] mobile persistence failed; keeping optimistic count', error));
  }

  function countDesktopShare(song = currentSong()) {
    if (!song?.key) return;
    const current = state.desktopOptimistic.get(song.key) || {
      baseline: Number(song.shares || 0),
      pending: 0
    };
    current.pending += 1;
    state.desktopOptimistic.set(song.key, current);
    render();
    // Desktop persistence remains owned by the existing player share() function.
    // This layer only renders the immediate +1 and never interferes with the popup.
  }

  function sharePayload(song) {
    return {
      title: song?.title || 'Stashbox Radio',
      text: song?.artist ? `${song.title} — ${song.artist}` : (song?.title || 'Stashbox Radio'),
      url: location.href
    };
  }

  function triggerNativeShare(song) {
    if (!song) return;
    const payload = sharePayload(song);
    try {
      if (typeof navigator.share === 'function') {
        Promise.resolve(navigator.share(payload)).catch(() => {});
        return;
      }
      if (navigator.clipboard?.writeText) Promise.resolve(navigator.clipboard.writeText(payload.url)).catch(() => {});
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
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    const desktopShareButton = event.target.closest('#v2App [data-share]');
    if (desktopShareButton && matchMedia('(min-width: 900px)').matches) {
      // Do not prevent, stop, or replace this click. The existing player handler
      // owns the native desktop share popup. We only add the visible +1 here.
      countDesktopShare(currentSong());
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
      countMobileShare(song);
    }
  }, true);

  state.observer = new MutationObserver(() => render());
  state.observer.observe(app, { childList: true, subtree: true });

  refresh();
  window.addEventListener('pageshow', () => refresh(true));
  window.addEventListener('focus', () => refresh(true));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh(true);
  });
  window.addEventListener('resize', render, { passive: true });

  window.StashboxV2ShareCount = Object.freeze({ refresh: () => refresh(true) });
})();
