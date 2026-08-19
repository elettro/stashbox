(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const VEC_API_ORIGIN = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com';

  const readAccessToken = () => {
    try {
      return String(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.accessToken || '');
    } catch (_) {
      return '';
    }
  };

  const isProtectedVecRequest = input => {
    try {
      const value = input instanceof Request ? input.url : String(input || '');
      const url = new URL(value, window.location.href);
      if (url.origin !== VEC_API_ORIGIN) return false;
      return url.pathname.includes('/dev/radio/visuals/') || url.pathname.includes('/dev/radio/vec/');
    } catch (_) {
      return false;
    }
  };

  const installAuthenticatedVecFetch = () => {
    if (window.__stashboxV2AuthenticatedVecFetchInstalled) return;
    window.__stashboxV2AuthenticatedVecFetchInstalled = true;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      if (!isProtectedVecRequest(input)) return nativeFetch(input, init);

      const token = readAccessToken();
      if (!token) return nativeFetch(input, init);

      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

      return nativeFetch(input, { ...init, headers });
    };
  };

  const loadFastLoginPath = () => {
    if (window.StashboxV2LoginFastPath || document.querySelector('script[data-v2-login-fast-path]')) return;
    const script = document.createElement('script');
    script.src = '/radio/dev/v2/v2-login-fast-path.js?v=20260819-fastlogin2';
    script.defer = true;
    script.dataset.v2LoginFastPath = 'true';
    document.head.appendChild(script);
  };

  const refreshVecRuntime = () => {
    window.setTimeout(() => {
      try { window.StashboxMainVecVideoWatchdog?.refresh?.(); } catch (_) {}
      try { window.StashboxMobileVecMotionRuntime?.refresh?.(); } catch (_) {}
      try { window.StashboxMobileVecMotionOverride?.refresh?.(); } catch (_) {}
    }, 120);
  };

  installAuthenticatedVecFetch();
  loadFastLoginPath();

  const finishSuccessfulLogin = () => {
    const overlay = document.querySelector('.v2-auth-overlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      window.setTimeout(() => { overlay.hidden = true; }, 120);
    }
    document.body.classList.remove('v2-auth-open');

    const loginButton = document.querySelector('.v2-header-login');
    if (loginButton) loginButton.textContent = 'Account';

    const detail = { reason: 'login-complete', loggedIn: true, refreshedAt: Date.now() };
    window.dispatchEvent(new CustomEvent('stashbox:v2-session-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-ready', { detail }));
    refreshVecRuntime();
  };

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-v2-auth-form="login"]');
    if (!form) return;

    const previousToken = readAccessToken();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const currentToken = readAccessToken();
      if (currentToken && currentToken !== previousToken) {
        window.clearInterval(timer);
        finishSuccessfulLogin();
        return;
      }
      if (attempts >= 90) window.clearInterval(timer);
    }, 100);
  }, true);

  window.addEventListener('stashbox:v2-auth-changed', refreshVecRuntime);
  window.addEventListener('stashbox:v2-session-changed', refreshVecRuntime);

  const install = () => {
    const actions = document.querySelector('#v2App .v2-header-actions');
    if (!actions) return false;

    actions.querySelectorAll('.stashbox-action-row').forEach(row => {
      if (!row.children.length) row.remove();
    });

    let button = actions.querySelector('.v2-header-login');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2-header-login';
      actions.appendChild(button);
    }

    button.dataset.v2AuthOpen = 'login';
    button.textContent = readAccessToken() ? 'Account' : 'Log In';
    button.setAttribute('aria-label', readAccessToken() ? 'Open your Stashbox Radio account' : 'Log in to Stashbox Radio');
    button.removeAttribute('hidden');
    return true;
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
