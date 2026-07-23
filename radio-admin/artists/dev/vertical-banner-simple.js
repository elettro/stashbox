(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const UPLOAD_PRESIGN_URL = `${API_ROOT}/admin/uploads/presign`;
  const ADMIN_TOKEN_KEYS = ['stashbox_admin_token_dev', 'stashbox-radio-admin-token-dev'];
  const ACCOUNT_TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_BYTES = 10 * 1024 * 1024;

  const el = id => document.getElementById(id);
  const clean = value => String(value ?? '').trim();
  const slugify = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'artist';

  let loadedSignature = '';
  let requestId = 0;

  function authHeaders(json = false) {
    const headers = json ? { 'Content-Type': 'application/json' } : {};
    for (const key of ADMIN_TOKEN_KEYS) {
      const token = clean(localStorage.getItem(key));
      if (token) {
        headers['x-admin-token'] = token;
        return headers;
      }
    }
    try {
      const tokens = JSON.parse(localStorage.getItem(ACCOUNT_TOKEN_KEY) || 'null') || {};
      if (tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
      if (tokens.idToken) headers['X-Cognito-Id-Token'] = tokens.idToken;
    } catch (_) {}
    return headers;
  }

  async function parse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok || body?.success === false) {
      throw new Error(body.error || body.message || `HTTP ${response.status}`);
    }
    return body;
  }

  function selectedArtist() {
    const id = clean(el('artistId')?.value);
    const key = slugify(el('artistKey')?.value || el('slug')?.value || el('name')?.value);
    const name = clean(el('name')?.value);
    const visible = !el('artistForm')?.classList.contains('hidden');
    return id && key && visible ? { id, key, name, signature: `${id}|${key}` } : null;
  }

  function setStatus(message = '', error = false) {
    const node = el('verticalBannerImageStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }

  function setPreview(url = '', dimensions = null) {
    const input = el('verticalBannerImageUrl');
    const preview = el('verticalBannerImagePreview');
    const dimension = el('verticalBannerImageDimensions');
    if (input) input.value = url;
    if (!preview || !dimension) return;

    preview.innerHTML = '';
    dimension.textContent = '';
    if (!url) {
      preview.innerHTML = '<span>No vertical banner</span>';
      return;
    }

    const image = new Image();
    image.alt = 'Vertical banner preview';
    image.onload = () => {
      dimension.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    };
    image.onerror = () => {
      preview.innerHTML = '<span>Saved image preview unavailable</span>';
      setStatus('The vertical-banner URL is saved, but the S3 image could not be displayed.', true);
    };
    image.src = `${url}${url.includes('?') ? '&' : '?'}preview=${Date.now()}`;
    preview.appendChild(image);
    if (dimensions) dimension.textContent = `${dimensions.width} × ${dimensions.height} px`;
  }

  async function getStoredVertical(key) {
    const body = await fetch(`${ARTISTS_URL}/${encodeURIComponent(key)}/media?read=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(false)
    }).then(parse);
    return clean(body.media?.vertical_banner_image_url);
  }

  async function persistAndVerify(key, url) {
    const body = await fetch(`${ARTISTS_URL}/${encodeURIComponent(key)}/media`, {
      method: 'PATCH',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({ vertical_banner_image_url: url })
    }).then(parse);

    const patched = clean(body.media?.vertical_banner_image_url);
    if (patched !== clean(url)) {
      throw new Error('Lambda did not return the vertical-banner URL after saving.');
    }

    const stored = await getStoredVertical(key);
    if (stored !== clean(url)) {
      throw new Error('The vertical-banner URL did not survive the independent RDS read-back.');
    }
    return stored;
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
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  async function upload(file) {
    const artist = selectedArtist();
    if (!artist) throw new Error('Select and save an existing artist before uploading its vertical banner.');
    const validation = validate(file);
    if (validation) throw new Error(validation);

    const dimensions = await readDimensions(file);
    setStatus('Requesting the same secure S3 upload used by Song CMS…');

    const presign = await fetch(UPLOAD_PRESIGN_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: authHeaders(true),
      body: JSON.stringify({
        song_key: `artist-${artist.key}-vertical-banner`,
        song_name: `${artist.name || artist.key} vertical banner`,
        artist: artist.name || artist.key,
        purpose: 'artwork',
        filename: file.name,
        content_type: file.type
      })
    }).then(parse);

    if (!presign.upload_url || !presign.public_url) {
      throw new Error('The upload authorization did not return upload_url and public_url.');
    }

    setStatus('Uploading vertical banner to S3…');
    const put = await fetch(presign.upload_url, {
      method: presign.method || 'PUT',
      mode: 'cors',
      credentials: 'omit',
      headers: presign.headers || { 'Content-Type': file.type },
      body: file
    });
    if (!put.ok) throw new Error(`S3 upload failed with status ${put.status}.`);

    setPreview(presign.public_url, dimensions);
    setStatus('S3 upload complete. Saving and checking RDS…');
    await persistAndVerify(artist.key, presign.public_url);
    setPreview(presign.public_url, dimensions);

    const ratioWarning = Math.abs((dimensions.width / Math.max(1, dimensions.height)) - (9 / 16)) > 0.12
      ? ' Warning: this image is outside the recommended 9:16 ratio.'
      : '';
    const sizeWarning = dimensions.width < 1080 || dimensions.height < 1920
      ? ' Warning: this image is below the recommended 1080 × 1920 size.'
      : '';
    setStatus(`${dimensions.width} × ${dimensions.height} px uploaded to S3 and verified in RDS.${ratioWarning}${sizeWarning}`);
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
    setStatus('Loading the saved vertical banner from RDS…');
    try {
      const url = await getStoredVertical(artist.key);
      if (currentRequest !== requestId || selectedArtist()?.signature !== artist.signature) return;
      setPreview(url);
      setStatus(url ? 'Vertical banner loaded and confirmed from RDS.' : 'No vertical banner is currently saved for this artist.');
    } catch (error) {
      if (currentRequest !== requestId) return;
      setStatus(`Vertical banner could not be loaded: ${error.message}`, true);
    }
  }

  const fileInput = el('verticalBannerImageFile');
  el('uploadVerticalBannerImage')?.addEventListener('click', () => {
    if (!selectedArtist()) {
      setStatus('Select and save an existing artist before uploading its vertical banner.', true);
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    upload(file).catch(error => setStatus(error.message, true));
  });

  el('deleteVerticalBannerImage')?.addEventListener('click', () => {
    const artist = selectedArtist();
    if (!artist) return setStatus('Select an existing artist first.', true);
    setStatus('Removing vertical banner and checking RDS…');
    persistAndVerify(artist.key, '')
      .then(() => {
        setPreview('');
        setStatus('Vertical banner removal verified in RDS.');
      })
      .catch(error => setStatus(error.message, true));
  });

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'artistForm') return;
    const pendingUrl = clean(el('verticalBannerImageUrl')?.value);
    if (!pendingUrl) return;
    setTimeout(() => {
      const artist = selectedArtist();
      if (!artist) return;
      persistAndVerify(artist.key, pendingUrl)
        .then(() => setStatus('Artist saved. Vertical banner independently verified in RDS.'))
        .catch(error => setStatus(`Artist saved, but vertical-banner verification failed: ${error.message}`, true));
    }, 900);
  }, true);

  document.addEventListener('click', event => {
    if (event.target.closest('#artistList, #newArtist, #cancelEdit')) {
      loadedSignature = '';
      setTimeout(() => loadSelected(true), 120);
    }
  }, true);

  window.addEventListener('focus', () => loadSelected(true));
  setInterval(() => loadSelected(false), 300);
})();
