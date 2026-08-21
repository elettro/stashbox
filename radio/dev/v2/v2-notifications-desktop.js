(() => {
  'use strict';

  const DESKTOP_QUERY = window.matchMedia('(min-width: 700px)');
  const CLOSE_MS = 300;
  let closeTimer = 0;

  const getUi = () => ({
    bell: document.querySelector('[data-desktop-notifications]') || document.querySelector('#v2App .v2-notifications-trigger'),
    overlay: document.querySelector('.v2-notification-overlay'),
    sheet: document.querySelector('.v2-notification-sheet')
  });

  const positionSheet = () => {
    if (!DESKTOP_QUERY.matches) return;
    const { bell, overlay } = getUi();
    if (!bell || !overlay) return;

    const rect = bell.getBoundingClientRect();
    const top = Math.round(rect.bottom + 9);
    const right = Math.max(16, Math.round(window.innerWidth - rect.right));

    overlay.style.setProperty('--v2-notification-anchor-top', `${top}px`);
    overlay.style.setProperty('--v2-notification-anchor-right', `${right}px`);
  };

  const isOpen = () => {
    const { overlay } = getUi();
    return Boolean(overlay && !overlay.hidden && overlay.classList.contains('is-open'));
  };

  const close = () => {
    const { overlay } = getUi();
    if (!overlay) return false;

    window.clearTimeout(closeTimer);
    overlay.classList.remove('is-open');
    document.body.classList.remove('v2-notifications-open');
    closeTimer = window.setTimeout(() => {
      if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    }, CLOSE_MS);
    return true;
  };

  document.addEventListener('click', event => {
    if (!DESKTOP_QUERY.matches) return;

    const bell = event.target.closest('#v2App .v2-notifications-trigger');
    if (bell) {
      if (isOpen()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }

      // The notification-sheet runtime owns opening and refreshing the feed.
      // This desktop layer only anchors the sheet to the visible persistent bell.
      positionSheet();
      return;
    }

    if (!isOpen()) return;
    const { sheet } = getUi();
    if (sheet?.contains(event.target)) return;
    close();
  }, true);

  document.addEventListener('keydown', event => {
    if (DESKTOP_QUERY.matches && event.key === 'Escape' && isOpen()) close();
  });

  window.addEventListener('resize', () => {
    if (DESKTOP_QUERY.matches && isOpen()) positionSheet();
  }, { passive: true });

  DESKTOP_QUERY.addEventListener?.('change', () => {
    const { overlay } = getUi();
    if (!overlay) return;
    overlay.style.removeProperty('--v2-notification-anchor-top');
    overlay.style.removeProperty('--v2-notification-anchor-right');
  });
})();
