(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const MOBILE = window.matchMedia('(max-width: 699px)');
  const MIN_DISTANCE = 68;
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
    if (Array.isArray(body)) return body;
    return body?.songs || body?.items || body?.data || [];
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
      genre: clean(row.genre || row.primary_genre || 'Other'),
      genres: genresFor(row),
      art: fixUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK_ART,
      audio: fixUrl(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url || row.file_url),
      plays: Math.max(0, Number(row.total_plays ?? row.plays ?? row.play_count ?? 0) || 0)
    };
  }

  async function loadCatalog() {
    if (catalog.length) return catalog;
    if (!catalogPromise) {
      catalogPromise = fetch(`${API}/radio/songs`, { cache: 'no-store', credentials: 'omit' })
        .then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          catalog = rows(body).map(normalizeSong).filter(song => song.key && song.title && song.audio);
          return catalog;
        })
        .catch(error => {
          console.warn('[Guest Player Safe] catalog unavailable', error);
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

  function ensureAuthActions(player, type) {
    const header = type === 'artist'
      ? player.querySelector('.artist-realm-header')
      : player.querySelector('.v2-player-header');
    if (!header) return;

    let actions = header.querySelector('[data-guest-safe-auth]');
    if (loggedIn()) {
      actions?.remove();
      player.classList.remove('is-guest-safe');
      return;
    }

    player.classList.add('is-guest-safe');
    if (actions) return;
    actions = document.createElement('div');
    actions.className = 'v2-guest-safe-auth';
    actions.dataset.guestSafeAuth = 'true';
    actions.innerHTML = `
      <button type="button" data-v2-auth-open="signup">Create Account</button>
      <button type="button" data-v2-auth-open="login">Log In</button>`;
    const profileButton = type === 'artist' ? header.querySelector('[data-realm-profile]') : null;
    if (profileButton) header.insertBefore(actions, profileButton);
    else header.appendChild(actions);
  }

  function syncMainLinks(player) {
    if (!player || loggedIn()) return;
    const artistName = clean(player.querySelector('[data-partist]')?.textContent);
    if (artistName) {
      const href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(slugify(artistName))}`;
      [player.querySelector('[data-avatar]'), player.querySelector('[data-partist]')].forEach(node => {
        if (!node) return;
        node.classList.add('v2-guest-safe-artist-link');
        node.dataset.guestSafeArtistHref = href;
        node.setAttribute('role', 'link');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-label', `Open ${artistName} artist profile`);
      });
    }

    const genre = player.querySelector('[data-pgenre]');
    if (genre && clean(genre.textContent)) {
      genre.classList.add('v2-guest-safe-genre-link');
      genre.setAttribute('role', 'button');
      genre.setAttribute('tabindex', '0');
      genre.setAttribute('aria-label', `Open ${clean(genre.textContent)} songs`);
    }
  }

  function bindMainAudio(player) {
    const audio = player?.querySelector('[data-audio]');
    if (!audio || boundAudio.has(audio)) return;
    boundAudio.add(audio);
    audio.addEventListener('ended', event => {
      if (loggedIn() || !mainQueueActive) return;
      event.stopImmediatePropagation();
      moveMainQueue(1);
    }, true);
  }

  function syncPlayers() {
    const main = mainPlayer();
    if (main) {
      ensureAuthActions(main, 'main');
      syncMainLinks(main);
      bindMainAudio(main);
    }
    const artist = artistPlayer();
    if (artist) ensureAuthActions(artist, 'artist');
  }

  function currentMainSong(player = mainPlayer()) {
    if (!player) return null;
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
    trigger.dataset.guestSafeOpen = 'true';
    mainApp.appendChild(trigger);
    trigger.click();
    trigger.remove();
    window.setTimeout(syncPlayers, 40);
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

  function ensureArtistShuffleTrigger() {
    if (!artistApp) return null;
    let trigger = artistApp.querySelector('[data-guest-safe-artist-shuffle]');
    if (trigger) return trigger;
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.startRadio = 'true';
    trigger.dataset.guestSafeArtistShuffle = 'true';
    trigger.tabIndex = -1;
    artistApp.appendChild(trigger);
    return trigger;
  }

  function ensureHint(player) {
    let hint = player.querySelector('[data-guest-safe-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'v2-guest-safe-hint';
    hint.dataset.guestSafeHint = 'true';
    hint.setAttribute('aria-live', 'polite');
    hint.innerHTML = '<i></i><strong></strong>';
    player.appendChild(hint);
    return hint;
  }

  function showHint(player, action) {
    const details = action === 'shuffle'
      ? { icon: '↓', label: 'Shuffle All' }
      : action === 'previous'
        ? { icon: '←', label: 'Previous Song' }
        : { icon: '→', label: 'Next Song' };
    const hint = ensureHint(player);
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
        ensureArtistShuffleTrigger()?.click();
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
    if (mainQueueActive && moveMainQueue(action === 'previous' ? -1 : 1)) return;
    player.querySelector(action === 'previous' ? '[data-prev]' : '[data-next]')?.click();
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest([
      'button', 'a', 'input', 'textarea', 'select', '[role="button"]', '[role="link"]',
      '[contenteditable="true"]', '.v2-li-sheet', '.v2-li-merch-tray',
      '[data-mobile-vec-commerce]', '[data-mobile-vec-commerce-tray]',
      '[data-guest-safe-sheet]', '[data-guest-safe-auth]'
    ].join(',')));
  }

  function ensureGenreSheet() {
    let sheet = document.querySelector('[data-guest-safe-sheet]');
    if (sheet) return sheet;
    sheet = document.createElement('section');
    sheet.className = 'v2-guest-safe-sheet';
    sheet.dataset.guestSafeSheet = 'true';
    sheet.hidden = true;
    sheet.innerHTML = `
      <button type="button" class="v2-guest-safe-backdrop" data-guest-safe-close aria-label="Close genre songs"></button>
      <div class="v2-guest-safe-panel" role="dialog" aria-modal="true" aria-labelledby="guestSafeGenreTitle">
        <div class="v2-guest-safe-handle"></div>
        <header>
          <div><small>Genre Catalog</small><h2 id="guestSafeGenreTitle" data-guest-safe-title>Genre</h2><p data-guest-safe-count></p></div>
          <button type="button" data-guest-safe-close aria-label="Close">×</button>
        </header>
        <div class="v2-guest-safe-actions">
          <button type="button" data-guest-safe-play-all>▶ Play All</button>
          <button type="button" data-guest-safe-shuffle>⇄ Shuffle All</button>
        </div>
        <div class="v2-guest-safe-list" data-guest-safe-list></div>
      </div>`;
    document.body.appendChild(sheet);
    return sheet;
  }

  function closeGenreSheet() {
    const sheet = document.querySelector('[data-guest-safe-sheet]');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    window.setTimeout(() => { sheet.hidden = true; }, 240);
  }

  async function openGenreSheet(player) {
    if (loggedIn()) return;
    const genre = clean(player.querySelector('[data-pgenre]')?.textContent);
    if (!genre) return;
    const songs = (await loadCatalog())
      .filter(song => song.genres.some(value => normalize(value) === normalize(genre)))
      .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));
    const sheet = ensureGenreSheet();
    sheet.__songs = songs;
    sheet.querySelector('[data-guest-safe-title]').textContent = genre;
    sheet.querySelector('[data-guest-safe-count]').textContent = `${songs.length} song${songs.length === 1 ? '' : 's'} · Swipe upward to browse`;
    const current = currentMainSong(player);
    sheet.querySelector('[data-guest-safe-list]').innerHTML = songs.length
      ? songs.map((song, index) => `
          <button type="button" class="v2-guest-safe-song${current?.key === song.key ? ' is-current' : ''}" data-guest-safe-song="${esc(song.key)}" data-index="${index}">
            <img src="${esc(song.art)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ART}'">
            <span><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></span>
            <i>${current?.key === song.key ? 'Playing' : 'Play'}</i>
          </button>`).join('')
      : '<p class="v2-guest-safe-empty">No playable songs are assigned to this genre.</p>';
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-open'));
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
      startY: touch.clientY
    };
  }, { passive: true });

  document.addEventListener('touchend', event => {
    if (!gesture || loggedIn()) return;
    const current = gesture;
    gesture = null;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - current.startX;
    const dy = touch.clientY - current.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < MIN_DISTANCE) return;
    if (absX > absY * 1.2) {
      performGesture(current.player, current.type, dx > 0 ? 'next' : 'previous');
      return;
    }
    if (absY > absX * 1.2 && dy > 0) performGesture(current.player, current.type, 'shuffle');
  }, { passive: true });

  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });

  document.addEventListener('click', event => {
    const artistLink = event.target.closest('[data-guest-safe-artist-href]');
    if (artistLink && !loggedIn()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = artistLink.dataset.guestSafeArtistHref;
      return;
    }

    const genreLink = event.target.closest('.v2-guest-safe-genre-link');
    if (genreLink && !loggedIn() && mainPlayer()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGenreSheet(mainPlayer());
      return;
    }

    if (event.target.closest('[data-guest-safe-close]')) {
      event.preventDefault();
      closeGenreSheet();
      return;
    }

    const sheet = event.target.closest('[data-guest-safe-sheet]');
    if (sheet) {
      const songs = Array.isArray(sheet.__songs) ? sheet.__songs : [];
      if (event.target.closest('[data-guest-safe-play-all]')) {
        event.preventDefault();
        activateMainQueue(songs);
        closeGenreSheet();
        return;
      }
      if (event.target.closest('[data-guest-safe-shuffle]')) {
        event.preventDefault();
        activateMainQueue(shuffle(songs));
        closeGenreSheet();
        return;
      }
      const songButton = event.target.closest('[data-guest-safe-song]');
      if (songButton) {
        event.preventDefault();
        activateMainQueue(songs, Number(songButton.dataset.index || 0));
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
      const manualSong = event.target.closest('#v2App [data-song]');
      if (manualSong && manualSong.dataset.guestSafeOpen !== 'true') {
        mainQueueActive = false;
        mainQueue = [];
        mainQueueIndex = -1;
      }
    }

    window.setTimeout(syncPlayers, 30);
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const artistLink = event.target.closest('[data-guest-safe-artist-href]');
    if (artistLink && !loggedIn()) {
      event.preventDefault();
      location.href = artistLink.dataset.guestSafeArtistHref;
      return;
    }
    const genreLink = event.target.closest('.v2-guest-safe-genre-link');
    if (genreLink && !loggedIn() && mainPlayer()) {
      event.preventDefault();
      openGenreSheet(mainPlayer());
    }
  });

  window.addEventListener('pageshow', syncPlayers);
  window.addEventListener('focus', syncPlayers);
  window.addEventListener('storage', syncPlayers);
  window.setInterval(syncPlayers, 650);
  loadCatalog().finally(syncPlayers);
  syncPlayers();
})();
