(() => {
  'use strict';

  if (window.__stashboxV2ShareCountLoaded) return;
  window.__stashboxV2ShareCountLoaded = true;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const app = document.getElementById('v2App');
  if (!app) return;

  const state = {
    songs: [],
    loading: null,
    observer: null,
    refreshTimer: 0,
    renderQueued: false,
    lastMobileShareAt: 0,
    lastMobileShareKey: '',
    toastTimer: 0
  };

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

  async function loadSongs(force = false) {
    if (state.loading && !force) return state.loading;
    state.loading = fetch(`${SONGS_URL}?limit=500&mobile_share_copy=${Date.now()}`, {
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

  function player() {
    return app.querySelector('.v2-player:not([hidden])') || app.querySelector('[data-player]:not([hidden])');
  }

  function currentSong() {
    const p = player();
    if (!p) return null;

    const key = clean(p.dataset.songKey || p.getAttribute('data-song-key'));
    if (key) {
      const byKey = state.songs.find(song => song.key === key);
      if (byKey) return byKey;
    }

    const title = norm(p.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(p.querySelector('[data-partist]')?.textContent);
    if (!title) return null;

    return state.songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || state.songs.find(song => norm(song.title) === title)
      || null;
  }

  function shareButton() {
    const p = player();
    if (!p) return null;
    return p.querySelector('[data-li-share]') || p.querySelector('[data-share]');
  }

  function ensureCountNode() {
    const button = shareButton();
    if (!button) return null;

    let count = button.querySelector('[data-shares]');
    if (!count) {
      count = document.createElement('strong');
      count.setAttribute('data-shares', '');
      count.className = 'v2-share-count';
      count.textContent = '0';
    }

    const label = [...button.children].find(child => child.tagName === 'SMALL') || null;
    if (label) {
      if (count.parentElement !== button || count.nextElementSibling !== label) button.insertBefore(count, label);
    } else if (count.parentElement !== button) {
      button.appendChild(count);
    }

    return count;
  }

  function render() {
    const count = ensureCountNode();
    if (!count) return;
    const song = currentSong();
    const value = String(Math.max(0, Number(song?.shares || 0)));
    if (count.textContent !== value) count.textContent = value;
    count.setAttribute('aria-label', `${value} shares`);
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      render();
    });
  }

  async function refresh(force = false) {
    await loadSongs(force);
    render();
  }

  function scheduleRefresh(delay = 1600) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refresh(true), delay);
  }

  function sessionId() {
    try {
      return crypto.randomUUID?.() || `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (_) {
      return `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function persistShare(song) {
    if (!song?.key) return;
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        song_key: song.key,
        event_type: 'share',
        session_id: sessionId()
      }),
      keepalive: true
    })
      .then(response => {
        if (!response.ok) throw new Error(`share track ${response.status}`);
        scheduleRefresh();
      })
      .catch(error => console.warn('[V2 Share] persistence failed; keeping optimistic count', error));
  }

  function countShare(song) {
    if (!song?.key) return;
    song.shares = Math.max(0, Number(song.shares || 0)) + 1;
    render();
    persistShare(song);
  }

  function songUrl(song) {
    const url = new URL('/radio/attempt2/', location.origin);
    if (song?.key) url.searchParams.set('song', song.key);
    return url.toString();
  }

  function fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
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

  function showToast(message = 'Copied URL') {
    let toast = document.querySelector('[data-v2-share-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('data-v2-share-toast', '');
      toast.className = 'v2-share-copy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1200);
  }

  async function copySongUrl(song) {
    const url = songUrl(song);
    let copied = false;

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (_) {}
    }

    if (!copied) copied = fallbackCopy(url);
    showToast(copied ? 'Copied URL' : 'Copy failed');
  }

  function acceptTap(song) {
    if (!song?.key) return false;
    const now = Date.now();
    if (state.lastMobileShareKey === song.key && now - state.lastMobileShareAt < 500) return false;
    state.lastMobileShareKey = song.key;
    state.lastMobileShareAt = now;
    return true;
  }

  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 899px) {
      .v2-li-player-rail [data-li-share] .v2-share-count,
      .v2-player [data-share] .v2-share-count {
        display:block;
        margin:2px 0 1px;
        min-width:1ch;
        font:inherit;
        font-size:12px;
        font-weight:700;
        line-height:1;
        text-align:center;
        pointer-events:none;
      }
      .v2-share-copy-toast {
        position:fixed;
        left:50%;
        bottom:calc(92px + env(safe-area-inset-bottom, 0px));
        z-index:30000;
        transform:translate(-50%, 8px);
        padding:8px 13px;
        border:1px solid rgba(255,255,255,.16);
        border-radius:999px;
        background:rgba(10,12,15,.94);
        color:#fff;
        font:700 12px/1.1 Karla, sans-serif;
        letter-spacing:.01em;
        opacity:0;
        pointer-events:none;
        transition:opacity .14s ease, transform .14s ease;
      }
      .v2-share-copy-toast.is-visible {
        opacity:1;
        transform:translate(-50%, 0);
      }
    }
  `;
  document.head.appendChild(style);

  // Mobile Share is intentionally simple: update this song's count immediately,
  // copy its deep link, and keep the player running. No navigator.share() sheet.
  app.addEventListener('click', event => {
    if (!matchMedia('(max-width: 899px)').matches) return;
    const button = event.target.closest('[data-li-share], [data-share]');
    if (!button || !player()?.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    const song = currentSong();
    if (!acceptTap(song)) return;

    countShare(song);
    void copySongUrl(song);
  }, true);

  state.observer = new MutationObserver(queueRender);
  state.observer.observe(app, { childList: true, subtree: true });

  refresh();
  window.addEventListener('pageshow', () => refresh(true));
  window.addEventListener('focus', () => refresh(true));
  window.addEventListener('resize', queueRender, { passive: true });

  window.StashboxV2ShareCount = Object.freeze({ refresh: () => refresh(true) });
})();
