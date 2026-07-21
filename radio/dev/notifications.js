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
    .catch((error) => {
      window.__restoreStashboxMutationObserver?.();
      console.error('[accounts] DEV account bootstrap failed', error);
    })
    .finally(() => Promise.all([
      loadScript('./notification-account-sync.js'),
      loadScript('./notifications-core.js')
    ]).catch((error) => console.error('[notifications] DEV notification client failed', error)));
})();