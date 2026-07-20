(() => {
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  loadScript('./account.js')
    .then(() => loadScript('./account-password-policy.js'))
    .catch((error) => console.error('[accounts] DEV account bootstrap failed', error))
    .finally(() => Promise.all([
      loadScript('./notification-account-sync.js'),
      loadScript('./notifications-core.js')
    ]).catch((error) => console.error('[notifications] DEV notification client failed', error)));
})();
