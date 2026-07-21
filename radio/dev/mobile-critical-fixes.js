(() => {
  if (window.__stashboxMobileCriticalFixesLoaded) return;
  window.__stashboxMobileCriticalFixesLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const DEV_RADIO_PATH = '/radio/dev/';
  const STYLE_ID = 'stashbox-mobile-critical-fixes-style';
  let scanFrame = 0;
  let topSnapTimer = 0;
  let logoutStarted = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        .radio-account-user-button,
        [data-account-menu-toggle] {
          display: inline-grid !important;
          place-items: center !important;
          width: 52px !important;
          min-width: 52px !important;
          max-width: 52px !important;
          height: 52px !important;
          min-height: 52px !important;
          padding: 0 !important;
          overflow: hidden !important;
          border-radius: 999px !important;
          font: 950 14px/1 Karla, Arial, sans-serif !important;
          letter-spacing: .055em !important;
          color: #fff !important;
          text-align: center !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          touch-action: manipulation !important;
        }

        .radio-account-user-button::before,
        [data-account-menu-toggle]::before,
        .radio-account-user-button::after,
        [data-account-menu-toggle]::after {
          content: none !important;
          display: none !important;
        }

        .song-card .song-artwork {
          pointer-events: auto !important;
          touch-action: manipulation !important;
          cursor: pointer !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initialsFor(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function resolveFullName(button) {
    const accountName = String(window.StashboxRadioAccount?.getAccount?.()?.display_name || '').trim();
    if (accountName) return accountName;

    const storedName = String(button.dataset.accountFullName || '').trim();
    if (storedName && storedName.length > 2) return storedName;

    const titleName = String(button.getAttribute('title') || '').replace(/^My Account:\s*/i, '').trim();
    if (titleName.length > 2) return titleName;

    const ariaName = String(button.getAttribute('aria-label') || '').match(/(?:for|menu for)\s+(.+)$/i)?.[1]?.trim();
    if (ariaName && ariaName.length > 2) return ariaName;

    const currentText = String(button.textContent || '').trim();
    if (currentText.length > 2) return currentText;
    return 'Listener';
  }

  function forceInitials() {
    document.querySelectorAll('.radio-account-user-button, [data-account-menu-toggle]').forEach((button) => {
      const fullName = resolveFullName(button);
      const initials = initialsFor(fullName);
      button.dataset.accountFullName = fullName;
      button.dataset.accountInitials = initials;
      button.textContent = initials;
      button.style.setProperty('font-size', '14px', 'important');
      button.style.setProperty('color', '#fff', 'important');
      button.style.setProperty('line-height', '1', 'important');
      button.style.setProperty('text-indent', '0', 'important');
      button.setAttribute('aria-label', `Open account menu for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
    });
  }

  function clearMobileSession() {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
  }

  function closeAccountUi() {
    const overlay = document.querySelector('.radio-account-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      overlay.style.pointerEvents = 'none';
    }
    document.querySelectorAll('.radio-account-menu').forEach(menu => {
      menu.hidden = true;
      menu.setAttribute('hidden', '');
    });
    document.body.style.overflow = '';
  }

  function redirectAfterLogout() {
    const separator = DEV_RADIO_PATH.includes('?') ? '&' : '?';
    window.location.replace(`${DEV_RADIO_PATH}${separator}logged_out=${Date.now()}`);
  }

  function handleMobileLogout(event) {
    const button = event.target?.closest?.('[data-account-logout], [data-action="logout"]');
    if (!button || logoutStarted) return;

    logoutStarted = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    clearMobileSession();
    closeAccountUi();

    try {
      const backgroundRequest = window.StashboxRadioAccount?.logout?.();
      backgroundRequest?.catch?.(() => {});
    } catch (_) {}

    redirectAfterLogout();
  }

  function cleanLogoutQuery() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('logged_out')) return;
      url.searchParams.delete('logged_out');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}` || DEV_RADIO_PATH);
    } catch (_) {}
  }

  function scrollPageToAbsoluteTop() {
    if (topSnapTimer) window.clearTimeout(topSnapTimer);

    const scrollTarget = document.scrollingElement || document.documentElement;
    try {
      scrollTarget?.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, 0);
    }

    topSnapTimer = window.setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      topSnapTimer = 0;
    }, 520);
  }

  function artworkCardFromEvent(event) {
    return event.target?.closest?.('.song-card .song-artwork')?.closest?.('.song-card') || null;
  }

  function selectableSongCardFromEvent(event) {
    const card = event.target?.closest?.('.song-card');
    if (!card) return null;
    if (event.target?.closest?.('.like-button, .share-button, .song-actions')) return null;
    return card;
  }

  function handleArtworkPointerUp(event) {
    const card = artworkCardFromEvent(event);
    if (!card) return;

    window.setTimeout(() => {
      if (!card.classList.contains('active')) card.click();
      window.setTimeout(scrollPageToAbsoluteTop, 70);
    }, 140);
  }

  function handleSongCardClick(event) {
    if (!selectableSongCardFromEvent(event)) return;
    window.setTimeout(scrollPageToAbsoluteTop, 90);
  }

  function scan() {
    injectStyles();
    forceInitials();
  }

  function queueScan() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scan();
    });
  }

  document.addEventListener('pointerdown', handleMobileLogout, true);
  document.addEventListener('touchend', handleMobileLogout, true);
  document.addEventListener('click', handleMobileLogout, true);
  document.addEventListener('pointerup', handleArtworkPointerUp, false);
  document.addEventListener('click', handleSongCardClick, false);

  cleanLogoutQuery();
  scan();
  new MutationObserver(queueScan).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'title', 'aria-label', 'aria-expanded']
  });

  window.setInterval(forceInitials, 100);
})();
