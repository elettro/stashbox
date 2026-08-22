(() => {
  'use strict';

  const app = document.getElementById('artistApp');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const MIN_DISTANCE = 64;
  const MIN_VELOCITY = 0.28;
  const AXIS_LOCK_DISTANCE = 12;
  const COOLDOWN_MS = 650;
  const RECENT_LIMIT = 6;

  let gesture = null;
  let lastActionAt = 0;
  let hintTimer = 0;
  let catalogPromise = null;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
  }

  function rows(data, names) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const name of names) if (Array.isArray(data?.[name])) return data[name];
    return [];
  }

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function activeRealm() {
    const realm = document.querySelector('.artist-realm-player');
    if (!realm || realm.hidden || getComputedStyle(realm).display === 'none') return null;
    return realm;
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest([
      'button',
      'a',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[contenteditable="true"]'
    ].join(',')));
  }

  function ensureHint(realm) {
    let hint = realm.querySelector('[data-artist-realm-swipe-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'artist-realm-swipe-hint';
    hint.dataset.artistRealmSwipeHint = 'true';
    hint.setAttribute('aria-live', 'polite');
    hint.innerHTML = '<i aria-hidden="true"></i><strong></strong>';
    realm.appendChild(hint);
    return hint;
  }

  function removeDesktopRestoreHints(realm) {
    if (!realm || MOBILE.matches) return false;
    realm.querySelectorAll('[data-artist-realm-restore-hint], .artist-realm-restore-hint').forEach(node => node.remove());
    return true;
  }

  function ensureRestoreHint(realm) {
    if (removeDesktopRestoreHints(realm)) return null;
    let hint = realm.querySelector('[data-artist-realm-restore-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'artist-realm-restore-hint';
    hint.dataset.artistRealmRestoreHint = 'true';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<i aria-hidden="true">↓</i><strong>Flick down to restore interface</strong>';
    realm.appendChild(hint);
    return hint;
  }

  function syncRestoreHint(realm) {
    const hint = ensureRestoreHint(realm);
    if (!hint) return;
    const active = realm.classList.contains('is-video-focus-mode');
    hint.classList.toggle('is-visible', active);
    hint.setAttribute('aria-hidden', active ? 'false' : 'true');
  }

  function actionDetails(action) {
    if (action === 'shuffle') return { icon: '↑', label: 'Shuffle All', className: 'is-shuffle' };
    if (action === 'previous') return { icon: '←', label: 'Previous Song', className: 'is-previous' };
    if (action === 'focus-on') return { icon: '↓', label: 'Interface Dimmed', className: 'is-focus-on' };
    if (action === 'focus-off') return { icon: '↓', label: 'Interface Restored', className: 'is-focus-off' };
    return { icon: '→', label: 'Next Song', className: 'is-next' };
  }

  function showHint(realm, action) {
    if (!MOBILE.matches) return;
    const hint = ensureHint(realm);
    const details = actionDetails(action);
    hint.classList.remove('is-next', 'is-previous', 'is-shuffle', 'is-focus-on', 'is-focus-off', 'is-visible');
    hint.classList.add(details.className);
    hint.querySelector('i').textContent = details.icon;
    hint.querySelector('strong').textContent = details.label;
    requestAnimationFrame(() => hint.classList.add('is-visible'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 720);
  }

  function animate(realm, action) {
    realm.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle');
    realm.classList.add(`is-swipe-${action}`);
    window.setTimeout(() => realm.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle'), 280);
  }

  function move(realm, action) {
    const selector = action === 'previous' ? '[data-realm-prev]' : '[data-realm-next]';
    const control = realm.querySelector(selector);
    if (!control) return false;
    showHint(realm, action);
    animate(realm, action);
    try { navigator.vibrate?.(12); } catch (_) {}
    control.click();
    return true;
  }

  function recentKey() {
    return `stashbox_artist_realm_swipe_recent:${normalize(identifier)}`;
  }

  function readRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(recentKey()) || '[]');
      return Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, RECENT_LIMIT) : [];
    } catch (_) {
      return [];
    }
  }

  function remember(songKey) {
    try {
      const next = [songKey, ...readRecent().filter(key => key !== songKey)].slice(0, RECENT_LIMIT);
      localStorage.setItem(recentKey(), JSON.stringify(next));
    } catch (_) {}
  }

  function songAudio(song) {
    return clean(song?.audio_url || song?.audioUrl || song?.mp3_url || song?.stream_url || song?.audio_file_url || song?.file_url);
  }

  function loadArtistSongs() {
    if (!catalogPromise) {
      catalogPromise = Promise.all([
        json(`${API}/radio/artists/${encodeURIComponent(identifier)}`),
        json(`${API}/radio/songs`)
      ]).then(([artistBody, songsBody]) => {
        const artist = artistBody.artist || {};
        const targetName = normalize(artist.name);
        const targetKey = normalize(artist.artist_key || artist.slug || identifier);
        return rows(songsBody, ['songs', 'items', 'data']).filter(song => {
          const name = normalize(song.artist || song.artist_name);
          const key = normalize(song.artist_key || song.primary_artist_key || song.artist_slug);
          return clean(song.song_key) && songAudio(song) && (name === targetName || (targetKey && key === targetKey));
        });
      }).catch(error => {
        catalogPromise = null;
        throw error;
      });
    }
    return catalogPromise;
  }

  function launchSong(song) {
    if (!song?.song_key) return false;
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.hidden = true;
    proxy.dataset.playSong = song.song_key;
    proxy.setAttribute('aria-hidden', 'true');
    app.appendChild(proxy);
    proxy.click();
    proxy.remove();
    return true;
  }

  async function shuffleAll(realm) {
    showHint(realm, 'shuffle');
    animate(realm, 'shuffle');
    try { navigator.vibrate?.([10, 22, 10]); } catch (_) {}

    try {
      const songs = await loadArtistSongs();
      if (!songs.length) return move(realm, 'next');
      const recent = new Set(readRecent());
      const currentTitle = normalize(realm.querySelector('[data-realm-title]')?.textContent);
      const candidates = songs.filter(song => {
        const title = normalize(song.display_title || song.song_name || song.title || song.song_key);
        return title !== currentTitle && !recent.has(clean(song.song_key));
      });
      const fallback = songs.filter(song => normalize(song.display_title || song.song_name || song.title || song.song_key) !== currentTitle);
      const pool = candidates.length ? candidates : (fallback.length ? fallback : songs);
      const selected = pool[Math.floor(Math.random() * pool.length)] || songs[0];
      remember(clean(selected.song_key));
      launchSong(selected);
    } catch (error) {
      console.warn('[Artist Realm Swipe] shuffle fallback', error);
      move(realm, 'next');
    }
  }

  function toggleOverlays(realm) {
    const active = realm.classList.toggle('is-video-focus-mode');
    syncRestoreHint(realm);
    showHint(realm, active ? 'focus-on' : 'focus-off');
    try { navigator.vibrate?.(active ? [10, 24, 10] : 14); } catch (_) {}
    window.dispatchEvent(new CustomEvent('stashbox:artist-realm-focus-change', {
      detail: { active, source: 'flick-down' }
    }));
  }

  function resetGesture() {
    gesture = null;
  }

  document.addEventListener('touchstart', event => {
    if (!MOBILE.matches || event.touches.length !== 1) return resetGesture();
    const realm = activeRealm();
    if (!realm || !realm.contains(event.target) || isInteractiveTarget(event.target)) return resetGesture();
    const touch = event.touches[0];
    gesture = {
      realm,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startedAt: performance.now(),
      axis: ''
    };
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!gesture.axis && Math.max(absX, absY) >= AXIS_LOCK_DISTANCE) {
      gesture.axis = absY > absX * 1.15 ? 'vertical' : 'horizontal';
    }
    if (gesture.axis) event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', event => {
    if (!gesture) return;
    const current = gesture;
    resetGesture();
    if (!current.axis || activeRealm() !== current.realm) return;

    const now = Date.now();
    if (now - lastActionAt < COOLDOWN_MS) return;

    const touch = event.changedTouches?.[0];
    const endX = touch ? touch.clientX : current.lastX;
    const endY = touch ? touch.clientY : current.lastY;
    const dx = endX - current.startX;
    const dy = endY - current.startY;
    const elapsed = Math.max(1, performance.now() - current.startedAt);

    if (current.axis === 'horizontal') {
      const velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      if (Math.abs(dx) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
      lastActionAt = now;
      move(current.realm, dx < 0 ? 'next' : 'previous');
      return;
    }

    const velocity = Math.abs(dy) / elapsed;
    if (Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    if (Math.abs(dy) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;

    lastActionAt = now;
    if (dy > 0) {
      toggleOverlays(current.realm);
      return;
    }
    shuffleAll(current.realm);
  }, { passive: true });

  document.addEventListener('touchcancel', resetGesture, { passive: true });

  const observer = new MutationObserver(() => {
    const realm = document.querySelector('.artist-realm-player');
    if (!realm) return;
    if (realm.hidden) realm.classList.remove('is-video-focus-mode');
    syncRestoreHint(realm);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden']
  });

  MOBILE.addEventListener?.('change', () => {
    const realm = document.querySelector('.artist-realm-player');
    if (realm) syncRestoreHint(realm);
  });
})();