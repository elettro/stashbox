(() => {
  'use strict';

  let queued = false;

  function ensureTier(button) {
    if (button.querySelector('.profile-shortcut-tier')) return;
    const tier = document.createElement('small');
    tier.className = 'profile-shortcut-tier';
    tier.textContent = '(Premium)';
    button.appendChild(tier);
  }

  function makeOfflineShortcut(button) {
    const label = button.querySelector(':scope > span');
    if (label) label.textContent = 'Offline Playlist';
    button.disabled = false;
    button.removeAttribute('disabled');
    button.dataset.openOfflinePlaylist = 'true';
    button.title = 'Open your offline playlist';
    button.querySelector('.profile-shortcut-tier')?.remove();
    button.querySelector('.profile-shortcut-coming-soon')?.remove();
  }

  function cleanShortcuts() {
    queued = false;
    const shortcuts = document.querySelector('#profileApp .profile-shortcuts');
    if (!shortcuts) return;

    shortcuts.classList.add('is-cleaned');
    [...shortcuts.querySelectorAll('.profile-shortcut')].forEach(button => {
      const primaryLabel = String(button.querySelector(':scope > span')?.textContent || button.textContent || '').trim().toLowerCase();
      if (['playlists', 'favorites', 'following'].includes(primaryLabel)) {
        button.remove();
        return;
      }

      if (primaryLabel === 'listening history') ensureTier(button);

      if (primaryLabel === 'downloads' || primaryLabel === 'offline playlist') {
        makeOfflineShortcut(button);
      }
    });
  }

  function queueClean() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(cleanShortcuts);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-open-offline-playlist]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const embedded = window.parent !== window;
    location.href = `/radio/dev/v2/offline/?profile=1${embedded ? '&embedded=1' : ''}`;
  }, true);

  new MutationObserver(queueClean).observe(document.getElementById('profileApp') || document.body, {
    childList: true,
    subtree: true
  });
  queueClean();
})();