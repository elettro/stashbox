(() => {
  'use strict';

  const MOBILE_QUERY = window.matchMedia('(max-width: 699px)');

  const getUi = () => ({
    header: document.querySelector('#v2App .v2-header'),
    bell: document.querySelector('#v2App .v2-notifications-trigger'),
    overlay: document.querySelector('.v2-notification-overlay')
  });

  const positionBelowHeader = () => {
    if (!MOBILE_QUERY.matches) return;
    const { header, overlay } = getUi();
    if (!header || !overlay) return;

    const top = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
    overlay.style.setProperty('--v2-notification-mobile-top', `${top}px`);
  };

  const isOpen = () => {
    const { overlay } = getUi();
    return Boolean(overlay && !overlay.hidden && overlay.classList.contains('is-open'));
  };

  const closeFromBell = () => {
    const { overlay } = getUi();
    if (!overlay) return;

    const backdrop = overlay.querySelector('[data-v2-notifications-close]');
    if (backdrop) {
      backdrop.click();
      return;
    }

    overlay.classList.remove('is-open');
    document.body.classList.remove('v2-notifications-open');
    window.setTimeout(() => {
      if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    }, 380);
  };

  document.addEventListener('click', event => {
    if (!MOBILE_QUERY.matches) return;

    const bell = event.target.closest('#v2App .v2-notifications-trigger');
    if (!bell) return;

    positionBelowHeader();

    if (!isOpen()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeFromBell();
  }, true);

  const reposition = () => {
    if (MOBILE_QUERY.matches && isOpen()) positionBelowHeader();
  };

  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('orientationchange', reposition, { passive: true });
  window.visualViewport?.addEventListener('resize', reposition, { passive: true });

  MOBILE_QUERY.addEventListener?.('change', () => {
    const { overlay } = getUi();
    if (!overlay) return;
    if (MOBILE_QUERY.matches) positionBelowHeader();
    else overlay.style.removeProperty('--v2-notification-mobile-top');
  });
})();
