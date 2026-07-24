(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const ADMIN_TOKEN_KEYS = ['stashbox_admin_token_dev', 'stashbox-radio-admin-token-dev'];
  const ACCOUNT_TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_BYTES = 10 * 1024 * 1024;

  const configs = {
    profile: {
      hidden: 'profileImageUrl',
      file: 'profileImageFile',
      upload: 'uploadProfileImage',
      remove: 'deleteProfileImage',
      preview: 'profileImagePreview',
      dimensions: 'profileImageDimensions',
      status: 'profileImageStatus',
      purpose: 'profile_image',
      payload: 'profile_image_url',
      media: 'profile_image_url',
      label: 'profile image',
      recommended: [1200, 1200],
      ratio: 1
    },
    banner: {
      hidden: 'bannerImageUrl',
      file: 'bannerImageFile',
      upload: 'uploadBannerImage',
      remove: 'deleteBannerImage',
      preview: 'bannerImagePreview',
      dimensions: 'bannerImageDimensions',
      status: 'bannerImageStatus',
      purpose: 'horizontal_banner',
      payload: 'horizontal_banner_image_url',
      media: 'horizontal_banner_image_url',
      label: 'horizontal banner',
      recommended: [1920, 1080],
      ratio: 16 / 9
    },
    verticalBanner: {
      hidden: 'verticalBannerImageUrl',
      file: 'verticalBannerImageFile',
      upload: 'uploadVerticalBannerImage',
      remove: 'deleteVerticalBannerImage',
      preview: 'verticalBannerImagePreview',
      dimensions: 'verticalBannerImageDimensions',
      status: 'verticalBannerImageStatus',
      purpose: 'vertical_banner',
      payload: 'vertical_banner_image_url',
      media: 'vertical_banner_image_url',
      label: 'vertical banner',
      recommended: [1080, 1920],
      ratio: 9 / 16
    }
  };

  const el = id => document.getElementById(id);
  const clean = value => String(value ?? '').trim();
  let loadedSignature = '';
  let loadTimer = 0;
  let requestId = 0;

  function accountTokens() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function headers(json = false) {
    const result = json ? { 'Content-Type': 'application/json' } : {};
    for (const key of ADMIN_TOKEN_KEYS) {
      const token = clean(localStorage.getItem(key));
      if (token) {
        result['x-admin-token'] = token;
        return result;
      }
    }
    const tokens = accountTokens();
    if (tokens.accessToken) result.Authorization = `Bearer ${tokens.accessToken}`;
    if (tokens.idToken) result['X-Cognito-Id-Token'] = tokens.idToken;
    return result;
  }

  async function parse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok || body?.success === false) {
      const error = new Error(body.error || body.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = body.code || '';
      throw error;
    }
    return body;
  }

  function selectedArtist() {
    const id = clean(el('artistId')?.value);
    const key = clean(el('artistKey')?.value || el('slug')?.value);
    const visible = !el('artistForm')?.classList.contains('hidden');
    return id && key && visible ? { id, key, signature: `${id}|${key}` } : null;
  }

  function setStatus(kind, message = '', error = false) {
    const node = el(configs[kind].status);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function setValue(kind, url = '') {
    const node = el(configs[kind].hidden);
    if (node) node.value = clean(url);
  }

  function render(kind, url = '', dimensions = null) {
    const config = configs[kind];
    const preview = el(config.preview);
    const pill = el(config.dimensions);
    if (!preview || !pill) return;
    preview.innerHTML = '';
    pill.textContent = '';
    if (!url) {
      preview.innerHTML = `<span>No ${config.label}</span>`;
      return;
    }
    const image = new Image();
    image.alt = `${config.label} preview`;
    image.onload = () => { pill.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`; };
    image.onerror = () => {
      preview.innerHTML = '<span>Saved image preview unavailable</span>';
      setStatus(kind, 'The saved URL exists, but the image preview could not load.', true);
    };
    image.src = `${url}${url.includes('?') ? '&' : '?'}preview=${Date.now()}`;
    preview.appendChild(image);
    if (dimensions) pill.textContent = `${dimensions.width} × ${dimensions.height} px`;
  }

  function applyMedia(media, message = 'Profile media loaded and verified from RDS.') {
    Object.entries(configs).forEach(([kind, config]) => {
      const url = clean(media?.[config.media]);
      setValue(kind, url);
      render(kind, url);
      setStatus(kind, message);
    });
  }

  async function readMedia(artist, cacheBust = true) {
    const suffix = cacheBust ? `?verify=${Date.now()}` : '';
    const response = await fetch(`${ARTISTS_URL}/${encodeURIComponent(artist.key)}/media${suffix}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: headers(false)
    });
    const body = await parse(response);
    return body.media || {};
  }

  async function loadSelected(force = false) {
    const artist = selectedArtist();
    if (!artist) {
      loadedSignature = '';
      return;
    }
    if (!force && artist.signature === loadedSignature) return;
    loadedSignature = artist.signature;
    const currentRequest = ++requestId;
    Object.keys(configs).forEach(kind => setStatus(kind, 'Loading saved profile media…'));
    try {
      const media = await readMedia(artist, true);
      if (currentRequest !== requestId || selectedArtist()?.signature !== artist.signature) return;
      applyMedia(media);
    } catch (error) {
      if (currentRequest !== requestId) return;
      Object.keys(configs).forEach(kind => setStatus(kind, `Profile media could not load: ${error.message}`, true));
    }
  }

  function scheduleLoad(force = false, delay = 80) {
    window.clearTimeout(loadTimer);
    loadTimer = window.setTimeout(() => loadSelected(force), delay);
  }

  async function dimensions(file) {
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
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  function warning(config, size) {
    const notes = [];
    if (size.width < config.recommended[0] || size.height < config.recommended[1]) {
      notes.push(`below ${config.recommended[0]} × ${config.recommended[1]}`);
    }
    if (Math.abs(size.width / Math.max(1, size.height) - config.ratio) > 0.12) {
      notes.push('outside the recommended aspect ratio');
    }
    return notes.length ? ` Warning: ${notes.join(' and ')}.` : '';
  }

  async function persistAndVerify(kind, artist, url) {
    const config = configs[kind];
    const response = await fetch(`${ARTISTS_URL}/${encodeURIComponent(artist.key)}/media`, {
      method: 'PATCH',
      cache: 'no-store',
      credentials: 'omit',
      headers: headers(true),
      body: JSON.stringify({ [config.payload]: clean(url) })
    });
    const body = await parse(response);
    const returned = clean(body.media?.[config.media]);
    if (returned !== clean(url)) {
      throw new Error(`The API returned a different ${config.label} URL after saving.`);
    }
    const fresh = await readMedia(artist, true);
    const verified = clean(fresh?.[config.media]);
    if (verified !== clean(url)) {
      throw new Error(`The ${config.label} did not survive a fresh RDS read-back.`);
    }
    setValue(kind, verified);
    render(kind, verified);
    return verified;
  }

  async function upload(kind, file) {
    const config = configs[kind];
    const artist = selectedArtist();
    if (!artist) throw new Error('Save and select the artist before uploading profile media.');
    const validation = validate(file);
    if (validation) throw new Error(validation);
    const size = await dimensions(file);

    setStatus(kind, 'Requesting secure artist upload URL…');
    const presign = await fetch(`${ARTISTS_URL}/${encodeURIComponent(artist.key)}/media/presign`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: headers(true),
      body: JSON.stringify({
        purpose: config.purpose,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size
      })
    }).then(parse);

    if (!presign.upload_url || !presign.public_url) {
      throw new Error('Upload authorization did not return upload_url and public_url.');
    }

    setStatus(kind, 'Uploading image to Stashbox storage…');
    const put = await fetch(presign.upload_url, {
      method: presign.method || 'PUT',
      mode: 'cors',
      credentials: 'omit',
      headers: presign.headers || { 'Content-Type': file.type },
      body: file
    });
    if (!put.ok) throw new Error(`S3 upload failed with status ${put.status}.`);

    render(kind, presign.public_url, size);
    setStatus(kind, 'Upload complete. Saving and verifying the artist record…');
    await persistAndVerify(kind, artist, presign.public_url);
    setStatus(kind, `${size.width} × ${size.height} px uploaded, saved, and verified.${warning(config, size)}`);
  }

  async function clear(kind) {
    const artist = selectedArtist();
    if (!artist) throw new Error('Select an existing artist first.');
    setStatus(kind, `Removing ${configs[kind].label}…`);
    await persistAndVerify(kind, artist, '');
    setStatus(kind, `${configs[kind].label[0].toUpperCase()}${configs[kind].label.slice(1)} removal verified in RDS.`);
  }

  function kindForControl(id, property) {
    return Object.entries(configs).find(([, config]) => config[property] === id)?.[0] || '';
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[id]') : null;
    if (!target) return;

    const uploadKind = kindForControl(target.id, 'upload');
    if (uploadKind) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const artist = selectedArtist();
      if (!artist) {
        setStatus(uploadKind, 'Save and select the artist before uploading profile media.', true);
        return;
      }
      const input = el(configs[uploadKind].file);
      if (input) {
        input.value = '';
        input.click();
      }
      return;
    }

    const removeKind = kindForControl(target.id, 'remove');
    if (removeKind) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear(removeKind).catch(error => setStatus(removeKind, error.message, true));
      return;
    }

    if (target.closest('#artistList, #newArtist, #cancelEdit')) {
      loadedSignature = '';
      scheduleLoad(true, 120);
      window.setTimeout(() => scheduleLoad(true, 0), 450);
    }
  }, true);

  document.addEventListener('change', event => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) return;
    const kind = kindForControl(input.id, 'file');
    if (!kind) return;
    event.stopImmediatePropagation();
    const file = input.files?.[0];
    if (file) upload(kind, file).catch(error => setStatus(kind, error.message, true));
  }, true);

  const observerTargets = [el('artistForm'), el('editorTitle')].filter(Boolean);
  if (observerTargets.length) {
    const observer = new MutationObserver(() => scheduleLoad(false, 60));
    observerTargets.forEach(target => observer.observe(target, { attributes: true, childList: true, subtree: true }));
  }

  window.addEventListener('focus', () => loadSelected(true));
  window.StashboxArtistProfileMedia = { loadSelected, readMedia, upload, clear };
  scheduleLoad(true, 120);
})();
