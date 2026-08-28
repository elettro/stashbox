(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');

  const MAX_BYTES = 10 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const formats = [
    { ratio: '1x1', field: 'song_artwork_url', label: 'Square', size: '2000 × 2000' },
    { ratio: '9x16', field: 'song_artwork_9x16_url', label: 'Vertical', size: '1080 × 1920' },
    { ratio: '16x9', field: 'song_artwork_16x9_url', label: 'Landscape', size: '1920 × 1080' },
    { ratio: '3x4', field: 'song_artwork_3x4_url', label: 'Portrait', size: '1200 × 1600' },
    { ratio: '4x5', field: 'song_artwork_4x5_url', label: 'Social Portrait', size: '1080 × 1350' },
    { ratio: '21x9', field: 'song_artwork_21x9_url', label: 'Ultrawide', size: '2520 × 1080' }
  ];

  const els = {
    grid: document.getElementById('artworkGrid'),
    message: document.getElementById('artworkMessage'),
    refresh: document.getElementById('refreshArtworkButton'),
    newSong: document.getElementById('newSongButton')
  };

  let media = {};

  function getStoredToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return current;
    for (const key of env.legacyTokenStorageKeys || []) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return '';
  }

  function currentSongKey() {
    const input = document.getElementById('field-song_key');
    if (!input || !input.disabled) return '';
    return String(input.value || '').trim();
  }

  function currentField(name) {
    return String(document.getElementById(`field-${name}`)?.value || '').trim();
  }

  async function guardedRequest(path, options = {}) {
    const token = getStoredToken();
    if (!token) throw new Error('No DEV admin token found.');
    const method = String(options.method || 'GET').toUpperCase();
    const url = `${env.apiBase}${path}`;
    const allowed = [
      `${env.apiBase}/admin/uploads/presign`,
      `${env.apiBase}/radio/admin/songs/`
    ];
    if (!allowed.some(prefix => url.startsWith(prefix))) throw new Error('Blocked request outside the DEV artwork API boundary.');
    if (!['GET', 'HEAD'].includes(method)) migration.assertWriteAllowed('dev', 'song-artwork');

    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        'x-admin-token': token,
        'accept': 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      cache: method === 'GET' ? 'no-store' : undefined
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { payload = text; }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object'
        ? (payload.error || payload.message || JSON.stringify(payload))
        : (payload || response.statusText);
      throw new Error(`${response.status}: ${detail}`);
    }
    return payload;
  }

  function artworkUrl(format) {
    if (format.ratio === '1x1') {
      return currentField('song_artwork_url') || String(media.song_artwork_url || media.artwork_images?.['1x1'] || '').trim();
    }
    return String(media[format.field] || media.artwork_images?.[format.ratio] || '').trim();
  }

  function render() {
    const key = currentSongKey();
    els.refresh.disabled = !key;
    els.grid.innerHTML = formats.map(format => {
      const url = artworkUrl(format);
      return `<article class="artwork-card" data-ratio="${format.ratio}">
        <div class="artwork-card-head">
          <div><strong>${format.label}</strong><small>${format.ratio} · target ${format.size}px</small></div>
          <span>${url ? 'Ready' : 'Missing'}</span>
        </div>
        <div class="artwork-preview${url ? '' : ' is-empty'}">
          ${url ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(format.ratio)} artwork preview" />` : '<div>No image</div>'}
        </div>
        <input class="artwork-file" type="file" accept="image/jpeg,image/png,image/webp" ${key ? '' : 'disabled'} />
        <div class="artwork-actions">
          <button type="button" class="upload-artwork" data-ratio="${format.ratio}" ${key ? '' : 'disabled'}>Upload to DEV</button>
          ${url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">Open</a>` : ''}
        </div>
        <p class="artwork-status"></p>
      </article>`;
    }).join('');
  }

  async function loadArtwork() {
    const key = currentSongKey();
    if (!key) {
      media = {};
      els.message.textContent = 'Save or select an existing DEV song before managing artwork.';
      render();
      return;
    }

    els.refresh.disabled = true;
    els.message.textContent = `Loading DEV artwork for ${key}…`;
    try {
      const payload = await guardedRequest(`/radio/admin/songs/${encodeURIComponent(key)}/artwork-images`, { method: 'GET' });
      media = payload?.media || payload?.song?.media || payload || {};
      els.message.textContent = `DEV artwork loaded for ${key}.`;
      render();
    } catch (error) {
      media = {};
      els.message.textContent = `Unable to load DEV artwork: ${error.message}`;
      render();
    } finally {
      els.refresh.disabled = false;
    }
  }

  function contentType(file) {
    if (ACCEPTED_TYPES.has(file.type)) return file.type;
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return file.type || 'application/octet-stream';
  }

  function validateFile(file) {
    if (!file) throw new Error('Choose an image first.');
    if (!ACCEPTED_TYPES.has(contentType(file))) throw new Error('Use a JPG, PNG, or WEBP image.');
    if (file.size > MAX_BYTES) throw new Error('Image must be 10 MB or smaller.');
  }

  async function uploadArtwork(card, ratio) {
    const key = currentSongKey();
    if (!key) throw new Error('Select an existing DEV song first.');
    const format = formats.find(item => item.ratio === ratio);
    if (!format) throw new Error('Unknown artwork ratio.');
    const file = card.querySelector('.artwork-file')?.files?.[0];
    validateFile(file);

    const status = card.querySelector('.artwork-status');
    const button = card.querySelector('.upload-artwork');
    button.disabled = true;
    status.textContent = 'Requesting DEV upload authorization…';

    try {
      const presign = await guardedRequest('/admin/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({
          song_key: key,
          song_name: currentField('song_name') || currentField('display_title') || key,
          artist: currentField('artist'),
          purpose: 'artwork',
          filename: `${format.ratio}-${file.name}`,
          content_type: contentType(file)
        })
      });

      const uploadUrl = String(presign?.upload_url || presign?.uploadUrl || '').trim();
      const publicUrl = String(presign?.public_url || presign?.publicUrl || '').trim();
      if (!uploadUrl || !publicUrl) throw new Error('DEV presign response is missing upload_url or public_url.');
      const parsedUpload = new URL(uploadUrl);
      if (parsedUpload.protocol !== 'https:') throw new Error('Blocked non-HTTPS upload URL.');

      status.textContent = 'Uploading image to DEV media storage…';
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType(file) },
        body: file
      });
      if (!put.ok) throw new Error(`Storage upload failed with status ${put.status}.`);

      status.textContent = 'Attaching image to DEV song…';
      const result = await guardedRequest(`/radio/admin/songs/${encodeURIComponent(key)}/artwork-images`, {
        method: 'PATCH',
        body: JSON.stringify({ [format.field]: publicUrl })
      });
      media = result?.media || media;

      if (format.ratio === '1x1') {
        const input = document.getElementById('field-song_artwork_url');
        if (input) input.value = publicUrl;
      }

      status.textContent = `${format.ratio} uploaded to DEV.`;
      els.message.textContent = `DEV artwork updated for ${key}.`;
      await loadArtwork();
    } finally {
      button.disabled = false;
    }
  }

  els.grid.addEventListener('click', async event => {
    const button = event.target.closest('.upload-artwork');
    if (!button) return;
    const card = button.closest('.artwork-card');
    const status = card.querySelector('.artwork-status');
    try {
      await uploadArtwork(card, button.dataset.ratio);
    } catch (error) {
      status.textContent = `Upload failed: ${error.message}`;
    }
  });

  // editor-sync.js is the sole owner of artwork refreshes when editor mode changes.
  // Keeping the explicit Edit listener here as well caused overlapping GET/render cycles
  // that could replace a file input immediately after a user selected artwork.
  els.refresh.addEventListener('click', loadArtwork);
  els.newSong.addEventListener('click', () => {
    media = {};
    window.setTimeout(() => {
      els.message.textContent = 'Save the new DEV song before uploading artwork.';
      render();
    }, 0);
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  render();
})();
