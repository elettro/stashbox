(() => {
  'use strict';

  if (window.__stashboxDesktopLikeHotkeysLoaded) return;
  window.__stashboxDesktopLikeHotkeysLoaded = true;

  const TRACK_URL = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/track';
  const desktopQuery = window.matchMedia('(min-width: 900px)');
  const app = document.getElementById('v2App');
  if (!app) return;

  const clean = value => String(value ?? '').trim();
  const numberValue = value => Math.max(0, Number.parseInt(String(value ?? '0').replace(/[^0-9-]/g, ''), 10) || 0);

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function player() {
    const node = app.querySelector('[data-player]');
    return node && !node.hidden ? node : null;
  }

  function songElements() {
    return [...app.querySelectorAll('[data-song]')];
  }

  function resolveSong() {
    const p = player();
    if (!p) return null;

    const likeButton = p.querySelector('[data-like]');
    let key = clean(
      p.dataset.currentSongKey ||
      p.dataset.songKey ||
      likeButton?.dataset.currentSongKey ||
      likeButton?.dataset.likeSongKey
    );

    const title = clean(p.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(p.querySelector('[data-partist]')?.textContent);

    if (!key || key.startsWith('ui:')) {
      const exact = songElements().find(node => {
        const cardTitle = clean(node.querySelector('h3')?.textContent || node.querySelector('strong')?.textContent);
        const cardArtist = clean(node.querySelector('p')?.textContent || node.querySelector('small')?.textContent);
        return cardTitle === title && (!artist || cardArtist === artist || cardArtist.includes(artist));
      });
      const titleOnly = exact || songElements().find(node => clean(node.querySelector('h3')?.textContent || node.querySelector('strong')?.textContent) === title);
      key = clean(titleOnly?.dataset.song);
    }

    if (!key) return null;
    return { key, title, artist: artist || 'Stashbox', button: likeButton, player: p };
  }

  function countNode(song) {
    return song.player.querySelector('[data-likes]') || song.button?.querySelector('span') || null;
  }

  function paintLike(song, count) {
    const countEl = countNode(song);
    if (countEl) countEl.textContent = String(count);

    if (song.button) {
      song.button.classList.add('is-liked', 'just-liked');
      song.button.setAttribute('aria-pressed', 'true');
      song.button.setAttribute('aria-label', 'You liked this song');
      song.button.title = 'Liked';
      window.setTimeout(() => song.button?.classList.remove('just-liked'), 430);
    }

    const railButton = song.player.querySelector('[data-li-favorite]');
    const railCount = song.player.querySelector('[data-li-like-count]');
    if (railCount) railCount.textContent = String(count);
    if (railButton) {
      railButton.classList.add('is-favorite', 'just-liked');
      railButton.setAttribute('aria-pressed', 'true');
      railButton.setAttribute('aria-label', `Liked. ${count} total likes`);
      window.setTimeout(() => railButton.classList.remove('just-liked'), 430);
    }

    window.dispatchEvent(new CustomEvent('stashbox:like-count-updated', {
      detail: { songKey: song.key, count, liked: true, source: 'prod-desktop-hotkey' }
    }));
  }

  function persistLike(song) {
    const sessionId = `like-hotkey-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'like',
        event_type: 'like',
        song_key: song.key,
        display_title: song.title,
        artist: song.artist,
        session_id: sessionId,
        source: 'radio_prod_desktop_hotkey_like'
      }),
      keepalive: true
    }).catch(error => console.warn('[PROD Like Hotkey] persistence failed', error));
  }

  function likePlusOne() {
    const song = resolveSong();
    if (!song?.button) return false;

    const current = numberValue(countNode(song)?.textContent);
    const next = current + 1;
    paintLike(song, next);
    persistLike(song);
    return true;
  }

  window.addEventListener('keydown', event => {
    if (!desktopQuery.matches || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const key = clean(event.key).toLowerCase();
    if (key !== 'f' && key !== 'l') return;
    if (!player()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    likePlusOne();
  }, true);
})();
