(() => {
  'use strict';
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopControlOrder) return;
  window.StashboxDesktopControlOrder = true;

  const app = document.getElementById('v2App');
  if (!app) return;
  let queued = false;

  function apply() {
    queued = false;
    app.querySelectorAll('[data-player] .v2-artist-row').forEach(row => {
      const playlist = row.querySelector('[data-desktop-add-playlist]');
      const more = row.querySelector('.v2-li-song-more');
      const fit = row.querySelector('[data-desktop-video-fit-toggle]');
      if (playlist) {
        playlist.style.setProperty('order', '20', 'important');
        playlist.style.setProperty('margin-left', 'auto', 'important');
      }
      if (more) more.style.setProperty('order', '25', 'important');
      if (fit) {
        fit.style.setProperty('order', '30', 'important');
        fit.style.setProperty('margin-left', '0', 'important');
      }
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  new MutationObserver(queue).observe(app, { childList: true, subtree: true });
  window.addEventListener('stashbox:desktop-controls-ready', queue);
  window.addEventListener('stashbox:desktop-song-change', queue);
  window.addEventListener('pageshow', queue);
  window.addEventListener('focus', queue);
  [0, 50, 150, 350, 750, 1500, 3000].forEach(delay => setTimeout(queue, delay));
})();