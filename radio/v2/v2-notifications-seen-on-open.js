(() => {
  'use strict';

  let observer = null;
  let scheduled = false;
  let marking = false;

  const markVisibleNotificationsSeen = () => {
    scheduled = false;
    if (marking) return;

    const overlay = document.querySelector('.v2-notification-overlay');
    if (!overlay || overlay.hidden || !overlay.classList.contains('is-open')) return;

    const badge = document.querySelector('#v2App .v2-notifications-trigger .v2-notification-count:not([hidden])');
    const unreadRow = overlay.querySelector('.v2-notification-row.is-unread');
    if (!badge && !unreadRow) return;

    const markAll = overlay.querySelector('[data-v2-mark-all]');
    if (!markAll) return;

    marking = true;
    markAll.click();
    window.setTimeout(() => { marking = false; }, 0);
  };

  const scheduleMarkSeen = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(markVisibleNotificationsSeen);
  };

  const install = () => {
    const overlay = document.querySelector('.v2-notification-overlay');
    if (!overlay) return false;

    observer?.disconnect();
    observer = new MutationObserver(scheduleMarkSeen);
    observer.observe(overlay, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
      childList: true,
      subtree: true
    });

    scheduleMarkSeen();
    return true;
  };

  if (install()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
