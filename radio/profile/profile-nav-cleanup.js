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

  /*
   * PAUSED 2026-08-22
   * Offline Playlist navigation is intentionally retained here for future use,
   * but is not active from Profile right now. Browser IndexedDB downloads are
   * device-local, so desktop cannot reliably show tracks saved on a different
   * phone/browser profile.
   *
   * To restore later, re-enable this helper and the click handler below.
   *
   * function makeOfflineShortcut(button) {
   *   const label = button.querySelector(':scope > span');
   *   if (label) label.textContent = 'Offline Playlist';
   *   button.disabled = false;
   *   button.removeAttribute('disabled');
   *   button.dataset.openOfflinePlaylist = 'true';
   *   button.title = 'Open your offline playlist';
   *   button.querySelector('.profile-shortcut-tier')?.remove();
   *   button.querySelector('.profile-shortcut-coming-soon')?.remove();
   * }
   */

  function restoreDownloadsComingSoon(button) {
    const label = button.querySelector(':scope > span');
    if (label) label.textContent = 'Downloads';
    delete button.dataset.openOfflinePlaylist;
    button.disabled = true;
    button.setAttribute('disabled', '');
    button.title = 'Premium offline downloads are coming soon.';
    ensureTier(button);
    if (!button.querySelector('.profile-shortcut-coming-soon')) {
      const badge = document.createElement('small');
      badge.className = 'profile-shortcut-coming-soon';
      badge.textContent = 'Coming Soon';
      button.appendChild(badge);
    }
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
        restoreDownloadsComingSoon(button);
      }
    });
  }

  function queueClean() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(cleanShortcuts);
  }

  /*
   * PAUSED 2026-08-22. Keep for future cross-device/offline-library work.
   * document.addEventListener('click', event => {
   *   const button = event.target.closest?.('[data-open-offline-playlist]');
   *   if (!button) return;
   *   event.preventDefault();
   *   event.stopImmediatePropagation();
   *   const embedded = window.parent !== window;
   *   location.href = `/radio/offline/?profile=1${embedded ? '&embedded=1' : ''}`;
   * }, true);
   */

  new MutationObserver(queueClean).observe(document.getElementById('profileApp') || document.body, {
    childList: true,
    subtree: true
  });
  queueClean();
})();