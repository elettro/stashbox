(() => {
  'use strict';

  const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/songs';
  const app = document.getElementById('v2App');
  if (!app) return;

  const state = {
    songs: [],
    loading: null,
    observer: null,
    refreshTimer: 0
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

  function ensureCountNode() {
    const shareButton = app.querySelector('[data-player] [data-share], .v2-player [data-share]');
    if (!shareButton) return null;

    let count = shareButton.querySelector('[data-shares]');
    if (!count) {
      count = document.createElement('span');
      count.setAttribute('data-shares', '');
      count.className = 'v2-share-count';
      count.textContent = '0';
      shareButton.appendChild(count);
    }
    return count;
  }

  function render() {
    const count = ensureCountNode();
    if (!count) return;
    const song = currentSong();
    count.textContent = String(song?.shares ?? 0);
    count.setAttribute('aria-label', `${song?.shares ?? 0} shares`);
  }

  async function refresh(force = false) {
    await loadSongs(force);
    render();
  }

  function scheduleRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refresh(true), 1400);
  }

  const style = document.createElement('style');
  style.textContent = `
    .v2-share-count {
      display: block;
      min-width: 1ch;
      font: inherit;
      line-height: 1;
      text-align: center;
      pointer-events: none;
    }
    @media (max-width: 899px) {
      [data-share] {
        display: inline-flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
      }
      [data-share] .v2-share-count {
        font-size: 11px;
      }
    }
    @media (min-width: 900px) {
      [data-share] {
        display: inline-flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 7px !important;
      }
      [data-share] .v2-share-count {
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    if (!event.target.closest('#v2App [data-share]')) return;
    scheduleRefresh();
  }, true);

  state.observer = new MutationObserver(() => render());
  state.observer.observe(app, { childList: true, subtree: true, characterData: true });

  refresh();
  window.addEventListener('pageshow', () => refresh(true));
  window.addEventListener('focus', () => refresh(true));

  window.StashboxV2ShareCount = Object.freeze({ refresh: () => refresh(true) });
})();
