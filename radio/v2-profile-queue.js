(() => {
  'use strict';

  const QUEUE_KEY = 'stashbox_v2_profile_queue_handoff';
  const app = document.getElementById('v2App');
  if (!app) return;

  let queue = null;
  try { queue = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || 'null'); }
  catch (_) {}

  const createdAt = Number(queue?.createdAt || 0);
  if (!queue || !Array.isArray(queue.songKeys) || !queue.songKeys.length || !createdAt || Date.now() - createdAt > 10 * 60 * 1000) return;

  const clean = value => String(value ?? '').trim();
  const unique = [];
  queue.songKeys.map(clean).filter(Boolean).forEach(key => {
    if (!unique.includes(key)) unique.push(key);
  });
  if (!unique.length) return;

  queue.songKeys = unique;
  queue.index = Math.max(0, Math.min(queue.songKeys.length - 1, Number(queue.index || 0)));
  queue.selectedSongKey = queue.songKeys[queue.index];

  let active = true;
  let syntheticSongClick = false;
  let lastAdvanceAt = 0;

  function save() {
    if (!active) return;
    queue.updatedAt = Date.now();
    try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
    catch (_) {}
  }

  function stop(reason = 'manual-selection') {
    active = false;
    queue.stopReason = reason;
    try { sessionStorage.removeItem(QUEUE_KEY); } catch (_) {}
    window.dispatchEvent(new CustomEvent('stashbox:profile-queue-stop', { detail: { reason } }));
  }

  function songCard(key) {
    return [...app.querySelectorAll('[data-song]')].find(card => clean(card.dataset.song) === clean(key));
  }

  function triggerSong(key) {
    const songKey = clean(key);
    if (!songKey) return false;

    let target = songCard(songKey);
    let proxy = null;
    if (!target) {
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.hidden = true;
      proxy.dataset.song = songKey;
      proxy.dataset.profileQueueProxy = 'true';
      app.appendChild(proxy);
      target = proxy;
    }

    syntheticSongClick = true;
    try { target.click(); }
    finally {
      syntheticSongClick = false;
      proxy?.remove();
    }
    return true;
  }

  function playIndex(index, reason = 'queue') {
    if (!active || !queue.songKeys.length) return false;
    const length = queue.songKeys.length;
    queue.index = (Number(index) + length) % length;
    queue.selectedSongKey = queue.songKeys[queue.index];
    queue.lastReason = reason;
    save();
    const played = triggerSong(queue.selectedSongKey);
    if (played) {
      window.dispatchEvent(new CustomEvent('stashbox:profile-queue-change', {
        detail: {
          playlistId: queue.playlistId || null,
          playlistName: queue.playlistName || '',
          mode: queue.mode || 'profile-playlist',
          index: queue.index,
          count: queue.songKeys.length,
          songKey: queue.selectedSongKey,
          reason
        }
      }));
    }
    return played;
  }

  function advance(step, reason) {
    const now = Date.now();
    if (now - lastAdvanceAt < 250) return;
    lastAdvanceAt = now;
    playIndex(queue.index + step, reason);
  }

  function currentKey() {
    const title = clean(app.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(app.querySelector('[data-partist]')?.textContent);
    if (!title) return '';
    const matching = [...app.querySelectorAll('[data-song]')].find(card => {
      const cardTitle = clean(card.querySelector('h3')?.textContent || card.querySelector('strong')?.textContent);
      const cardArtist = clean(card.querySelector('p')?.textContent || card.querySelector('small')?.textContent);
      return cardTitle === title && (!artist || cardArtist === artist || cardArtist.includes(artist));
    });
    return clean(matching?.dataset.song);
  }

  function syncIndex() {
    if (!active) return;
    const key = currentKey();
    const index = queue.songKeys.indexOf(key);
    if (index >= 0 && index !== queue.index) {
      queue.index = index;
      queue.selectedSongKey = key;
      save();
    }
  }

  const directEnded = () => {
    if (!active) return;
    advance(1, 'ended-direct');
  };

  function ownAudioEndedHandler() {
    if (!active) return false;
    const audio = app.querySelector('[data-player] [data-audio]');
    if (!(audio instanceof HTMLAudioElement)) return false;
    if (audio.onended !== directEnded) audio.onended = directEnded;
    audio.dataset.profilePlaylistQueue = 'true';
    return true;
  }

  document.addEventListener('ended', event => {
    if (!active) return;
    const media = event.target;
    if (!(media instanceof HTMLAudioElement) || !media.matches('[data-audio]') || !media.closest('#v2App [data-player]')) return;

    // Playlist playback owns song-end advancement. Block the normal Radio
    // catalog auto-advance so the next song always comes from this queue.
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    advance(1, 'ended');
  }, true);

  document.addEventListener('click', event => {
    if (!active) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const next = target.closest('#v2App [data-next]');
    if (next) {
      event.preventDefault();
      event.stopImmediatePropagation();
      advance(1, 'next');
      return;
    }

    const previous = target.closest('#v2App [data-prev]');
    if (previous) {
      event.preventDefault();
      event.stopImmediatePropagation();
      advance(-1, 'previous');
      return;
    }

    const song = target.closest('#v2App [data-song]');
    if (!song) return;
    const key = clean(song.dataset.song);
    const index = queue.songKeys.indexOf(key);

    if (syntheticSongClick || song.dataset.profileQueueProxy === 'true') {
      if (index >= 0) {
        queue.index = index;
        queue.selectedSongKey = key;
        save();
      }
      return;
    }

    // A deliberate click on another catalog song exits playlist mode. A
    // deliberate click on another song inside the playlist keeps the queue.
    if (index < 0) {
      stop('manual-catalog-selection');
      return;
    }
    queue.index = index;
    queue.selectedSongKey = key;
    save();
  }, true);

  ['playing', 'loadedmetadata'].forEach(type => {
    document.addEventListener(type, event => {
      if (!active || !(event.target instanceof HTMLAudioElement) || !event.target.matches('[data-audio]')) return;
      ownAudioEndedHandler();
      syncIndex();
    }, true);
  });

  let attempts = 0;
  const startup = window.setInterval(() => {
    attempts += 1;
    if (app.querySelector('[data-song]') || app.querySelector('[data-player]')) {
      window.clearInterval(startup);
      ownAudioEndedHandler();
      playIndex(queue.index, 'start');
      return;
    }
    if (attempts >= 300) {
      window.clearInterval(startup);
      stop('player-not-ready');
    }
  }, 50);

  const syncTimer = window.setInterval(() => {
    if (!active) return window.clearInterval(syncTimer);
    ownAudioEndedHandler();
    syncIndex();
  }, 350);

  save();
  window.StashboxProfileQueue = Object.freeze({
    active: () => active,
    state: () => ({ ...queue, songKeys: [...queue.songKeys] }),
    next: () => advance(1, 'api-next'),
    previous: () => advance(-1, 'api-previous'),
    stop
  });
})();
