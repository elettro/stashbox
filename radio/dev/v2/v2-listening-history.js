(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MIN_SECONDS = 10;
  const PAUSE_FINALIZE_MS = 15000;
  const app = document.getElementById('v2App');
  if (!app) return;

  let songs = [];
  let audio = null;
  let session = null;
  let pendingKey = '';
  let pauseTimer = 0;
  let attachTimer = 0;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function normalizedMediaUrl(value) {
    return clean(value)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '')
      .replace(/#.*$/, '');
  }

  function songKey(row) {
    return clean(row.song_key || row.songKey || row.song_id || row.id);
  }

  function songTitle(row) {
    return clean(row.display_title || row.title || row.song_name || songKey(row));
  }

  function songArtist(row) {
    return clean(row.artist || row.artist_name || 'Stashbox');
  }

  function songAudio(row) {
    return normalizedMediaUrl(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url);
  }

  function songArtwork(row) {
    return clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url);
  }

  function findCurrentSong() {
    if (pendingKey) {
      const direct = songs.find(row => songKey(row) === pendingKey);
      if (direct) return direct;
    }

    const currentSource = normalizedMediaUrl(audio?.currentSrc || audio?.src || '');
    if (currentSource) {
      const bySource = songs.find(row => songAudio(row) === currentSource);
      if (bySource) return bySource;
    }

    const title = clean(app.querySelector('[data-ptitle]')?.textContent).toLowerCase();
    const artist = clean(app.querySelector('[data-partist]')?.textContent).toLowerCase();
    return songs.find(row => songTitle(row).toLowerCase() === title && songArtist(row).toLowerCase() === artist) || null;
  }

  function newSession(row) {
    const key = songKey(row);
    if (!key) return null;
    return {
      id: `v2:${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      song: row,
      songKey: key,
      startedAt: new Date().toISOString(),
      playedSeconds: 0,
      lastMediaTime: Number(audio?.currentTime || 0),
      completed: false,
      sent: false
    };
  }

  function updatePlayedTime() {
    if (!session || !audio || audio.paused) return;
    const current = Number(audio.currentTime || 0);
    const previous = Number(session.lastMediaTime || 0);
    const delta = current - previous;
    if (delta > 0 && delta <= 15) session.playedSeconds += delta;
    session.lastMediaTime = current;
  }

  function payloadFor(current) {
    const row = current.song;
    return {
      song_key: current.songKey,
      song_id: clean(row.song_id || row.id) || null,
      display_title: songTitle(row),
      artist: songArtist(row),
      event_type: current.completed ? 'play_full' : 'play_partial',
      seconds_played: Math.max(0, Math.round(current.playedSeconds)),
      completed: Boolean(current.completed),
      client_event_id: current.id,
      source: 'radio_dev_v2',
      listened_at: current.startedAt,
      metadata: {
        genre: clean(row.genre || row.primary_genre || 'Other'),
        artwork_url: songArtwork(row),
        duration_seconds: Number.isFinite(audio?.duration) ? Math.round(audio.duration) : 0
      }
    };
  }

  function sendHistory(current, keepalive = false) {
    const tokens = readTokens();
    if (!tokens.accessToken || current.sent || current.playedSeconds < MIN_SECONDS) return;
    current.sent = true;
    fetch(`${API_ROOT}/radio/me/history`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
      },
      body: JSON.stringify(payloadFor(current))
    }).catch(() => {
      current.sent = false;
    });
  }

  function finalize({ completed = false, keepalive = false } = {}) {
    clearTimeout(pauseTimer);
    if (!session) return;
    updatePlayedTime();
    session.completed = completed || session.completed;
    const current = session;
    session = null;
    sendHistory(current, keepalive);
  }

  function beginOrResume() {
    clearTimeout(pauseTimer);
    const row = findCurrentSong();
    if (!row) return;
    const key = songKey(row);
    if (session && session.songKey !== key) finalize();
    if (!session) session = newSession(row);
    if (session) session.lastMediaTime = Number(audio?.currentTime || 0);
    pendingKey = key;
  }

  function handlePause() {
    updatePlayedTime();
    clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => finalize(), PAUSE_FINALIZE_MS);
  }

  function handleEnded() {
    updatePlayedTime();
    if (session) {
      const duration = Number(audio?.duration || 0);
      session.completed = duration > 0
        ? session.playedSeconds >= Math.max(MIN_SECONDS, duration * .85)
        : session.playedSeconds >= MIN_SECONDS;
    }
    finalize({ completed: session?.completed });
  }

  function handleSourceChange() {
    if (session) finalize();
    window.setTimeout(() => {
      const row = findCurrentSong();
      if (row) pendingKey = songKey(row);
    }, 0);
  }

  function attach() {
    const nextAudio = app.querySelector('[data-audio]');
    if (!nextAudio || nextAudio === audio) return;
    if (audio) finalize();
    audio = nextAudio;
    audio.addEventListener('play', beginOrResume);
    audio.addEventListener('timeupdate', updatePlayedTime);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleSourceChange);
  }

  document.addEventListener('click', event => {
    const songElement = event.target.closest('#v2App [data-song]');
    if (songElement?.dataset.song) pendingKey = songElement.dataset.song;
  }, true);

  window.addEventListener('pagehide', () => finalize({ keepalive: true }));
  window.addEventListener('beforeunload', () => finalize({ keepalive: true }));

  fetch(`${API_ROOT}/radio/songs`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(body => {
      songs = Array.isArray(body) ? body : (body.songs || body.items || body.data || []);
    })
    .catch(() => {});

  attachTimer = window.setInterval(attach, 250);
  attach();
})();
