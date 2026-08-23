(() => {
  'use strict';

  let queued = false;
  const mobile = window.matchMedia('(max-width: 699px)');

  function ensureTier(button) {
    if (button.querySelector('.profile-shortcut-tier')) return;
    const tier = document.createElement('small');
    tier.className = 'profile-shortcut-tier';
    tier.textContent = '(Premium)';
    button.appendChild(tier);
  }

  function makeMobileDownloads(button) {
    const label = button.querySelector(':scope > span');
    if (label) label.textContent = 'Downloads';
    button.hidden = false;
    button.disabled = false;
    button.removeAttribute('disabled');
    button.removeAttribute('aria-disabled');
    button.dataset.openOfflinePlaylist = 'true';
    button.title = 'Open your offline downloads';
    button.querySelector('.profile-shortcut-tier')?.remove();
    button.querySelector('.profile-shortcut-coming-soon')?.remove();
  }

  function hideDesktopDownloads(button) {
    const label = button.querySelector(':scope > span');
    if (label) label.textContent = 'Downloads';
    delete button.dataset.openOfflinePlaylist;
    button.hidden = true;
    button.disabled = true;
    button.setAttribute('disabled', '');
    button.setAttribute('aria-disabled', 'true');
    button.title = '';
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
        if (mobile.matches) makeMobileDownloads(button);
        else hideDesktopDownloads(button);
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
    if (!button || !mobile.matches) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const embedded = window.parent !== window;
    location.href = `/radio/offline/?profile=1${embedded ? '&embedded=1' : ''}`;
  }, true);

  new MutationObserver(queueClean).observe(document.getElementById('profileApp') || document.body, {
    childList: true,
    subtree: true
  });

  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', queueClean);
  else if (typeof mobile.addListener === 'function') mobile.addListener(queueClean);

  queueClean();
})();