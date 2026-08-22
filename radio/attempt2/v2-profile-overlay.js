(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/profile/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2ProfileOverlay) return;

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const PROFILE_URL = '/radio/attempt2/profile/?embedded=1';
  let overlay = null;
  let lastTrigger = null;

  function hasSession() {
    try {
      if (window.StashboxV2Session?.hasSession) return Boolean(window.StashboxV2Session.hasSession());
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  }

  function installStyles() {
    if (document.getElementById('v2ProfileOverlayStyles')) return;
    const style = document.createElement('style');
    style.id = 'v2ProfileOverlayStyles';
    style.textContent = `
      .v2-profile-browser-overlay {
        position: fixed;
        inset: 0;
        z-index: 50000;
        background: #050607;
      }
      .v2-profile-browser-overlay iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #050607;
      }
      .v2-profile-browser-back {
        position: fixed;
        top: max(10px, env(safe-area-inset-top));
        left: max(12px, env(safe-area-inset-left));
        z-index: 50002;
        width: 42px;
        height: 42px;
        border: 0;
        padding: 0;
        background: transparent;
        color: #fff;
        font: 400 38px/38px Arial, sans-serif;
        text-align: center;
        cursor: pointer;
        opacity: .92;
      }
      .v2-profile-browser-back:hover,
      .v2-profile-browser-back:focus-visible {
        opacity: 1;
        outline: none;
      }
      body.v2-profile-browser-open { overflow: hidden !important; }
    `;
    document.head.appendChild(style);
  }

  function pauseRadioForOfflinePlayback() {
    document.querySelectorAll('#v2App [data-player] audio').forEach(audio => {
      try { audio.pause(); } catch (_) {}
    });
  }

  function runProfileQueue() {
    const script = document.createElement('script');
    script.src = `/radio/attempt2/v2-profile-queue.js?v=20260822-profilequeue-live-${Date.now()}`;
    script.async = true;
    script.dataset.v2ProfileQueueReload = 'true';
    document.head.appendChild(script);
    script.addEventListener('load', () => script.remove(), { once: true });
    script.addEventListener('error', () => script.remove(), { once: true });
  }

  function closeProfile() {
    if (!overlay) return;
    const previous = lastTrigger;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('v2-profile-browser-open');
    try { previous?.focus?.({ preventScroll: true }); } catch (_) {}
  }

  function openProfile(trigger = null) {
    if (!hasSession()) return false;
    installStyles();
    if (overlay?.isConnected) return true;

    lastTrigger = trigger instanceof HTMLElement ? trigger : null;
    const shell = document.createElement('section');
    shell.className = 'v2-profile-browser-overlay';
    shell.setAttribute('aria-label', 'Stashbox Radio profile');
    shell.innerHTML = `
      <iframe src="${PROFILE_URL}" title="Stashbox Radio profile" allow="autoplay; clipboard-write"></iframe>
      <button type="button" class="v2-profile-browser-back" aria-label="Back to player" title="Back to player">&lt;</button>
    `;
    shell.querySelector('.v2-profile-browser-back')?.addEventListener('click', closeProfile);
    document.body.appendChild(shell);
    document.body.classList.add('v2-profile-browser-open');
    overlay = shell;
    return true;
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const entry = target.closest('[data-desktop-login], #v2App .v2-header-login');
    if (!entry || !hasSession()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openProfile(entry);
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay) closeProfile();
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'stashbox:profile-close') {
      closeProfile();
      return;
    }
    if (event.data.type === 'stashbox:offline-play-start') {
      pauseRadioForOfflinePlayback();
      return;
    }
    if (event.data.type === 'stashbox:profile-play') {
      closeProfile();
      runProfileQueue();
    }
  });

  window.StashboxV2ProfileOverlay = Object.freeze({
    open: openProfile,
    close: closeProfile,
    active: () => Boolean(overlay?.isConnected)
  });
})();