(() => {
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // DEV safety rollback: keep the radio and notification drawer available while
  // the account header observer is repaired. Production is not affected.
  Promise.all([
    loadScript('./notifications-core.js')
  ]).catch((error) => console.error('[notifications] DEV notification client failed', error));
})();
