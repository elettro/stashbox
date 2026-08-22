(() => {
  'use strict';

  const MOBILE_QUERY = window.matchMedia('(max-width: 699px)');
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  let loginWatch = 0;
  let topLockFrame = 0;
  let topLockCleanup = 0;

  const hasSession = () => {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return Boolean(tokens?.accessToken);
    } catch (_) {
      return false;
    }
  };

  const resetToAbsoluteTop = () => {
    if (!MOBILE_QUERY.matches) return;

    document.activeElement?.blur?.();

    const scrollingElement = document.scrollingElement || document.documentElement;
    if (typeof scrollingElement.scrollTo === 'function') scrollingElement.scrollTo(0, 0);
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const app = document.getElementById('v2App');
    if (app) {
      app.scrollTop = 0;
      if (typeof app.scrollTo === 'function') app.scrollTo(0, 0);
    }

    window.scrollTo(0, 0);
  };

  const lockPageAtTop = () => {
    if (!MOBILE_QUERY.matches) return;

    window.cancelAnimationFrame(topLockFrame);
    window.clearTimeout(topLockCleanup);

    try { history.scrollRestoration = 'manual'; }
    catch (_) {}

    const startedAt = performance.now();
    const tick = now => {
      resetToAbsoluteTop();
      if (now - startedAt < 3200) topLockFrame = window.requestAnimationFrame(tick);
    };

    topLockFrame = window.requestAnimationFrame(tick);

    const settleTimes = [0, 80, 180, 320, 500, 680, 850, 1050, 1250, 1500, 1850, 2250, 2750, 3300];
    settleTimes.forEach(delay => window.setTimeout(resetToAbsoluteTop, delay));

    const viewport = window.visualViewport;
    const keepTopDuringViewportChange = () => resetToAbsoluteTop();
    viewport?.addEventListener('resize', keepTopDuringViewportChange);
    viewport?.addEventListener('scroll', keepTopDuringViewportChange);

    topLockCleanup = window.setTimeout(() => {
      window.cancelAnimationFrame(topLockFrame);
      viewport?.removeEventListener('resize', keepTopDuringViewportChange);
      viewport?.removeEventListener('scroll', keepTopDuringViewportChange);
      resetToAbsoluteTop();
      window.requestAnimationFrame(resetToAbsoluteTop);
    }, 3500);
  };

  const watchSuccessfulLogin = () => {
    if (!MOBILE_QUERY.matches || hasSession()) return;

    window.clearInterval(loginWatch);
    let attempts = 0;
    loginWatch = window.setInterval(() => {
      attempts += 1;
      if (hasSession()) {
        window.clearInterval(loginWatch);
        lockPageAtTop();
        return;
      }
      if (attempts >= 180) window.clearInterval(loginWatch);
    }, 50);
  };

  document.addEventListener('submit', event => {
    if (!event.target.closest('[data-v2-auth-form="login"]')) return;
    watchSuccessfulLogin();
  }, true);
})();
