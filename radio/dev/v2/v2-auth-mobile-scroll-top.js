(() => {
  'use strict';

  const MOBILE_QUERY = window.matchMedia('(max-width: 699px)');
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  let loginWatch = 0;

  const hasSession = () => {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return Boolean(tokens?.accessToken);
    } catch (_) {
      return false;
    }
  };

  const resetToTop = () => {
    if (!MOBILE_QUERY.matches) return;

    document.activeElement?.blur?.();
    const scrollingElement = document.scrollingElement || document.documentElement;
    scrollingElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  const watchSuccessfulLogin = () => {
    if (!MOBILE_QUERY.matches || hasSession()) return;

    window.clearInterval(loginWatch);
    let attempts = 0;
    loginWatch = window.setInterval(() => {
      attempts += 1;
      if (hasSession()) {
        window.clearInterval(loginWatch);
        window.setTimeout(resetToTop, 680);
        window.setTimeout(resetToTop, 1050);
        return;
      }
      if (attempts >= 120) window.clearInterval(loginWatch);
    }, 100);
  };

  document.addEventListener('submit', event => {
    if (!event.target.closest('[data-v2-auth-form="login"]')) return;
    watchSuccessfulLogin();
  }, true);
})();
