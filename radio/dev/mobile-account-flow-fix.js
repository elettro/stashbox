(() => {
  if (window.__stashboxMobileAccountFlowFixLoaded) return;
  window.__stashboxMobileAccountFlowFixLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const STYLE_ID = 'stashbox-mobile-account-flow-fix-style';
  let loginPending = false;
  let closeLockUntil = 0;
  let observerFrame = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        .radio-account-modal-header {
          position: relative !important;
          z-index: 4 !important;
        }

        .radio-account-close {
          position: relative !important;
          z-index: 10 !important;
          width: 58px !important;
          min-width: 58px !important;
          height: 58px !important;
          min-height: 58px !important;
          padding: 0 !important;
          pointer-events: auto !important;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240, 165, 0, 0.28) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function accountOverlay() {
    return document.querySelector('.radio-account-overlay');
  }

  function isOverlayOpen() {
    const overlay = accountOverlay();
    return Boolean(overlay && !overlay.hidden && getComputedStyle(overlay).display !== 'none');
  }

  function scrollAbsoluteTop() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, 0);
    }

    window.setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 420);
  }

  function closeAccountOverlay({ returnToTop = false } = {}) {
    const overlay = accountOverlay();
    if (!overlay) return false;

    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    const menu = document.querySelector('.radio-account-menu');
    if (menu) menu.hidden = true;
    document.querySelector('[data-account-menu-toggle]')?.setAttribute('aria-expanded', 'false');

    if (returnToTop) scrollAbsoluteTop();
    return true;
  }

  function markLoginPending(event) {
    const form = event.target?.closest?.('form[data-form="login"]');
    if (!form) return;
    loginPending = true;
  }

  function handleCloseGesture(event) {
    const closeButton = event.target?.closest?.('.radio-account-close');
    if (!closeButton) return;

    const now = performance.now();
    if (now < closeLockUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    closeLockUntil = now + 700;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeAccountOverlay({ returnToTop: false });
  }

  function checkPostLoginState() {
    if (!loginPending) return;
    const loggedInButton = document.querySelector('.radio-account-user-button, [data-account-menu-toggle]');
    if (!loggedInButton) return;

    loginPending = false;
    closeAccountOverlay({ returnToTop: true });
  }

  function scheduleCheck() {
    if (observerFrame) return;
    observerFrame = requestAnimationFrame(() => {
      observerFrame = 0;
      checkPostLoginState();
    });
  }

  injectStyles();

  document.addEventListener('submit', markLoginPending, true);
  document.addEventListener('pointerup', handleCloseGesture, true);
  document.addEventListener('touchend', handleCloseGesture, { capture: true, passive: false });
  document.addEventListener('click', handleCloseGesture, true);

  new MutationObserver(scheduleCheck).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-expanded']
  });

  window.addEventListener('pageshow', () => {
    if (!isOverlayOpen()) document.body.style.overflow = '';
  });
})();
