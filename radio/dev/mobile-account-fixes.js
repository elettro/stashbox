(() => {
  const mobileQuery = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 900px)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const DEV_RADIO_URL = 'https://stashbox.com/radio/dev/';
  const STYLE_ID = 'stashbox-mobile-account-fixes';
  let redirecting = false;
  let wasLoggedIn = hasSession();
  let loginTransitionHandled = false;
  let scanFrame = 0;

  document.documentElement.classList.add('sbr-mobile-account-fixes');

  function hasSession() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) || 'null');
      return Boolean(tokens?.accessToken && tokens?.refreshToken);
    } catch (_) {
      return false;
    }
  }

  function initialsFor(value) {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        html.sbr-mobile-account-fixes .radio-account-actions {
          position: relative !important;
          z-index: 40 !important;
          overflow: visible !important;
        }

        html.sbr-mobile-account-fixes .radio-account-user-button {
          position: relative !important;
          z-index: 41 !important;
          display: inline-grid !important;
          place-items: center !important;
          width: 50px !important;
          min-width: 50px !important;
          height: 50px !important;
          min-height: 50px !important;
          padding: 0 !important;
          border-radius: 999px !important;
          font-size: 14px !important;
          font-weight: 950 !important;
          letter-spacing: .06em !important;
          line-height: 1 !important;
          pointer-events: auto !important;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240, 165, 0, .2) !important;
        }

        html.sbr-mobile-account-fixes .radio-account-user-button::after {
          content: '';
          position: absolute;
          inset: -5px;
          border-radius: 999px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function fullNameFromButton(button) {
    const stored = String(button.dataset.accountFullName || '').trim();
    if (stored && stored.length > 2) return stored;

    const text = String(button.textContent || '').trim();
    if (text.length > 2) return text;

    const label = String(button.getAttribute('aria-label') || '');
    const match = label.match(/for\s+(.+)$/i);
    return String(match?.[1] || '').trim() || 'Listener';
  }

  function syncInitials() {
    document.querySelectorAll('.radio-account-user-button').forEach((button) => {
      const fullName = fullNameFromButton(button);
      if (fullName.length > 2) button.dataset.accountFullName = fullName;
      const initials = initialsFor(fullName);
      if (button.textContent !== initials) button.textContent = initials;
      button.setAttribute('aria-label', `Open My Account for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
    });
  }

  function closeLoginSplash() {
    const overlay = document.querySelector('.radio-account-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    document.querySelector('.radio-account-user-button')?.focus?.({ preventScroll: true });
  }

  function syncLoginTransition() {
    const loggedIn = hasSession() && Boolean(document.querySelector('.radio-account-user-button'));
    if (!wasLoggedIn && loggedIn && !loginTransitionHandled) {
      loginTransitionHandled = true;
      closeLoginSplash();
    }
    if (!loggedIn) loginTransitionHandled = false;
    wasLoggedIn = loggedIn;
  }

  function clearSession() {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
  }

  function redirectToRadio() {
    window.location.assign(DEV_RADIO_URL);
    window.setTimeout(() => {
      if (window.location.href === DEV_RADIO_URL) window.location.reload();
    }, 120);
  }

  function handleLogout(event) {
    const button = event.target.closest?.('[data-action="logout"], [data-account-logout]');
    if (!button || redirecting) return;

    redirecting = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    clearSession();
    try {
      const request = window.StashboxRadioAccount?.logout?.();
      request?.catch?.(() => {});
    } catch (_) {}

    document.querySelector('.radio-account-overlay')?.setAttribute('hidden', '');
    document.body.style.overflow = '';
    redirectToRadio();
  }

  function handleProfileTap(event) {
    const button = event.target.closest?.('.radio-account-user-button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.StashboxRadioAccount?.open?.('account');
  }

  function scan() {
    injectStyles();
    syncInitials();
    syncLoginTransition();
  }

  function queueScan() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scan();
    });
  }

  document.addEventListener('click', handleLogout, true);
  document.addEventListener('click', handleProfileTap, true);

  injectStyles();
  scan();

  new MutationObserver(queueScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-label']
  });
})();
