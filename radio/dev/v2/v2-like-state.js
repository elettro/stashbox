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

  function numberValue(value) {
    return Math.max(0, Number.parseInt(String(value ?? '0').replace(/[^0-9-]/g, ''), 10) || 0);
  }

  function setText(node, value) {
    const text = String(value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function scheduleSync(delay = 0) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncLikeUi, delay);
  }

  function dispatchLikeUpdate(key, count, liked, source = 'sync', error = '') {
    window.dispatchEvent(new CustomEvent('stashbox:like-count-updated', {
      detail: { songKey: key, count, liked, source, error }
    }));
  }

  function applyLikeUi({ key, count, liked, animate = false, source = 'sync' }) {
    const player = document.querySelector('#v2App [data-player]');
    if (!player || player.hidden) return;

    const primaryButton = player.querySelector('[data-like]');
    const primaryCount = player.querySelector('[data-likes]');
    const railButton = player.querySelector('[data-li-favorite]');
    const railCount = player.querySelector('[data-li-like-count]');

    setText(primaryCount, count);
    setText(railCount, count);

    if (primaryButton) {
      primaryButton.classList.toggle('is-liked', liked);
      if (animate) {
        primaryButton.classList.add('just-liked');
        window.setTimeout(() => primaryButton.classList.remove('just-liked'), 430);
      }
      primaryButton.setAttribute('aria-pressed', String(liked));
      primaryButton.setAttribute('aria-label', liked ? 'You liked this song' : 'Like this song');
      primaryButton.title = liked ? 'Liked' : 'Like this song';
    }

    if (railButton) {
      railButton.classList.toggle('is-favorite', liked);
      railButton.setAttribute('aria-pressed', String(liked));
      railButton.setAttribute('aria-label', liked ? `Liked. ${count} total likes` : `Like this song. ${count} total likes`);
      if (animate) {
        railButton.classList.add('just-liked');
        window.setTimeout(() => railButton.classList.remove('just-liked'), 430);
      }
    }

    dispatchLikeUpdate(key, count, liked, source);
  }

  function syncLikeUi() {
    const player = document.querySelector('#v2App [data-player]');
    const button = player?.querySelector('[data-like]');
    const count = player?.querySelector('[data-likes]');
    if (!player || player.hidden || !button || !count) return;

    const key = resolveCurrentKey();
    if (!key) return;

    const rawCount = numberValue(count.textContent);
    const storedCount = numberValue(likedCounts[key]);
    const isLiked = storedCount > 0;

    if (button.dataset.likeSongKey !== key) {
      button.dataset.likeSongKey = key;
      button.dataset.serverLikeCount = String(rawCount);
    }

    const serverCount = numberValue(button.dataset.serverLikeCount || rawCount);
    const resolvedCount = isLiked ? Math.max(serverCount, storedCount) : Math.max(serverCount, rawCount);
    applyLikeUi({ key, count: resolvedCount, liked: isLiked, source: 'sync' });
  }

  async function sendLike(key) {
    const details = songDetails(key);
    const response = await fetch(TRACK_URL, {
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
    });

    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    if (!response.ok || body?.success === false) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function authoritativeCount(body, fallback) {
    const values = [
      body?.total_likes,
      body?.like_count,
      body?.likes,
      body?.song?.total_likes,
      body?.song?.like_count,
      body?.song?.likes,
      body?.counts?.likes
    ].map(numberValue).filter(value => value > 0);
    return values.length ? Math.max(fallback, ...values) : fallback;
  }

  async function handleLike(button) {
    const count = document.querySelector('#v2App [data-likes]');
    const key = resolveCurrentKey();
    if (!button || !count || !key || button.dataset.likeSaving === 'true') return;

    if (numberValue(likedCounts[key]) > 0) {
      syncLikeUi();
      return;
    }

    const currentCount = numberValue(count.textContent);
    const likedCount = currentCount + 1;
    likedCounts[key] = likedCount;
    saveLikedCounts();
    button.dataset.likeSaving = 'true';
    applyLikeUi({ key, count: likedCount, liked: true, animate: true, source: 'optimistic' });

    try {
      const body = await sendLike(key);
      const confirmedCount = authoritativeCount(body, likedCount);
      likedCounts[key] = confirmedCount;
      saveLikedCounts();
      applyLikeUi({ key, count: confirmedCount, liked: true, source: 'confirmed' });
    } catch (error) {
      delete likedCounts[key];
      saveLikedCounts();
      applyLikeUi({ key, count: currentCount, liked: false, source: 'rollback' });
      dispatchLikeUpdate(key, currentCount, false, 'error', error.message || 'Like was not saved.');
      console.warn('[V2 Like] Like request failed', error);
    } finally {
      delete button.dataset.likeSaving;
    }
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

  window.addEventListener('stashbox:like-count-updated', event => {
    const detail = event.detail || {};
    if (detail.source === 'sync') return;
    const railCount = document.querySelector('#v2App [data-li-like-count]');
    if (railCount && Number.isFinite(Number(detail.count))) setText(railCount, Math.max(0, Number(detail.count)));
  });

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
    playerObserver.observe(player, { childList: true, subtree: true });
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