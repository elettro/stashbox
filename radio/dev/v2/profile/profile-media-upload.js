(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const mobile = window.matchMedia('(max-width: 699px)');
  const originalFetch = window.fetch.bind(window);
  const app = document.getElementById('profileApp');
  if (!app) return;

  const config = {
    avatar: {
      purpose: 'profile_image',
      inputName: 'avatar_url',
      label: 'Profile Photo',
      help: '1:1 square · recommended 1200 × 1200',
      previewClass: 'square',
      recommended: { width: 1200, height: 1200 },
      ratio: 1
    },
    horizontal: {
      purpose: 'horizontal_banner',
      inputName: 'banner_url',
      label: 'Horizontal Banner',
      help: '16:9 desktop · recommended 1920 × 1080',
      previewClass: 'horizontal',
      recommended: { width: 1920, height: 1080 },
      ratio: 16 / 9
    },
    vertical: {
      purpose: 'vertical_banner',
      inputName: 'vertical_banner_url',
      label: 'Vertical Banner',
      help: '9:16 mobile · recommended 1080 × 1920',
      previewClass: 'vertical',
      recommended: { width: 1080, height: 1920 },
      ratio: 9 / 16
    }
  };

  let preferencesSettings = {};
  let scheduled = false;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function authHeaders(json = false) {
    const tokens = readTokens();
    const headers = {};
    if (tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
    if (tokens.idToken) headers['X-Cognito-Id-Token'] = tokens.idToken;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function capturePreferences(body) {
    const settings = body?.preferences?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    preferencesSettings = { ...preferencesSettings, ...settings };
    queueEnhance();
  }

  function preferencesRequest(url) {
    return String(url || '').includes('/radio/me/preferences');
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;

    if (preferencesRequest(url) && method === 'PATCH' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        const verticalInput = document.querySelector('form[data-form="account"] [name="vertical_banner_url"]');
        if (verticalInput) {
          body.settings = {
            ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
            vertical_banner_url: String(verticalInput.value || '').trim()
          };
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {}
    }

    const response = await originalFetch(input, nextInit);
    if (response.ok && preferencesRequest(url) && ['GET', 'PATCH'].includes(method)) {
      response.clone().json().then(capturePreferences).catch(() => {});
    }
    return response;
  };

  function currentInput(kind) {
    return document.querySelector(`form[data-form="account"] [name="${config[kind].inputName}"]`);
  }

  function valueFor(kind) {
    const input = currentInput(kind);
    if (input) return String(input.value || '').trim();
    if (kind === 'avatar') return String(preferencesSettings.avatar_url || '').trim();
    if (kind === 'horizontal') return String(preferencesSettings.banner_url || '').trim();
    return String(preferencesSettings.vertical_banner_url || '').trim();
  }

  function setValue(kind, value) {
    const input = currentInput(kind);
    if (input) input.value = value || '';
    if (kind === 'avatar') preferencesSettings.avatar_url = value || '';
    else if (kind === 'horizontal') preferencesSettings.banner_url = value || '';
    else preferencesSettings.vertical_banner_url = value || '';
    renderPreview(kind, value || '');
    applyProfileBanner();
  }

  function card(kind) {
    return document.querySelector(`.profile-media-card[data-profile-media-kind="${kind}"]`);
  }

  function status(kind, message = '', error = false) {
    const node = card(kind)?.querySelector('[data-profile-media-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function renderPreview(kind, url = '') {
    const node = card(kind)?.querySelector('[data-profile-media-preview]');
    if (!node) return;
    node.innerHTML = '';
    if (!url) {
      node.textContent = `No ${config[kind].label.toLowerCase()} uploaded`;
      return;
    }
    const image = new Image();
    image.alt = `${config[kind].label} preview`;
    image.src = url;
    image.onload = () => {};
    image.onerror = () => {
      node.innerHTML = '';
      node.textContent = 'Image preview unavailable';
    };
    node.appendChild(image);
  }

  function mediaCardMarkup(kind) {
    const item = config[kind];
    return `
      <article class="profile-media-card" data-profile-media-kind="${kind}">
        <div class="profile-media-card-head"><strong>${item.label}</strong><span>${item.help}</span></div>
        <div class="profile-media-preview ${item.previewClass}" data-profile-media-preview>No ${item.label.toLowerCase()} uploaded</div>
        <div class="profile-media-controls">
          <button type="button" data-profile-media-choose="${kind}">Upload / Replace</button>
          <button type="button" class="secondary" data-profile-media-clear="${kind}" aria-label="Remove ${item.label}">Remove</button>
        </div>
        <input class="profile-media-file" type="file" accept="image/jpeg,image/png,image/webp" data-profile-media-file="${kind}">
        <p class="profile-media-status" data-profile-media-status aria-live="polite"></p>
      </article>`;
  }

  function enhanceAccountForm() {
    const form = document.querySelector('form[data-form="account"]');
    if (!form || form.dataset.mediaUploadsReady === 'true') return;

    const avatarInput = form.querySelector('[name="avatar_url"]');
    const horizontalInput = form.querySelector('[name="banner_url"]');
    if (!avatarInput || !horizontalInput) return;

    form.dataset.mediaUploadsReady = 'true';
    avatarInput.closest('label')?.classList.add('profile-url-source');
    horizontalInput.closest('label')?.classList.add('profile-url-source');
    avatarInput.type = 'hidden';
    horizontalInput.type = 'hidden';

    let verticalInput = form.querySelector('[name="vertical_banner_url"]');
    if (!verticalInput) {
      verticalInput = document.createElement('input');
      verticalInput.type = 'hidden';
      verticalInput.name = 'vertical_banner_url';
      verticalInput.value = String(preferencesSettings.vertical_banner_url || '');
      form.appendChild(verticalInput);
    }

    const editor = document.createElement('section');
    editor.className = 'profile-media-editor';
    editor.innerHTML = `
      <div class="profile-media-editor-head">
        <strong>Profile Images</strong>
        <span>Upload all three formats so your profile is optimized for desktop and mobile.</span>
      </div>
      <div class="profile-media-upload-grid">
        ${mediaCardMarkup('avatar')}
        ${mediaCardMarkup('horizontal')}
        ${mediaCardMarkup('vertical')}
      </div>`;

    const signInLabel = [...form.querySelectorAll('label')].find(label => label.textContent.includes('Sign-in Email'));
    if (signInLabel) signInLabel.before(editor);
    else form.querySelector('.profile-form-actions')?.before(editor);

    renderPreview('avatar', avatarInput.value || preferencesSettings.avatar_url || '');
    renderPreview('horizontal', horizontalInput.value || preferencesSettings.banner_url || '');
    renderPreview('vertical', verticalInput.value || preferencesSettings.vertical_banner_url || '');
  }

  async function readDimensions(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('The selected image could not be read.'));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function validate(file) {
    if (!file) return 'Choose an image first.';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_IMAGE_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  function qualityNote(kind, dimensions) {
    const item = config[kind];
    const ratio = dimensions.width / Math.max(1, dimensions.height);
    const tolerance = kind === 'avatar' ? .12 : .18;
    const notes = [];
    if (dimensions.width < item.recommended.width || dimensions.height < item.recommended.height) {
      notes.push(`below ${item.recommended.width} × ${item.recommended.height}`);
    }
    if (Math.abs(ratio - item.ratio) > tolerance) {
      notes.push(`not close to ${kind === 'avatar' ? '1:1' : kind === 'horizontal' ? '16:9' : '9:16'}`);
    }
    return notes.length ? ` Warning: ${notes.join(' and ')}.` : '';
  }

  async function upload(kind, file) {
    const validation = validate(file);
    if (validation) {
      status(kind, validation, true);
      return;
    }
    const tokens = readTokens();
    if (!tokens.accessToken) throw new Error('Your session expired. Log in again before uploading.');

    const dimensions = await readDimensions(file);
    status(kind, 'Requesting secure upload URL…');
    const presignResponse = await originalFetch(`${API_ROOT}/radio/me/media/presign`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({
        purpose: config[kind].purpose,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size
      })
    });
    const presign = await parseResponse(presignResponse);
    if (!presign.upload_url || !presign.public_url) throw new Error('Upload authorization did not return the required URLs.');

    status(kind, 'Uploading image…');
    const uploadResponse = await originalFetch(presign.upload_url, {
      method: presign.method || 'PUT',
      mode: 'cors',
      credentials: 'omit',
      headers: presign.headers || { 'Content-Type': file.type },
      body: file
    });
    if (!uploadResponse.ok) throw new Error(`Image upload failed with status ${uploadResponse.status}.`);

    setValue(kind, presign.public_url);
    status(kind, `${dimensions.width} × ${dimensions.height} px uploaded.${qualityNote(kind, dimensions)} Tap Save Profile to keep it.`);
  }

  function applyProfileBanner() {
    const hero = document.querySelector('#profileApp .profile-hero');
    if (!hero) return;
    if (!hero.dataset.horizontalBannerStyle) {
      hero.dataset.horizontalBannerStyle = hero.style.getPropertyValue('--profile-banner') || '';
    }
    const horizontal = String(preferencesSettings.banner_url || '').trim();
    const vertical = String(preferencesSettings.vertical_banner_url || '').trim();
    const desired = mobile.matches && vertical
      ? `url(${JSON.stringify(vertical)})`
      : horizontal
        ? `url(${JSON.stringify(horizontal)})`
        : hero.dataset.horizontalBannerStyle;
    if (desired) hero.style.setProperty('--profile-banner', desired);
  }

  function enhance() {
    scheduled = false;
    enhanceAccountForm();
    applyProfileBanner();
  }

  function queueEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener('click', event => {
    const choose = event.target.closest('[data-profile-media-choose]');
    if (choose) {
      event.preventDefault();
      card(choose.dataset.profileMediaChoose)?.querySelector('[data-profile-media-file]')?.click();
      return;
    }

    const clear = event.target.closest('[data-profile-media-clear]');
    if (clear) {
      event.preventDefault();
      const kind = clear.dataset.profileMediaClear;
      setValue(kind, '');
      status(kind, 'Image removed. Tap Save Profile to confirm.');
    }
  });

  document.addEventListener('change', event => {
    const input = event.target.closest('[data-profile-media-file]');
    if (!input) return;
    const kind = input.dataset.profileMediaFile;
    const file = input.files?.[0];
    if (!file) return;
    upload(kind, file).catch(error => status(kind, error.message, true));
  });

  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', applyProfileBanner);
  else if (typeof mobile.addListener === 'function') mobile.addListener(applyProfileBanner);

  new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
  queueEnhance();
})();
