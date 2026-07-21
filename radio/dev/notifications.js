(() => {
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  loadScript('./account-observer-guard.js')
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
      loadScript('./notification-account-sync.js'),
      loadScript('./notifications-core.js')
    ]).catch((error) => console.error('[notifications] DEV notification client failed', error)));
})();
