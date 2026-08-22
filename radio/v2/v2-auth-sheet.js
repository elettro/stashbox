(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const AUTH_CONFIG_URL = `${API_ROOT}/radio/auth/config`;
  const AUTH_GUARD_URL = `${API_ROOT}/radio/auth/guard`;
  const ME_URL = `${API_ROOT}/radio/me`;
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_EMAIL_KEY = 'stashbox_radio_dev_pending_email';
  const nativeFetch = window.fetch.bind(window);

  const state = {
    config: null,
    view: 'login',
    busy: false,
    account: null,
    overlay: null,
    content: null
  };

  const emailIcon = '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="m3 7 9 7 9-7"/></svg>';
  const lockIcon = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
  const userIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  const codeIcon = '<svg viewBox="0 0 24 24"><path d="M7 8h10M7 12h10M7 16h6"/><rect x="3" y="4" width="18" height="16" rx="3"/></svg>';
  const eyeIcon = '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const readTokens = () => {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); }
    catch (_) { return null; }
  };

  const writeTokens = authenticationResult => {
    if (!authenticationResult) return;
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        accessToken: authenticationResult.AccessToken || '',
        idToken: authenticationResult.IdToken || '',
        refreshToken: authenticationResult.RefreshToken || '',
        expiresAt: Date.now() + Math.max(60, Number(authenticationResult.ExpiresIn || 3600)) * 1000
      }));
    } catch (_) {}
  };

  const parseResponse = async response => {
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
  };

  const loadConfig = async () => {
    if (state.config) return state.config;
    const body = await nativeFetch(AUTH_CONFIG_URL, { cache: 'no-store' }).then(parseResponse);
    state.config = body.auth || {};
    if (!state.config.enabled || !state.config.region || !state.config.app_client_id) {
      throw new Error('Listener login is not configured in DEV.');
    }
    return state.config;
  };

  const authGuard = async action => nativeFetch(AUTH_GUARD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  }).then(parseResponse);

  const cognitoCall = async (operation, payload) => {
    const config = await loadConfig();
    return nativeFetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`
      },
      body: JSON.stringify(payload)
    }).then(parseResponse);
  };

  const friendlyError = error => {
    const code = String(error?.code || '');
    if (code.includes('NotAuthorized')) return 'Incorrect email or password.';
    if (code.includes('UserNotConfirmed')) return 'Verify your email before logging in.';
    if (code.includes('CodeMismatch')) return 'The confirmation code is incorrect.';
    if (code.includes('ExpiredCode')) return 'That code expired. Request a new one.';
    if (code.includes('UsernameExists')) return 'An account with this email already exists.';
    if (code.includes('InvalidPassword')) return 'Use at least 12 characters with uppercase, lowercase, number, and symbol.';
    if (error?.status === 429 || code === 'RATE_LIMITED') return 'Too many attempts. Wait and try again.';
    return error?.message || 'The request failed.';
  };

  const pendingEmail = () => {
    try { return localStorage.getItem(PENDING_EMAIL_KEY) || ''; }
    catch (_) { return ''; }
  };

  const savePendingEmail = email => {
    try { localStorage.setItem(PENDING_EMAIL_KEY, email); }
    catch (_) {}
  };

  const ensureUi = () => {
    if (state.overlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'v2-auth-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <button class="v2-auth-backdrop" type="button" data-v2-auth-close aria-label="Close login"></button>
      <section class="v2-auth-sheet" role="dialog" aria-modal="true" aria-labelledby="v2AuthTitle">
        <button class="v2-auth-close" type="button" data-v2-auth-close aria-label="Close">×</button>
        <div class="v2-auth-scroll">
          <div class="v2-auth-handle" aria-hidden="true"></div>
          <div class="v2-auth-brand">STASH<span>BOX</span></div>
          <div data-v2-auth-content></div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.content = overlay.querySelector('[data-v2-auth-content]');

    overlay.addEventListener('click', event => {
      if (event.target.closest('[data-v2-auth-close]')) close();
      const viewButton = event.target.closest('[data-v2-auth-view]');
      if (viewButton) render(viewButton.dataset.v2AuthView);
      const passwordToggle = event.target.closest('[data-v2-password-toggle]');
      if (passwordToggle) togglePassword(passwordToggle);
      if (event.target.closest('[data-v2-resend]')) resendCode();
    });

    state.content.addEventListener('submit', handleSubmit);
  };

  const input = ({ label, name, type = 'text', placeholder = '', icon = '', value = '', autocomplete = '', minlength = '' }) => `
    <label class="v2-auth-field">
      <span>${escapeHtml(label)}</span>
      <span class="v2-auth-input-shell">
        ${icon}
        <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ''} ${minlength ? `minlength="${escapeHtml(minlength)}"` : ''} required>
        ${type === 'password' ? `<button class="v2-auth-password-toggle" type="button" data-v2-password-toggle aria-label="Show password">${eyeIcon}</button>` : '<span></span>'}
      </span>
    </label>`;

  const message = '<p class="v2-auth-message" data-v2-auth-message aria-live="polite"></p>';

  const render = view => {
    ensureUi();
    state.view = view || 'login';
    const email = pendingEmail();

    if (state.view === 'signup') {
      state.content.innerHTML = `
        <h2 class="v2-auth-title" id="v2AuthTitle">Create New Account</h2>
        <p class="v2-auth-subtitle">Save favorites, build playlists, and continue listening across devices.</p>
        <form class="v2-auth-form" data-v2-auth-form="signup">
          ${input({ label: 'Display Name', name: 'display_name', placeholder: 'Your name', icon: userIcon, autocomplete: 'nickname' })}
          ${input({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@email.com', icon: emailIcon, value: email, autocomplete: 'email' })}
          ${input({ label: 'Password', name: 'password', type: 'password', placeholder: 'Create a password', icon: lockIcon, autocomplete: 'new-password', minlength: '12' })}
          <p class="v2-auth-note">At least 12 characters with uppercase, lowercase, a number, and a symbol.</p>
          ${message}
          <button class="v2-auth-primary" type="submit">Create Account</button>
          <button class="v2-auth-switch" type="button" data-v2-auth-view="login">Already have an account? Log in</button>
        </form>
        ${legalMarkup()}`;
      return;
    }

    if (state.view === 'verify') {
      state.content.innerHTML = `
        <h2 class="v2-auth-title" id="v2AuthTitle">Verify Your Email</h2>
        <p class="v2-auth-subtitle">Enter the confirmation code sent to your email.</p>
        <form class="v2-auth-form" data-v2-auth-form="verify">
          ${input({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@email.com', icon: emailIcon, value: email, autocomplete: 'email' })}
          ${input({ label: 'Verification Code', name: 'code', placeholder: '123456', icon: codeIcon, autocomplete: 'one-time-code' })}
          ${message}
          <button class="v2-auth-primary" type="submit">Verify Email</button>
          <button class="v2-auth-secondary" type="button" data-v2-resend>Resend Code</button>
        </form>`;
      return;
    }

    if (state.view === 'forgot') {
      state.content.innerHTML = `
        <h2 class="v2-auth-title" id="v2AuthTitle">Reset Password</h2>
        <p class="v2-auth-subtitle">Enter your email and we’ll send a reset code.</p>
        <form class="v2-auth-form" data-v2-auth-form="forgot">
          ${input({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@email.com', icon: emailIcon, value: email, autocomplete: 'email' })}
          ${message}
          <button class="v2-auth-primary" type="submit">Send Reset Code</button>
          <button class="v2-auth-switch" type="button" data-v2-auth-view="login">Back to Log In</button>
        </form>`;
      return;
    }

    if (state.view === 'reset') {
      state.content.innerHTML = `
        <h2 class="v2-auth-title" id="v2AuthTitle">Choose New Password</h2>
        <p class="v2-auth-subtitle">Enter the reset code and your new password.</p>
        <form class="v2-auth-form" data-v2-auth-form="reset">
          ${input({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@email.com', icon: emailIcon, value: email, autocomplete: 'email' })}
          ${input({ label: 'Reset Code', name: 'code', placeholder: '123456', icon: codeIcon, autocomplete: 'one-time-code' })}
          ${input({ label: 'New Password', name: 'password', type: 'password', placeholder: 'New password', icon: lockIcon, autocomplete: 'new-password', minlength: '12' })}
          ${message}
          <button class="v2-auth-primary" type="submit">Reset Password</button>
        </form>`;
      return;
    }

    state.view = 'login';
    state.content.innerHTML = `
      <h2 class="v2-auth-title" id="v2AuthTitle">Welcome Back</h2>
      <p class="v2-auth-subtitle">Log in to follow artists and pick up where you left off.</p>
      <form class="v2-auth-form" data-v2-auth-form="login">
        ${input({ label: 'Email', name: 'email', type: 'email', placeholder: 'you@email.com', icon: emailIcon, value: email, autocomplete: 'username' })}
        ${input({ label: 'Password', name: 'password', type: 'password', placeholder: '••••••••••••', icon: lockIcon, autocomplete: 'current-password' })}
        <div class="v2-auth-link-row"><button class="v2-auth-link" type="button" data-v2-auth-view="forgot">Forgot password?</button></div>
        ${message}
        <button class="v2-auth-primary" type="submit">Log In</button>
      </form>
      <div class="v2-auth-divider">or</div>
      <p class="v2-auth-new">New to Stashbox Radio?</p>
      <button class="v2-auth-secondary" type="button" data-v2-auth-view="signup">Create New Account</button>
      ${legalMarkup()}`;
  };

  const legalMarkup = () => `
    <p class="v2-auth-legal">By continuing, you agree to our <a href="/legal/terms-of-use/" target="_blank" rel="noopener">Terms of Service</a><br>and acknowledge our <a href="/legal/privacy-policy/" target="_blank" rel="noopener">Privacy Policy</a>.</p>`;

  const setMessage = (text = '', isError = false) => {
    const target = state.content?.querySelector('[data-v2-auth-message]');
    if (!target) return;
    target.textContent = text;
    target.classList.toggle('is-error', isError);
  };

  const setBusy = busy => {
    state.busy = busy;
    state.content?.querySelectorAll('button, input').forEach(element => { element.disabled = busy; });
  };

  const togglePassword = button => {
    const inputElement = button.closest('.v2-auth-input-shell')?.querySelector('input');
    if (!inputElement) return;
    inputElement.type = inputElement.type === 'password' ? 'text' : 'password';
    button.setAttribute('aria-label', inputElement.type === 'password' ? 'Show password' : 'Hide password');
  };

  const open = async view => {
    ensureUi();
    render(view || 'login');
    state.overlay.hidden = false;
    document.body.classList.add('v2-auth-open');
    window.requestAnimationFrame(() => {
      state.overlay.classList.add('is-open');
      window.setTimeout(() => state.content.querySelector('input, button')?.focus(), 180);
    });
    try { await loadConfig(); }
    catch (error) { setMessage(friendlyError(error), true); }
  };

  const close = () => {
    if (!state.overlay) return;
    state.overlay.classList.remove('is-open');
    document.body.classList.remove('v2-auth-open');
    window.setTimeout(() => { if (state.overlay) state.overlay.hidden = true; }, 430);
  };

  const handleSubmit = async event => {
    const form = event.target.closest('[data-v2-auth-form]');
    if (!form) return;
    event.preventDefault();
    if (state.busy) return;
    const values = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMessage('Working…');
    try {
      const config = await loadConfig();
      const email = String(values.email || '').trim().toLowerCase();

      if (form.dataset.v2AuthForm === 'signup') {
        await authGuard('signup');
        await cognitoCall('SignUp', {
          ClientId: config.app_client_id,
          Username: email,
          Password: String(values.password || ''),
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'preferred_username', Value: String(values.display_name || '').trim() }
          ]
        });
        savePendingEmail(email);
        render('verify');
        setMessage('Account created. Enter the code sent to your email.');
        return;
      }

      if (form.dataset.v2AuthForm === 'verify') {
        await authGuard('verify');
        await cognitoCall('ConfirmSignUp', {
          ClientId: config.app_client_id,
          Username: email,
          ConfirmationCode: String(values.code || '').trim()
        });
        savePendingEmail(email);
        render('login');
        setMessage('Email verified. Log in to continue.');
        return;
      }

      if (form.dataset.v2AuthForm === 'forgot') {
        await authGuard('forgot_password');
        await cognitoCall('ForgotPassword', { ClientId: config.app_client_id, Username: email });
        savePendingEmail(email);
        render('reset');
        setMessage('Enter the reset code sent to your email.');
        return;
      }

      if (form.dataset.v2AuthForm === 'reset') {
        await authGuard('reset_password');
        await cognitoCall('ConfirmForgotPassword', {
          ClientId: config.app_client_id,
          Username: email,
          ConfirmationCode: String(values.code || '').trim(),
          Password: String(values.password || '')
        });
        savePendingEmail(email);
        render('login');
        setMessage('Password reset. Log in with your new password.');
        return;
      }

      await authGuard('login');
      const result = await cognitoCall('InitiateAuth', {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.app_client_id,
        AuthParameters: { USERNAME: email, PASSWORD: String(values.password || '') }
      });
      writeTokens(result.AuthenticationResult);
      savePendingEmail(email);
      await loadAccount();
      updateHeaderAccount();
      setMessage('Logged in successfully.');
      window.setTimeout(close, 650);
    } catch (error) {
      setMessage(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    const email = String(state.content?.querySelector('input[name="email"]')?.value || '').trim().toLowerCase();
    if (!email) return setMessage('Enter your email first.', true);
    setBusy(true);
    try {
      const config = await loadConfig();
      await authGuard('verify');
      await cognitoCall('ResendConfirmationCode', { ClientId: config.app_client_id, Username: email });
      setMessage('A new verification code was sent.');
    } catch (error) {
      setMessage(friendlyError(error), true);
    } finally {
      setBusy(false);
    }
  };

  const loadAccount = async () => {
    const tokens = readTokens();
    if (!tokens?.accessToken) return null;
    try {
      const response = await nativeFetch(ME_URL, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
        }
      });
      if (!response.ok) return null;
      const body = await response.json();
      state.account = body.user || null;
      return state.account;
    } catch (_) {
      return null;
    }
  };

  const updateHeaderAccount = () => {
    const button = document.querySelector('.v2-header-login');
    if (!button) return;
    const label = String(state.account?.display_name || '').trim().split(/\s+/)[0] || (readTokens()?.accessToken ? 'Account' : 'Log In');
    button.textContent = label.slice(0, 14);
  };

  document.addEventListener('click', event => {
    const trigger = event.target.closest('.v2-header-login, [data-v2-auth-open]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger.dataset.v2AuthOpen || 'login');
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.overlay && !state.overlay.hidden) close();
  });

  ensureUi();
  loadAccount().finally(updateHeaderAccount);

  const requestedView = new URLSearchParams(location.search).get('auth');
  if (requestedView) {
    history.replaceState(null, '', '/radio/dev/v2/');
    window.setTimeout(() => open(requestedView), 120);
  }
})();
