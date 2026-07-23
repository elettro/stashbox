(() => {
  'use strict';

  const STORAGE_KEY = 'stashbox_v2_artist_song_handoff';
  let handoff = null;
  try { handoff = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); }
  catch (_) {}
  if (!handoff?.songKey || Date.now() - Number(handoff.createdAt || 0) > 5 * 60 * 1000) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const cards = [...document.querySelectorAll('#v2App [data-song]')];
    const target = cards.find(card => String(card.dataset.song || '') === String(handoff.songKey));
    if (target) {
      window.clearInterval(timer);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
      target.click();
      return;
    }
    if (attempts >= 240) {
      window.clearInterval(timer);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
  }, 50);
})();
