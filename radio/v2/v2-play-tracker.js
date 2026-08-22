(() => {
  'use strict';

  if (window.StashboxV2PlayTracker) return;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const QUALIFY_SECONDS = 10;
  const MAX_TICK_SECONDS = 1.5;
  const PLAY_STAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v7H5a1 1 0 0 1-1-1v-6Zm16 0h-3v7h2a1 1 0 0 0 1-1v-6Z"/></svg>';

  const state = {
    songs: [],
    songsPromise: null,
    audio: null,
    songKey: '',
    sessionId: '',
    listenedSeconds: 0,
    lastWallMs: 0,
    qualified: false,
    pending: false,
    sourceToken: '',
    persistAttempts: 0,
    persistSuccesses: 0,
    lastPersistedTotal: null
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

  function canonicalPath(value) {
    const raw = clean(value);
    if (!raw) return '';
    try { return new URL(raw, location.href).pathname.toLowerCase(); }
    catch (_) { return raw.split(/[?#]/)[0].toLowerCase(); }
  }

  function songAudio(row) {
    return row?.audio_url || row?.resolved_audio_url || row?.audioUrl || row?.stream_url || row?.mp3_url || '';
  }

  function normalizeSong(row) {
    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id),
      title: clean(row.display_title || row.song_name || row.title),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      audioPath: canonicalPath(songAudio(row)),
      totalPlays: Number(row.total_plays ?? row.play_count ?? row.plays ?? 0) || 0
    };
  }

  async function loadSongs(force = false) {
    if (state.songsPromise && !force) return state.songsPromise;
    state.songsPromise = fetch(`${SONGS_URL}?limit=500&play_tracker=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`songs ${response.status}`)))
      .then(payload => {
        state.songs = rows(payload).map(normalizeSong).filter(song => song.key);
        renderCurrentPlayStat();
        return state.songs;
      })
      .catch(() => state.songs)
      .finally(() => { state.songsPromise = null; });
    return state.songsPromise;
  }

  function activePlayer(audio) {
    return audio?.closest?.('#v2App [data-player]') || audio?.closest?.('[data-player]') || null;
  }

  function currentAudio() {
    return document.querySelector('#v2App [data-player]:not([hidden]) [data-audio], #v2App [data-player]:not([hidden]) audio')
      || document.querySelector('#v2App [data-player] [data-audio], #v2App [data-player] audio');
  }

  function resolveSong(audio = state.audio) {
    if (!audio) return null;
    const player = activePlayer(audio);
    const hintedKey = clean(player?.dataset?.songKey || player?.dataset?.currentSongKey || player?.getAttribute?.('data-song-key'));
    if (hintedKey) {
      const byKey = state.songs.find(song => song.key === hintedKey);
      if (byKey) return byKey;
    }

    const audioPath = canonicalPath(audio.currentSrc || audio.src);
    if (audioPath) {
      const byAudio = state.songs.find(song => song.audioPath && song.audioPath === audioPath);
      if (byAudio) return byAudio;
    }

    const title = norm(player?.querySelector?.('[data-ptitle]')?.textContent);
    const artist = norm(player?.querySelector?.('[data-partist]')?.textContent);
    if (!title) return null;
    return state.songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || state.songs.find(song => norm(song.title) === title)
      || null;
  }

  function installPlayStatStyles() {
    if (document.getElementById('v2PlayStatStyles')) return;
    const style = document.createElement('style');
    style.id = 'v2PlayStatStyles';
    style.textContent = `
      .v2-play-stat-ui { pointer-events: none; }
      .v2-play-stat-ui svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      @media (min-width: 900px) {
        .v2-player-controls:has(> .v2-play-stat-desktop) {
          grid-template-columns: 52px 52px 52px 76px 52px 52px !important;
        }
        .v2-play-stat-desktop {
          width: 52px;
          min-width: 52px;
          height: 52px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #fff;
        }
        .v2-play-stat-desktop svg { width: 22px; height: 22px; }
        .v2-play-stat-desktop [data-plays] { font-size: 13px; font-weight: 700; line-height: 1; }
      }
      @media (max-width: 699px) {
        .v2-li-player-rail .v2-play-stat-mobile { width: 62px; display: grid; justify-items: center; gap: 4px; color: #fff; text-align: center; }
        .v2-play-stat-mobile .v2-li-rail-circle svg { width: 23px; height: 23px; }
        .v2-play-stat-mobile strong { max-width: 62px; overflow: hidden; color: #f3f1eb; font-size: 8px; font-weight: 700; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
        .v2-play-stat-mobile small { color: #c5c8cd; font-size: 8px; line-height: 1.05; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePlayStatUi(audio = currentAudio()) {
    const player = activePlayer(audio);
    if (!player) return;
    installPlayStatStyles();

    if (matchMedia('(max-width: 699px)').matches) {
      const rail = player.querySelector('.v2-li-player-rail');
      const share = rail?.querySelector('[data-li-share]');
      if (rail && share && !rail.querySelector('[data-play-stat-mobile]')) {
        const stat = document.createElement('div');
        stat.className = 'v2-li-rail-item v2-play-stat-ui v2-play-stat-mobile';
        stat.setAttribute('data-play-stat-mobile', '');
        stat.setAttribute('aria-label', 'Song plays');
        stat.innerHTML = `<span class="v2-li-rail-circle">${PLAY_STAT_ICON}</span><strong data-plays>0</strong><small>Plays</small>`;
        rail.insertBefore(stat, share);
      }
      return;
    }

    const controls = player.querySelector('.v2-player-controls');
    const like = controls?.querySelector('[data-like]');
    if (controls && like && !controls.querySelector('[data-play-stat-desktop]')) {
      const stat = document.createElement('span');
      stat.className = 'v2-play-stat-ui v2-play-stat-desktop';
      stat.setAttribute('data-play-stat-desktop', '');
      stat.setAttribute('aria-label', 'Song plays');
      stat.innerHTML = `${PLAY_STAT_ICON}<span data-plays>0</span>`;
      like.insertAdjacentElement('afterend', stat);
    }
  }

  function renderCurrentPlayStat(audio = currentAudio()) {
    if (!audio) return;
    ensurePlayStatUi(audio);
    const song = resolveSong(audio);
    if (song?.key) syncVisiblePlayTotal(song, song.totalPlays);
  }

  function makeSessionId(songKey) {
    try {
      return `play10-${songKey}-${crypto.randomUUID()}`;
    } catch (_) {
      return `play10-${songKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function resetSession(audio, songKey = '') {
    state.audio = audio || null;
    state.songKey = clean(songKey);
    state.sessionId = state.songKey ? makeSessionId(state.songKey) : '';
    state.listenedSeconds = 0;
    state.lastWallMs = 0;
    state.qualified = false;
    state.pending = false;
    state.sourceToken = audio ? canonicalPath(audio.currentSrc || audio.src) : '';
    state.persistAttempts = 0;
    state.persistSuccesses = 0;
    state.lastPersistedTotal = null;
  }

  async function ensureSession(audio) {
    if (!audio) return null;
    if (!state.songs.length) await loadSongs();
    const song = resolveSong(audio);
    if (!song?.key) return null;
    const sourceToken = canonicalPath(audio.currentSrc || audio.src);
    if (state.audio !== audio || state.songKey !== song.key || (state.sourceToken && sourceToken && state.sourceToken !== sourceToken)) {
      resetSession(audio, song.key);
      state.sourceToken = sourceToken;
    }
    ensurePlayStatUi(audio);
    syncVisiblePlayTotal(song, song.totalPlays);
    return song;
  }

  function syncVisiblePlayTotal(song, total) {
    if (!song?.key || !Number.isFinite(Number(total))) return;
    const audio = state.audio || currentAudio();
    const player = activePlayer(audio);
    if (!player) return;
    const value = String(Math.max(0, Number(total)));
    player.dataset.totalPlays = value;
    player.querySelectorAll('[data-plays], [data-play-count], [data-total-plays]').forEach(node => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = value;
      else node.textContent = value;
    });
  }

  async function persistQualifiedPlay(song) {
    if (!song?.key || state.qualified || state.pending) return false;
    state.pending = true;
    state.persistAttempts += 1;
    const sessionId = state.sessionId || makeSessionId(song.key);
    try {
      const response = await fetch(TRACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          song_key: song.key,
          event_type: 'play_start',
          session_id: sessionId,
          seconds_played: QUALIFY_SECONDS,
          qualified_after_seconds: QUALIFY_SECONDS,
          source: 'v2_play_tracker'
        })
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) {}
      if (!response.ok) throw new Error(body?.error || `track ${response.status}`);

      state.qualified = true;
      state.pending = false;
      state.persistSuccesses += 1;
      const serverTotal = Number(body?.total_plays ?? body?.play_count ?? body?.plays);
      song.totalPlays = Number.isFinite(serverTotal)
        ? Math.max(0, serverTotal)
        : Math.max(0, Number(song.totalPlays || 0)) + 1;
      state.lastPersistedTotal = song.totalPlays;
      syncVisiblePlayTotal(song, song.totalPlays);

      window.dispatchEvent(new CustomEvent('stashbox:qualified-play', {
        detail: {
          songKey: song.key,
          sessionId,
          listenedSeconds: state.listenedSeconds,
          totalPlays: song.totalPlays,
          persistAttempts: state.persistAttempts,
          persistSuccesses: state.persistSuccesses
        }
      }));
      return true;
    } catch (error) {
      state.pending = false;
      console.warn('[V2 Play Tracker] qualifying play persistence failed', error);
      return false;
    }
  }

  async function tick(audio, eventWallMs = performance.now()) {
    if (!(audio instanceof HTMLAudioElement) || audio.paused || audio.ended || audio.seeking) {
      state.lastWallMs = 0;
      return;
    }

    const song = await ensureSession(audio);
    if (!song || state.qualified) return;

    if (!state.lastWallMs) {
      state.lastWallMs = eventWallMs;
      return;
    }

    const delta = Math.max(0, Math.min(MAX_TICK_SECONDS, (eventWallMs - state.lastWallMs) / 1000));
    state.lastWallMs = eventWallMs;
    if (!Number.isFinite(delta) || delta <= 0) return;

    state.listenedSeconds += delta;
    if (state.listenedSeconds >= QUALIFY_SECONDS) await persistQualifiedPlay(song);
  }

  function onPlay(audio) {
    ensureSession(audio).then(song => {
      state.lastWallMs = performance.now();
      if (song) syncVisiblePlayTotal(song, song.totalPlays);
      window.setTimeout(() => renderCurrentPlayStat(audio), 250);
      window.setTimeout(() => renderCurrentPlayStat(audio), 900);
    }).catch(() => {});
  }

  function onPause(audio) {
    if (audio === state.audio) state.lastWallMs = 0;
  }

  function onEnded(audio) {
    if (audio === state.audio) resetSession(null, '');
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onPlay(event.target);
  }, true);

  document.addEventListener('playing', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onPlay(event.target);
  }, true);

  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onPause(event.target);
  }, true);

  document.addEventListener('waiting', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onPause(event.target);
  }, true);

  document.addEventListener('seeking', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onPause(event.target);
  }, true);

  document.addEventListener('timeupdate', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) {
      ensurePlayStatUi(event.target);
      tick(event.target).catch(() => {});
    }
  }, true);

  document.addEventListener('ended', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App')) onEnded(event.target);
  }, true);

  document.addEventListener('emptied', event => {
    if (event.target instanceof HTMLAudioElement && event.target.closest('#v2App') && event.target === state.audio) resetSession(null, '');
  }, true);

  installPlayStatStyles();
  loadSongs();
  window.setTimeout(renderCurrentPlayStat, 500);
  window.setTimeout(renderCurrentPlayStat, 1500);

  window.StashboxV2PlayTracker = Object.freeze({
    thresholdSeconds: QUALIFY_SECONDS,
    refreshCatalog: () => loadSongs(true),
    refreshUi: () => renderCurrentPlayStat(),
    state: () => ({
      songKey: state.songKey,
      sessionId: state.sessionId,
      listenedSeconds: state.listenedSeconds,
      qualified: state.qualified,
      pending: state.pending,
      sourceToken: state.sourceToken,
      persistAttempts: state.persistAttempts,
      persistSuccesses: state.persistSuccesses,
      lastPersistedTotal: state.lastPersistedTotal
    })
  });
})();