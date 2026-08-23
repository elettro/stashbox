(() => {
  'use strict';

  if (matchMedia('(min-width: 700px)').matches || window.StashboxOfflineAudioHook) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const DB_NAME = 'stashbox-radio-offline-prod';
  const DB_VERSION = 1;
  const STORE = 'songs';
  const SW_URL = '/radio/offline-sw.js?v=20260821-offlineaudio3';
  const OFFLINE_URL = '/radio/offline/';
  const app = document.getElementById('v2App');
  if (!app) return;

  const clean = value => String(value ?? '').trim();
  const slug = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'song';

  const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 19h14"/></svg>';
  const LIBRARY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h4"/></svg>';
  let dbPromise = null;
  let catalogPromise = null;
  let busy = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
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
    return dbPromise;
  }

  async function getDownload(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read offline storage.'));
    });
  }

  async function putDownload(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not save offline audio.'));
      tx.onabort = () => reject(tx.error || new Error('Offline save was cancelled.'));
    });
  }

  function currentPlayer() {
    return app.querySelector('[data-player]:not([hidden])');
  }

  function currentSong() {
    const player = currentPlayer();
    const audio = player?.querySelector('[data-audio], audio');
    const title = clean(player?.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(player?.querySelector('[data-partist]')?.textContent);
    const genre = clean(player?.querySelector('[data-pgenre]')?.textContent);
    const trackerKey = clean(window.StashboxV2PlayTracker?.state?.()?.songKey);
    const hintedKey = clean(player?.dataset?.songKey || player?.dataset?.currentSongKey || player?.getAttribute?.('data-song-key'));
    const audioUrl = clean(audio?.currentSrc || audio?.src);
    if (!player || !audio || !title || !audioUrl) return null;
    let pathKey = '';
    try {
      const match = new URL(audioUrl, location.href).pathname.match(/\/tracks\/([^/]+)\//i);
      if (match) pathKey = decodeURIComponent(match[1]);
    } catch (_) {}
    const songKey = trackerKey || hintedKey || pathKey;
    const id = songKey || `${slug(artist)}--${slug(title)}`;
    const backdrop = player.querySelector('[data-backdrop]');
    let artworkUrl = '';
    const background = clean(backdrop?.style?.backgroundImage || getComputedStyle(backdrop || player).backgroundImage);
    const match = background.match(/url\(["']?(.*?)["']?\)/i);
    if (match) artworkUrl = clean(match[1]);
    return { id, songKey, title, artist, genre, artworkUrl, audioUrl };
  }

  function catalogRows(value) {
    if (typeof value?.body === 'string') {
      try { return catalogRows(JSON.parse(value.body)); } catch (_) { return []; }
    }
    if (Array.isArray(value)) return value;
    for (const key of ['songs', 'items', 'rows', 'data']) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    return [];
  }

  function preferredAudio(row) {
    const explicit = clean(
      row?.audio_stream_url ||
      row?.preferred_audio_url ||
      row?.browser_audio_url ||
      row?.browserAudioUrl ||
      row?.mp3_url ||
      row?.stream_url
    );
    if (explicit) return explicit;

    try {
      const fast = clean(window.StashboxAudioFastStart?.preferredAudioUrl?.(row));
      if (fast) return fast;
    } catch (_) {}

    const master = clean(
      row?.audio_master_url ||
      row?.browser_original_audio_url ||
      row?.audio_url ||
      row?.resolved_audio_url ||
      row?.audioUrl
    );
    try {
      const mapped = clean(window.StashboxBrowserAudioMap?.resolveAudioUrl?.(master));
      if (mapped) return mapped;
    } catch (_) {}
    return master;
  }

  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch(`${API}/radio/songs?offline_source=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(response => {
        if (!response.ok) throw new Error(`Song catalog HTTP ${response.status}`);
        return response.json();
      })
      .then(catalogRows)
      .catch(error => {
        catalogPromise = null;
        throw error;
      });
    return catalogPromise;
  }

  async function resolveDownloadSong(song) {
    if (!song) return null;
    try {
      const rows = await loadCatalog();
      const wantedKey = clean(song.songKey || song.id).toLowerCase();
      const wantedTitle = slug(song.title);
      const wantedArtist = slug(song.artist);
      const row = rows.find(item => {
        const key = clean(item?.song_key || item?.songKey || item?.song_id || item?.id).toLowerCase();
        if (wantedKey && key && key === wantedKey) return true;
        return slug(item?.display_title || item?.song_name || item?.title) === wantedTitle &&
          slug(item?.artist || item?.artist_name) === wantedArtist;
      });
      if (!row) return song;
      const key = clean(row.song_key || row.songKey || row.song_id || row.id || song.songKey || song.id);
      const audioUrl = preferredAudio(row);
      return {
        ...song,
        id: key || song.id,
        songKey: key || song.songKey,
        title: clean(row.display_title || row.song_name || row.title || song.title),
        artist: clean(row.artist || row.artist_name || song.artist),
        genre: clean(row.genre || row.primary_genre || song.genre),
        artworkUrl: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url || song.artworkUrl),
        audioUrl: audioUrl || song.audioUrl
      };
    } catch (error) {
      console.warn('[V2 Offline Audio] catalog source resolution failed, using current player source', error);
      return song;
    }
  }

  function toast(message, error = false) {
    let node = document.querySelector('.v2-offline-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'v2-toast v2-offline-toast';
      Object.assign(node.style, {
        position: 'fixed', left: '50%', bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', zIndex: '9999',
        maxWidth: 'calc(100vw - 28px)', padding: '11px 14px', borderRadius: '999px',
        transform: 'translateX(-50%)', fontSize: '12px', fontWeight: '800', textAlign: 'center',
        background: 'rgba(8,10,12,.96)', border: '1px solid rgba(255,159,10,.4)', color: '#fff'
      });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.style.borderColor = error ? 'rgba(255,95,87,.55)' : 'rgba(85,223,131,.45)';
    node.style.color = error ? '#ffc0bc' : '#baf6cd';
    node.classList.add('is-visible');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('is-visible'), 3200);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register(SW_URL, { scope: '/radio/' });
    } catch (error) {
      console.warn('[V2 Offline Audio] service worker registration failed', error);
    }
  }

  async function requestPersistentStorage() {
    try { await navigator.storage?.persist?.(); } catch (_) {}
  }

  function actionRow({ kind, icon, title, subtitle, disabled = false }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v2-li-action';
    button.dataset.offlineAction = kind;
    button.disabled = disabled;
    button.innerHTML = `<span class="v2-li-action-icon">${icon}</span><span class="v2-li-action-copy"><strong>${title}</strong><small>${subtitle}</small></span><span class="v2-li-action-arrow">›</span>`;
    return button;
  }

  async function injectActions() {
    const sheet = document.querySelector('.v2-li-sheet-root.is-open .v2-li-action-list, .v2-li-sheet-root .v2-li-action-list');
    if (!sheet || sheet.querySelector('[data-offline-action]')) return;
    const song = currentSong();
    if (!song) return;
    let downloaded = null;
    try { downloaded = await getDownload(song.id); } catch (_) {}
    const download = actionRow({
      kind: downloaded ? 'downloaded' : 'download',
      icon: DOWNLOAD_ICON,
      title: downloaded ? 'Downloaded ✓' : 'Download for Offline',
      subtitle: downloaded ? 'This song is saved on this device' : 'Save audio on this phone for offline playback',
      disabled: busy,
    });
    const library = actionRow({
      kind: 'library',
      icon: LIBRARY_ICON,
      title: 'Offline Downloads',
      subtitle: 'Open your on-device audio library',
    });
    sheet.prepend(library);
    sheet.prepend(download);
  }

  async function fetchAudio(song, row) {
    const response = await fetch(song.audioUrl, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Audio download HTTP ${response.status}`);
    const type = response.headers.get('content-type') || 'audio/mpeg';
    const total = Number(response.headers.get('content-length') || 0) || 0;
    const reader = response.body?.getReader?.();
    if (!reader) {
      const blob = await response.blob();
      if (!blob.size) throw new Error('Audio download was empty.');
      return { blob, type: blob.type || type, bytes: blob.size };
    }
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        const strong = row?.querySelector('strong');
        const small = row?.querySelector('small');
        if (strong) strong.textContent = total ? `Downloading ${Math.min(100, Math.round(received / total * 100))}%` : 'Downloading…';
        if (small) small.textContent = `${(received / 1024 / 1024).toFixed(1)} MB received`;
      }
    }
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('Audio download was empty.');
    return { blob, type, bytes: blob.size };
  }

  async function downloadCurrent(row) {
    if (busy) return;
    const current = currentSong();
    if (!current) return toast('Open a song before downloading it.', true);
    busy = true;
    row.disabled = true;
    await requestPersistentStorage();
    try {
      const song = await resolveDownloadSong(current);
      if (!song?.audioUrl) throw new Error('No downloadable audio source was found for this song.');
      const existing = await getDownload(song.id).catch(() => null);
      if (existing) {
        const strong = row.querySelector('strong');
        const small = row.querySelector('small');
        if (strong) strong.textContent = 'Downloaded ✓';
        if (small) small.textContent = 'This song is already saved on this device';
        row.dataset.offlineAction = 'downloaded';
        return;
      }
      const { blob, type, bytes } = await fetchAudio(song, row);
      await putDownload({
        ...song,
        audioBlob: blob,
        audioType: type,
        bytes,
        downloadedAt: Date.now(),
      });
      const verified = await getDownload(song.id);
      if (!verified?.audioBlob?.size) throw new Error('The device did not retain the downloaded audio.');
      const strong = row.querySelector('strong');
      const small = row.querySelector('small');
      if (strong) strong.textContent = 'Downloaded ✓';
      if (small) small.textContent = `${(bytes / 1024 / 1024).toFixed(1)} MB saved on this device`;
      row.dataset.offlineAction = 'downloaded';
      toast(`${song.title} is ready offline.`);
      window.dispatchEvent(new CustomEvent('stashbox:offline-library-changed', { detail: { songKey: song.songKey || song.id, downloaded: true } }));
    } catch (error) {
      console.error('[V2 Offline Audio] download failed', error);
      const strong = row.querySelector('strong');
      const small = row.querySelector('small');
      if (strong) strong.textContent = 'Download for Offline';
      if (small) small.textContent = 'Download failed. Tap to try again.';
      row.disabled = false;
      toast(`Offline download failed: ${clean(error?.message) || 'network error'}`, true);
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-li-more]')) {
      setTimeout(injectActions, 0);
      setTimeout(injectActions, 80);
      return;
    }
    const row = event.target.closest('[data-offline-action]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = row.dataset.offlineAction;
    if (action === 'download') return void downloadCurrent(row);
    if (action === 'downloaded' || action === 'library') location.href = OFFLINE_URL;
  }, true);

  const observer = new MutationObserver(() => {
    if (document.querySelector('.v2-li-sheet-root .v2-li-action-list')) injectActions();
  });
  observer.observe(document.body, { childList: true });

  registerServiceWorker();
  window.StashboxOfflineAudioHook = Object.freeze({
    openLibrary: () => { location.href = OFFLINE_URL; },
    currentSong,
    resolveDownloadSong,
    refreshActions: injectActions,
  });
})();
