(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';

  function loggedIn() {
    try {
      return Boolean(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken);
    } catch (_) {
      return false;
    }
  }

  function player() {
    return app.querySelector('[data-player]');
  }

  function syncButton(currentPlayer) {
    const button = currentPlayer?.querySelector('[data-video-focus-toggle]');
    if (!button) return;
    const active = currentPlayer.classList.contains('is-video-focus-mode');
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Restore player controls' : 'Minimize player overlays');
    button.title = active ? 'Restore player controls' : 'Minimize player overlays';
  }

  function inject() {
    const currentPlayer = player();
    if (!currentPlayer || !loggedIn() || !currentPlayer.classList.contains('is-logged-in-player')) return false;
    if (!currentPlayer.querySelector('[data-video-focus-toggle]')) {
      currentPlayer.insertAdjacentHTML('beforeend', `
        <button type="button" class="v2-video-focus-toggle" data-video-focus-toggle aria-pressed="false" aria-label="Minimize player overlays" title="Minimize player overlays">
          <svg class="v2-focus-enter-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>
          </svg>
          <svg class="v2-focus-restore-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>
          </svg>
        </button>`);
    }
    syncButton(currentPlayer);
    return true;
  }

  function restore(currentPlayer) {
    if (!currentPlayer) return;
    currentPlayer.classList.remove('is-video-focus-mode');
    syncButton(currentPlayer);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-video-focus-toggle]');
    if (!button) return;
    const currentPlayer = button.closest('[data-player]');
    if (!currentPlayer || !loggedIn()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    currentPlayer.classList.toggle('is-video-focus-mode');
    syncButton(currentPlayer);
    window.dispatchEvent(new CustomEvent('stashbox:video-focus-change', {
      detail: { active: currentPlayer.classList.contains('is-video-focus-mode') }
    }));
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const currentPlayer = player();
    if (!currentPlayer?.classList.contains('is-video-focus-mode')) return;
    event.preventDefault();
    restore(currentPlayer);
  }, true);

  const observer = new MutationObserver(() => {
    const currentPlayer = player();
    if (!currentPlayer) return;
    if (!loggedIn()) {
      restore(currentPlayer);
      return;
    }
    inject();
    if (currentPlayer.hidden) restore(currentPlayer);
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (inject() || attempts >= 240) window.clearInterval(timer);
  }, 50);
})();