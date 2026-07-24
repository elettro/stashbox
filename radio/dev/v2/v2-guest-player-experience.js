(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_URL = `${API}/radio/songs`;
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const MOBILE = window.matchMedia('(max-width: 699px)');
  const MIN_DISTANCE = 62;
  const MIN_VELOCITY = 0.28;
  const AXIS_LOCK_DISTANCE = 12;
  const COOLDOWN_MS = 620;

  const mainApp = document.getElementById('v2App');
  const artistApp = document.getElementById('artistApp');
  if (!mainApp && !artistApp) return;

  let catalog = [];
  let catalogPromise = null;
  let gesture = null;
  let lastActionAt = 0;
  let hintTimer = 0;
  let mainQueue = [];
  let mainQueueIndex = -1;
  let mainQueueActive = false;
  const boundAudio = new WeakSet();

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');
  const slugify = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox';

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function rows(body) {
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch (_) {}
    }
    return Array.isArray(body) ? body : body?.songs || body?.items || body?.data || [];
  }

  function genresFor(row) {
    return [
      row.genre,
      row.primary_genre,
      row.secondary_genre,
      ...(Array.isArray(row.genres) ? row.genres : []),
      ...(Array.isArray(row.genre_tags) ? row.genre_tags : [])
    ].map(clean).filter(Boolean);
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
      title: clean(row.display_title || row.title || row.song_name || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genres: genresFor(row),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      art: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK_ART,
      audio: fixUrl(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url || row.file_url),
      plays: Math.max(0, Number(row.total_plays ?? row.plays ?? row.play_count ?? 0) || 0)
    };
  }

  async function loadCatalog() {
    if (catalog.length) return catalog;
    if (!catalogPromise) {
      catalogPromise = fetch(SONGS_URL, { cache: 'no-store', credentials: 'omit' })
        .then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          catalog = rows(body).map(normalizeSong).filter(song => song.key && song.title && song.audio);
          return catalog;
        })
        .catch(error => {
          console.warn('[Guest Player] catalog unavailable', error);
          return [];
        });
    }
    return catalogPromise;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function visible(node) {
    return Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none');
  }

  function mainPlayer() {
    const player = mainApp?.querySelector('[data-player]');
    return visible(player) ? player : null;
  }

  function artistPlayer() {
    const player = document.querySelector('.artist-realm-player');
    return visible(player) ? player : null;
  }

  function authActions() {
    const actions = document.createElement('div');
    actions.className = 'v2-guest-auth-actions';
    actions.dataset.guestAuthActions = 'true';
    actions.innerHTML = `
      <button type="button" data-v2-auth-open="signup">Create Account</button>
      <button type="button" data-v2-auth-open="login">Log In</button>`;
    return actions;
  }

  function syncGuestAuth(player, type) {
    if (!player) return;
    const guest = !loggedIn();
    player.classList.toggle('is-guest-player', guest);
    const header = type === 'artist'
      ? player.querySelector('.artist-realm-header')
      : player.querySelector('.v2-player-header');
    if (!header) return;
    let actions = header.querySelector('[data-guest-auth-actions]');
    if (!guest) {
      actions?.remove();
      return;
    }
    if (!actions) {
      actions = authActions();
      const artistProfile = type === 'artist' ? header.querySelector('[data-realm-profile]') : null;
      if (artistProfile) header.insertBefore(actions, artistProfile);
      else header.appendChild(actions);
    }
  }

  function syncArtistLink(player) {
    if (!player) return;
    const artist = clean(player.querySelector('[data-partist]')?.textContent);
    if (!artist) return;
    const href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(slugify(artist))}`;
    [player.querySelector('[data-avatar]'), player.querySelector('[data-partist]')].forEach(node => {
      if (!node) return;
      node.classList.add('v2-player-artist-profile-link');
      node.dataset.artistProfileHref = href;
      node.setAttribute('role', 'link');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Open ${artist} artist profile`);
    });
  }

  function syncGenreLink(player) {
    const genre = player?.querySelector('[data-pgenre]');
    if (!genre) return;
    if (loggedIn() || !clean(genre.textContent)) {
      genre.classList.remove('v2-player-genre-link');
      genre.removeAttribute('role');
      genre.removeAttribute('tabindex');
      genre.removeAttribute('aria-label');
      return;
    }
    genre.classList.add('v2-player-genre-link');
    genre.setAttribute('role', 'button');
    genre.setAttribute('tabindex', '0');
    genre.setAttribute('aria-label', `Open ${clean(genre.textContent)} song catalog`);
  }

  function ensureArtistShuffleTrigger() {
    if (!artistApp || artistApp.querySelector('[data-start-radio]')) return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.startRadio = 'true';
    trigger.dataset.guestArtistShuffleTrigger = 'true';
    trigger.setAttribute('aria-hidden', 'true');
    trigger.tabIndex = -1;
    artistApp.appendChild(trigger);
  }

  function syncPlayers() {
    const main = mainPlayer();
    if (main) {
      syncGuestAuth(main, 'main');
      syncArtistLink(main);
      syncGenreLink(main);
      bindMainAudio(main.querySelector('[data-audio]'));
    }
    const artist = artistPlayer();
    if (artist) {
      syncGuestAuth(artist, 'artist');
      ensureArtistShuffleTrigger();
    }
  }

  function currentMainSong(player = mainPlayer()) {
    if (!player) return null;
    const key = clean(player.dataset.currentSongKey || player.querySelector('[data-like]')?.dataset.currentSongKey);
    if (key) {
      const byKey = catalog.find(song => song.key === key);
      if (byKey) return byKey;
    }
    const title = normalize(player.querySelector('[data-ptitle]')?.textContent);
    const artist = normalize(player.querySelector('[data-partist]')?.textContent);
    return catalog.find(song => normalize(song.title) === title && normalize(song.artist) === artist)
      || catalog.find(song => normalize(song.title) === title)
      || null;
  }

  function openMainSong(song) {
    if (!mainApp || !song?.key) return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.song = song.key;
    trigger.dataset.guestQueueOpen = 'true';
    mainApp.appendChild(trigger);
    trigger.click();
    trigger.remove();
  }

  function activateMainQueue(queue, startIndex = 0) {
    if (loggedIn() || !queue.length) return;
    mainQueue = [...queue];
    mainQueueIndex = Math.min(mainQueue.length - 1, Math.max(0, startIndex));
    mainQueueActive = true;
    openMainSong(mainQueue[mainQueueIndex]);
  }

  function moveMainQueue(direction) {
    if (!mainQueueActive || !mainQueue.length) return false;
    mainQueueIndex = (mainQueueIndex + direction + mainQueue.length) % mainQueue.length;
    openMainSong(mainQueue[mainQueueIndex]);
    return true;
  }

  function bindMainAudio(audio) {
    if (!audio || boundAudio.has(audio)) return;
    boundAudio.add(audio);
    audio.addEventListener('ended', event => {
      if (loggedIn() || !mainQueueActive) return;
      event.stopImmediatePropagation();
      moveMainQueue(1);
    }, true);
  }

  function ensureGenreSheet(player) {
    let sheet = player.querySelector('[data-guest-genre-sheet]');
    if (sheet) return sheet;
    sheet = document.createElement('section');
    sheet.className = 'v2-guest-genre-sheet';
    sheet.dataset.guestGenreSheet = 'true';
    sheet.hidden = true;
    sheet.innerHTML = `
      <button class="v2-guest-genre-backdrop" type="button" data-guest-genre-close aria-label="Close genre catalog"></button>
      <div class="v2-guest-genre-panel" role="dialog" aria-modal="true" aria-labelledby="v2GuestGenreTitle">
        <div class="v2-guest-genre-handle" aria-hidden="true"></div>
        <header>
          <div><small>Genre Catalog</small><h2 id="v2GuestGenreTitle" data-guest-genre-title>Genre</h2><p data-guest-genre-count></p></div>
          <button type="button" data-guest-genre-close aria-label="Close genre catalog">×</button>
        </header>
        <div class="v2-guest-genre-actions">
          <button type="button" data-guest-genre-play-all>▶ <span>Play All</span></button>
          <button type="button" data-guest-genre-shuffle>⇄ <span>Shuffle All</span></button>
        </div>
        <div class="v2-guest-genre-list" data-guest-genre-list></div>
      </div>`;
    player.appendChild(sheet);
    return sheet;
  }

  function closeGenreSheet() {
    const sheet = document.querySelector('[data-guest-genre-sheet]');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    document.body.classList.remove('v2-guest-genre-open');
    window.setTimeout(() => { sheet.hidden = true; }, 260);
  }

  async function openGenreSheet(player) {
    if (loggedIn()) return;
    const genre = clean(player.querySelector('[data-pgenre]')?.textContent);
    if (!genre) return;
    const songs = (await loadCatalog())
      .filter(song => song.genres.some(value => normalize(value) === normalize(genre)))
      .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));
    const sheet = ensureGenreSheet(player);
    sheet.dataset.genre = genre;
    sheet.__genreSongs = songs;
    sheet.querySelector('[data-guest-genre-title]').textContent = genre;
    sheet.querySelector('[data-guest-genre-count]').textContent = `${songs.length} song${songs.length === 1 ? '' : 's'} · Flick upward to browse`;
    const current = currentMainSong(player);
    sheet.querySelector('[data-guest-genre-list]').innerHTML = songs.length
      ? songs.map((song, index) => `
          <button type="button" class="v2-guest-genre-song${current?.key === song.key ? ' is-current' : ''}" data-guest-genre-song="${esc(song.key)}" data-guest-genre-index="${index}">
            <img src="${esc(song.art)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ART}'">
            <span><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></span>
            <i>${current?.key === song.key ? 'Playing' : 'Play'}</i>
          </button>`).join('')
      : '<p class="v2-guest-genre-empty">No playable songs are currently assigned to this genre.</p>';
    sheet.hidden = false;
    document.body.classList.add('v2-guest-genre-open');
    requestAnimationFrame(() => sheet.classList.add('is-open'));
  }

  function ensureHint(player) {
    let hint = player.querySelector('[data-guest-gesture-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'v2-guest-gesture-hint';
    hint.dataset.guestGestureHint = 'true';
    hint.setAttribute('aria-live', 'polite');
    hint.innerHTML = '<i></i><strong></strong>';
    player.appendChild(hint);
    return hint;
  }

  function showHint(player, action) {
    const hint = ensureHint(player);
    const details = action === 'shuffle'
      ? { icon: '↓', label: 'Shuffle All' }
      : action === 'previous'
        ? { icon: '←', label: 'Previous Song' }
        : { icon: '→', label: 'Next Song' };
    hint.querySelector('i').textContent = details.icon;
    hint.querySelector('strong').textContent = details.label;
    hint.classList.remove('is-visible');
    requestAnimationFrame(() => hint.classList.add('is-visible'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 520);
  }

  async function performGesture(player, type, action) {
    const now = Date.now();
    if (now - lastActionAt < COOLDOWN_MS) return;
    lastActionAt = now;
    showHint(player, action);
    try { navigator.vibrate?.(12); } catch (_) {}

    if (type === 'artist') {
      if (action === 'shuffle') {
        ensureArtistShuffleTrigger();
        artistApp?.querySelector('[data-start-radio]')?.click();
        return;
      }
      player.querySelector(action === 'previous' ? '[data-realm-prev]' : '[data-realm-next]')?.click();
      return;
    }

    if (action === 'shuffle') {
      const songs = await loadCatalog();
      activateMainQueue(shuffle(songs));
      return;
    }
    player.querySelector(action === 'previous' ? '[data-prev]' : '[data-next]')?.click();
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest([
      'button', 'a', 'input', 'textarea', 'select', '[role="button"]', '[role="link"]',
      '[contenteditable="true"]', '.v2-li-sheet', '.v2-li-merch-tray',
      '[data-mobile-vec-commerce]', '[data-mobile-vec-commerce-tray]',
      '[data-guest-genre-sheet]', '[data-guest-auth-actions]'
    ].join(',')));
  }

  document.addEventListener('touchstart', event => {
    if (!MOBILE.matches || loggedIn() || event.touches.length !== 1 || isInteractiveTarget(event.target)) {
      gesture = null;
      return;
    }
    const main = mainPlayer();
    const artist = artistPlayer();
    const player = artist?.contains(event.target) ? artist : main?.contains(event.target) ? main : null;
    if (!player) return;
    const touch = event.touches[0];
    gesture = {
      player,
      type: player === artist ? 'artist' : 'main',
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
    gesture = null;
    if (!current.axis || loggedIn()) return;
    const touch = event.changedTouches?.[0];
    const dx = (touch ? touch.clientX : current.lastX) - current.startX;
    const dy = (touch ? touch.clientY : current.lastY) - current.startY;
    const elapsed = Math.max(1, performance.now() - current.startedAt);

    if (current.axis === 'horizontal') {
      const velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      if (Math.abs(dx) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
      performGesture(current.player, current.type, dx > 0 ? 'next' : 'previous');
      return;
    }

    const velocity = Math.abs(dy) / elapsed;
    if (Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    if (Math.abs(dy) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
    if (dy > 0) performGesture(current.player, current.type, 'shuffle');
  }, { passive: true });

  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });

  document.addEventListener('click', event => {
    const artistLink = event.target.closest('[data-artist-profile-href]');
    if (artistLink) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = artistLink.dataset.artistProfileHref;
      return;
    }

    const genreLink = event.target.closest('.v2-player-genre-link');
    if (genreLink && mainPlayer() && !loggedIn()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGenreSheet(mainPlayer());
      return;
    }

    if (event.target.closest('[data-guest-genre-close]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGenreSheet();
      return;
    }

    const sheet = event.target.closest('[data-guest-genre-sheet]');
    if (sheet) {
      const songs = Array.isArray(sheet.__genreSongs) ? sheet.__genreSongs : [];
      if (event.target.closest('[data-guest-genre-play-all]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateMainQueue(songs, 0);
        closeGenreSheet();
        return;
      }
      if (event.target.closest('[data-guest-genre-shuffle]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateMainQueue(shuffle(songs), 0);
        closeGenreSheet();
        return;
      }
      const songButton = event.target.closest('[data-guest-genre-song]');
      if (songButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateMainQueue(songs, Number(songButton.dataset.guestGenreIndex || 0));
        closeGenreSheet();
        return;
      }
    }

    if (!loggedIn() && mainQueueActive) {
      const next = event.target.closest('#v2App [data-player] [data-next]');
      const previous = event.target.closest('#v2App [data-player] [data-prev]');
      if (next || previous) {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveMainQueue(next ? 1 : -1);
        return;
      }
      const manuallySelected = event.target.closest('#v2App [data-song]');
      if (manuallySelected && manuallySelected.dataset.guestQueueOpen !== 'true') {
        mainQueueActive = false;
        mainQueue = [];
        mainQueueIndex = -1;
      }
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const artistLink = event.target.closest('[data-artist-profile-href]');
    if (artistLink) {
      event.preventDefault();
      location.href = artistLink.dataset.artistProfileHref;
      return;
    }
    const genreLink = event.target.closest('.v2-player-genre-link');
    if (genreLink && mainPlayer() && !loggedIn()) {
      event.preventDefault();
      openGenreSheet(mainPlayer());
    }
  });

  new MutationObserver(syncPlayers).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
  window.addEventListener('storage', syncPlayers);
  window.addEventListener('pageshow', syncPlayers);
  window.setInterval(syncPlayers, 600);
  loadCatalog().finally(syncPlayers);
  syncPlayers();
})();
