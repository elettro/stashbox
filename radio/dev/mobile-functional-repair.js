(() => {
  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const DEV_RADIO_PATH = '/radio/dev/';
  const STYLE_ID = 'stashbox-mobile-functional-repair';
  let loginAttemptPending = false;
  let logoutStarted = false;
  let scanFrame = 0;

  document.documentElement.classList.add('sbr-mobile-functional-repair');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        html.sbr-mobile-functional-repair .radio-account-overlay[hidden] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        html.sbr-mobile-functional-repair .radio-account-actions {
          position: relative !important;
          z-index: 100 !important;
          overflow: visible !important;
        }

        html.sbr-mobile-functional-repair .radio-account-user-button {
          position: relative !important;
          z-index: 101 !important;
          display: inline-grid !important;
          place-items: center !important;
          width: 52px !important;
          min-width: 52px !important;
          height: 52px !important;
          min-height: 52px !important;
          max-width: 52px !important;
          padding: 0 !important;
          overflow: visible !important;
          border-radius: 999px !important;
          font-size: 14px !important;
          font-weight: 950 !important;
          line-height: 1 !important;
          letter-spacing: .055em !important;
          text-align: center !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240, 165, 0, .24) !important;
        }

        html.sbr-mobile-functional-repair .radio-account-user-button::after {
          content: '';
          position: absolute;
          inset: -7px;
          border-radius: 999px;
        }

        html.sbr-mobile-functional-repair .player,
        html.sbr-mobile-functional-repair .player-bar,
        html.sbr-mobile-functional-repair .player-controls,
        html.sbr-mobile-functional-repair .player-controls-layout,
        html.sbr-mobile-functional-repair .player-mobile-main-controls,
        html.sbr-mobile-functional-repair .player-mobile-video-actions,
        html.sbr-mobile-functional-repair .player-pill,
        html.sbr-mobile-functional-repair .like-button,
        html.sbr-mobile-functional-repair .song-card,
        html.sbr-mobile-functional-repair .song-artwork,
        html.sbr-mobile-functional-repair .song-play {
          pointer-events: auto !important;
        }

        html.sbr-mobile-functional-repair .player-bar,
        html.sbr-mobile-functional-repair .player-mobile-main-controls,
        html.sbr-mobile-functional-repair .player-mobile-video-actions {
          position: relative !important;
          z-index: 20 !important;
          touch-action: manipulation !important;
        }

        html.sbr-mobile-functional-repair .song-card,
        html.sbr-mobile-functional-repair .song-artwork,
        html.sbr-mobile-functional-repair .song-play {
          position: relative;
          z-index: 2;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240, 165, 0, .18);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function hasSession() {
    const tokens = readTokens();
    return Boolean(tokens?.accessToken && tokens?.refreshToken);
  }

  function initialsFor(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function accountDisplayName(button) {
    const accountName = String(window.StashboxRadioAccount?.getAccount?.()?.display_name || '').trim();
    if (accountName) return accountName;
    const storedName = String(button?.dataset?.accountFullName || '').trim();
    if (storedName && storedName.length > 2) return storedName;
    const text = String(button?.textContent || '').trim();
    if (text.length > 2) return text;
    const title = String(button?.getAttribute('title') || '');
    const titleName = title.replace(/^My Account:\s*/i, '').trim();
    if (titleName) return titleName;
    return 'Listener';
  }

  function syncProfileButton() {
    document.querySelectorAll('.radio-account-user-button').forEach(button => {
      const fullName = accountDisplayName(button);
      const initials = initialsFor(fullName);
      button.dataset.accountFullName = fullName;
      if (button.textContent !== initials) button.textContent = initials;
      button.setAttribute('aria-label', `Open account menu for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
    });
  }

  function closeAccountOverlay() {
    const overlay = document.querySelector('.radio-account-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('hidden', '');
    overlay.inert = true;
    overlay.style.pointerEvents = 'none';
    document.body.style.overflow = '';
  }

  function syncOverlayState() {
    const overlay = document.querySelector('.radio-account-overlay');
    if (!overlay) return;
    if (overlay.hidden || overlay.hasAttribute('hidden')) {
      overlay.inert = true;
      overlay.style.pointerEvents = 'none';
    } else {
      overlay.inert = false;
      overlay.style.pointerEvents = 'auto';
    }

    if (loginAttemptPending && hasSession() && document.querySelector('.radio-account-user-button')) {
      loginAttemptPending = false;
      closeAccountOverlay();
    }

    const notificationOpen = Boolean(document.querySelector('.sbr-notification-drawer:not([hidden])'));
    const accountOpen = Boolean(document.querySelector('.radio-account-overlay:not([hidden])'));
    if (!notificationOpen && !accountOpen) document.body.style.overflow = '';
  }

  function clearSessionStorage() {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
  }

  function redirectAfterLogout() {
    const url = `${DEV_RADIO_PATH}?logged_out=${Date.now()}`;
    window.location.replace(url);
  }

  function performLogout(event) {
    const button = event.target?.closest?.('[data-action="logout"], [data-account-logout]');
    if (!button || logoutStarted) return false;

    logoutStarted = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    clearSessionStorage();
    closeAccountOverlay();

    try {
      const request = window.StashboxRadioAccount?.logout?.();
      request?.catch?.(() => {});
    } catch (_) {}

    redirectAfterLogout();
    return true;
  }

  function handleLoginSubmit(event) {
    const form = event.target?.closest?.('form[data-form="login"]');
    if (!form) return;
    loginAttemptPending = true;
  }

  function handleSongArtworkClick(event) {
    const artwork = event.target?.closest?.('.song-card .song-artwork');
    if (!artwork) return;
    const card = artwork.closest('.song-card');
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    card.click();
    window.setTimeout(() => {
      const player = document.querySelector('.player');
      player?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function cleanLogoutQuery() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('logged_out')) return;
    url.searchParams.delete('logged_out');
    const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState(null, '', cleanUrl || DEV_RADIO_PATH);
  }

  function scan() {
    injectStyles();
    syncProfileButton();
    syncOverlayState();
  }

  function queueScan() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scan();
    });
  }

  document.addEventListener('submit', handleLoginSubmit, true);
  document.addEventListener('pointerup', performLogout, true);
  document.addEventListener('click', performLogout, true);
  document.addEventListener('click', handleSongArtworkClick, true);

  cleanLogoutQuery();
  scan();

  new MutationObserver(queueScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-expanded', 'title']
  });

  window.setInterval(scan, 500);
})();
