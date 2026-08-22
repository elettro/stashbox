(() => {
  'use strict';

  if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ALBUM_NAME = 'Stashbox Radio';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const absoluteUrl = value => {
    const fixed = clean(value)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
    try { return new URL(fixed || FALLBACK_ART, location.href).href; }
    catch (_) { return new URL(FALLBACK_ART, location.href).href; }
  };

  let catalog = [];
  let catalogPromise = null;
  let refreshTimer = 0;
  let positionTimer = 0;
  let lastFingerprint = '';
  const boundAudio = new WeakSet();

  function rows(body) {
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch (_) {}
    }
    return Array.isArray(body) ? body : body?.songs || body?.items || body?.data || [];
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      artwork: absoluteUrl(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url || FALLBACK_ART)
    };
  }

  async function loadCatalog() {
    if (catalog.length) return catalog;
    if (!catalogPromise) {
      catalogPromise = fetch(`${API}/radio/songs`, { cache: 'no-store', credentials: 'omit' })
        .then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          catalog = rows(body).map(normalizeSong).filter(song => song.key && song.title);
          return catalog;
        })
        .catch(() => []);
    }
    return catalogPromise;
  }

  function visible(node) {
    return Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none');
  }

  function mainContext() {
    const player = document.querySelector('#v2App [data-player]');
    const audio = player?.querySelector('[data-audio]');
    if (!player || !audio || (!visible(player) && (audio.paused || !audio.currentSrc))) return null;
    return {
      type: 'main',
      root: player,
      audio,
      title: clean(player.querySelector('[data-ptitle]')?.textContent),
      artist: clean(player.querySelector('[data-partist]')?.textContent),
      key: clean(player.dataset.currentSongKey || player.querySelector('[data-like]')?.dataset.currentSongKey || player.querySelector('[data-like]')?.dataset.likeSongKey),
      previous: player.querySelector('[data-prev]'),
      next: player.querySelector('[data-next]'),
      toggle: player.querySelector('[data-play]')
    };
  }

  function artistContext() {
    const root = document.querySelector('.artist-realm-player');
    if (!visible(root)) return null;
    return {
      type: 'artist',
      root,
      audio: null,
      title: clean(root.querySelector('[data-realm-title]')?.textContent),
      artist: clean(root.querySelector('[data-realm-artist]')?.textContent || root.querySelector('[data-realm-subtitle]')?.textContent?.split('·')[0]),
      key: clean(root.dataset.currentSongKey),
      previous: root.querySelector('[data-realm-prev]'),
      next: root.querySelector('[data-realm-next]'),
      toggle: root.querySelector('[data-realm-toggle]'),
      progress: root.querySelector('[data-realm-progress]'),
      currentNode: root.querySelector('[data-realm-current]'),
      durationNode: root.querySelector('[data-realm-duration]')
    };
  }

  function activeContext() {
    return artistContext() || mainContext();
  }

  function resolveSong(context) {
    if (!context) return null;
    if (context.key) {
      const byKey = catalog.find(song => song.key === context.key);
      if (byKey) return byKey;
    }
    const title = normalize(context.title);
    const artist = normalize(context.artist);
    return catalog.find(song => normalize(song.title) === title && (!artist || normalize(song.artist) === artist))
      || catalog.find(song => normalize(song.title) === title)
      || null;
  }

  function fallbackArtwork(context) {
    const mainImage = context?.root?.querySelector('[data-avatar] img')?.src;
    const artistImage = context?.root?.querySelector('.artist-realm-stage img')?.src;
    return absoluteUrl(mainImage || artistImage || FALLBACK_ART);
  }

  function parseClock(value) {
    const parts = clean(value).split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function playbackState(context) {
    if (!context) return 'none';
    if (context.audio) return context.audio.paused ? 'paused' : 'playing';
    return normalize(context.toggle?.getAttribute('aria-label')) === 'pause' ? 'playing' : 'paused';
  }

  function setPlaybackState(context) {
    try { navigator.mediaSession.playbackState = playbackState(context); }
    catch (_) {}
  }

  function setPosition(context) {
    if (!context || typeof navigator.mediaSession.setPositionState !== 'function') return;
    let duration = 0;
    let position = 0;
    let playbackRate = 1;

    if (context.audio) {
      duration = Number.isFinite(context.audio.duration) ? context.audio.duration : 0;
      position = Number.isFinite(context.audio.currentTime) ? context.audio.currentTime : 0;
      playbackRate = Number.isFinite(context.audio.playbackRate) && context.audio.playbackRate > 0 ? context.audio.playbackRate : 1;
    } else {
      duration = parseClock(context.durationNode?.textContent);
      const rangeValue = Number(context.progress?.value || 0);
      const rangeMax = Math.max(1, Number(context.progress?.max || 1000));
      position = duration > 0 ? Math.min(duration, Math.max(0, rangeValue / rangeMax * duration)) : parseClock(context.currentNode?.textContent);
    }

    if (!(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.min(duration, Math.max(0, position))
      });
    } catch (_) {}
  }

  function schedulePosition(context, delay = 180) {
    clearTimeout(positionTimer);
    positionTimer = window.setTimeout(() => setPosition(context || activeContext()), delay);
  }

  function bindAudio(context) {
    const audio = context?.audio;
    if (!audio || boundAudio.has(audio)) return;
    boundAudio.add(audio);
    ['play', 'pause', 'loadedmetadata', 'durationchange', 'ratechange'].forEach(type => {
      audio.addEventListener(type, () => {
        setPlaybackState(activeContext());
        schedulePosition(activeContext(), 0);
      });
    });
    audio.addEventListener('timeupdate', () => schedulePosition(activeContext(), 250));
  }

  async function refreshMetadata() {
    const context = activeContext();
    if (!context || !context.title || /^loading/i.test(context.title)) return;
    await loadCatalog();
    const song = resolveSong(context);
    const title = clean(song?.title || context.title || 'Stashbox Radio');
    const artist = clean(song?.artist || context.artist || 'Stashbox');
    const artwork = clean(song?.artwork || fallbackArtwork(context));
    const fingerprint = `${context.type}|${song?.key || context.key}|${title}|${artist}|${artwork}`;

    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album: ALBUM_NAME,
          artwork: [{ src: artwork }]
        });
      } catch (_) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: ALBUM_NAME }); }
        catch (_) {}
      }
    }

    bindAudio(context);
    setPlaybackState(context);
    schedulePosition(context, 0);
  }

  function scheduleRefresh(delay = 40) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshMetadata, delay);
  }

  function clickControl(control) {
    if (control && !control.disabled) control.click();
  }

  function seekArtist(context, targetSeconds) {
    if (!context?.progress) return;
    const duration = parseClock(context.durationNode?.textContent);
    if (!(duration > 0)) return;
    const max = Math.max(1, Number(context.progress.max || 1000));
    context.progress.value = String(Math.round(Math.min(duration, Math.max(0, targetSeconds)) / duration * max));
    context.progress.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function seekBy(seconds) {
    const context = activeContext();
    if (!context) return;
    if (context.audio) {
      const duration = Number.isFinite(context.audio.duration) ? context.audio.duration : Infinity;
      context.audio.currentTime = Math.min(duration, Math.max(0, context.audio.currentTime + seconds));
    } else {
      const current = parseClock(context.currentNode?.textContent);
      seekArtist(context, current + seconds);
    }
    schedulePosition(context, 0);
  }

  function seekTo(seconds) {
    const context = activeContext();
    if (!context || !Number.isFinite(Number(seconds))) return;
    if (context.audio) context.audio.currentTime = Math.max(0, Number(seconds));
    else seekArtist(context, Number(seconds));
    schedulePosition(context, 0);
  }

  function play() {
    const context = activeContext();
    if (!context) return;
    if (context.audio) context.audio.play().catch(() => {});
    else if (normalize(context.toggle?.getAttribute('aria-label')) !== 'pause') clickControl(context.toggle);
  }

  function pause() {
    const context = activeContext();
    if (!context) return;
    if (context.audio) context.audio.pause();
    else if (normalize(context.toggle?.getAttribute('aria-label')) === 'pause') clickControl(context.toggle);
  }

  function installAction(name, handler) {
    try { navigator.mediaSession.setActionHandler(name, handler); }
    catch (_) {}
  }

  installAction('play', play);
  installAction('pause', pause);
  installAction('previoustrack', () => clickControl(activeContext()?.previous));
  installAction('nexttrack', () => clickControl(activeContext()?.next));
  installAction('seekbackward', details => seekBy(-Math.max(1, Number(details?.seekOffset || 10))));
  installAction('seekforward', details => seekBy(Math.max(1, Number(details?.seekOffset || 10))));
  installAction('seekto', details => seekTo(Number(details?.seekTime)));
  installAction('stop', pause);

  new MutationObserver(() => scheduleRefresh()).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-label', 'data-current-song-key']
  });

  window.addEventListener('stashbox:v2-current-song', scheduleRefresh);
  document.addEventListener('visibilitychange', () => scheduleRefresh(0));
  loadCatalog().finally(() => scheduleRefresh(0));
})();
