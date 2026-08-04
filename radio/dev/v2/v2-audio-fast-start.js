(() => {
  'use strict';

  const path = window.location.pathname;
  if (!path.includes('/radio/dev/v2/') || path.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxAudioFastStart) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const MAX_WARMERS = 4;
  const songMap = new Map();
  const songOrder = [];
  const warmers = new Map();
  let catalogPromise = null;
  let audioObserver = null;

  const clean = value => String(value ?? '').trim();
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  function rows(data) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  async function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(SONGS_URL, { cache: 'no-store', credentials: 'omit' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(data => {
          rows(data).forEach((row, index) => {
            const key = clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`);
            const audio = fixUrl(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url);
            if (!key || !audio) return;
            songMap.set(key, audio);
            songOrder.push(key);
          });
          return songMap;
        })
        .catch(error => {
          catalogPromise = null;
          console.warn('[V2 audio fast start] Song catalog unavailable.', error?.message || error);
          return songMap;
        });
    }
    return catalogPromise;
  }

  function configurePrimaryAudio() {
    const audio = document.querySelector('#v2App [data-audio]');
    if (!audio) return false;
    audio.preload = 'auto';
    audio.setAttribute('preload', 'auto');
    audio.setAttribute('playsinline', '');
    audio.dataset.fastStartReady = 'true';
    return true;
  }

  function removeOldestWarmer() {
    while (warmers.size >= MAX_WARMERS) {
      const oldestKey = warmers.keys().next().value;
      const warmer = warmers.get(oldestKey);
      try {
        warmer.pause();
        warmer.removeAttribute('src');
        warmer.load();
      } catch (_) {}
      warmers.delete(oldestKey);
    }
  }

  function warmUrl(url) {
    const source = fixUrl(url);
    if (!source) return null;
    if (warmers.has(source)) {
      const existing = warmers.get(source);
      warmers.delete(source);
      warmers.set(source, existing);
      return existing;
    }

    removeOldestWarmer();
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.muted = true;
    audio.defaultMuted = true;
    audio.volume = 0;
    audio.playsInline = true;
    audio.src = source;
    audio.dataset.audioWarmup = 'true';
    audio.addEventListener('canplay', () => {
      try { audio.pause(); } catch (_) {}
    }, { once: true, passive: true });
    audio.load();
    warmers.set(source, audio);
    return audio;
  }

  async function warmSong(songKey) {
    const key = clean(songKey);
    if (!key) return null;
    if (!songMap.size) await catalog();
    return warmUrl(songMap.get(key));
  }

  async function warmAdjacent(songKey) {
    const key = clean(songKey);
    if (!key) return;
    if (!songMap.size) await catalog();
    const index = songOrder.indexOf(key);
    if (index < 0 || !songOrder.length) return;
    const previous = songOrder[(index - 1 + songOrder.length) % songOrder.length];
    const next = songOrder[(index + 1) % songOrder.length];
    warmSong(previous);
    warmSong(next);
  }

  function songKeyFromTarget(target) {
    return clean(target?.closest?.('#v2App [data-song]')?.dataset?.song);
  }

  ['pointerenter', 'pointerdown', 'focusin', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      const key = songKeyFromTarget(event.target);
      if (key) warmSong(key);
    }, { capture: true, passive: true });
  });

  window.addEventListener('stashbox:vec-asset-change', event => {
    const key = clean(event?.detail?.songKey);
    if (!key) return;
    configurePrimaryAudio();
    warmAdjacent(key);
  });

  audioObserver = new MutationObserver(() => {
    if (configurePrimaryAudio()) audioObserver.disconnect();
  });
  audioObserver.observe(document.documentElement, { childList: true, subtree: true });
  configurePrimaryAudio();

  catalog().then(() => {
    songOrder.slice(0, 3).forEach(key => warmSong(key));
  });

  window.StashboxAudioFastStart = Object.freeze({
    warmSong,
    warmAdjacent,
    refresh: configurePrimaryAudio,
    state: () => ({ catalogSize: songMap.size, warmed: warmers.size })
  });
})();