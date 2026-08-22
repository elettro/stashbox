(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const LOCAL_LIKES_KEY = 'stashbox_v2_liked_song_counts';
  const app = document.getElementById('v2App');
  if (!app) return;

  let catalog = [];
  let lastSignature = '';
  let syncTimer = 0;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const numberValue = value => Math.max(0, Number.parseInt(String(value ?? '0').replace(/[^0-9-]/g, ''), 10) || 0);

  function rows(body) {
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch (_) {}
    }
    if (Array.isArray(body)) return body;
    return body?.songs || body?.items || body?.data || [];
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || ''),
      artist: clean(row.artist || row.artist_name || ''),
      likes: numberValue(row.total_likes ?? row.like_count ?? row.likes ?? row.likes_count ?? 0)
    };
  }

  function localLikedCounts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_LIKES_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function currentPlayer() {
    const player = app.querySelector('[data-player]');
    return player && !player.hidden ? player : null;
  }

  function resolveDisplayedSong(player) {
    const title = clean(player.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(player.querySelector('[data-partist]')?.textContent);
    if (!title) return null;

    return catalog.find(song => normalize(song.title) === normalize(title) && (!artist || normalize(song.artist) === normalize(artist)))
      || catalog.find(song => normalize(song.title) === normalize(title))
      || null;
  }

  function setCount(node, value) {
    const text = String(Math.max(0, numberValue(value)));
    if (node && node.textContent !== text) node.textContent = text;
  }

  function synchronize(force = false) {
    window.clearTimeout(syncTimer);
    const player = currentPlayer();
    if (!player || !catalog.length) return;

    const song = resolveDisplayedSong(player);
    if (!song?.key) return;

    const signature = `${song.key}|${normalize(song.title)}|${normalize(song.artist)}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    const likeButton = player.querySelector('[data-like]');
    const localCount = numberValue(localLikedCounts()[song.key]);
    const resolvedCount = Math.max(song.likes, localCount);

    player.dataset.currentSongKey = song.key;
    if (likeButton) {
      likeButton.dataset.currentSongKey = song.key;
      likeButton.dataset.likeSongKey = song.key;
      likeButton.dataset.serverLikeCount = String(song.likes);
    }

    setCount(player.querySelector('[data-likes]'), resolvedCount);
    setCount(player.querySelector('[data-li-like-count]'), resolvedCount);

    window.dispatchEvent(new CustomEvent('stashbox:v2-current-song', {
      detail: { songKey: song.key, likeCount: resolvedCount, source: 'like-count-switch-fix' }
    }));
  }

  function schedule(delay = 0, force = true) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => synchronize(force), delay);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-prev], #v2App [data-next]')) {
      schedule(55, true);
      window.setTimeout(() => synchronize(true), 180);
    }
  }, true);

  window.addEventListener('stashbox:v2-current-song', event => {
    if (event.detail?.source === 'like-count-switch-fix') return;
    schedule(0, true);
  });

  fetch(`${API}/radio/songs`, { cache: 'no-store', credentials: 'omit' })
    .then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      catalog = rows(body).map(normalizeSong).filter(song => song.key && song.title);
      synchronize(true);
    })
    .catch(error => console.warn('[V2 Like Count Switch Fix]', error));

  window.setInterval(() => synchronize(false), 250);
  window.addEventListener('pageshow', () => schedule(0, true));
  window.addEventListener('focus', () => schedule(0, true));
})();
