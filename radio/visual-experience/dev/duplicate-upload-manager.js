(() => {
  'use strict';

  if (window.__stashboxVideoLibraryDuplicateManagerInstalled) return;
  window.__stashboxVideoLibraryDuplicateManagerInstalled = true;

  const CONTENT_CONFIG = window.StashboxCanonicalContent || Object.freeze({
    apiRoot: 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2',
    tokenStorageKey: 'radio_admin_token_prod'
  });
  const API_ROOT = CONTENT_CONFIG.apiRoot;
  const TOKEN_KEY = CONTENT_CONFIG.tokenStorageKey;
  const INPUT_TYPES = new Map([
    ['imageUploadInput', 'image'],
    ['clipUploadInput', 'clip']
  ]);
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const VIDEO_EXTENSIONS = new Set(['mp4']);

  let activeFolderId = '';
  let activeFolderName = '';
  let activeReview = null;
  let busy = false;

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function normalizeFileName(value) {
    return clean(value)
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function slugify(value) {
    return clean(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'visuals-folder';
  }

  function extensionOf(name) {
    const match = clean(name).match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function splitFileName(name) {
    const value = clean(name) || 'upload';
    const lastDot = value.lastIndexOf('.');
    if (lastDot <= 0) return { base: value, extension: '' };
    return { base: value.slice(0, lastDot), extension: value.slice(lastDot) };
  }

  function formatBytes(value) {
    let bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'size unavailable';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unit = 0;
    while (bytes >= 1024 && unit < units.length - 1) {
      bytes /= 1024;
      unit += 1;
    }
    return `${bytes.toFixed(bytes >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function formatDate(value) {
    if (!value) return 'date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleString();
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; }
    catch (_) { return ''; }
  }

  async function adminFetch(url, options = {}) {
    const token = getToken();
    if (!token) throw new Error('Enter your PROD admin token before uploading files.');
    const headers = { 'x-admin-token': token, ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { cache: 'no-store', ...options, headers });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `API request failed with ${response.status}.`);
    return body;
  }

  function assetsUrl(folderId, assetId = '') {
    const base = `${API_ROOT}/admin/visuals/folders/${encodeURIComponent(folderId)}/assets`;
    return assetId ? `${base}/${encodeURIComponent(assetId)}` : base;
  }

  function showLibraryMessage(message, type = 'success') {
    const target = document.getElementById('mediaMessage');
    if (!target) return;
    target.textContent = message;
    target.className = `message${type === 'error' ? ' error' : ''}`;
    target.classList.remove('hidden');
  }

  function installStyles() {
    if (document.getElementById('stashboxDuplicateUploadStyles')) return;
    const style = document.createElement('style');
    style.id = 'stashboxDuplicateUploadStyles';
    style.textContent = `
      .sbd-duplicate-note {
        margin: -.25rem 0 1rem;
        padding: .7rem .8rem;
        border: 1px dashed rgba(230,198,95,.42);
        border-radius: 14px;
        background: rgba(230,198,95,.08);
        color: #ffe7a1;
        font-size: .86rem;
        line-height: 1.45;
      }
      .sbd-review-root {
        position: fixed;
        inset: 0;
        z-index: 9000;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: rgba(0,0,0,.78);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .sbd-review-dialog {
        width: min(920px, 100%);
        max-height: min(90dvh, 900px);
        overflow: hidden;
        display: grid;
        grid-template-rows: auto auto minmax(0,1fr) auto;
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 24px;
        background: linear-gradient(180deg,#18231d,#0b100d);
        color: #f5fff8;
        box-shadow: 0 30px 100px rgba(0,0,0,.66);
      }
      .sbd-review-head,
      .sbd-review-bulk,
      .sbd-review-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .75rem;
        flex-wrap: wrap;
        padding: 1rem 1.15rem;
      }
      .sbd-review-head { border-bottom: 1px solid rgba(255,255,255,.1); }
      .sbd-review-head h2 { margin: 0; font-size: clamp(1.35rem,3vw,2rem); }
      .sbd-review-head p { width: 100%; margin: .15rem 0 0; color: #a8b8ad; line-height: 1.45; }
      .sbd-review-close {
        width: 38px;
        height: 38px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 50%;
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 24px;
        cursor: pointer;
      }
      .sbd-review-summary {
        display: flex;
        gap: .45rem;
        flex-wrap: wrap;
        padding: 0 1.15rem 1rem;
      }
      .sbd-review-summary span {
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px;
        padding: .35rem .65rem;
        background: rgba(255,255,255,.045);
        color: #dce8df;
        font-size: .8rem;
        font-weight: 800;
      }
      .sbd-review-bulk {
        justify-content: flex-start;
        padding-top: 0;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .sbd-review-bulk strong { margin-right: .25rem; font-size: .82rem; color: #a8b8ad; }
      .sbd-bulk-button,
      .sbd-review-actions button {
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        background: rgba(255,255,255,.07);
        color: #f5fff8;
        padding: .65rem .85rem;
        font: inherit;
        font-weight: 850;
        cursor: pointer;
      }
      .sbd-review-actions button.primary {
        border-color: #e6c65f;
        background: #e6c65f;
        color: #171308;
      }
      .sbd-review-actions button:disabled,
      .sbd-bulk-button:disabled,
      .sbd-review-close:disabled { opacity: .45; cursor: wait; }
      .sbd-review-list {
        min-height: 0;
        overflow: auto;
        display: grid;
        gap: .65rem;
        padding: 1rem 1.15rem;
      }
      .sbd-review-row {
        display: grid;
        grid-template-columns: minmax(0,1fr) minmax(12rem,15rem);
        gap: .85rem;
        align-items: center;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 16px;
        background: rgba(255,255,255,.04);
        padding: .8rem;
      }
      .sbd-review-row.is-new { border-color: rgba(69,196,111,.3); }
      .sbd-review-row.is-conflict { border-color: rgba(230,198,95,.35); }
      .sbd-file-copy { min-width: 0; display: grid; gap: .28rem; }
      .sbd-file-copy strong { overflow-wrap: anywhere; }
      .sbd-file-copy small { color: #a8b8ad; line-height: 1.4; }
      .sbd-file-copy b { color: #ffe07a; font-size: .76rem; letter-spacing: .04em; text-transform: uppercase; }
      .sbd-file-copy b.is-new { color: #83eba5; }
      .sbd-choice {
        display: grid;
        gap: .35rem;
        color: #a8b8ad;
        font-size: .76rem;
        font-weight: 800;
      }
      .sbd-choice select {
        width: 100%;
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 12px;
        background: #090d0b;
        color: #fff;
        padding: .7rem .75rem;
        font: inherit;
      }
      .sbd-review-status {
        flex: 1 1 20rem;
        margin: 0;
        color: #b8c6bc;
        line-height: 1.4;
      }
      .sbd-review-status.error { color: #ffb8b8; }
      @media (max-width: 650px) {
        .sbd-review-root { padding: .5rem; }
        .sbd-review-dialog { max-height: 96dvh; border-radius: 18px; }
        .sbd-review-row { grid-template-columns: 1fr; }
        .sbd-review-actions button { flex: 1 1 9rem; }
      }
    `;
    document.head.appendChild(style);
  }

  function installNote() {
    const uploadStatus = document.getElementById('uploadStatus');
    if (!uploadStatus || document.getElementById('stashboxDuplicateUploadNote')) return;
    const note = document.createElement('p');
    note.id = 'stashboxDuplicateUploadNote';
    note.className = 'sbd-duplicate-note';
    note.textContent = 'Duplicate safety is on. Before uploading, Stashbox compares filenames with this folder and lets you Skip, Replace, or Keep Both.';
    uploadStatus.insertAdjacentElement('afterend', note);
  }

  function validateFile(file, assetType) {
    const extension = extensionOf(file.name);
    if (assetType === 'image' && !IMAGE_EXTENSIONS.has(extension)) return 'Use JPG, JPEG, PNG, or WEBP.';
    if (assetType === 'clip' && !VIDEO_EXTENSIONS.has(extension)) return 'Use MP4.';
    return '';
  }

  async function loadFolderInfo(folderId) {
    const response = await adminFetch(`${API_ROOT}/admin/visuals/folders`);
    const folders = Array.isArray(response) ? response : (response.folders || response.items || []);
    const folder = folders.find(item => String(item.id || item.folder_id) === String(folderId));
    return {
      id: folderId,
      name: clean(folder?.folder_name || folder?.name || activeFolderName || 'Visual Library Folder'),
      slug: clean(folder?.folder_slug || folder?.slug || slugify(folder?.folder_name || folder?.name || activeFolderName))
    };
  }

  async function loadAssets(folderId) {
    const response = await adminFetch(assetsUrl(folderId));
    return Array.isArray(response) ? response : (response.assets || response.items || []);
  }

  function buildReview(files, assetType, folder, assets) {
    const byName = new Map();
    assets.forEach(asset => {
      const key = normalizeFileName(asset.file_name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(asset);
    });

    const incomingSeen = new Map();
    const rows = files.map((file, index) => {
      const key = normalizeFileName(file.name);
      const existing = byName.get(key) || [];
      const batchEarlier = incomingSeen.get(key) || [];
      const conflict = existing.length > 0 || batchEarlier.length > 0;
      const sameSize = existing.some(asset => Number(asset.size_bytes || 0) === Number(file.size || 0));
      const row = {
        id: `review-${index}-${Date.now()}`,
        file,
        assetType,
        existing,
        batchEarlier,
        conflict,
        sameSize,
        choice: conflict ? 'skip' : 'upload'
      };
      if (!incomingSeen.has(key)) incomingSeen.set(key, []);
      incomingSeen.get(key).push(row);
      return row;
    });

    return { folder, assetType, assets, rows };
  }

  function reviewStats(review) {
    const conflicts = review.rows.filter(row => row.conflict).length;
    return {
      total: review.rows.length,
      newFiles: review.rows.length - conflicts,
      conflicts
    };
  }

  function existingDescription(row) {
    if (row.existing.length) {
      const newest = [...row.existing].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
      const status = clean(newest.status || 'active');
      const sizeMatch = row.sameSize ? ' · same file size' : '';
      return `${row.existing.length} matching library file${row.existing.length === 1 ? '' : 's'} · ${formatBytes(newest.size_bytes)} · ${status} · ${formatDate(newest.updated_at || newest.created_at)}${sizeMatch}`;
    }
    return `${row.batchEarlier.length} earlier file${row.batchEarlier.length === 1 ? '' : 's'} with this name in the selected batch.`;
  }

  function closeReview(force = false) {
    if (busy && !force) return;
    activeReview?.root?.remove();
    activeReview = null;
  }

  function setReviewStatus(message, isError = false) {
    const node = activeReview?.root?.querySelector('[data-sbd-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', isError);
  }

  function updateReviewChoicesFromDom() {
    if (!activeReview) return;
    activeReview.review.rows.forEach(row => {
      const select = activeReview.root.querySelector(`[data-sbd-choice="${CSS.escape(row.id)}"]`);
      if (select) row.choice = select.value;
    });
  }

  function setAllConflictChoices(choice) {
    if (!activeReview || busy) return;
    activeReview.review.rows.filter(row => row.conflict).forEach(row => {
      row.choice = choice;
      const select = activeReview.root.querySelector(`[data-sbd-choice="${CSS.escape(row.id)}"]`);
      if (select) select.value = choice;
    });
  }

  function openReview(review) {
    closeReview(true);
    const stats = reviewStats(review);
    const root = document.createElement('div');
    root.className = 'sbd-review-root';
    root.innerHTML = `
      <section class="sbd-review-dialog" role="dialog" aria-modal="true" aria-labelledby="sbdReviewTitle">
        <header class="sbd-review-head">
          <div>
            <h2 id="sbdReviewTitle">Review duplicate files</h2>
            <p>Stashbox checked <strong>${esc(review.folder.name)}</strong> before uploading. New files will upload normally. Choose what to do with matching filenames.</p>
          </div>
          <button class="sbd-review-close" type="button" data-sbd-cancel aria-label="Cancel upload">×</button>
        </header>
        <div>
          <div class="sbd-review-summary">
            <span>${stats.total} selected</span>
            <span>${stats.newFiles} new</span>
            <span>${stats.conflicts} already present</span>
          </div>
          <div class="sbd-review-bulk">
            <strong>For all duplicates:</strong>
            <button class="sbd-bulk-button" type="button" data-sbd-bulk="skip">Skip All</button>
            <button class="sbd-bulk-button" type="button" data-sbd-bulk="replace">Replace All</button>
            <button class="sbd-bulk-button" type="button" data-sbd-bulk="keep">Keep Both All</button>
          </div>
        </div>
        <div class="sbd-review-list">
          ${review.rows.map(row => `
            <article class="sbd-review-row ${row.conflict ? 'is-conflict' : 'is-new'}">
              <div class="sbd-file-copy">
                <b class="${row.conflict ? '' : 'is-new'}">${row.conflict ? 'Filename already exists' : 'New file'}</b>
                <strong>${esc(row.file.name)}</strong>
                <small>Incoming: ${formatBytes(row.file.size)}${row.conflict ? `<br>Existing: ${esc(existingDescription(row))}` : ''}</small>
              </div>
              ${row.conflict ? `
                <label class="sbd-choice">Action
                  <select data-sbd-choice="${esc(row.id)}">
                    <option value="skip" selected>Skip this file</option>
                    <option value="replace">Replace existing file</option>
                    <option value="keep">Keep both — rename new file</option>
                  </select>
                </label>` : '<div class="sbd-choice"><span>Action</span><strong>Upload new file</strong></div>'}
            </article>`).join('')}
        </div>
        <footer class="sbd-review-actions">
          <p class="sbd-review-status" data-sbd-status>${stats.conflicts ? 'Nothing has uploaded yet. Review the duplicate choices, then continue.' : 'No duplicates found.'}</p>
          <button type="button" data-sbd-cancel>Cancel</button>
          <button class="primary" type="button" data-sbd-continue>Continue Upload</button>
        </footer>
      </section>`;
    document.body.appendChild(root);
    activeReview = { root, review };

    root.addEventListener('change', event => {
      const select = event.target.closest('[data-sbd-choice]');
      if (!select) return;
      const row = review.rows.find(item => item.id === select.dataset.sbdChoice);
      if (row) row.choice = select.value;
    });
    root.addEventListener('click', event => {
      const bulk = event.target.closest('[data-sbd-bulk]');
      if (bulk) return setAllConflictChoices(bulk.dataset.sbdBulk);
      if (event.target.closest('[data-sbd-cancel]')) return closeReview();
      if (event.target.closest('[data-sbd-continue]')) executeReview();
    });
  }

  function nextAvailableFile(file, reservedNames) {
    const parts = splitFileName(file.name);
    let counter = 2;
    let candidate = `${parts.base} (${counter})${parts.extension}`;
    while (reservedNames.has(normalizeFileName(candidate))) {
      counter += 1;
      candidate = `${parts.base} (${counter})${parts.extension}`;
    }
    reservedNames.add(normalizeFileName(candidate));
    return new File([file], candidate, { type: file.type, lastModified: file.lastModified });
  }

  function defaultContentType(file, assetType) {
    if (file.type) return file.type;
    if (assetType === 'clip') return 'video/mp4';
    const extension = extensionOf(file.name);
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    return 'image/jpeg';
  }

  async function requestPresign(folder, file, assetType) {
    return adminFetch(`${API_ROOT}/admin/uploads/presign`, {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        content_type: defaultContentType(file, assetType),
        purpose: assetType === 'clip' ? 'visual_folder_clip' : 'visual_folder_image',
        folder_slug: folder.slug,
        folder_id: folder.id
      })
    });
  }

  async function uploadObject(presign, file, assetType) {
    const uploadUrl = presign.uploadUrl || presign.upload_url;
    if (!uploadUrl) throw new Error('The upload service did not return an S3 upload URL.');
    const contentType = defaultContentType(file, assetType);
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!response.ok) throw new Error(`S3 upload failed with ${response.status}.`);
    const publicUrl = presign.publicUrl || presign.public_url;
    if (!publicUrl) throw new Error('The upload service did not return a public URL.');
    return { publicUrl, contentType, key: presign.key || presign.object_key || '' };
  }

  async function createRecord(review, row, file, uploaded) {
    const source = row.existing[0] || {};
    const payload = {
      asset_type: row.assetType,
      file_name: file.name,
      s3_key: uploaded.key,
      public_url: uploaded.publicUrl,
      thumbnail_url: uploaded.publicUrl,
      content_type: uploaded.contentType,
      size_bytes: file.size,
      width: null,
      height: null,
      ratio_label: '',
      status: 'active',
      caption: row.choice === 'replace' ? clean(source.caption) : '',
      alt_text: row.choice === 'replace' ? clean(source.alt_text) : '',
      notes: row.choice === 'replace' ? clean(source.notes) : '',
      shopify_product_urls: row.assetType === 'clip' && row.choice === 'replace'
        ? (Array.isArray(source.shopify_product_urls) ? source.shopify_product_urls : [])
        : []
    };
    const response = await adminFetch(assetsUrl(review.folder.id), { method: 'POST', body: JSON.stringify(payload) });
    return response.asset || response;
  }

  async function hideReplacedAssets(review, row) {
    const failures = [];
    for (const asset of row.existing) {
      if (!asset?.id || clean(asset.status).toLowerCase() === 'hidden') continue;
      try {
        await adminFetch(assetsUrl(review.folder.id, asset.id), { method: 'DELETE' });
      } catch (error) {
        failures.push(`${clean(asset.file_name) || asset.id}: ${error.message}`);
      }
    }
    return failures;
  }

  async function processRow(review, row, file) {
    const presign = await requestPresign(review.folder, file, row.assetType);
    const uploaded = await uploadObject(presign, file, row.assetType);
    await createRecord(review, row, file, uploaded);
    if (row.choice === 'replace') return hideReplacedAssets(review, row);
    return [];
  }

  function setBusyState(value) {
    busy = value;
    activeReview?.root?.querySelectorAll('button, select').forEach(control => { control.disabled = value; });
  }

  async function refreshFolderPanel(folderId) {
    const close = document.getElementById('closeMediaPanel');
    close?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    const opener = document.querySelector(`[data-media="${CSS.escape(String(folderId))}"]`);
    opener?.click();
  }

  async function executeReview() {
    if (!activeReview || busy) return;
    updateReviewChoicesFromDom();
    const { review } = activeReview;
    const reservedNames = new Set(review.assets.map(asset => normalizeFileName(asset.file_name)).filter(Boolean));
    const plan = [];

    review.rows.forEach(row => {
      if (row.choice === 'skip') return;
      let file = row.file;
      if (row.choice === 'keep') file = nextAvailableFile(file, reservedNames);
      else reservedNames.add(normalizeFileName(file.name));
      plan.push({ row, file });
    });

    if (!plan.length) {
      const skipped = review.rows.filter(row => row.choice === 'skip').length;
      showLibraryMessage(`No files uploaded. ${skipped} existing file${skipped === 1 ? ' was' : 's were'} skipped.`);
      closeReview(true);
      return;
    }

    setBusyState(true);
    const failures = [];
    const warnings = [];
    let completed = 0;

    for (const item of plan) {
      setReviewStatus(`Uploading ${completed + 1} of ${plan.length}: ${item.file.name}`);
      try {
        const hideFailures = await processRow(review, item.row, item.file);
        warnings.push(...hideFailures);
        completed += 1;
      } catch (error) {
        failures.push(`${item.file.name}: ${error.message || 'Upload failed.'}`);
      }
    }

    setBusyState(false);
    if (failures.length) {
      setReviewStatus(`${completed} uploaded; ${failures.length} failed. ${failures.join(' | ')}`, true);
      showLibraryMessage(`${completed} file${completed === 1 ? '' : 's'} uploaded; ${failures.length} failed.`, 'error');
      return;
    }

    const skipped = review.rows.filter(row => row.choice === 'skip').length;
    const replaced = review.rows.filter(row => row.choice === 'replace').length;
    const kept = review.rows.filter(row => row.choice === 'keep').length;
    const summary = [
      `${completed} uploaded`,
      replaced ? `${replaced} replaced` : '',
      kept ? `${kept} kept as renamed copies` : '',
      skipped ? `${skipped} skipped` : ''
    ].filter(Boolean).join(' · ');

    const completionMessage = warnings.length ? `${summary}. Replacement cleanup warning: ${warnings.join(' | ')}` : `${summary}. Folder list refreshed.`;
    const completionType = warnings.length ? 'error' : 'success';
    closeReview(true);
    await refreshFolderPanel(review.folder.id);
    window.setTimeout(() => showLibraryMessage(completionMessage, completionType), 220);
  }

  async function inspectSelection(files, assetType) {
    const valid = [];
    const invalid = [];
    files.forEach(file => {
      const error = validateFile(file, assetType);
      if (error) invalid.push(`${file.name}: ${error}`);
      else valid.push(file);
    });

    if (invalid.length) showLibraryMessage(invalid.join(' '), 'error');
    if (!valid.length) return;
    if (!activeFolderId) throw new Error('Open a Video Library folder with Manage Files before selecting files.');

    showLibraryMessage(`Checking ${valid.length} selected file${valid.length === 1 ? '' : 's'} against this folder…`);
    const [folder, assets] = await Promise.all([loadFolderInfo(activeFolderId), loadAssets(activeFolderId)]);
    const review = buildReview(valid, assetType, folder, assets);
    const stats = reviewStats(review);

    if (stats.conflicts) {
      openReview(review);
      return;
    }

    openReview(review);
    setReviewStatus('No duplicate filenames found. Uploading automatically…');
    window.setTimeout(() => executeReview(), 350);
  }

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-media]');
    if (opener) {
      activeFolderId = clean(opener.dataset.media);
      activeFolderName = clean(opener.closest('.folder-card')?.querySelector('h3')?.textContent);
      window.setTimeout(installNote, 30);
    }
  }, true);

  document.addEventListener('change', event => {
    const input = event.target;
    const assetType = INPUT_TYPES.get(input?.id);
    if (!assetType || !input.files?.length) return;

    const files = [...input.files];
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';

    inspectSelection(files, assetType).catch(error => {
      console.error('[Video Library duplicate manager]', error);
      showLibraryMessage(error.message || 'Could not check for duplicate files.', 'error');
    });
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeReview && !busy) closeReview();
  });

  installStyles();
  installNote();
})();
