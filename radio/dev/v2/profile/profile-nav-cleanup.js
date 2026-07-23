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

      if (primaryLabel === 'downloads') {
        ensureTier(button);
        button.disabled = true;
        button.title = 'Premium offline downloads are coming soon.';
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
