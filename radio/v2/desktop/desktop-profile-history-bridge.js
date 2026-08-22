(() => {
  'use strict';

  if (window.StashboxDesktopProfileHistoryBridge) return;

  const API_ROOT = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const HISTORY_URL = `${API_ROOT}/radio/me/history`;
  const SONGS_URL = `${API_ROOT}/radio/songs`;
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let session = null;

  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

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
      songId: clean(row.song_id || row.id),
      title: clean(row.display_title || row.song_name || row.title),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      artwork: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url)
    };
  }

  function currentAudio() {
    return app.querySelector('[data-player]:not([hidden]) [data-audio], [data-player]:not([hidden]) audio')
      || app.querySelector('[data-player] [data-audio], [data-player] audio');
  }

  function playerFor(audio = currentAudio()) {
    return audio?.closest?.('[data-player]') || app.querySelector('[data-player]:not([hidden])');
  }

  function resolveSong(songKey = '', audio = currentAudio()) {
    if (songKey) {
      const byKey = songs.find(song => song.key === songKey);
      if (byKey) return byKey;
    }

    const player = playerFor(audio);
    const hintedKey = clean(player?.dataset?.songKey || player?.getAttribute?.('data-song-key'));
    if (hintedKey) {
      const byHint = songs.find(song => song.key === hintedKey);
      if (byHint) return byHint;
    }

    const title = norm(player?.querySelector?.('[data-ptitle]')?.textContent);
    const artist = norm(player?.querySelector?.('[data-partist]')?.textContent);
    return songs.find(song => norm(song.title) === title && (!artist || norm(song.artist) === artist))
      || songs.find(song => norm(song.title) === title)
      || null;
  }

  function updateSeconds(force = false) {
    if (!session?.audio) return;
    const audio = session.audio;
    if (!force && (audio.paused || audio.seeking || audio.ended)) return;

    const current = Number(audio.currentTime || 0);
    const previous = Number(session.lastMediaTime || 0);
    const delta = current - previous;
    if (delta > 0 && delta <= 15) session.listenedSeconds += delta;
    session.lastMediaTime = current;
  }

  function historyPayload(current, completed = false) {
    const duration = Number(current.audio?.duration || 0);
    return {
      song_key: current.song.key,
      song_id: current.song.songId || null,
      display_title: current.song.title,
      artist: current.song.artist,
      event_type: completed ? 'play_full' : 'play_partial',
      seconds_played: Math.max(10, Math.round(current.listenedSeconds || 0)),
      completed: Boolean(completed),
      client_event_id: `desktop-profile:${current.sessionId}`,
      source: 'radio_dev_v2_desktop',
      listened_at: current.startedAt,
      metadata: {
        genre: current.song.genre || 'Other',
        artwork_url: current.song.artwork || '',
        duration_seconds: Number.isFinite(duration) ? Math.round(duration) : 0
      }
    };
  }

  function send(current, { completed = false, keepalive = false } = {}) {
    const tokens = readTokens();
    if (!current || current.sent || !tokens.accessToken) return;
    if (current.listenedSeconds < 9.5) return;

    current.sent = true;
    fetch(HISTORY_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
      },
      body: JSON.stringify(historyPayload(current, completed))
    })
      .then(response => {
        if (!response.ok) throw new Error(`profile history ${response.status}`);
        window.dispatchEvent(new CustomEvent('stashbox:profile-history-recorded', {
          detail: {
            songKey: current.song.key,
            sessionId: current.sessionId,
            secondsPlayed: Math.max(10, Math.round(current.listenedSeconds || 0)),
            completed: Boolean(completed)
          }
        }));
      })
      .catch(error => {
        current.sent = false;
        console.warn('[Desktop Profile History] persistence failed', error);
      });
  }

  function finalize({ completed = false, keepalive = false } = {}) {
    if (!session) return;
    updateSeconds(true);
    const current = session;
    session = null;
    send(current, { completed, keepalive });
  }

  function begin(detail = {}) {
    const songKey = clean(detail.songKey);
    const sessionId = clean(detail.sessionId);
    const audio = currentAudio();
    const song = resolveSong(songKey, audio);
    if (!song?.key || !sessionId || !audio) return;

    if (session && session.sessionId !== sessionId) finalize();
    if (session?.sessionId === sessionId) return;

    const initialSeconds = Math.max(10, Number(detail.listenedSeconds || 0));
    session = {
      sessionId,
      song,
      audio,
      startedAt: new Date(Date.now() - initialSeconds * 1000).toISOString(),
      listenedSeconds: initialSeconds,
      lastMediaTime: Number(audio.currentTime || 0),
      sent: false
    };
  }

  window.addEventListener('stashbox:qualified-play', event => begin(event.detail || {}));

  document.addEventListener('timeupdate', event => {
    if (session && event.target === session.audio) updateSeconds();
  }, true);

  document.addEventListener('play', event => {
    if (session && event.target === session.audio) session.lastMediaTime = Number(session.audio.currentTime || 0);
  }, true);

  document.addEventListener('seeking', event => {
    if (session && event.target === session.audio) session.lastMediaTime = Number(session.audio.currentTime || 0);
  }, true);

  document.addEventListener('ended', event => {
    if (session && event.target === session.audio) finalize({ completed: true });
  }, true);

  document.addEventListener('emptied', event => {
    if (session && event.target === session.audio) finalize();
  }, true);

  document.addEventListener('click', event => {
    if (!session) return;
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev], #v2App [data-close]')) {
      finalize();
    }
  }, true);

  window.addEventListener('pagehide', () => finalize({ keepalive: true }));
  window.addEventListener('beforeunload', () => finalize({ keepalive: true }));

  fetch(`${SONGS_URL}?limit=500&profile_history_bridge=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`songs ${response.status}`)))
    .then(payload => { songs = rows(payload).map(normalizeSong).filter(song => song.key); })
    .catch(() => {});

  window.StashboxDesktopProfileHistoryBridge = Object.freeze({
    active: () => Boolean(session),
    state: () => session ? {
      songKey: session.song.key,
      sessionId: session.sessionId,
      listenedSeconds: session.listenedSeconds,
      sent: session.sent
    } : null,
    finalize: () => finalize()
  });
})();