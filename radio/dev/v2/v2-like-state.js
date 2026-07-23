(() => {
  'use strict';

  const STORAGE_KEY = 'stashbox_v2_liked_song_counts';
  const TRACK_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/track';
  let likedCounts = readLikedCounts();
  let currentKey = '';
  let playerObserver = null;
  let syncTimer = 0;

  function readLikedCounts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveLikedCounts() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(likedCounts)); }
    catch (_) {}
  }

  function songElements() {
    return [...document.querySelectorAll('#v2App [data-song]')];
  }

  function songDetails(key) {
    const element = songElements().find(item => String(item.dataset.song || '') === String(key || ''));
    return {
      key: String(key || ''),
      title: element?.querySelector('h3')?.textContent?.trim() || document.querySelector('#v2App [data-ptitle]')?.textContent?.trim() || '',
      artist: element?.querySelector('p')?.textContent?.trim() || document.querySelector('#v2App [data-partist]')?.textContent?.trim() || ''
    };
  }

  function resolveCurrentKey() {
    if (currentKey) return currentKey;

    const title = document.querySelector('#v2App [data-ptitle]')?.textContent?.trim() || '';
    const artist = document.querySelector('#v2App [data-partist]')?.textContent?.trim() || '';
    if (!title) return '';

    const match = songElements().find(element => {
      const elementTitle = element.querySelector('h3')?.textContent?.trim() || '';
      const elementArtist = element.querySelector('p')?.textContent?.trim() || '';
      return elementTitle === title && (!artist || elementArtist === artist);
    });

    currentKey = String(match?.dataset.song || '');
    return currentKey;
  }

  function scheduleSync(delay = 0) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncLikeUi, delay);
  }

  function syncLikeUi() {
    const player = document.querySelector('#v2App [data-player]');
    const button = player?.querySelector('[data-like]');
    const count = player?.querySelector('[data-likes]');
    if (!player || player.hidden || !button || !count) return;

    const key = resolveCurrentKey();
    if (!key) return;

    const rawCount = Math.max(0, Number.parseInt(count.textContent || '0', 10) || 0);
    const storedCount = Math.max(0, Number.parseInt(likedCounts[key] || '0', 10) || 0);
    const isLiked = storedCount > 0;

    if (button.dataset.likeSongKey !== key) {
      button.dataset.likeSongKey = key;
      button.dataset.serverLikeCount = String(rawCount);
    }

    const serverCount = Math.max(0, Number.parseInt(button.dataset.serverLikeCount || String(rawCount), 10) || 0);
    count.textContent = String(isLiked ? Math.max(serverCount, storedCount) : serverCount);
    button.classList.toggle('is-liked', isLiked);
    button.setAttribute('aria-pressed', String(isLiked));
    button.setAttribute('aria-label', isLiked ? 'You liked this song' : 'Like this song');
    button.title = isLiked ? 'Liked' : 'Like this song';
  }

  function sendLike(key) {
    const details = songDetails(key);
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'like',
        event_type: 'like',
        song_key: details.key,
        display_title: details.title,
        artist: details.artist,
        source: 'radio_dev_v2'
      }),
      keepalive: true
    }).catch(() => {});
  }

  function handleLike(button) {
    const count = document.querySelector('#v2App [data-likes]');
    const key = resolveCurrentKey();
    if (!button || !count || !key) return;

    if (Number(likedCounts[key]) > 0) {
      syncLikeUi();
      return;
    }

    const currentCount = Math.max(0, Number.parseInt(count.textContent || '0', 10) || 0);
    const likedCount = currentCount + 1;
    likedCounts[key] = likedCount;
    saveLikedCounts();

    count.textContent = String(likedCount);
    button.classList.add('is-liked', 'just-liked');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'You liked this song');
    button.title = 'Liked';
    window.setTimeout(() => button.classList.remove('just-liked'), 430);

    sendLike(key);
  }

  document.addEventListener('click', event => {
    const songElement = event.target.closest('#v2App [data-song]');
    if (songElement) {
      currentKey = String(songElement.dataset.song || '');
      scheduleSync(40);
    }

    if (event.target.closest('#v2App [data-prev], #v2App [data-next]')) {
      currentKey = '';
      scheduleSync(80);
    }

    const likeButton = event.target.closest('#v2App [data-like]');
    if (!likeButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    handleLike(likeButton);
  }, true);

  function installPlayerObserver() {
    const player = document.querySelector('#v2App [data-player]');
    const title = player?.querySelector('[data-ptitle]');
    if (!player || !title) return false;

    playerObserver?.disconnect();
    playerObserver = new MutationObserver(() => {
      currentKey = '';
      scheduleSync(20);
    });
    playerObserver.observe(player, { attributes: true, attributeFilter: ['hidden'] });
    playerObserver.observe(title, { childList: true, characterData: true, subtree: true });
    scheduleSync();
    return true;
  }

  if (!installPlayerObserver()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (installPlayerObserver() || attempts >= 200) window.clearInterval(timer);
    }, 50);
  }
})();
