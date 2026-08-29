(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const LEGACY_PRESIGN_URL = `${API_ROOT}/admin/uploads/presign`;
  const STANDARD_ADMIN_TOKEN_KEY = 'stashbox_admin_token_dev';
  const LEGACY_ADMIN_TOKEN_KEY = 'stashbox-radio-admin-token-dev';
  const ACCOUNT_TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const originalFetch = window.fetch.bind(window);
  const pendingVertical = new Map();

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
      recommended: { width: 1200, height: 1200 },
      label: 'profile image',
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
      recommended: { width: 1920, height: 1080 },
      label: 'horizontal banner',
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
      recommended: { width: 1080, height: 1920 },
      label: 'vertical banner',
      ratio: 9 / 16
    }
  };

  const el = id => document.getElementById(id);

  function accountTokens() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function adminToken() {
    return localStorage.getItem(STANDARD_ADMIN_TOKEN_KEY)
      || localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY)
      || '';
  }

  function authHeaders(json = false) {
    const headers = {};
    const admin = adminToken();
    if (admin) headers['x-admin-token'] = admin;
    else {
      const tokens = accountTokens();
      if (tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
      if (tokens.idToken) headers['X-Cognito-Id-Token'] = tokens.idToken;
    }
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function slugify(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'artist';
  }

  function currentArtistKey() {
    return slugify(el('artistKey')?.value || el('slug')?.value || el('name')?.value || 'artist');
  }

  function existingArtist() {
    return Boolean(String(el('artistId')?.value || '').trim());
  }

  function setStatus(kind, message = '', error = false) {
    const node = el(configs[kind].status);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function setHidden(kind, value = '') {
    const node = el(configs[kind].hidden);
    if (node) node.value = value || '';
  }

  function renderPreview(kind, url = '', dimensions = null) {
    const config = configs[kind];
    const preview = el(config.preview);
    const pill = el(config.dimensions);
    if (!preview || !pill) return;
    preview.innerHTML = '';
    if (!url) {
      preview.innerHTML = `<span>No ${config.label}</span>`;
      pill.textContent = '';
      return;
    }
    const image = new Image();
    image.alt = `${config.label} preview`;
    image.src = url;
    image.onload = () => {
      pill.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    };
    image.onerror = () => {
      preview.innerHTML = '<span>Image preview unavailable</span>';
      pill.textContent = '';
    };
    preview.appendChild(image);
    if (dimensions) pill.textContent = `${dimensions.width} × ${dimensions.height} px`;
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

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  async function requestPresign(kind, file) {
    const config = configs[kind];
    const artistKey = currentArtistKey();
    const artistName = String(el('name')?.value || '').trim();
    if (!artistName) throw new Error('Enter the artist name before uploading.');

    if (existingArtist()) {
      const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(artistKey)}/media/presign`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: authHeaders(true),
        body: JSON.stringify({
          purpose: config.purpose,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size
        })
      });
      return parseResponse(response);
    }

    if (!adminToken()) throw new Error('Save the new artist first, then upload images from the saved profile.');
    const response = await originalFetch(LEGACY_PRESIGN_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({
        song_key: `artist-${artistKey}-${config.purpose}`,
        song_name: `${artistName} ${config.label}`,
        artist: artistName,
        purpose: 'artwork',
        filename: file.name,
        content_type: file.type
      })
    });
    return parseResponse(response);
  }

  function ratioWarning(config, dimensions) {
    const ratio = dimensions.width / Math.max(1, dimensions.height);
    const tolerance = config.purpose === 'profile_image' ? .12 : .18;
    const ratioOff = Math.abs(ratio - config.ratio) > tolerance;
    const tooSmall = dimensions.width < config.recommended.width || dimensions.height < config.recommended.height;
    const notes = [];
    if (tooSmall) notes.push(`smaller than ${config.recommended.width} × ${config.recommended.height}`);
    if (ratioOff) notes.push(`not close to the recommended ${config.purpose === 'profile_image' ? '1:1' : config.purpose === 'horizontal_banner' ? '16:9' : '9:16'} ratio`);
    return notes.length ? ` Warning: ${notes.join(' and ')}.` : '';
  }

  async function upload(kind, file) {
    const config = configs[kind];
    const error = validate(file);
    if (error) {
      setStatus(kind, error, true);
      return;
    }

    const dimensions = await readDimensions(file);
    setStatus(kind, 'Requesting secure upload URL…');
    const presign = await requestPresign(kind, file);
    if (!presign.upload_url || !presign.public_url) throw new Error('Upload authorization did not return the required URLs.');

    setStatus(kind, 'Uploading image to DEV storage…');
    const response = await originalFetch(presign.upload_url, {
      method: presign.method || 'PUT',
      mode: 'cors',
      credentials: 'omit',
      headers: presign.headers || { 'Content-Type': file.type },
      body: file
    });
    if (!response.ok) throw new Error(`DEV storage upload failed with status ${response.status}.`);

    setHidden(kind, presign.public_url);
    renderPreview(kind, presign.public_url, dimensions);
    setStatus(kind, `${dimensions.width} × ${dimensions.height} px. Uploaded successfully.${ratioWarning(config, dimensions)} Click Save Artist.`);
  }

  function clear(kind) {
    setHidden(kind, '');
    const file = el(configs[kind].file);
    if (file) file.value = '';
    renderPreview(kind, '');
    setStatus(kind, 'Image removed from the form. Click Save Artist to confirm.');
  }

  async function loadVerticalForArtist(artistKey) {
    if (!artistKey) return;
    try {
      const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(artistKey)}/media`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: authHeaders(false)
      });
      const body = await parseResponse(response);
      const url = body.media?.vertical_banner_image_url || '';
      pendingVertical.set(artistKey, url);
      syncPendingVertical();
    } catch (error) {
      setStatus('verticalBanner', error.message, true);
    }
  }

  function syncPendingVertical() {
    const key = currentArtistKey();
    if (!existingArtist() || !pendingVertical.has(key)) return;
    const url = pendingVertical.get(key) || '';
    if (el('verticalBannerImageUrl')?.value !== url) {
      setHidden('verticalBanner', url);
      renderPreview('verticalBanner', url);
      setStatus('verticalBanner');
    }
  }

  async function saveVertical(artistKey) {
    const url = String(el('verticalBannerImageUrl')?.value || '').trim();
    const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(artistKey)}/media`, {
      method: 'PATCH',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({ vertical_banner_image_url: url })
    });
    const body = await parseResponse(response);
    pendingVertical.set(artistKey, body.media?.vertical_banner_image_url || url);
    return body;
  }

  function isSingleArtistRead(url, method) {
    if (method !== 'GET' || !url.startsWith(`${ARTISTS_URL}/`)) return false;
    return !url.includes('/access') && !url.includes('/media') && !url.includes('/songs');
  }

  function isArtistWrite(url, method) {
    if (!['POST', 'PATCH'].includes(method)) return false;
    if (url === ARTISTS_URL) return true;
    return url.startsWith(`${ARTISTS_URL}/`) && !url.includes('/access') && !url.includes('/media') && !url.includes('/songs');
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const response = await originalFetch(input, init);

    if (response.ok && isSingleArtistRead(url, method)) {
      response.clone().json().then(body => {
        const key = body.artist?.artist_key;
        if (key) loadVerticalForArtist(key);
      }).catch(() => {});
    }

    if (response.ok && isArtistWrite(url, method)) {
      try {
        const body = await response.clone().json();
        const key = body.artist?.artist_key;
        if (key) await saveVertical(key);
      } catch (error) {
        setStatus('verticalBanner', `Artist saved, but the vertical banner could not be saved: ${error.message}`, true);
      }
    }

    return response;
  };

  function kindFromTarget(target, property) {
    return Object.entries(configs).find(([, config]) => config[property] === target.id)?.[0] || '';
  }

  document.addEventListener('click', event => {
    const uploadKind = kindFromTarget(event.target.closest('button[id]') || {}, 'upload');
    if (uploadKind) {
      event.preventDefault();
      event.stopImmediatePropagation();
      el(configs[uploadKind].file)?.click();
      return;
    }

    const removeKind = kindFromTarget(event.target.closest('button[id]') || {}, 'remove');
    if (removeKind) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear(removeKind);
      return;
    }

    if (event.target.closest('#newArtist')) {
      window.setTimeout(() => {
        setHidden('verticalBanner', '');
        renderPreview('verticalBanner', '');
        setStatus('verticalBanner');
      }, 0);
    }
  }, true);

  document.addEventListener('change', event => {
    const kind = kindFromTarget(event.target, 'file');
    if (!kind) return;
    event.stopImmediatePropagation();
    const file = event.target.files?.[0];
    if (!file) return;
    upload(kind, file).catch(error => setStatus(kind, error.message, true));
  }, true);

  window.setInterval(syncPendingVertical, 150);
})();
