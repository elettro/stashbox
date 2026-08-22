(() => {
  'use strict';

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const VEC_API_ORIGIN = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const FAST_LOGIN_SRC = '/radio/v2-login-fast-path.js?v=20260819-fastlogin2';
  let fastLoginPromise = null;

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
    if (window.StashboxV2LoginFastPath) {
      return Promise.resolve(window.StashboxV2LoginFastPath);
    }
    if (fastLoginPromise) return fastLoginPromise;

    let script = document.querySelector('script[data-v2-login-fast-path]');
    fastLoginPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if (window.StashboxV2LoginFastPath) {
          resolve(window.StashboxV2LoginFastPath);
          return;
        }
        reject(new Error('Fast login module loaded without initializing.'));
      };
      const fail = () => reject(new Error('Fast login module failed to load.'));

      if (!script) {
        script = document.createElement('script');
        script.src = FAST_LOGIN_SRC;
        script.async = false;
        script.dataset.v2LoginFastPath = 'true';
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });
        document.head.appendChild(script);
        return;
      }

      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', fail, { once: true });
    }).catch(error => {
      fastLoginPromise = null;
      throw error;
    });

    return fastLoginPromise;
  };

  const showFastLoginLoadError = form => {
    const message = form.querySelector('[data-v2-auth-message]');
    if (!message) return;
    message.textContent = 'Login is still starting. Please try again.';
    message.classList.add('is-error');
  };

  const refreshVecRuntime = () => {
    window.setTimeout(() => {
      try { window.StashboxMainVecVideoWatchdog?.refresh?.(); } catch (_) {}
      try { window.StashboxMobileVecMotionRuntime?.refresh?.(); } catch (_) {}
      try { window.StashboxMobileVecMotionOverride?.refresh?.(); } catch (_) {}
    }, 120);
  };

  installAuthenticatedVecFetch();
  loadFastLoginPath().catch(() => {});

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

    // On a cold mobile page the login form can be submitted before the fast-login
    // module finishes downloading. Hold that first submit for the module, then
    // replay it through the fast handler instead of the legacy /radio/me path.
    if (!window.StashboxV2LoginFastPath) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (form.dataset.v2FastLoginQueued === 'true') return;

      form.dataset.v2FastLoginQueued = 'true';
      loadFastLoginPath()
        .then(() => {
          delete form.dataset.v2FastLoginQueued;
          if (!form.isConnected) return;
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        })
        .catch(() => {
          delete form.dataset.v2FastLoginQueued;
          showFastLoginLoadError(form);
        });
      return;
    }

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
