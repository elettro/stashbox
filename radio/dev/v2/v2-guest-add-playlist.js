(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const mainApp = document.getElementById('v2App');
  const artistApp = document.getElementById('artistApp');
  if (!mainApp && !artistApp) return;

  const plusIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function visible(node) {
    return Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none');
  }

  function ensureButton(player, type) {
    if (!player) return;
    const existing = player.querySelector('[data-guest-add-playlist]');
    if (loggedIn()) {
      existing?.remove();
      return;
    }

    if (existing) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `v2-guest-add-playlist v2-li-rail-item is-${type}`;
    button.dataset.guestAddPlaylist = 'true';
    button.dataset.v2AuthOpen = 'login';
    button.setAttribute('aria-label', 'Log in or create an account to add this song to a playlist');
    button.innerHTML = `<span class="v2-li-rail-circle">${plusIcon}</span><small>Add to<br>Playlist</small>`;
    player.appendChild(button);
  }

  function synchronize() {
    const mainPlayer = mainApp?.querySelector('[data-player]');
    if (visible(mainPlayer)) ensureButton(mainPlayer, 'main');
    else mainPlayer?.querySelector('[data-guest-add-playlist]')?.remove();

    const artistPlayer = document.querySelector('.artist-realm-player');
    if (visible(artistPlayer)) ensureButton(artistPlayer, 'artist');
    else artistPlayer?.querySelector('[data-guest-add-playlist]')?.remove();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-guest-add-playlist]');
    if (!button || loggedIn()) return;
    // v2-auth-sheet.js handles data-v2-auth-open="login". This listener only
    // keeps the guest control from being treated as a player swipe surface.
    event.stopPropagation();
    button.dispatchEvent(new CustomEvent('stashbox:guest-playlist-login', { bubbles: true }));
  });

  window.addEventListener('pageshow', synchronize);
  window.addEventListener('focus', synchronize);
  window.addEventListener('storage', synchronize);
  window.setInterval(synchronize, 500);
  synchronize();
})();
