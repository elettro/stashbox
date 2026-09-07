(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const DEV_MEDIA_BUCKET = 'stashbox-radio-media-dev-us-east-1';
  const PROD_MEDIA_BUCKET = 'stashbox-radio-media-prod-us-east-1';
  const FOLDERS_URL = `${env.apiBase}/admin/visuals/folders`;
  const MAPPING_URL = `${env.apiBase}/admin/visuals/song-folders`;
  const PRESIGN_URL = `${env.apiBase}/admin/uploads/presign`;
  const SONGS_URL = `${env.apiBase}/admin/songs`;

  const els = {
    token: document.getElementById('adminToken'), saveToken: document.getElementById('saveToken'), clearToken: document.getElementById('clearToken'), tokenStatus: document.getElementById('tokenStatus'),
    search: document.getElementById('folderSearch'), refresh: document.getElementById('refreshFolders'), message: document.getElementById('videoLibraryMessage'), count: document.getElementById('folderCount'), body: document.getElementById('foldersBody'), newFolder: document.getElementById('newFolder'),
    editorCard: document.getElementById('folderEditorCard'), editorHeading: document.getElementById('folderEditorHeading'), form: document.getElementById('folderForm'), id: document.getElementById('folderId'), name: document.getElementById('folderName'), type: document.getElementById('folderType'), status: document.getElementById('folderStatus'), priority: document.getElementById('folderPriority'), description: document.getElementById('folderDescription'), artists: document.getElementById('folderArtists'), genres: document.getElementById('folderGenres'), moods: document.getElementById('folderMoods'), songs: document.getElementById('folderSongs'), notes: document.getElementById('folderNotes'), saveFolder: document.getElementById('saveFolder'), cancelFolder: document.getElementById('cancelFolder'),
    mappingSong: document.getElementById('mappingSong'), visualMixMode: document.getElementById('visualMixMode'), mappingStatus: document.getElementById('mappingStatus'), mappingFolders: document.getElementById('mappingFolders'), reloadMapping: document.getElementById('reloadMapping'), saveMapping: document.getElementById('saveMapping'),
    assetCard: document.getElementById('assetManagerCard'), assetHeading: document.getElementById('assetManagerHeading'), assetMeta: document.getElementById('assetManagerMeta'), assetMessage: document.getElementById('assetMessage'), closeAssets: document.getElementById('closeAssets'), uploadType: document.getElementById('uploadAssetType'), uploadFile: document.getElementById('uploadAssetFile'), uploadCaption: document.getElementById('uploadCaption'), uploadAlt: document.getElementById('uploadAltText'), uploadNotes: document.getElementById('uploadNotes'), uploadProducts: document.getElementById('uploadProductUrls'), uploadAsset: document.getElementById('uploadAsset'), refreshAssets: document.getElementById('refreshAssets'), assetsList: document.getElementById('assetsList')
  };

  let folders = [];
  let cmsSongs = [];
  let mappingFolders = [];
  let mappingSelected = new Set();
  let activeFolder = null;
  let activeAssets = [];

  function getToken() {
    const direct = localStorage.getItem(env.tokenStorageKey);
    if (direct) return String(direct).trim();
    for (const key of env.legacyTokenStorageKeys || []) {
      const value = localStorage.getItem(key);
      if (value) return String(value).trim();
    }
    return '';
  }

  function updateTokenStatus() {
    const token = getToken();
    els.token.value = token;
    els.tokenStatus.textContent = token ? 'DEV admin token available.' : 'No DEV admin token saved.';
  }

  function isAllowedApiUrl(url) {
    return url === SONGS_URL || url === PRESIGN_URL || url === FOLDERS_URL || url.startsWith(`${FOLDERS_URL}/`) || url.startsWith(`${MAPPING_URL}/`);
  }

  async function apiRequest(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (!url.startsWith(env.apiBase) || !isAllowedApiUrl(url)) throw new Error('Blocked request outside the DEV Video Library API boundary.');
    if (!['GET', 'HEAD'].includes(method)) {
      if (url === SONGS_URL) throw new Error('Blocked write to Song CMS from Video Library.');
      migration.assertWriteAllowed('dev', 'video-library');
    }
    const token = getToken();
    if (!token) throw new Error('Save a DEV admin token first.');
    const response = await fetch(url, {
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
    if (text) {
      try { body = JSON.parse(text); } catch { body = { error: text }; }
    }
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch {}
    }
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    return body;
  }

  function splitValues(value) {
    return [...new Set(String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean))];
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function slugify(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'visual-folder'; }
  function normalizeList(value) { return Array.isArray(value) ? value.map(String).map(v => v.trim()).filter(Boolean) : splitValues(value); }
  function normalizeFolder(folder = {}) {
    return {
      ...folder,
      id: String(folder.id || folder.folder_id || ''),
      folder_name: folder.folder_name || folder.name || '',
      folder_slug: folder.folder_slug || folder.slug || slugify(folder.folder_name || folder.name || ''),
      folder_type: String(folder.folder_type || folder.type || 'general').toLowerCase(),
      status: String(folder.status || 'active').toLowerCase(),
      priority: String(folder.priority || 'medium').toLowerCase(),
      description: folder.description || '', notes: folder.notes || '',
      relevant_artists: normalizeList(folder.relevant_artists || folder.artists), relevant_genres: normalizeList(folder.relevant_genres || folder.genres), relevant_moods: normalizeList(folder.relevant_moods || folder.moods), relevant_songs: normalizeList(folder.relevant_songs || folder.songs),
      asset_count: Number(folder.asset_count || folder.assets_count || 0), images_count: Number(folder.images_count || folder.image_count || 0), clips_count: Number(folder.clips_count || folder.clip_count || 0), selected: folder.selected === true
    };
  }
  function folderRows(data) {
    const source = Array.isArray(data) ? data : data?.folders || data?.items || data?.rows || data?.data || [];
    return Array.isArray(source) ? source.map(normalizeFolder).filter(folder => folder.id || folder.folder_name) : [];
  }
  function normalizeAsset(asset = {}) {
    return {
      ...asset,
      id: String(asset.id || asset.asset_id || asset.s3_key || asset.public_url || ''),
      asset_type: String(asset.asset_type || asset.type || 'image').toLowerCase() === 'clip' ? 'clip' : 'image',
      file_name: asset.file_name || asset.name || asset.title || 'Untitled asset',
      public_url: asset.public_url || asset.url || asset.asset_url || '',
      content_type: asset.content_type || asset.mime_type || '', status: asset.status || 'active', caption: asset.caption || '', alt_text: asset.alt_text || '', notes: asset.notes || asset.description || '', shopify_product_urls: normalizeList(asset.shopify_product_urls || asset.shopifyProductUrls || [])
    };
  }
  function assetRows(data) {
    const source = Array.isArray(data) ? data : data?.assets || data?.items || data?.rows || [];
    return Array.isArray(source) ? source.map(normalizeAsset).filter(asset => asset.id) : [];
  }

  function renderFolders() {
    const q = String(els.search.value || '').trim().toLowerCase();
    const rows = q ? folders.filter(folder => [folder.folder_name, folder.folder_type, folder.status, folder.priority, ...folder.relevant_artists, ...folder.relevant_genres, ...folder.relevant_moods, ...folder.relevant_songs].join(' ').toLowerCase().includes(q)) : folders;
    els.count.textContent = `${rows.length.toLocaleString()} of ${folders.length.toLocaleString()} DEV folders shown`;
    if (!rows.length) { els.body.innerHTML = '<tr><td colspan="7" class="muted">No matching DEV visual folders.</td></tr>'; return; }
    els.body.innerHTML = rows.map(folder => {
      const targets = [...folder.relevant_artists, ...folder.relevant_genres, ...folder.relevant_moods, ...folder.relevant_songs].slice(0, 5);
      return `<tr><td><div class="vl-actions"><button class="secondary edit-folder" data-folder-id="${escapeHtml(folder.id)}" type="button">Edit</button><button class="secondary manage-assets" data-folder-id="${escapeHtml(folder.id)}" type="button">Files</button></div></td><td><strong>${escapeHtml(folder.folder_name)}</strong><br><code>${escapeHtml(folder.folder_slug)}</code></td><td>${escapeHtml(folder.folder_type)}</td><td>${escapeHtml(folder.status)}</td><td>${escapeHtml(folder.priority)}</td><td>${Number(folder.asset_count || 0).toLocaleString()}</td><td>${escapeHtml(targets.join(', ') || '—')}</td></tr>`;
    }).join('');
  }

  async function loadFolders() {
    els.refresh.disabled = true; els.message.textContent = 'Loading authoritative DEV visual folders…';
    try {
      const data = await apiRequest(FOLDERS_URL);
      folders = folderRows(data);
      renderFolders();
      els.message.textContent = `Loaded ${folders.length} DEV visual folder${folders.length === 1 ? '' : 's'}. Folder and asset writes are DEV-only.`;
    } catch (error) {
      folders = []; renderFolders(); els.message.textContent = `DEV Video Library load failed: ${error.message}`;
    } finally { els.refresh.disabled = false; updateTokenStatus(); }
  }

  function fillFolderEditor(folder = {}) {
    els.id.value = folder.id || ''; els.name.value = folder.folder_name || ''; els.type.value = folder.folder_type || 'general'; els.status.value = folder.status || 'active'; els.priority.value = folder.priority || 'medium'; els.description.value = folder.description || ''; els.artists.value = (folder.relevant_artists || []).join(', '); els.genres.value = (folder.relevant_genres || []).join(', '); els.moods.value = (folder.relevant_moods || []).join(', '); els.songs.value = (folder.relevant_songs || []).join(', '); els.notes.value = folder.notes || '';
    const editing = Boolean(folder.id); els.editorHeading.textContent = editing ? `Edit DEV Folder: ${folder.folder_name}` : 'New DEV Visual Folder'; els.saveFolder.textContent = editing ? 'Save DEV Folder Changes' : 'Create DEV Folder'; els.editorCard.classList.remove('vl-hidden');
  }
  function closeFolderEditor() { els.form.reset(); els.id.value = ''; els.editorCard.classList.add('vl-hidden'); }
  function folderPayload() {
    const data = { folder_name: els.name.value.trim(), folder_type: els.type.value, description: els.description.value.trim(), status: els.status.value, priority: els.priority.value, notes: els.notes.value.trim(), relevant_artists: splitValues(els.artists.value), relevant_genres: splitValues(els.genres.value), relevant_moods: splitValues(els.moods.value), relevant_songs: splitValues(els.songs.value) };
    if (!data.folder_name) throw new Error('Folder Name is required.');
    return data;
  }
  async function saveFolder(event) {
    event.preventDefault();
    let data; try { data = folderPayload(); } catch (error) { els.message.textContent = error.message; return; }
    const id = String(els.id.value || '').trim();
    const url = id ? `${FOLDERS_URL}/${encodeURIComponent(id)}` : FOLDERS_URL;
    els.saveFolder.disabled = true; els.message.textContent = id ? `Saving DEV folder ${id}…` : 'Creating DEV visual folder…';
    try {
      await apiRequest(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      closeFolderEditor(); await loadFolders(); await loadSongs(); els.message.textContent = id ? 'DEV Visual Folder updated.' : 'DEV Visual Folder created.';
    } catch (error) { els.message.textContent = `DEV folder save failed: ${error.message}`; }
    finally { els.saveFolder.disabled = false; }
  }

  function songKey(song = {}) { return String(song.song_key || song.songKey || song.key || song.slug || song.id || ''); }
  function songLabel(song = {}) { const title = song.display_title || song.song_name || song.title || songKey(song); const artist = song.artist || song.artist_name || ''; return artist ? `${title} — ${artist}` : title; }
  async function loadSongs() {
    try {
      const data = await apiRequest(SONGS_URL); cmsSongs = Array.isArray(data) ? data : Array.isArray(data?.songs) ? data.songs : [];
      const current = els.mappingSong.value; els.mappingSong.innerHTML = '<option value="">Select a song…</option>' + cmsSongs.map(song => `<option value="${escapeHtml(songKey(song))}">${escapeHtml(songLabel(song))}</option>`).join(''); if (current && cmsSongs.some(song => songKey(song) === current)) els.mappingSong.value = current;
    } catch (error) { cmsSongs = []; els.mappingStatus.textContent = `DEV Song list unavailable: ${error.message}`; }
  }
  function mappingRows(data) {
    const rows = Array.isArray(data) ? data : data?.folders || data?.visuals_folders || data?.items || [];
    return (Array.isArray(rows) && rows.length ? rows : folders).map(normalizeFolder);
  }
  function mappingMode(data) { const value = String(data?.visual_mix_mode || data?.song?.visual_mix_mode || data?.mapping?.visual_mix_mode || 'direct_first'); return ['direct_first','direct_plus_relevant','direct_only','relevant_only','fallback_only'].includes(value) ? value : 'direct_first'; }
  function renderMapping() {
    if (!els.mappingSong.value) { els.mappingFolders.innerHTML = ''; els.mappingStatus.textContent = 'Select a song to load its mapping.'; els.saveMapping.disabled = true; return; }
    els.mappingFolders.innerHTML = mappingFolders.map(folder => `<label class="vl-check"><input type="checkbox" value="${escapeHtml(folder.id)}" ${mappingSelected.has(folder.id) ? 'checked' : ''}/><span><strong>${escapeHtml(folder.folder_name)}</strong><br><span class="vl-muted">${escapeHtml(folder.folder_type)} · ${escapeHtml(folder.status)} · ${escapeHtml(folder.priority)}</span></span></label>`).join('') || '<p class="muted">No DEV folders available.</p>';
    els.mappingStatus.textContent = `${mappingSelected.size} DEV folder${mappingSelected.size === 1 ? '' : 's'} selected.`; els.saveMapping.disabled = false;
  }
  async function loadMapping() {
    const key = els.mappingSong.value; if (!key) { mappingFolders = []; mappingSelected = new Set(); renderMapping(); return; }
    els.saveMapping.disabled = true; els.mappingStatus.textContent = `Loading mapping for ${key}…`;
    try {
      const data = await apiRequest(`${MAPPING_URL}/${encodeURIComponent(key)}`); mappingFolders = mappingRows(data); mappingSelected = new Set(mappingFolders.filter(folder => folder.selected).map(folder => folder.id)); els.visualMixMode.value = mappingMode(data); renderMapping();
    } catch (error) { mappingFolders = []; mappingSelected = new Set(); els.mappingFolders.innerHTML = ''; els.mappingStatus.textContent = `DEV mapping load failed: ${error.message}`; }
  }
  async function saveMapping() {
    const key = els.mappingSong.value; if (!key) return;
    const data = { folder_ids: [...mappingSelected], visual_mix_mode: els.visualMixMode.value };
    els.saveMapping.disabled = true; els.mappingStatus.textContent = 'Saving DEV song visual mapping…';
    try {
      const result = await apiRequest(`${MAPPING_URL}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(data) }); mappingFolders = mappingRows(result); mappingSelected = new Set(mappingFolders.filter(folder => folder.selected).map(folder => folder.id)); if (!mappingSelected.size) mappingSelected = new Set(data.folder_ids); els.visualMixMode.value = mappingMode(result) || data.visual_mix_mode; renderMapping(); els.mappingStatus.textContent = 'DEV song visual mapping saved.';
    } catch (error) { els.mappingStatus.textContent = `DEV mapping save failed: ${error.message}`; els.saveMapping.disabled = false; }
  }

  function assetsUrl(folderId, assetId = '') { return `${FOLDERS_URL}/${encodeURIComponent(folderId)}/assets${assetId ? `/${encodeURIComponent(assetId)}` : ''}`; }
  async function loadAssets() {
    if (!activeFolder) return;
    els.assetMessage.textContent = `Loading DEV assets for ${activeFolder.folder_name}…`;
    try { const data = await apiRequest(assetsUrl(activeFolder.id)); activeAssets = assetRows(data); renderAssets(); els.assetMessage.textContent = `Loaded ${activeAssets.length} DEV asset${activeAssets.length === 1 ? '' : 's'}.`; }
    catch (error) { activeAssets = []; renderAssets(); els.assetMessage.textContent = `DEV asset load failed: ${error.message}`; }
  }
  async function openAssets(folder) {
    activeFolder = folder; els.assetHeading.textContent = `Manage DEV Assets: ${folder.folder_name}`; els.assetMeta.textContent = `${folder.folder_type} · ${folder.status} · ${folder.priority}`; els.assetCard.classList.remove('vl-hidden'); await loadAssets();
  }
  function closeAssets() { activeFolder = null; activeAssets = []; els.assetCard.classList.add('vl-hidden'); els.assetsList.innerHTML = ''; }
  function renderAssets() {
    if (!activeAssets.length) { els.assetsList.innerHTML = '<p class="muted">No assets in this DEV folder.</p>'; return; }
    els.assetsList.innerHTML = activeAssets.map(asset => `<article class="vl-asset" data-asset-id="${escapeHtml(asset.id)}"><div class="vl-asset-head"><div><strong>${escapeHtml(asset.file_name)}</strong><br><span class="vl-pill">${escapeHtml(asset.asset_type)}</span> <span class="vl-pill">${escapeHtml(asset.status)}</span>${asset.public_url ? ` <a href="${escapeHtml(asset.public_url)}" target="_blank" rel="noopener">Open</a>` : ''}</div><div class="vl-actions"><button class="secondary toggle-asset" type="button" data-asset-id="${escapeHtml(asset.id)}">${asset.status === 'hidden' ? 'Activate' : 'Hide'}</button><button class="secondary hide-asset" type="button" data-asset-id="${escapeHtml(asset.id)}">Hide via DELETE</button></div></div><div class="vl-asset-fields"><label>Caption<input class="asset-caption" value="${escapeHtml(asset.caption)}" /></label><label>Alt Text<input class="asset-alt" value="${escapeHtml(asset.alt_text)}" /></label><label class="full">Notes<textarea class="asset-notes">${escapeHtml(asset.notes)}</textarea></label><label class="full">Shopify Product URLs<textarea class="asset-products">${escapeHtml(asset.shopify_product_urls.join('\n'))}</textarea></label></div><div class="vl-actions"><button class="save-asset" type="button" data-asset-id="${escapeHtml(asset.id)}">Save DEV Asset Details</button></div></article>`).join('');
  }
  function validateUpload(file, type) {
    if (!file) return 'Choose a file first.';
    if (type === 'clip') return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4') ? '' : 'Video clips must be MP4.';
    return ['image/jpeg','image/png','image/webp'].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name) ? '' : 'Images must be JPG, PNG, or WEBP.';
  }
  function assertDevUploadTarget(url) {
    let parsed; try { parsed = new URL(url); } catch { throw new Error('Blocked Video Library upload because presign returned an invalid URL.'); }
    const host = parsed.hostname.toLowerCase();
    if (host.includes(PROD_MEDIA_BUCKET)) throw new Error('Blocked Video Library upload because DEV presign returned a PROD media target.');
    if (!host.includes(DEV_MEDIA_BUCKET)) throw new Error('Blocked Video Library upload because DEV presign returned an unknown storage target.');
    return true;
  }
  async function uploadAsset() {
    if (!activeFolder) return;
    const file = els.uploadFile.files?.[0]; const type = els.uploadType.value; const validation = validateUpload(file, type); if (validation) { els.assetMessage.textContent = validation; return; }
    els.uploadAsset.disabled = true; els.assetMessage.textContent = 'Requesting secure DEV upload URL…';
    try {
      const presign = await apiRequest(PRESIGN_URL, { method: 'POST', body: JSON.stringify({ filename: file.name, content_type: file.type || (type === 'clip' ? 'video/mp4' : 'image/jpeg'), purpose: type === 'clip' ? 'visual_folder_clip' : 'visual_folder_image', folder_slug: activeFolder.folder_slug || slugify(activeFolder.folder_name), folder_id: activeFolder.id }) });
      const uploadUrl = presign.upload_url || presign.uploadUrl; const publicUrl = presign.public_url || presign.publicUrl; if (!uploadUrl || !publicUrl) throw new Error('DEV presign response did not return upload and public URLs.'); assertDevUploadTarget(uploadUrl); if (String(publicUrl).includes(PROD_MEDIA_BUCKET)) throw new Error('Blocked Video Library upload because DEV presign returned a PROD public media URL.');
      els.assetMessage.textContent = 'Uploading file to DEV media storage…';
      const contentType = file.type || presign.content_type || presign.contentType || (type === 'clip' ? 'video/mp4' : 'image/jpeg');
      const put = await fetch(uploadUrl, { method: presign.method || 'PUT', mode: 'cors', credentials: 'omit', headers: presign.headers || { 'Content-Type': contentType }, body: file }); if (!put.ok) throw new Error(`DEV storage upload failed with status ${put.status}.`);
      await apiRequest(assetsUrl(activeFolder.id), { method: 'POST', body: JSON.stringify({ asset_type: type, file_name: file.name, s3_key: presign.key || presign.object_key || '', public_url: publicUrl, thumbnail_url: publicUrl, content_type: contentType, size_bytes: file.size, width: null, height: null, ratio_label: '', caption: els.uploadCaption.value.trim(), alt_text: els.uploadAlt.value.trim(), notes: els.uploadNotes.value.trim(), shopify_product_urls: type === 'clip' ? splitValues(els.uploadProducts.value) : [] }) });
      els.uploadFile.value = ''; els.uploadCaption.value = ''; els.uploadAlt.value = ''; els.uploadNotes.value = ''; els.uploadProducts.value = ''; await loadAssets(); await loadFolders(); els.assetMessage.textContent = 'DEV visual asset uploaded and saved.';
    } catch (error) { els.assetMessage.textContent = `DEV asset upload failed: ${error.message}`; }
    finally { els.uploadAsset.disabled = false; }
  }
  async function saveAsset(assetId) {
    if (!activeFolder) return; const card = els.assetsList.querySelector(`[data-asset-id="${CSS.escape(assetId)}"]`); const asset = activeAssets.find(item => item.id === assetId); if (!card || !asset) return;
    const data = { caption: card.querySelector('.asset-caption').value, alt_text: card.querySelector('.asset-alt').value, notes: card.querySelector('.asset-notes').value, shopify_product_urls: asset.asset_type === 'clip' ? splitValues(card.querySelector('.asset-products').value) : [] };
    try { await apiRequest(assetsUrl(activeFolder.id, assetId), { method: 'PUT', body: JSON.stringify(data) }); await loadAssets(); els.assetMessage.textContent = 'DEV asset details saved and verified.'; } catch (error) { els.assetMessage.textContent = `DEV asset save failed: ${error.message}`; }
  }
  async function toggleAsset(assetId) {
    if (!activeFolder) return; const asset = activeAssets.find(item => item.id === assetId); if (!asset) return; const status = asset.status === 'hidden' ? 'active' : 'hidden';
    try { await apiRequest(assetsUrl(activeFolder.id, assetId), { method: 'PUT', body: JSON.stringify({ status }) }); await loadAssets(); els.assetMessage.textContent = `DEV asset status changed to ${status}.`; } catch (error) { els.assetMessage.textContent = `DEV asset status update failed: ${error.message}`; }
  }
  async function hideAsset(assetId) {
    if (!activeFolder) return;
    try { await apiRequest(assetsUrl(activeFolder.id, assetId), { method: 'DELETE' }); await loadAssets(); await loadFolders(); els.assetMessage.textContent = 'DEV asset hidden using the existing asset DELETE contract.'; } catch (error) { els.assetMessage.textContent = `DEV asset hide failed: ${error.message}`; }
  }

  els.saveToken.addEventListener('click', () => { const value = els.token.value.trim(); if (value) localStorage.setItem(env.tokenStorageKey, value); else localStorage.removeItem(env.tokenStorageKey); updateTokenStatus(); loadFolders(); loadSongs(); });
  els.clearToken.addEventListener('click', () => { localStorage.removeItem(env.tokenStorageKey); els.token.value = ''; updateTokenStatus(); folders = []; renderFolders(); });
  els.refresh.addEventListener('click', loadFolders); els.search.addEventListener('input', renderFolders); els.newFolder.addEventListener('click', () => fillFolderEditor({ status: 'active', priority: 'medium', folder_type: 'general' })); els.cancelFolder.addEventListener('click', closeFolderEditor); els.form.addEventListener('submit', saveFolder);
  els.body.addEventListener('click', event => { const edit = event.target.closest('.edit-folder'); const media = event.target.closest('.manage-assets'); const id = edit?.dataset.folderId || media?.dataset.folderId; if (!id) return; const folder = folders.find(item => item.id === id); if (!folder) return; if (edit) fillFolderEditor(folder); else openAssets(folder); });
  els.mappingSong.addEventListener('change', loadMapping); els.reloadMapping.addEventListener('click', loadMapping); els.mappingFolders.addEventListener('change', event => { const input = event.target.closest('input[type="checkbox"]'); if (!input) return; if (input.checked) mappingSelected.add(input.value); else mappingSelected.delete(input.value); renderMapping(); }); els.saveMapping.addEventListener('click', saveMapping);
  els.closeAssets.addEventListener('click', closeAssets); els.refreshAssets.addEventListener('click', loadAssets); els.uploadAsset.addEventListener('click', uploadAsset); els.assetsList.addEventListener('click', event => { const save = event.target.closest('.save-asset'); const toggle = event.target.closest('.toggle-asset'); const hide = event.target.closest('.hide-asset'); const id = save?.dataset.assetId || toggle?.dataset.assetId || hide?.dataset.assetId; if (!id) return; if (save) saveAsset(id); else if (toggle) toggleAsset(id); else hideAsset(id); });

  updateTokenStatus();
  if (getToken()) { loadFolders(); loadSongs(); } else { renderFolders(); els.message.textContent = 'Save a DEV admin token to load the Video Library.'; }
})();
