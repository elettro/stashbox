(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  const API_ROOT = window.StashboxCanonicalContent?.apiRoot || 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const ARTWORK_API_ROOT = `${API_ROOT}/radio/admin/songs`;
  const MAX_BYTES = 10 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const PLACEHOLDER = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const formats = [
    {
      ratio: '1x1',
      field: 'song_artwork_url',
      label: 'Square',
      width: 2000,
      height: 2000,
      uses: 'Player artwork, playlists, search, favorites and song cards.'
    },
    {
      ratio: '9x16',
      field: 'song_artwork_9x16_url',
      label: 'Vertical',
      width: 1080,
      height: 1920,
      uses: 'Mobile full screen, Stories, Reels, TikTok and Shorts.'
    },
    {
      ratio: '16x9',
      field: 'song_artwork_16x9_url',
      label: 'Landscape',
      width: 1920,
      height: 1080,
      uses: 'Desktop heroes, YouTube, video thumbnails and horizontal promotions.'
    },
    {
      ratio: '3x4',
      field: 'song_artwork_3x4_url',
      label: 'Portrait',
      width: 1200,
      height: 1600,
      uses: 'Portrait cards, posters, editorial panels and mobile promotions.'
    },
    {
      ratio: '4x5',
      field: 'song_artwork_4x5_url',
      label: 'Social Portrait',
      width: 1080,
      height: 1350,
      uses: 'Instagram and Facebook feed posts, campaigns and Content Review.'
    },
    {
      ratio: '21x9',
      field: 'song_artwork_21x9_url',
      label: 'Ultrawide',
      width: 2520,
      height: 1080,
      uses: 'Cinematic headers, feature strips, signage and wide displays.'
    }
  ];

  const state = {
    key: '',
    media: null,
    loading: false,
    error: '',
    section: null,
    grid: null,
    progress: null,
    note: null,
    lastSquareUrl: ''
  };

  function clean(value) {
    return String(value ?? '').trim();
  }

  function selectedKey() {
    try {
      if (clean(selectedSongKey)) return clean(selectedSongKey);
    } catch (_) {}
    return clean(document.getElementById('selectedSongKey')?.textContent);
  }

  function isCreateMode() {
    try { return editorMode === 'create'; } catch (_) { return false; }
  }

  function fieldInput(name) {
    return document.getElementById(`field_${name}`);
  }

  function fieldValue(name) {
    return clean(fieldInput(name)?.value);
  }

  function artworkUrl(format) {
    if (format.ratio === '1x1') return fieldValue('song_artwork_url');
    return clean(state.media?.[format.field] || state.media?.artwork_images?.[format.ratio]);
  }

  function callAdminFetch(url, options) {
    if (typeof adminFetch !== 'function') {
      return Promise.reject(new Error('The Song CMS admin connection is not ready.'));
    }
    return adminFetch(url, options);
  }

  function notify(message, type = 'success') {
    if (typeof showMessage === 'function') showMessage(message, type);
  }

  function injectStyles() {
    if (document.getElementById('songImagesStyles')) return;
    const style = document.createElement('style');
    style.id = 'songImagesStyles';
    style.textContent = `
      .song-images-section{grid-column:1/-1;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:20px;background:rgba(10,16,14,.68);margin:4px 0 10px}
      .song-images-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}
      .song-images-header h3{margin:3px 0 4px;font-size:1.25rem}
      .song-images-header p{margin:0;color:#aeb8b3;max-width:780px;line-height:1.45}
      .song-images-progress{white-space:nowrap;border:1px solid rgba(66,217,130,.42);background:rgba(66,217,130,.09);color:#dff8e9;border-radius:999px;padding:8px 12px;font-weight:800;font-size:.78rem;letter-spacing:.03em}
      .song-images-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .song-image-card{border:1px solid rgba(255,255,255,.11);border-radius:15px;padding:13px;background:rgba(255,255,255,.035);min-width:0}
      .song-image-card.is-busy{opacity:.72;pointer-events:none}
      .song-image-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .song-image-card-head strong{display:block;font-size:.96rem}
      .song-image-card-head small{display:block;color:#9ea8a3;margin-top:3px}
      .song-image-ratio{border-radius:999px;padding:5px 8px;background:#19231f;color:#eff8f3;border:1px solid rgba(255,255,255,.13);font-weight:900;font-size:.72rem}
      .song-image-preview{width:100%;max-height:240px;border-radius:11px;overflow:hidden;background:#080d0b;border:1px solid rgba(255,255,255,.09);display:grid;place-items:center;margin-bottom:10px}
      .song-image-preview img{width:100%;height:100%;object-fit:contain;display:block}
      .song-image-preview.is-empty img{opacity:.18;object-fit:contain;padding:18px}
      .song-image-meta{min-height:36px;color:#aeb8b3;font-size:.76rem;line-height:1.4;margin-bottom:8px}
      .song-image-meta .is-warning{color:#f0c04c}
      .song-image-uses{min-height:48px;color:#929d97;font-size:.76rem;line-height:1.4;margin:0 0 11px}
      .song-image-actions{display:flex;flex-wrap:wrap;gap:7px}
      .song-image-actions button,.song-image-actions a{font:inherit;font-weight:800;font-size:.75rem;border-radius:9px;padding:7px 9px;border:1px solid rgba(255,255,255,.15);background:#17211d;color:#edf5f0;text-decoration:none;cursor:pointer}
      .song-image-actions button:hover,.song-image-actions a:hover{border-color:rgba(66,217,130,.7)}
      .song-image-actions button:disabled,.song-image-actions a.is-disabled{opacity:.38;pointer-events:none}
      .song-image-actions .remove{color:#ffb5b5;border-color:rgba(255,100,100,.3)}
      .song-image-status{margin-top:9px;min-height:18px;color:#aeb8b3;font-size:.76rem}
      .song-image-status.is-error{color:#ffb1b1}
      .song-image-status.is-success{color:#a9edc5}
      @media(max-width:980px){.song-images-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.song-images-section{padding:14px}.song-images-header{display:block}.song-images-progress{display:inline-block;margin-top:12px}.song-images-grid{grid-template-columns:1fr}.song-image-preview{max-height:320px}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    if (state.section?.isConnected) return true;
    const formFieldsNode = document.getElementById('formFields');
    const originalArtworkWrap = formFieldsNode?.querySelector('[data-field-name="song_artwork_url"]');
    const videoWrap = formFieldsNode?.querySelector('[data-field-name="video_link"]');
    if (!formFieldsNode || !originalArtworkWrap || !videoWrap) return false;

    injectStyles();
    originalArtworkWrap.classList.add('hidden');
    originalArtworkWrap.setAttribute('aria-hidden', 'true');

    const section = document.createElement('section');
    section.className = 'song-images-section field-full';
    section.setAttribute('aria-labelledby', 'songImagesHeading');
    section.innerHTML = `
      <div class="song-images-header">
        <div>
          <p class="eyebrow">Prepared artwork library</p>
          <h3 id="songImagesHeading">Song Images</h3>
          <p id="songImagesNote">Upload prepared artwork for Stashbox Radio, Social Factory, Video Factory and third-party social placements. The square image remains the primary song artwork.</p>
        </div>
        <div id="songImagesProgress" class="song-images-progress">0 of 6 Images Ready</div>
      </div>
      <div id="songImagesGrid" class="song-images-grid"></div>
    `;
    videoWrap.before(section);
    state.section = section;
    state.grid = section.querySelector('#songImagesGrid');
    state.progress = section.querySelector('#songImagesProgress');
    state.note = section.querySelector('#songImagesNote');
    return true;
  }

  function dimensionsFor(file) {
    const objectUrl = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image could not be read.'));
      };
      image.src = objectUrl;
    });
  }

  function contentType(file) {
    if (ACCEPTED_TYPES.has(file.type)) return file.type;
    const extension = clean(file.name).split('.').pop().toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    return file.type || 'application/octet-stream';
  }

  function validateFile(file) {
    if (!file) return 'Choose an image first.';
    if (!ACCEPTED_TYPES.has(contentType(file))) return 'Use a JPG, PNG or WEBP image.';
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  function warnings(format, size) {
    const messages = [];
    const actualRatio = size.width / Math.max(1, size.height);
    const expectedRatio = format.width / format.height;
    if (Math.abs(actualRatio - expectedRatio) / expectedRatio > 0.04) {
      messages.push(`aspect ratio is ${size.width}:${size.height}, not ${format.ratio}`);
    }
    if (size.width < format.width || size.height < format.height) {
      messages.push(`resolution is below ${format.width} × ${format.height}px`);
    }
    return messages;
  }

  async function uploadFile(format, file, statusNode, card) {
    const key = selectedKey();
    if (!key || isCreateMode()) throw new Error('Save the song before uploading its prepared images.');
    const validation = validateFile(file);
    if (validation) throw new Error(validation);

    const size = await dimensionsFor(file);
    const fileWarnings = warnings(format, size);
    if (fileWarnings.length) {
      const proceed = window.confirm(`This image has a warning:\n\n${fileWarnings.join('\n')}\n\nUpload it anyway?`);
      if (!proceed) return;
    }

    card.classList.add('is-busy');
    statusNode.className = 'song-image-status';
    statusNode.textContent = 'Requesting secure upload URL…';

    try {
      const presign = await callAdminFetch(UPLOAD_PRESIGN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song_key: key,
          song_name: fieldValue('song_name') || fieldValue('display_title') || key,
          artist: fieldValue('artist'),
          purpose: 'artwork',
          filename: `${format.ratio}-${file.name}`,
          content_type: contentType(file)
        })
      });

      const uploadUrl = clean(presign?.upload_url || presign?.uploadUrl);
      const publicUrl = clean(presign?.public_url || presign?.publicUrl);
      if (!uploadUrl || !publicUrl) throw new Error('Upload authorization did not return upload_url and public_url.');

      statusNode.textContent = 'Uploading image to Stashbox storage…';
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType(file) },
        body: file
      });
      if (!put.ok) throw new Error(`S3 upload failed with status ${put.status}.`);

      statusNode.textContent = 'Saving artwork to the song…';
      const result = await callAdminFetch(`${ARTWORK_API_ROOT}/${encodeURIComponent(key)}/artwork-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [format.field]: publicUrl })
      });

      state.media = result?.media || state.media;
      if (format.ratio === '1x1') {
        const input = fieldInput('song_artwork_url');
        if (input) {
          input.value = publicUrl;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      statusNode.className = 'song-image-status is-success';
      statusNode.textContent = `${size.width} × ${size.height}px uploaded and saved.`;
      notify(`${format.ratio} song image uploaded and saved.`, 'success');
      render();
    } finally {
      card.classList.remove('is-busy');
    }
  }

  async function removeImage(format, statusNode, card) {
    const key = selectedKey();
    if (!key) return;
    if (!window.confirm(`Remove the ${format.ratio} image from this song? The uploaded source file will remain in storage.`)) return;

    card.classList.add('is-busy');
    statusNode.className = 'song-image-status';
    statusNode.textContent = 'Removing image from the song…';
    try {
      const result = await callAdminFetch(`${ARTWORK_API_ROOT}/${encodeURIComponent(key)}/artwork-images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [format.field]: '' })
      });
      state.media = result?.media || state.media;
      if (format.ratio === '1x1') {
        const input = fieldInput('song_artwork_url');
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      notify(`${format.ratio} song image removed.`, 'success');
      render();
    } finally {
      card.classList.remove('is-busy');
    }
  }

  function preview(format, url, metaNode) {
    const wrap = document.createElement('div');
    wrap.className = `song-image-preview${url ? '' : ' is-empty'}`;
    wrap.style.aspectRatio = `${format.width} / ${format.height}`;
    const image = document.createElement('img');
    image.alt = url ? `${format.ratio} song artwork preview` : 'No song artwork uploaded';
    image.src = url || PLACEHOLDER;
    if (url) {
      image.onload = () => {
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        const imageWarnings = warnings(format, size);
        metaNode.innerHTML = `${size.width} × ${size.height}px${imageWarnings.length ? `<br><span class="is-warning">Warning: ${imageWarnings.join('; ')}.</span>` : '<br>Ready for this format.'}`;
      };
      image.onerror = () => {
        metaNode.innerHTML = '<span class="is-warning">Saved URL exists, but its preview did not load.</span>';
      };
    }
    wrap.appendChild(image);
    return wrap;
  }

  function buildCard(format) {
    const url = artworkUrl(format);
    const disabled = !selectedKey() || isCreateMode();
    const card = document.createElement('article');
    card.className = 'song-image-card';

    const head = document.createElement('div');
    head.className = 'song-image-card-head';
    head.innerHTML = `<div><strong>${format.label}</strong><small>Recommended ${format.width} × ${format.height}px</small></div><span class="song-image-ratio">${format.ratio}</span>`;

    const meta = document.createElement('div');
    meta.className = 'song-image-meta';
    meta.textContent = url ? 'Reading image dimensions…' : 'Missing. The system will use a fallback image when needed.';

    const uses = document.createElement('p');
    uses.className = 'song-image-uses';
    uses.textContent = format.uses;

    const actions = document.createElement('div');
    actions.className = 'song-image-actions';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
    fileInput.hidden = true;

    const upload = document.createElement('button');
    upload.type = 'button';
    upload.textContent = url ? 'Replace Image' : 'Upload Image';
    upload.disabled = disabled;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.disabled = disabled || !url;

    const open = document.createElement('a');
    open.textContent = 'Open Full Image';
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.href = url || '#';
    if (!url) open.classList.add('is-disabled');

    const status = document.createElement('div');
    status.className = 'song-image-status';
    if (disabled) status.textContent = 'Save and select the song to manage this image.';

    upload.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      uploadFile(format, file, status, card).catch(error => {
        status.className = 'song-image-status is-error';
        status.textContent = error.message;
        card.classList.remove('is-busy');
        notify(error.message, 'error');
      });
    });
    remove.addEventListener('click', () => {
      removeImage(format, status, card).catch(error => {
        status.className = 'song-image-status is-error';
        status.textContent = error.message;
        card.classList.remove('is-busy');
        notify(error.message, 'error');
      });
    });

    actions.append(upload, remove, open, fileInput);
    card.append(head, preview(format, url, meta), meta, uses, actions, status);
    return card;
  }

  function render() {
    if (!ensureSection()) return;
    const ready = formats.filter(format => artworkUrl(format)).length;
    state.progress.textContent = ready === 6 ? 'Complete Image Set' : `${ready} of 6 Images Ready`;
    state.note.textContent = state.error
      ? `The image set could not load: ${state.error}`
      : isCreateMode()
        ? 'Save the new song first. Its six prepared image formats will become available immediately afterward.'
        : 'Upload prepared artwork for Stashbox Radio, Social Factory, Video Factory and third-party social placements. The square image remains the primary song artwork.';
    state.grid.innerHTML = '';
    formats.forEach(format => state.grid.appendChild(buildCard(format)));
  }

  async function loadForSong(key) {
    state.loading = true;
    state.error = '';
    render();
    try {
      const result = await callAdminFetch(`${ARTWORK_API_ROOT}/${encodeURIComponent(key)}/artwork-images`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (key !== selectedKey()) return;
      state.media = result?.media || null;
      const squareUrl = clean(state.media?.song_artwork_url || state.media?.song_artwork_1x1_url);
      const squareInput = fieldInput('song_artwork_url');
      if (squareInput && squareUrl && !clean(squareInput.value)) squareInput.value = squareUrl;
    } catch (error) {
      if (key !== selectedKey()) return;
      state.media = null;
      state.error = error.message;
    } finally {
      if (key === selectedKey()) {
        state.loading = false;
        render();
      }
    }
  }

  function synchronize() {
    if (!ensureSection()) return;
    const key = selectedKey();
    const squareUrl = fieldValue('song_artwork_url');
    if (key !== state.key) {
      state.key = key;
      state.media = null;
      state.error = '';
      state.lastSquareUrl = squareUrl;
      render();
      if (key && !isCreateMode()) loadForSong(key);
      return;
    }
    if (squareUrl !== state.lastSquareUrl) {
      state.lastSquareUrl = squareUrl;
      render();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureSection();
    synchronize();
    window.setInterval(synchronize, 450);
  });
})();
