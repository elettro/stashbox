(() => {
  'use strict';

  let queued = false;

  function cleanShortcuts() {
    queued = false;
    const shortcuts = document.querySelector('#profileApp .profile-shortcuts');
    if (!shortcuts) return;

    shortcuts.classList.add('is-cleaned');
    [...shortcuts.querySelectorAll('.profile-shortcut')].forEach(button => {
      const label = String(button.querySelector('span')?.textContent || button.textContent || '').trim().toLowerCase();
      if (['playlists', 'favorites', 'following'].includes(label)) {
        button.remove();
        return;
      }

      if (label === 'downloads') {
        button.disabled = true;
        button.title = 'Offline downloads are coming soon.';
        if (!button.querySelector('.profile-shortcut-coming-soon')) {
          const badge = document.createElement('small');
          badge.className = 'profile-shortcut-coming-soon';
          badge.textContent = 'Coming Soon';
          button.appendChild(badge);
        }
      }
    });
  }

  function queueClean() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(cleanShortcuts);
  }

  new MutationObserver(queueClean).observe(document.getElementById('profileApp') || document.body, {
    childList: true,
    subtree: true
  });
  queueClean();
})();
