(() => {
  'use strict';

  if (window.StashboxV2LoginFastPath) return;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const AUTH_CONFIG_URL = `${API_ROOT}/radio/auth/config`;
  const AUTH_GUARD_URL = `${API_ROOT}/radio/auth/guard`;
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_EMAIL_KEY = 'stashbox_radio_dev_pending_email';
  const PREWARM_TTL_MS = 30000;
  const nativeFetch = window.fetch.bind(window);

  let config = null;
  let configPromise = null;
  let guardPromise = null;
  let guardStartedAt = 0;
  let submitting = false;

  function timeoutFetch(input, init = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .catch(error => {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error('Login service took too long. Please try again.');
          timeoutError.code = 'LOGIN_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timer));
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { message: text }; }
    if (!response.ok) {
      const error = new Error(body.message || body.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = String(body.__type || body.code || '').split('#').pop();
      throw error;
    }
    return body;
  }

  function loadConfig() {
    if (config) return Promise.resolve(config);
    if (configPromise) return configPromise;
    configPromise = timeoutFetch(AUTH_CONFIG_URL, { cache: 'no-store' }, 5000)
      .then(parseResponse)
      .then(body => {
        config = body.auth || {};
        if (!config.enabled || !config.region || !config.app_client_id) {
          throw new Error('Listener login is not configured in DEV.');
        }
        return config;
      })
      .finally(() => { configPromise = null; });
    return configPromise;
  }

  function prewarmGuard(force = false) {
    const fresh = guardPromise && (Date.now() - guardStartedAt) < PREWARM_TTL_MS;
    if (fresh && !force) return guardPromise;
    guardStartedAt = Date.now();
    guardPromise = timeoutFetch(AUTH_GUARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login' })
    }, 5000).then(parseResponse);
    guardPromise.catch(() => {});
    return guardPromise;
  }

  function prewarm() {
    loadConfig().catch(() => {});
    prewarmGuard().catch(() => {});
  }

  async function cognitoLogin(authConfig, email, password) {
    return timeoutFetch(`https://cognito-idp.${authConfig.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: authConfig.app_client_id,
        AuthParameters: { USERNAME: email, PASSWORD: password }
      })
    }, 7500).then(parseResponse);
  }

  function writeTokens(authenticationResult) {
    if (!authenticationResult?.AccessToken) throw new Error('Login completed without an access token.');
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      accessToken: authenticationResult.AccessToken || '',
      idToken: authenticationResult.IdToken || '',
      refreshToken: authenticationResult.RefreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(authenticationResult.ExpiresIn || 3600)) * 1000
    }));
  }

  function setMessage(form, text, isError = false) {
    const message = form.querySelector('[data-v2-auth-message]');
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button, input').forEach(element => { element.disabled = busy; });
  }

  function friendlyError(error) {
    const code = String(error?.code || '');
    if (code.includes('NotAuthorized')) return 'Incorrect email or password.';
    if (code.includes('UserNotConfirmed')) return 'Verify your email before logging in.';
    if (error?.status === 429 || code === 'RATE_LIMITED') return 'Too many attempts. Wait and try again.';
    if (code === 'LOGIN_TIMEOUT') return 'Login service took too long. Please try again.';
    return error?.message || 'Login failed. Please try again.';
  }

  function finishLogin(email) {
    try { localStorage.setItem(PENDING_EMAIL_KEY, email); } catch (_) {}

    document.querySelectorAll('.v2-header-login').forEach(button => {
      button.textContent = 'Account';
      button.setAttribute('aria-label', 'Open your Stashbox Radio account');
    });

    const overlay = document.querySelector('.v2-auth-overlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
    }
    document.body.classList.remove('v2-auth-open');

    const detail = { reason: 'login-fast-path', loggedIn: true, refreshedAt: Date.now() };
    window.dispatchEvent(new CustomEvent('stashbox:v2-session-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-changed', { detail }));
    window.dispatchEvent(new CustomEvent('stashbox:v2-auth-ready', { detail }));
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.v2-header-login, [data-v2-auth-open="login"]')) prewarm();
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target.closest('[data-v2-auth-form="login"]')) prewarm();
  }, true);

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-v2-auth-form="login"]');
    if (!form) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (submitting) return;

    submitting = true;
    setBusy(form, true);
    setMessage(form, 'Logging in…');

    const values = Object.fromEntries(new FormData(form).entries());
    const email = String(values.email || '').trim().toLowerCase();
    const password = String(values.password || '');

    try {
      const authConfigPromise = loadConfig();
      const loginGuardPromise = prewarmGuard();
      const [authConfig] = await Promise.all([authConfigPromise, loginGuardPromise]);
      guardPromise = null;

      const result = await cognitoLogin(authConfig, email, password);
      writeTokens(result.AuthenticationResult);
      finishLogin(email);
    } catch (error) {
      guardPromise = null;
      setMessage(form, friendlyError(error), true);
      setBusy(form, false);
    } finally {
      submitting = false;
    }
  }, true);

  window.StashboxV2LoginFastPath = Object.freeze({ prewarm });
})();
