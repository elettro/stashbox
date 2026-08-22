(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopPlayStatUi) return;

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v7H5a1 1 0 0 1-1-1v-6Zm16 0h-3v7h2a1 1 0 0 0 1-1v-6Z"/></svg>';
  const SONGS_URL = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/songs';
  let timer = 0;
  let attempts = 0;
  let catalog = [];
  let catalogPromise = null;

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
      title: clean(row.display_title || row.song_name || row.title),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      totalPlays: Number(row.total_plays ?? row.play_count ?? row.plays ?? 0) || 0
    };
  }

  async function loadCatalog(force = false) {
    if (catalogPromise && !force) return catalogPromise;
    catalogPromise = fetch(`${SONGS_URL}?limit=500&play_rank=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`songs ${response.status}`)))
      .then(payload => {
        catalog = rows(payload).map(normalizeSong).filter(song => song.key || song.title);
        return catalog;
      })
      .catch(() => catalog)
      .finally(() => { catalogPromise = null; });
    return catalogPromise;
  }

  function installStyles() {
    let style = document.getElementById('desktopPlayStatUiStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'desktopPlayStatUiStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      @media (min-width: 900px) {
        #v2App .v2-player-controls:has(> [data-play-stat-desktop]) {
          position: relative !important;
          display: block !important;
          width: 100% !important;
          min-height: 76px !important;
        }

        /* Dead-center transport anchor: stats cannot shift this trio. */
        #v2App .v2-player-controls > [data-play] {
          position: absolute !important;
          left: 50% !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          margin: 0 !important;
        }
        #v2App .v2-player-controls > [data-prev] {
          position: absolute !important;
          left: calc(50% - 96px) !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          margin: 0 !important;
        }
        #v2App .v2-player-controls > [data-next] {
          position: absolute !important;
          left: calc(50% + 96px) !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          margin: 0 !important;
        }

        /* Engagement stats live around the fixed center transport. */
        #v2App .v2-player-controls > [data-like] {
          position: absolute !important;
          left: 0 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          margin: 0 !important;
        }
        #v2App .v2-player-controls > [data-share] {
          position: absolute !important;
          right: 76px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          margin: 0 !important;
        }
        #v2App .v2-player-controls > [data-play-stat-desktop] {
          position: absolute !important;
          right: 0 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          margin: 0 !important;
          width: 64px;
          min-width: 64px;
          height: 52px;
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #fff;
          pointer-events: auto;
          cursor: default;
        }
        #v2App [data-play-stat-desktop] svg {
          width: 22px;
          height: 22px;
          flex: 0 0 auto;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        #v2App [data-play-stat-desktop] [data-plays] {
          display: inline-block;
          min-width: 1ch;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          text-align: left;
        }
      }
    `;
  }

  function resolveCurrentSong(player) {
    if (!player || !catalog.length) return null;
    const hintedKey = clean(player.dataset.songKey || player.dataset.currentSongKey || player.getAttribute('data-song-key'));
    if (hintedKey) {
      const byKey = catalog.find(song => song.key === hintedKey);
      if (byKey) return byKey;
    }
    const title = norm(player.querySelector('[data-ptitle]')?.textContent);
    const artist = norm(player.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    return catalog.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || catalog.find(song => norm(song.title) === title)
      || null;
  }

  function rankFor(song) {
    if (!song) return null;
    const sorted = [...catalog].sort((a, b) => b.totalPlays - a.totalPlays || a.title.localeCompare(b.title));
    const index = sorted.findIndex(item => song.key ? item.key === song.key : (norm(item.title) === norm(song.title) && norm(item.artist) === norm(song.artist)));
    return index >= 0 ? index + 1 : null;
  }

  function updateTooltip(player, stat) {
    if (!player || !stat) return;
    const visibleTotal = Number(stat.querySelector('[data-plays]')?.textContent || player.dataset.totalPlays || 0) || 0;
    const song = resolveCurrentSong(player);
    if (song) song.totalPlays = visibleTotal;
    const rank = rankFor(song);
    const text = rank
      ? `Total plays: ${visibleTotal} · #${rank} most played on Stashbox Radio`
      : `Total plays: ${visibleTotal}`;
    stat.setAttribute('aria-label', text);
    stat.setAttribute('title', text);
    stat.querySelector('[data-plays]')?.setAttribute('title', text);
  }

  function mount() {
    installStyles();
    const player = document.querySelector('#v2App [data-player]');
    const controls = player?.querySelector('.v2-player-controls');
    const share = controls?.querySelector('[data-share]');
    if (!player || !controls || !share) return false;

    let stat = controls.querySelector('[data-play-stat-desktop]');
    if (!stat) {
      stat = document.createElement('span');
      stat.setAttribute('data-play-stat-desktop', '');
      stat.innerHTML = `${ICON}<span data-plays>0</span>`;
    }
    if (stat.previousElementSibling !== share) share.insertAdjacentElement('afterend', stat);

    const api = window.StashboxV2PlayTracker;
    if (api?.refreshUi) {
      try { api.refreshUi(); } catch (_) {}
    }
    updateTooltip(player, stat);
    return true;
  }

  function refreshRank(force = false) {
    return loadCatalog(force).then(() => mount()).catch(() => false);
  }

  function startRetryWindow() {
    clearInterval(timer);
    attempts = 0;
    mount();
    timer = window.setInterval(() => {
      attempts += 1;
      mount();
      if (attempts >= 40) {
        clearInterval(timer);
        timer = 0;
      }
    }, 250);
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) {
      startRetryWindow();
      refreshRank(false);
    }
  }, true);
  document.addEventListener('timeupdate', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) mount();
  }, true);

  window.addEventListener('stashbox:qualified-play', () => {
    window.setTimeout(() => refreshRank(true), 250);
  });

  loadCatalog(false).then(() => startRetryWindow());
  window.StashboxDesktopPlayStatUi = Object.freeze({
    refresh: mount,
    refreshRank: () => refreshRank(true)
  });
})();
