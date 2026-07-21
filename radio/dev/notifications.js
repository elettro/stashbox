(() => {
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const loadStyle = (href) => new Promise((resolve, reject) => {
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find((link) => link.href.includes('notifications-compact.css'));
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });

  loadScript('./account-config-ready.js?v=20260721-configready1')
    .then(() => loadScript('./account-observer-guard.js'))
    .then(() => loadScript('./account.js'))
    .then(() => {
      window.__restoreStashboxMutationObserver?.();
      return loadScript('./account-password-policy.js');
    })
    .then(() => loadScript('./password-visibility.js?v=20260720-eye2'))
    .then(() => loadScript('./account-preferences-ui.js?v=20260720-toggle1'))
    .then(() => loadScript('./account-dashboard-ui.js?v=20260721-dashboard1'))
    .then(() => loadScript('./account-following-stat.js?v=20260721-following-list1'))
    .then(() => loadScript('./account-playlist-ui.js?v=20260721-playlist-summary1'))
    .then(() => loadScript('./artist-queue-handoff.js?v=20260721-artistqueue1'))
    .then(() => loadScript('./account-song-lists.js?v=20260720-songlists2'))
    .then(() => loadScript('./artist-follow.js?v=20260721-follow2'))
    .then(() => loadScript('./artist-metadata-layout.js?v=20260721-layout2'))
    .then(() => loadScript('./account-name-launcher.js?v=20260720-account1'))
    .then(() => loadScript('./header-action-alignment.js?v=20260720-header1'))
    .catch((error) => {
      window.__restoreStashboxMutationObserver?.();
      console.error('[accounts] DEV account bootstrap failed', error);
    })
    .finally(() => Promise.all([
      loadStyle('./notifications-compact.css?v=20260721-compact3'),
      loadScript('./notification-account-sync.js'),
      loadScript('./notifications-core.js?v=20260721-compact3'),
      loadScript('./mobile-ux-phase2.js?v=20260721-phase2b'),
      loadScript('./mobile-notification-peek.js?v=20260721-peek2'),
      loadScript('./mobile-critical-fixes.js?v=20260721-critical4'),
      loadScript('./mobile-transport-controls.js?v=20260721-transport1')
    ]).catch((error) => console.error('[notifications] DEV notification client failed', error)));
})();
