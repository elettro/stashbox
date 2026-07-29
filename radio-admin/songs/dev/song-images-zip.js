(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTWORK_API_ROOT = `${API_ROOT}/radio/admin/songs`;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_ZIP_BYTES = 150 * 1024 * 1024;
  const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const MIME_BY_EXTENSION = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };

  const formats = [
    { ratio: '1x1', field: 'song_artwork_url', width: 2000, height: 2000 },
    { ratio: '9x16', field: 'song_artwork_9x16_url', width: 1080, height: 1920 },
    { ratio: '16x9', field: 'song_artwork_16x9_url', width: 1920, height: 1080 },
    { ratio: '3x4', field: 'song_artwork_3x4_url', width: 1200, height: 1600 },
    { ratio: '4x5', field: 'song_artwork_4x5_url', width: 1080, height: 1350 },
    { ratio: '21x9', field: 'song_artwork_21x9_url', width: 2520, height: 1080 }
  ];

  const state = {
    busy: false,
    section: null,
    button: null,
    input: null,
    status: null
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

  function fieldValue(name) {
    return clean(document.getElementById(`field_${name}`)?.value);
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

  function setStatus(message, type = '') {
    if (!state.status) return;
    state.status.textContent = message;
    state.status.className = `song-image-zip-status${type ? ` is-${type}` : ''}`;
  }

  function updateAvailability() {
    if (!state.button) return;
    const unavailable = state.busy || !selectedKey() || isCreateMode();
    state.button.disabled = unavailable;
    if (!state.busy && !selectedKey()) setStatus('Select an existing song before uploading a ZIP.');
    else if (!state.busy && isCreateMode()) setStatus('Save the new song first, then upload its image ZIP.');
    else if (!state.busy && !state.status?.dataset.result) setStatus('Complete and partial ZIP image sets are accepted.');
  }

  function injectStyles() {
    if (document.getElementById('songImageZipStyles')) return;
    const style = document.createElement('style');
    style.id = 'songImageZipStyles';
    style.textContent = `
      .song-image-zip-controls{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:220px;max-width:310px}
      .song-image-zip-button{font:inherit;font-weight:900;font-size:.78rem;border-radius:10px;padding:9px 12px;border:1px solid rgba(240,192,76,.58);background:rgba(240,192,76,.12);color:#fff1bd;cursor:pointer}
      .song-image-zip-button:hover:not(:disabled){border-color:#f0c04c;background:rgba(240,192,76,.2)}
      .song-image-zip-button:disabled{opacity:.42;cursor:not-allowed}
      .song-image-zip-status{color:#9ea8a3;font-size:.73rem;line-height:1.35;text-align:right;min-height:18px}
      .song-image-zip-status.is-working{color:#f0c04c}
      .song-image-zip-status.is-success{color:#a9edc5}
      .song-image-zip-status.is-error{color:#ffb1b1}
      @media(max-width:640px){.song-image-zip-controls{max-width:none;min-width:0;margin-top:12px}.song-image-zip-status{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function ensureControls() {
    const section = document.querySelector('.song-images-section');
    const progress = section?.querySelector('#songImagesProgress');
    if (!section || !progress) return false;
    if (state.section === section && state.button?.isConnected) return true;

    injectStyles();
    const wrap = document.createElement('div');
    wrap.className = 'song-image-zip-controls';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'song-image-zip-button';
    button.textContent = 'Upload Image ZIP';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.hidden = true;

    const status = document.createElement('div');
    status.className = 'song-image-zip-status';
    status.setAttribute('aria-live', 'polite');

    progress.replaceWith(wrap);
    wrap.append(progress, button, input, status);

    state.section = section;
    state.button = button;
    state.input = input;
    state.status = status;

    button.addEventListener('click', () => {
      input.value = '';
      input.click();
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      processZip(file).catch((error) => {
        state.busy = false;
        setStatus(error?.message || 'The ZIP upload failed.', 'error');
        state.status.dataset.result = 'error';
        notify(error?.message || 'The ZIP upload failed.', 'error');
        updateAvailability();
      });
    });

    updateAvailability();
    return true;
  }

  function extensionFor(name) {
    return clean(name).split('.').pop().toLowerCase();
  }

  function baseName(name) {
    return clean(name).split('/').pop();
  }

  function formatFromName(name) {
    const normalized = baseName(name).toLowerCase().replaceAll('×', 'x');
    return formats.find((format) => {
      const escaped = format.ratio.replace('x', '[xX]');
      return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`, 'i').test(normalized);
    }) || null;
  }

  function findEndOfCentralDirectory(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser does not support ZIP decompression. Update Chrome and try again.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZipEntries(file) {
    if (!file) throw new Error('Choose a ZIP file first.');
    if (file.size > MAX_ZIP_BYTES) throw new Error('The ZIP must be 150 MB or smaller.');

    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error('The selected file is not a readable ZIP package.');

    const totalEntries = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    if (totalEntries === 0xffff || centralOffset === 0xffffffff) {
      throw new Error('ZIP64 packages are not supported. Create a standard ZIP and try again.');
    }

    const decoder = new TextDecoder('utf-8');
    const entries = [];
    let cursor = centralOffset;

    for (let index = 0; index < totalEntries; index += 1) {
      if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
        throw new Error('The ZIP directory is damaged or incomplete.');
      }

      const flags = view.getUint16(cursor + 8, true);
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const nameStart = cursor + 46;
      const nameEnd = nameStart + nameLength;

      if (nameEnd > view.byteLength || localOffset + 30 > view.byteLength) {
        throw new Error('The ZIP contains an invalid file record.');
      }

      const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength));
      cursor = nameEnd + extraLength + commentLength;
      if (!name || name.endsWith('/') || name.includes('__MACOSX/')) continue;
      if (flags & 0x0001) throw new Error('Password-protected ZIP files are not supported.');
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new Error('ZIP64 image entries are not supported.');
      }
      if (view.getUint32(localOffset, true) !== 0x04034b50) {
        throw new Error(`The ZIP file record for ${baseName(name)} is invalid.`);
      }

      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > view.byteLength) throw new Error(`The ZIP entry ${baseName(name)} is incomplete.`);

      const compressed = new Uint8Array(buffer, dataStart, compressedSize);
      let bytes;
      if (method === 0) bytes = new Uint8Array(compressed);
      else if (method === 8) bytes = await inflateRaw(compressed);
      else throw new Error(`The ZIP uses an unsupported compression method for ${baseName(name)}.`);

      if (uncompressedSize && bytes.byteLength !== uncompressedSize) {
        throw new Error(`The extracted size for ${baseName(name)} does not match the ZIP record.`);
      }
      entries.push({ name, bytes });
    }

    return entries;
  }

  function imageFileFromEntry(entry) {
    const name = baseName(entry.name);
    const extension = extensionFor(name);
    if (!ACCEPTED_EXTENSIONS.has(extension)) return null;
    return new File([entry.bytes], name, { type: MIME_BY_EXTENSION[extension] });
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
        reject(new Error(`${file.name} is not a readable image.`));
      };
      image.src = objectUrl;
    });
  }

  function warnings(format, size) {
    const messages = [];
    const actualRatio = size.width / Math.max(1, size.height);
    const expectedRatio = format.width / format.height;
    if (Math.abs(actualRatio - expectedRatio) / expectedRatio > 0.04) {
      messages.push(`is ${size.width}:${size.height}, not ${format.ratio}`);
    }
    if (size.width < format.width || size.height < format.height) {
      messages.push(`is below ${format.width} × ${format.height}px`);
    }
    return messages;
  }

  async function collectMatches(zipFile) {
    const entries = await readZipEntries(zipFile);
    const matches = new Map();

    for (const entry of entries) {
      const file = imageFileFromEntry(entry);
      if (!file) continue;
      const format = formatFromName(file.name);
      if (!format) continue;
      if (matches.has(format.ratio)) {
        throw new Error(`The ZIP contains more than one ${format.ratio} image. Keep one file per ratio.`);
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`${file.name} exceeds the 10 MB image limit.`);
      }
      matches.set(format.ratio, { format, file });
    }

    if (!matches.size) {
      throw new Error('No supported ratio files were found. Include 1x1, 9x16, 16x9, 3x4, 4x5 or 21x9 in each image filename.');
    }

    return formats.filter((format) => matches.has(format.ratio)).map((format) => matches.get(format.ratio));
  }

  async function validateMatches(matches) {
    const issues = [];
    for (const match of matches) {
      match.size = await dimensionsFor(match.file);
      const fileWarnings = warnings(match.format, match.size);
      if (fileWarnings.length) issues.push(`${match.format.ratio} ${match.file.name}: ${fileWarnings.join(' and ')}`);
    }
    if (issues.length) {
      const proceed = window.confirm(`The ZIP contains image warnings:\n\n${issues.join('\n')}\n\nUpload these files anyway?`);
      if (!proceed) throw new Error('ZIP upload cancelled.');
    }
  }

  async function uploadOne(match, songKey, index, total) {
    setStatus(`Uploading ${index + 1} of ${total}: ${match.format.ratio}…`, 'working');
    const presign = await callAdminFetch(UPLOAD_PRESIGN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        song_key: songKey,
        song_name: fieldValue('song_name') || fieldValue('display_title') || songKey,
        artist: fieldValue('artist'),
        purpose: 'artwork',
        filename: `${match.format.ratio}-${match.file.name}`,
        content_type: match.file.type
      })
    });

    const uploadUrl = clean(presign?.upload_url || presign?.uploadUrl);
    const publicUrl = clean(presign?.public_url || presign?.publicUrl);
    if (!uploadUrl || !publicUrl) throw new Error(`Upload authorization failed for ${match.format.ratio}.`);

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': match.file.type },
      body: match.file
    });
    if (!put.ok) throw new Error(`${match.format.ratio} storage upload failed with status ${put.status}.`);
    return publicUrl;
  }

  function refreshSongImagesModule(songKey, squareUrl = '') {
    const keyPill = document.getElementById('selectedSongKey');
    const originalPillText = keyPill?.textContent || '';
    const squareInput = document.getElementById('field_song_artwork_url');

    if (squareUrl && squareInput) {
      squareInput.value = squareUrl;
      squareInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    try { selectedSongKey = ''; } catch (_) {}
    if (keyPill) keyPill.textContent = '';

    window.setTimeout(() => {
      try { selectedSongKey = songKey; } catch (_) {}
      if (keyPill) keyPill.textContent = originalPillText || songKey;
    }, 650);
  }

  async function processZip(zipFile) {
    const songKey = selectedKey();
    if (!songKey || isCreateMode()) throw new Error('Select and save an existing song before uploading a ZIP.');
    if (!/\.zip$/i.test(zipFile.name) && !String(zipFile.type).includes('zip')) {
      throw new Error('Choose a .zip image package.');
    }

    state.busy = true;
    state.status.dataset.result = '';
    updateAvailability();
    setStatus('Reading ZIP package…', 'working');

    const matches = await collectMatches(zipFile);
    setStatus(`Found ${matches.length} matching image${matches.length === 1 ? '' : 's'}. Validating…`, 'working');
    await validateMatches(matches);

    const patch = {};
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      patch[match.format.field] = await uploadOne(match, songKey, index, matches.length);
    }

    setStatus('Saving the image set to the song…', 'working');
    await callAdminFetch(`${ARTWORK_API_ROOT}/${encodeURIComponent(songKey)}/artwork-images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });

    refreshSongImagesModule(songKey, patch.song_artwork_url || '');
    state.busy = false;
    const ratios = matches.map((match) => match.format.ratio).join(', ');
    setStatus(`Uploaded ${matches.length} image${matches.length === 1 ? '' : 's'}: ${ratios}.`, 'success');
    state.status.dataset.result = 'success';
    notify(`ZIP image set uploaded: ${ratios}.`, 'success');
    updateAvailability();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureControls();
    window.setInterval(() => {
      ensureControls();
      updateAvailability();
    }, 450);
  });
})();
