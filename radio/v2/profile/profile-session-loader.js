(() => {
  'use strict';

  if (window.StashboxProfileSessionLoader) return;
  window.StashboxProfileSessionLoader = true;

  const scripts = [
    '/radio/v2/profile/profile.js?v=20260822-sessiongate1',
    '/radio/v2/profile/profile-real-stats.js?v=20260819-live-refresh1',
    '/radio/v2/profile/profile-streak-visual-fix.js?v=20260723-profile14',
    '/radio/v2/profile/profile-nav-cleanup.js?v=20260822-offlinepaused2',
    '/radio/v2/profile/profile-playlist-reorder.js?v=20260723-profile14',
    '/radio/v2/profile/profile-favorites-bulk.js?v=20260723-profile14',
    '/radio/v2/profile/profile-save-confirmation.js?v=20260723-profile14'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`Profile script failed to load: ${src}`)), { once: true });
      document.body.appendChild(script);
    });
  }

  async function restoreSession() {
    const session = window.StashboxV2Session;
    if (!session?.hasSession?.()) return;

    try {
      if (session.ready) await session.ready;
    } catch (_) {}

    try {
      await session.ensureFresh?.({ reason: 'profile-page-boot' });
    } catch (_) {
      // profile.js owns the final invalid-session/login decision.
    }
  }

  async function boot() {
    await restoreSession();
    for (const src of scripts) await loadScript(src);
  }

  boot().catch(error => {
    const app = document.getElementById('profileApp');
    if (!app) return;
    app.innerHTML = `<section class="profile-error"><strong>STASH<span>BOX</span></strong><h1>Profile could not load</h1><p>${String(error?.message || 'Unknown profile loading error').replace(/[<>]/g, '')}</p><a href="/radio/">Return to Radio</a></section>`;
  });
})();
