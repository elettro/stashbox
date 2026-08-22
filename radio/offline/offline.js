(() => {
  'use strict';

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const DB_NAME = 'stashbox-radio-offline-prod';
  const DB_VERSION = 1;
  const STORE = 'songs';
  const AUDIO_MAP = window.STASHBOX_BROWSER_AUDIO_MAP || {};
  const DESKTOP_VIEW = Boolean(window.matchMedia?.('(min-width: 900px)')?.matches);
  const PROFILE_CONTEXT = new URLSearchParams(location.search).get('profile') === '1';

  const state = {
    db: null,
    downloads: [],
    catalog: [],
    filtered: [],
    currentIndex: -1,
    currentUrl: '',
    shuffle: false,
    repeat: false,
    busy: new Set(),
  };

  const $ = selector => document.querySelector(selector);
  const clean = value => String(value ?? '').trim();
  const esc = value => clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const fmtTime = seconds => {
    const value = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  };
  const fmtBytes = bytes => {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('downloadedAt', 'downloadedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    });
  }

  function tx(mode, callback) {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      let result;
      try { result = callback(store); }
      catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Offline storage transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was cancelled.'));
    });
  }

  function allDownloads() {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => Number(b.downloadedAt || 0) - Number(a.downloadedAt || 0)));
      request.onerror = () => reject(request.error || new Error('Could not read downloads.'));
    });
  }

  function getDownload(id) {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read download.'));
    });
  }

  async function putDownload(record) {
    await tx('readwrite', store => store.put(record));
  }

  async function deleteDownload(id) {
    await tx('readwrite', store => store.delete(id));
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) {}
    }
    return value;
  }

  function rows(value) {
    value = unwrap(value);
    if (Array.isArray(value)) return value;
    for (const key of ['songs', 'items', 'rows', 'data']) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    return [];
  }

  function preferredAudio(row) {
    const explicit = clean(row.audio_stream_url || row.preferred_audio_url || row.mp3_url || row.stream_url);
    if (explicit) return explicit;
    const master = clean(row.audio_master_url || row.browser_original_audio_url || row.audio_url || row.resolved_audio_url || row.audioUrl);
    return clean(AUDIO_MAP[master] || master);
  }

  function normalizeSong(row, index) {
    const audioUrl = preferredAudio(row);
    const key = clean(row.song_key || row.songKey || row.song_id || row.id);
    return {
      id: key || audioUrl || `song-${index}`,
      songKey: key,
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      artworkUrl: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url),
      audioUrl,
      duration: Math.max(0, Number(row.duration_seconds || row.duration || 0) || 0),
    };
  }

  function toast(message, isError = false) {
    const node = $('#offlineToast');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', Boolean(isError));
    node.classList.add('is-visible');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('is-visible'), 3200);
  }

  function status() {
    const pill = $('#connectionState');
    if (!pill) return;
    const online = navigator.onLine;
    pill.textContent = online ? 'ONLINE' : 'OFFLINE';
    pill.classList.toggle('is-online', online);
    pill.classList.toggle('is-offline', !online);
    $('#onlineLibrary')?.toggleAttribute('hidden', DESKTOP_VIEW || !online);
    const message = $('#offlineMessage');
    if (message) {
      if (DESKTOP_VIEW) {
        message.textContent = 'Desktop view: play or remove downloaded tracks here. Add songs to your Offline Playlist from mobile.';
        message.hidden = false;
      } else {
        message.toggleAttribute('hidden', online);
      }
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/radio/offline-sw.js?v=20260821-offlineaudio1', { scope: '/radio/' });
    } catch (error) {
      console.warn('[Stashbox Offline] service worker registration failed', error);
    }
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (_) {}
  }

  async function loadCatalog() {
    if (!navigator.onLine || DESKTOP_VIEW) return [];
    const response = await fetch(`${API}/radio/songs?offline_audio=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Song catalog HTTP ${response.status}`);
    state.catalog = rows(await response.json()).map(normalizeSong).filter(song => song.audioUrl);
    state.filtered = state.catalog;
    return state.catalog;
  }

  function artMarkup(song) {
    const url = clean(song.artworkUrl);
    const initials = esc((song.title || 'SB').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'SB');
    if (!url) return `<span class="offline-art-fallback">${initials}</span>`;
    return `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.insertAdjacentHTML('beforeend','<span class=&quot;offline-art-fallback&quot;>${initials}</span>')">`;
  }

  function downloadedIds() {
    return new Set(state.downloads.map(item => item.id));
  }

  function renderDownloads() {
    const list = $('#downloadedList');
    const empty = $('#downloadedEmpty');
    const totalBytes = state.downloads.reduce((sum, item) => sum + Number(item.bytes || item.audioBlob?.size || 0), 0);
    $('#downloadCount').textContent = String(state.downloads.length);
    $('#downloadStorage').textContent = fmtBytes(totalBytes);
    empty.hidden = state.downloads.length > 0;
    list.innerHTML = state.downloads.map((song, index) => `
      <article class="offline-track${index === state.currentIndex ? ' is-current' : ''}" data-download-id="${esc(song.id)}">
        <button class="offline-track-main" type="button" data-play-download="${esc(song.id)}">
          <span class="offline-track-art">${artMarkup(song)}</span>
          <span class="offline-track-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist)}${song.genre ? ` · ${esc(song.genre)}` : ''}</small><em>${fmtBytes(song.bytes || song.audioBlob?.size || 0)}</em></span>
          <span class="offline-track-play">▶</span>
        </button>
        <button class="offline-remove" type="button" data-remove-download="${esc(song.id)}" aria-label="Remove ${esc(song.title)} from downloads">×</button>
      </article>`).join('');
  }

  function renderCatalog() {
    const list = $('#availableList');
    if (!list) return;
    if (DESKTOP_VIEW) {
      list.innerHTML = '';
      return;
    }
    const ids = downloadedIds();
    $('#availableCount').textContent = String(state.filtered.length);
    list.innerHTML = state.filtered.map(song => {
      const downloaded = ids.has(song.id);
      const busy = state.busy.has(song.id);
      return `
        <article class="offline-track offline-available" data-catalog-id="${esc(song.id)}">
          <span class="offline-track-art">${artMarkup(song)}</span>
          <span class="offline-track-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist)} · ${esc(song.genre)}</small></span>
          <button class="offline-download-button${downloaded ? ' is-downloaded' : ''}" type="button" data-download-song="${esc(song.id)}" ${downloaded || busy ? 'disabled' : ''}>${busy ? 'Downloading…' : downloaded ? 'Downloaded ✓' : 'Download'}</button>
        </article>`;
    }).join('');
  }

  async function refreshDownloads() {
    state.downloads = await allDownloads();
    if (state.currentIndex >= state.downloads.length) state.currentIndex = state.downloads.length - 1;
    renderDownloads();
    renderCatalog();
  }

  async function fetchBlobWithProgress(song, onProgress) {
    const response = await fetch(song.audioUrl, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Audio download HTTP ${response.status}`);
    const type = response.headers.get('content-type') || 'audio/mpeg';
    const total = Number(response.headers.get('content-length') || 0) || 0;
    if (!response.body?.getReader) {
      const blob = await response.blob();
      if (!blob.size) throw new Error('The audio server returned an empty file.');
      onProgress?.(blob.size, blob.size);
      return { blob, type: blob.type || type, bytes: blob.size };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(received, total);
      }
    }
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('The audio server returned an empty file.');
    return { blob, type, bytes: blob.size };
  }

  async function downloadSong(id) {
    if (DESKTOP_VIEW) return;
    const song = state.catalog.find(item => item.id === id);
    if (!song || state.busy.has(id)) return;
    state.busy.add(id);
    renderCatalog();
    await requestPersistentStorage();

    const button = document.querySelector(`[data-download-song="${CSS.escape(id)}"]`);
    try {
      const { blob, type, bytes } = await fetchBlobWithProgress(song, (received, total) => {
        if (!button) return;
        button.textContent = total > 0 ? `${Math.min(100, Math.round(received / total * 100))}%` : fmtBytes(received);
      });
      await putDownload({
        ...song,
        audioBlob: blob,
        audioType: type,
        bytes,
        downloadedAt: Date.now(),
      });
      toast(`${song.title} saved for offline playback.`);
      await refreshDownloads();
    } catch (error) {
      console.error('[Stashbox Offline] download failed', error);
      const cors = /fetch|cors|network/i.test(clean(error?.message));
      toast(cors ? 'Audio download was blocked by the media delivery policy. We need to enable download CORS on the audio CDN.' : `Download failed: ${clean(error?.message) || 'Unknown error'}`, true);
    } finally {
      state.busy.delete(id);
      renderCatalog();
    }
  }

  function revokeCurrentUrl() {
    if (!state.currentUrl) return;
    URL.revokeObjectURL(state.currentUrl);
    state.currentUrl = '';
  }

  async function playById(id, autoplay = true) {
    const record = await getDownload(id);
    if (!record?.audioBlob) return toast('That downloaded file is no longer available.', true);
    const index = state.downloads.findIndex(item => item.id === id);
    if (index >= 0) state.currentIndex = index;
    revokeCurrentUrl();
    state.currentUrl = URL.createObjectURL(record.audioBlob);
    const audio = $('#offlineAudio');
    audio.src = state.currentUrl;
    $('#nowTitle').textContent = record.title || 'Downloaded Song';
    $('#nowArtist').textContent = record.artist || 'Stashbox';
    $('#nowGenre').textContent = record.genre || 'Offline Audio';
    const hero = $('#nowArt');
    hero.innerHTML = artMarkup(record);
    $('#playerEmpty').hidden = true;
    $('#playerReady').hidden = false;
    renderDownloads();
    updateMediaSession(record);
    if (autoplay) {
      if (window.parent !== window) {
        try { window.parent.postMessage({ type: 'stashbox:offline-play-start', songId: id }, location.origin); } catch (_) {}
      }
      try { await audio.play(); }
      catch (_) { updatePlayButton(); }
    }
  }

  function updateMediaSession(song) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'Downloaded Song',
        artist: song.artist || 'Stashbox',
        album: 'Stashbox Offline',
      });
    } catch (_) {}
  }

  function nextIndex(direction) {
    if (!state.downloads.length) return -1;
    if (state.shuffle && state.downloads.length > 1) {
      let next = state.currentIndex;
      while (next === state.currentIndex) next = Math.floor(Math.random() * state.downloads.length);
      return next;
    }
    const start = state.currentIndex >= 0 ? state.currentIndex : 0;
    return (start + direction + state.downloads.length) % state.downloads.length;
  }

  function adjacent(direction) {
    const index = nextIndex(direction);
    if (index < 0) return;
    playById(state.downloads[index].id, true);
  }

  function updatePlayButton() {
    const audio = $('#offlineAudio');
    const button = $('#playPause');
    button.textContent = audio.paused ? '▶' : '❚❚';
    button.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }

  function updateTimeline() {
    const audio = $('#offlineAudio');
    const scrub = $('#scrub');
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    scrub.max = String(duration || 0);
    if (document.activeElement !== scrub) scrub.value = String(Math.min(current, duration || current));
    $('#nowTime').textContent = fmtTime(current);
    $('#totalTime').textContent = fmtTime(duration);
  }

  async function removeDownload(id) {
    const record = state.downloads.find(item => item.id === id);
    if (!record) return;
    const audio = $('#offlineAudio');
    const removingCurrent = state.currentIndex >= 0 && state.downloads[state.currentIndex]?.id === id;
    if (removingCurrent) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      revokeCurrentUrl();
      state.currentIndex = -1;
      $('#playerReady').hidden = true;
      $('#playerEmpty').hidden = false;
    }
    await deleteDownload(id);
    toast(`${record.title} removed from this device.`);
    await refreshDownloads();
  }

  function filterCatalog(query) {
    if (DESKTOP_VIEW) return;
    const needle = clean(query).toLowerCase();
    state.filtered = !needle ? state.catalog : state.catalog.filter(song => `${song.title} ${song.artist} ${song.genre}`.toLowerCase().includes(needle));
    renderCatalog();
  }

  function bind() {
    document.addEventListener('click', event => {
      const play = event.target.closest('[data-play-download]');
      if (play) return playById(play.dataset.playDownload, true);
      const remove = event.target.closest('[data-remove-download]');
      if (remove) return removeDownload(remove.dataset.removeDownload);
      const download = event.target.closest('[data-download-song]');
      if (download && !DESKTOP_VIEW) return downloadSong(download.dataset.downloadSong);
      if (event.target.closest('#playPause')) {
        const audio = $('#offlineAudio');
        if (!audio.src) return;
        return audio.paused ? audio.play().catch(() => {}) : audio.pause();
      }
      if (event.target.closest('#previousTrack')) return adjacent(-1);
      if (event.target.closest('#nextTrack')) return adjacent(1);
      if (event.target.closest('#shuffleToggle')) {
        state.shuffle = !state.shuffle;
        $('#shuffleToggle').classList.toggle('is-active', state.shuffle);
        return;
      }
      if (event.target.closest('#repeatToggle')) {
        state.repeat = !state.repeat;
        $('#repeatToggle').classList.toggle('is-active', state.repeat);
      }
    });

    $('#catalogSearch')?.addEventListener('input', event => filterCatalog(event.target.value));
    $('#scrub')?.addEventListener('input', event => {
      const audio = $('#offlineAudio');
      audio.currentTime = Number(event.target.value) || 0;
      updateTimeline();
    });

    const audio = $('#offlineAudio');
    audio.addEventListener('play', updatePlayButton);
    audio.addEventListener('pause', updatePlayButton);
    audio.addEventListener('timeupdate', updateTimeline);
    audio.addEventListener('loadedmetadata', updateTimeline);
    audio.addEventListener('ended', () => {
      if (state.repeat) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        adjacent(1);
      }
    });

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => adjacent(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => adjacent(1));
      } catch (_) {}
    }

    window.addEventListener('online', async () => {
      status();
      if (DESKTOP_VIEW) return;
      try { await loadCatalog(); renderCatalog(); }
      catch (error) { toast(`Catalog refresh failed: ${clean(error?.message)}`, true); }
    });
    window.addEventListener('offline', status);
    window.addEventListener('pagehide', revokeCurrentUrl);
  }

  async function init() {
    status();
    if (PROFILE_CONTEXT) {
      const back = document.querySelector('.offline-footer a');
      if (back) {
        back.href = '/radio/profile/';
        back.textContent = 'Back to Profile';
      }
    }
    bind();
    await registerServiceWorker();
    try {
      state.db = await openDb();
      await refreshDownloads();
    } catch (error) {
      console.error('[Stashbox Offline] storage init failed', error);
      toast('This browser could not open offline storage.', true);
      return;
    }

    if (navigator.onLine && !DESKTOP_VIEW) {
      try {
        await loadCatalog();
        renderCatalog();
      } catch (error) {
        console.warn('[Stashbox Offline] catalog unavailable', error);
        $('#catalogError').hidden = false;
        $('#catalogError').textContent = `Catalog unavailable: ${clean(error?.message) || 'network error'}`;
      }
    }
  }

  init();
})();