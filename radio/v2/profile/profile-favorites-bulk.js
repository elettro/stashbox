(() => {
  'use strict';

  const QUEUE_KEY = 'stashbox_v2_profile_queue_handoff';
  let scheduled = false;

  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
  const shuffleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3c5 0 5 10 10 10h3M17 4l3 3-3 3M4 17h3c2 0 3-1.5 4-3M15 7c1-1 2-1 5-1M17 14l3 3-3 3"/></svg>';

  function favoriteSheet() {
    return [...document.querySelectorAll('.profile-overlay.open, .profile-overlay')].find(overlay => overlay.querySelector('.profile-sheet-head h2')?.textContent?.trim() === 'Favorites');
  }

  function keysFromSheet(overlay) {
    return [...overlay.querySelectorAll('[data-play-song]')]
      .map(button => String(button.dataset.playSong || '').trim())
      .filter((key, index, list) => key && list.indexOf(key) === index);
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function startQueue(keys, mode) {
    if (!keys.length) return;
    const ordered = mode === 'shuffle' ? shuffle(keys) : [...keys];
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify({
        songKeys: ordered,
        index: 0,
        mode,
        createdAt: Date.now()
      }));
    } catch (_) {}
    location.href = '/radio/dev/v2/?profile_queue=1';
  }

  function enhance() {
    scheduled = false;
    const overlay = favoriteSheet();
    if (!overlay) return;
    const list = overlay.querySelector('.profile-sheet-body > .profile-list');
    if (!list || overlay.querySelector('.profile-favorites-bulk')) return;
    const keys = keysFromSheet(overlay);
    const toolbar = document.createElement('div');
    toolbar.className = 'profile-favorites-bulk';
    toolbar.innerHTML = `
      <button type="button" data-favorites-play-all ${keys.length ? '' : 'disabled'}>${playIcon}<span>Play All</span></button>
      <button type="button" data-favorites-shuffle-all ${keys.length ? '' : 'disabled'}>${shuffleIcon}<span>Shuffle All</span></button>`;
    list.before(toolbar);
  }

  function queueEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener('click', event => {
    const overlay = favoriteSheet();
    if (!overlay) return;
    const keys = keysFromSheet(overlay);
    if (event.target.closest('[data-favorites-play-all]')) {
      event.preventDefault();
      startQueue(keys, 'play-all');
    }
    if (event.target.closest('[data-favorites-shuffle-all]')) {
      event.preventDefault();
      startQueue(keys, 'shuffle');
    }
  });

  new MutationObserver(queueEnhance).observe(document.body, { childList: true, subtree: true });
  queueEnhance();
})();
