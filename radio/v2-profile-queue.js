(() => {
  'use strict';

  const QUEUE_KEY = 'stashbox_v2_profile_queue_handoff';
  const app = document.getElementById('v2App');
  if (!app) return;

  let queue = null;
  try { queue = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || 'null'); }
  catch (_) {}
  if (!queue || !Array.isArray(queue.songKeys) || !queue.songKeys.length || Date.now() - Number(queue.createdAt || 0) > 10 * 60 * 1000) return;

  queue.songKeys = queue.songKeys.map(value => String(value || '').trim()).filter(Boolean);
  queue.index = Math.max(0, Math.min(queue.songKeys.length - 1, Number(queue.index || 0)));
  let active = true;
  let audioBound = false;

  function save() {
    try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
    catch (_) {}
  }

  function songCard(key) {
    return [...app.querySelectorAll('[data-song]')].find(card => String(card.dataset.song || '') === String(key || ''));
  }

  function playIndex(index) {
    if (!active || !queue.songKeys.length) return;
    queue.index = (index + queue.songKeys.length) % queue.songKeys.length;
    save();
    const card = songCard(queue.songKeys[queue.index]);
    if (card) card.click();
  }

  function currentKey() {
    const title = app.querySelector('[data-ptitle]')?.textContent?.trim() || '';
    const artist = app.querySelector('[data-partist]')?.textContent?.trim() || '';
    const matching = [...app.querySelectorAll('[data-song]')].find(card => {
      const cardTitle = card.querySelector('h3')?.textContent?.trim() || '';
      const cardArtist = card.querySelector('p')?.textContent?.trim() || '';
      return cardTitle === title && (!artist || cardArtist === artist);
    });
    return String(matching?.dataset.song || '');
  }

  function syncIndex() {
    const key = currentKey();
    const index = queue.songKeys.indexOf(key);
    if (index >= 0) {
      queue.index = index;
      save();
    }
  }

  function bindAudio() {
    if (audioBound) return true;
    const audio = app.querySelector('[data-audio]');
    if (!audio) return false;
    audioBound = true;
    audio.onended = () => playIndex(queue.index + 1);
    return true;
  }

  document.addEventListener('click', event => {
    if (!active) return;
    const next = event.target.closest('#v2App [data-next]');
    if (next) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playIndex(queue.index + 1);
      return;
    }
    const previous = event.target.closest('#v2App [data-prev]');
    if (previous) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playIndex(queue.index - 1);
      return;
    }
    const song = event.target.closest('#v2App [data-song]');
    if (song) {
      const index = queue.songKeys.indexOf(String(song.dataset.song || ''));
      if (index >= 0) {
        queue.index = index;
        save();
      }
    }
  }, true);

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const ready = songCard(queue.songKeys[queue.index]);
    if (ready) {
      window.clearInterval(timer);
      playIndex(queue.index);
      const audioTimer = window.setInterval(() => {
        if (bindAudio()) window.clearInterval(audioTimer);
      }, 50);
      return;
    }
    if (attempts >= 300) {
      window.clearInterval(timer);
      active = false;
      try { sessionStorage.removeItem(QUEUE_KEY); } catch (_) {}
    }
  }, 50);

  const titleTimer = window.setInterval(() => {
    if (!active) return window.clearInterval(titleTimer);
    syncIndex();
  }, 500);
})();
