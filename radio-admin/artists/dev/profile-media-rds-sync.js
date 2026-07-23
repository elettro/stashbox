(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const ADMIN_KEYS = ['stashbox_admin_token_dev', 'stashbox-radio-admin-token-dev'];
  const ACCOUNT_KEY = 'stashbox_radio_dev_cognito_tokens';
  let selectedSignature = '';
  let requestNumber = 0;
  let timer = 0;

  const clean = value => String(value ?? '').trim();
  const slug = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist';
  const el = id => document.getElementById(id);

  function headers() {
    const result = {};
    for (const key of ADMIN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) {
        result['x-admin-token'] = value;
        return result;
      }
    }
    try {
      const tokens = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null') || {};
      if (tokens.accessToken) result.Authorization = `Bearer ${tokens.accessToken}`;
      if (tokens.idToken) result['X-Cognito-Id-Token'] = tokens.idToken;
    } catch (_) {}
    return result;
  }

  function currentSelection() {
    const id = clean(el('artistId')?.value);
    const key = slug(el('artistKey')?.value || el('slug')?.value || el('name')?.value);
    return id && key ? { id, key, signature: `${id}|${key}` } : null;
  }

  function status(message, error = false) {
    const node = el('verticalBannerImageStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function render(url) {
    const hidden = el('verticalBannerImageUrl');
    const preview = el('verticalBannerImagePreview');
    const dimensions = el('verticalBannerImageDimensions');
    if (hidden) hidden.value = url;
    if (!preview || !dimensions) return;
    preview.innerHTML = '';
    dimensions.textContent = '';
    if (!url) {
      preview.innerHTML = '<span>No vertical banner</span>';
      return;
    }
    const image = new Image();
    image.alt = 'Vertical banner preview';
    image.onload = () => { dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`; };
    image.onerror = () => {
      preview.innerHTML = '<span>Saved image preview unavailable</span>';
      status('RDS contains a vertical banner URL, but the image could not be displayed from S3.', true);
    };
    image.src = `${url}${url.includes('?') ? '&' : '?'}preview=${Date.now()}`;
    preview.appendChild(image);
  }

  async function readRds(key) {
    const response = await fetch(`${ARTISTS_URL}/${encodeURIComponent(key)}/media?rdscheck=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: headers()
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return clean(body.media?.vertical_banner_image_url);
  }

  async function sync(force = false) {
    const selection = currentSelection();
    if (!selection) {
      selectedSignature = '';
      return;
    }
    if (!force && selection.signature === selectedSignature) return;
    selectedSignature = selection.signature;
    const thisRequest = ++requestNumber;
    status('Checking the saved vertical banner in RDS…');
    try {
      const url = await readRds(selection.key);
      if (thisRequest !== requestNumber || currentSelection()?.signature !== selection.signature) return;
      render(url);
      status(url ? 'Vertical banner loaded and confirmed from RDS.' : 'RDS currently has no vertical banner saved for this artist.', !url);
    } catch (error) {
      if (thisRequest !== requestNumber) return;
      status(`Could not verify the vertical banner in RDS: ${error.message}`, true);
    }
  }

  function schedule(force = false, delay = 0) {
    clearTimeout(timer);
    timer = setTimeout(() => sync(force), delay);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#artistList, #newArtist, #cancelEdit')) {
      selectedSignature = '';
      schedule(true, 120);
    }
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.id === 'artistForm') schedule(true, 900);
  }, true);

  window.addEventListener('focus', () => schedule(true, 80));
  setInterval(() => {
    const selection = currentSelection();
    if (!selection) {
      selectedSignature = '';
      return;
    }
    if (selection.signature !== selectedSignature) schedule(true, 0);
  }, 300);
})();
