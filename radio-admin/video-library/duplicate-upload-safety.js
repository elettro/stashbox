(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration || window.__stashboxStagingDuplicateSafetyInstalled) return;
  window.__stashboxStagingDuplicateSafetyInstalled = true;

  const env = migration.getCanonicalVisualEnvironment();
  const FOLDERS_URL = `${env.apiBase}/admin/visuals/folders`;
  const nativeFetch = window.fetch.bind(window);
  let activeFolderId = '';
  let pendingReplace = null;
  let bypassNextUpload = false;

  const clean = value => String(value ?? '').trim();
  const normalizeName = value => clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();

  function getToken() {
    return clean(localStorage.getItem(env.tokenStorageKey));
  }

  function assetsUrl(folderId, assetId = '') {
    const base = `${FOLDERS_URL}/${encodeURIComponent(folderId)}/assets`;
    return assetId ? `${base}/${encodeURIComponent(assetId)}` : base;
  }

  async function adminFetch(url, options = {}) {
    if (!url.startsWith(`${FOLDERS_URL}/`)) throw new Error('Blocked duplicate-safety request outside canonical PROD Visual Folder assets.');
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) migration.assertCanonicalVisualWriteApproved('video-library-duplicate-safety');
    const token = getToken();
    if (!token) throw new Error('Save a PROD admin token first.');
    const response = await nativeFetch(url, {
      ...options,
      method,
      headers: {
        'x-admin-token': token,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      cache: method === 'GET' ? 'no-store' : undefined,
      credentials: 'omit'
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    return body;
  }

  function rows(data) {
    const source = Array.isArray(data) ? data : data?.assets || data?.items || data?.rows || [];
    return Array.isArray(source) ? source : [];
  }

  function installControl() {
    if (document.getElementById('duplicateUploadAction')) return;
    const typeLabel = document.getElementById('uploadAssetType')?.closest('label');
    if (!typeLabel) return;
    const label = document.createElement('label');
    label.innerHTML = `Duplicate Filename Action<select id="duplicateUploadAction"><option value="skip" selected>Skip existing filename</option><option value="replace">Replace existing asset</option><option value="keep">Keep Both · rename new file</option></select><span class="vl-muted">Checked within the active LIVE folder before upload.</span>`;
    typeLabel.insertAdjacentElement('afterend', label);
  }

  function message(text) {
    const node = document.getElementById('assetMessage');
    if (node) node.textContent = text;
  }

  function renamedFile(file, assets) {
    const names = new Set(assets.map(asset => normalizeName(asset.file_name)).filter(Boolean));
    const original = clean(file.name) || 'upload';
    const dot = original.lastIndexOf('.');
    const base = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot) : '';
    let count = 2;
    let candidate = `${base} (${count})${ext}`;
    while (names.has(normalizeName(candidate))) {
      count += 1;
      candidate = `${base} (${count})${ext}`;
    }
    return new File([file], candidate, { type: file.type, lastModified: file.lastModified });
  }

  function replaceInputFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  }

  async function cleanupReplacedAssets(folderId, assetIds) {
    const failures = [];
    for (const id of assetIds) {
      try { await adminFetch(assetsUrl(folderId, id), { method: 'DELETE' }); }
      catch (error) { failures.push(`${id}: ${error.message}`); }
    }
    if (failures.length) message(`New LIVE asset saved, but replacement cleanup had warnings: ${failures.join(' | ')}`);
  }

  window.fetch = async function duplicateAwareFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const response = await nativeFetch(input, init);
    if (pendingReplace && response.ok && method === 'POST' && url === assetsUrl(pendingReplace.folderId)) {
      const cleanup = pendingReplace;
      pendingReplace = null;
      await cleanupReplacedAssets(cleanup.folderId, cleanup.assetIds);
    }
    return response;
  };

  document.addEventListener('click', event => {
    const folderButton = event.target.closest('.manage-assets[data-folder-id]');
    if (folderButton) activeFolderId = clean(folderButton.dataset.folderId);
    if (event.target.closest('#closeAssets')) activeFolderId = '';
  }, true);

  document.addEventListener('click', async event => {
    const upload = event.target.closest('#uploadAsset');
    if (!upload) return;
    if (bypassNextUpload) {
      bypassNextUpload = false;
      return;
    }
    const input = document.getElementById('uploadAssetFile');
    const file = input?.files?.[0];
    if (!file || !activeFolderId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    upload.disabled = true;
    try {
      const data = await adminFetch(assetsUrl(activeFolderId));
      const assets = rows(data);
      const conflicts = assets.filter(asset => normalizeName(asset.file_name) === normalizeName(file.name));
      if (!conflicts.length) {
        bypassNextUpload = true;
        upload.disabled = false;
        upload.click();
        return;
      }

      const action = document.getElementById('duplicateUploadAction')?.value || 'skip';
      if (action === 'skip') {
        message(`Skipped ${file.name}: that filename already exists in this LIVE folder.`);
        return;
      }

      if (action === 'keep') {
        const renamed = renamedFile(file, assets);
        replaceInputFile(input, renamed);
        message(`Duplicate detected. Uploading as ${renamed.name}.`);
        bypassNextUpload = true;
        upload.disabled = false;
        upload.click();
        return;
      }

      pendingReplace = {
        folderId: activeFolderId,
        assetIds: conflicts.filter(asset => asset.id && clean(asset.status).toLowerCase() !== 'hidden').map(asset => String(asset.id))
      };
      message(`Duplicate detected. Saving the new ${file.name} first, then hiding ${pendingReplace.assetIds.length} existing match${pendingReplace.assetIds.length === 1 ? '' : 'es'}.`);
      bypassNextUpload = true;
      upload.disabled = false;
      upload.click();
    } catch (error) {
      pendingReplace = null;
      message(`Duplicate check failed: ${error.message}`);
    } finally {
      upload.disabled = false;
    }
  }, true);

  installControl();
})();
