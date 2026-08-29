(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');

  const env = migration.getCanonicalVisualEnvironment();
  const PROD_MEDIA_BUCKET = 'stashbox-radio-media-prod-us-east-1';
  const DEV_MEDIA_BUCKET = 'stashbox-radio-media-dev-us-east-1';
  const PROD_CDN_HOST = 'd34ez960394y8w.cloudfront.net';
  const DEV_CDN_HOST = 'd1ufj7xan6uxy0.cloudfront.net';
  const FOLDERS_URL = `${env.apiBase}/admin/visuals/folders`;
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
  let currentVisualSettings = null;
  let activeFolder = null;
  let activeAssets = [];

  const clean = value => String(value ?? '').trim();
  function splitValues(value) { return [...new Set(clean(value).split(/[\n,]/).map(item => item.trim()).filter(Boolean))]; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function slugify(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'visual-folder'; }
  function normalizeList(value) { return Array.isArray(value) ? value.map(String).map(v => v.trim()).filter(Boolean) : splitValues(value); }

  function getToken() { return clean(localStorage.getItem(env.tokenStorageKey)); }

  function updateTokenStatus() {
    const token = getToken();
    els.token.value = token;
    els.tokenStatus.textContent = token ? 'PROD admin token available.' : 'No PROD admin token saved.';
  }

  function visualSettingsUrl(songKey) { return `${env.apiBase}/admin/songs/${encodeURIComponent(songKey)}/visual-settings`; }

  function isAllowedApiUrl(url) {
    if (url === SONGS_URL || url === PRESIGN_URL || url === FOLDERS_URL || url.startsWith(`${FOLDERS_URL}/`)) return true;
    return /^https:\/\/je3zud66nb\.execute-api\.us-east-1\.amazonaws\.com\/prod-v2\/admin\/songs\/[^/]+\/visual-settings$/.test(url);
  }

  async function apiRequest(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (!url.startsWith(env.apiBase) || !isAllowedApiUrl(url)) throw new Error('Blocked request outside the canonical PROD Video Library API boundary.');
    if (!['GET', 'HEAD'].includes(method)) {
      if (url === SONGS_URL) throw new Error('Blocked write to Song CMS from Video Library.');
      migration.assertCanonicalVisualWriteApproved('video-library');
    }
    const token = getToken();
    if (!token) throw new Error('Save a PROD admin token first.');
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
    if (text) { try { body = JSON.parse(text); } catch { body = { error: text }; } }
    if (typeof body?.body === 'string') { try { body = JSON.parse(body.body); } catch {} }
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    return body;
  }

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
      inclusion_state: String(folder.inclusion_state || folder.state || '').toLowerCase(),
      relevant_artists: normalizeList(folder.relevant_artists || folder.artists),
      relevant_genres: normalizeList(folder.relevant_genres || folder.genres),
      relevant_moods: normalizeList(folder.relevant_moods || folder.moods),
      relevant_songs: normalizeList(folder.relevant_songs || folder.songs),
      asset_count: Number(folder.asset_count || folder.assets_count || (Array.isArray(folder.assets) ? folder.assets.length : 0)),
      images_count: Number(folder.images_count || folder.image_count || 0),
      clips_count: Number(folder.clips_count || folder.clip_count || 0)
    };
  }

  function folderRows(data) {
    const source = Array.isArray(data) ? data : data?.folders || data?.items || data?.rows || data?.data || [];
    return Array.isArray(source) ? source.map(normalizeFolder).filter(folder => folder.id || folder.folder_name) : [];
  }

  function normalizeAsset(asset = {}) {
    return {
      ...asset,
      id: String(asset.id || asset.asset_id || ''),
      asset_type: String(asset.asset_type || asset.type || 'image').toLowerCase() === 'clip' ? 'clip' : 'image',
      file_name: asset.file_name || asset.filename || asset.name || asset.title || 'Untitled asset',
      s3_key: asset.s3_key || asset.key || '',
      public_url: asset.public_url || asset.url || asset.asset_url || '',
      thumbnail_url: asset.thumbnail_url || '',
      content_type: asset.content_type || asset.mime_type || '',
      status: String(asset.status || 'active').toLowerCase(),
      caption: asset.caption || '', alt_text: asset.alt_text || '', notes: asset.notes || asset.description || '',
      shopify_product_urls: normalizeList(asset.shopify_product_urls || asset.shopifyProductUrls || [])
    };
  }

  function assetRows(data) {
    const source = Array.isArray(data) ? data : data?.assets || data?.items || data?.rows || data?.data || [];
    return Array.isArray(source) ? source.map(normalizeAsset).filter(asset => asset.id) : [];
  }

  function renderFolders() {
    const q = clean(els.search.value).toLowerCase();
    const rows = q ? folders.filter(folder => [folder.folder_name, folder.folder_type, folder.status, folder.priority, ...folder.relevant_artists, ...folder.relevant_genres, ...folder.relevant_moods, ...folder.relevant_songs].join(' ').toLowerCase().includes(q)) : folders;
    els.count.textContent = `${rows.length.toLocaleString()} of ${folders.length.toLocaleString()} LIVE folders shown`;
    if (!rows.length) { els.body.innerHTML = '<tr><td colspan="7" class="muted">No matching LIVE visual folders.</td></tr>'; return; }
    els.body.innerHTML = rows.map(folder => {
      const targets = [...folder.relevant_artists, ...folder.relevant_genres, ...folder.relevant_moods, ...folder.relevant_songs].slice(0, 5);
      return `<tr><td><div class="vl-actions"><button class="secondary edit-folder" data-folder-id="${escapeHtml(folder.id)}" type="button">Edit</button><button class="secondary manage-assets" data-folder-id="${escapeHtml(folder.id)}" type="button">Files</button></div></td><td><strong>${escapeHtml(folder.folder_name)}</strong><br><code>${escapeHtml(folder.folder_slug)}</code></td><td>${escapeHtml(folder.folder_type)}</td><td>${escapeHtml(folder.status)}</td><td>${escapeHtml(folder.priority)}</td><td>${Number(folder.asset_count || 0).toLocaleString()}</td><td>${escapeHtml(targets.join(', ') || '—')}</td></tr>`;
    }).join('');
  }

  async function loadFolders() {
    els.refresh.disabled = true; els.message.textContent = 'Loading canonical PROD visual folders…';
    try { folders = folderRows(await apiRequest(FOLDERS_URL)); renderFolders(); els.message.textContent = `Loaded ${folders.length} canonical LIVE visual folder${folders.length === 1 ? '' : 's'} from PROD.`; }
    catch (error) { folders = []; renderFolders(); els.message.textContent = `LIVE Video Library load failed: ${error.message}`; }
    finally { els.refresh.disabled = false; updateTokenStatus(); }
  }

  function fillFolderEditor(folder = {}) {
    els.id.value = folder.id || ''; els.name.value = folder.folder_name || ''; els.type.value = folder.folder_type || 'general'; els.status.value = folder.status || 'active'; els.priority.value = folder.priority || 'medium'; els.description.value = folder.description || ''; els.artists.value = (folder.relevant_artists || []).join(', '); els.genres.value = (folder.relevant_genres || []).join(', '); els.moods.value = (folder.relevant_moods || []).join(', '); els.songs.value = (folder.relevant_songs || []).join(', '); els.notes.value = folder.notes || '';
    const editing = Boolean(folder.id); els.editorHeading.textContent = editing ? `Edit LIVE Folder: ${folder.folder_name}` : 'New LIVE Visual Folder'; els.saveFolder.textContent = editing ? 'Save LIVE Folder Changes' : 'Create LIVE Folder'; els.editorCard.classList.remove('vl-hidden'); els.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeFolderEditor() { els.form.reset(); els.id.value = ''; els.editorCard.classList.add('vl-hidden'); }
  function folderPayload() {
    const data = { folder_name: clean(els.name.value), folder_type: els.type.value, description: clean(els.description.value), status: els.status.value, priority: els.priority.value, notes: clean(els.notes.value), relevant_artists: splitValues(els.artists.value), relevant_genres: splitValues(els.genres.value), relevant_moods: splitValues(els.moods.value), relevant_songs: splitValues(els.songs.value) };
    if (!data.folder_name) throw new Error('Folder Name is required.');
    return data;
  }
  async function saveFolder(event) {
    event.preventDefault(); let data; try { data = folderPayload(); } catch (error) { els.message.textContent = error.message; return; }
    const id = clean(els.id.value); const url = id ? `${FOLDERS_URL}/${encodeURIComponent(id)}` : FOLDERS_URL;
    els.saveFolder.disabled = true; els.message.textContent = id ? `Saving LIVE folder ${id}…` : 'Creating LIVE visual folder…';
    try { await apiRequest(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }); closeFolderEditor(); await loadFolders(); els.message.textContent = id ? 'LIVE Visual Folder updated in PROD.' : 'LIVE Visual Folder created in PROD.'; }
    catch (error) { els.message.textContent = `LIVE folder save failed: ${error.message}`; }
    finally { els.saveFolder.disabled = false; }
  }

  function songKey(song = {}) { return String(song.song_key || song.songKey || song.key || song.slug || song.id || ''); }
  function songLabel(song = {}) { const title = song.display_title || song.song_name || song.title || songKey(song); const artist = song.artist || song.artist_name || ''; return artist ? `${title} — ${artist}` : title; }
  async function loadSongs() {
    try {
      const data = await apiRequest(SONGS_URL); cmsSongs = Array.isArray(data) ? data : Array.isArray(data?.songs) ? data.songs : Array.isArray(data?.items) ? data.items : [];
      const current = els.mappingSong.value; els.mappingSong.innerHTML = '<option value="">Select a song…</option>' + cmsSongs.map(song => `<option value="${escapeHtml(songKey(song))}">${escapeHtml(songLabel(song))}</option>`).join(''); if (current && cmsSongs.some(song => songKey(song) === current)) els.mappingSong.value = current;
    } catch (error) { cmsSongs = []; els.mappingStatus.textContent = `PROD Song list unavailable: ${error.message}`; }
  }
  function mappingRows(data) { const source = Array.isArray(data) ? data : data?.folders || data?.items || data?.rows || []; return (Array.isArray(source) && source.length ? source : folders).map(normalizeFolder); }
  function mappingOrderMode(data) { const value = String(data?.order_mode || data?.settings?.order_mode || 'random'); return ['random', 'newest_first', 'manual'].includes(value) ? value : 'random'; }
  function renderMapping() {
    if (!els.mappingSong.value) { els.mappingFolders.innerHTML = ''; els.mappingStatus.textContent = 'Select a song to load its mapping.'; els.saveMapping.disabled = true; return; }
    els.mappingFolders.innerHTML = mappingFolders.map(folder => `<label class="vl-check"><input type="checkbox" value="${escapeHtml(folder.id)}" ${mappingSelected.has(folder.id) ? 'checked' : ''}/><span><strong>${escapeHtml(folder.folder_name)}</strong><br><span class="vl-muted">${escapeHtml(folder.folder_type)} · ${escapeHtml(folder.status)} · ${escapeHtml(folder.priority)} · ${Number(folder.asset_count || 0)} assets</span></span></label>`).join('') || '<p class="muted">No LIVE folders available.</p>';
    els.mappingStatus.textContent = `${mappingSelected.size} explicit LIVE folder${mappingSelected.size === 1 ? '' : 's'} included for this song.`; els.saveMapping.disabled = false;
  }
  async function loadMapping() {
    const key = els.mappingSong.value; if (!key) { mappingFolders = []; mappingSelected = new Set(); currentVisualSettings = null; renderMapping(); return; }
    els.saveMapping.disabled = true; els.mappingStatus.textContent = `Loading LIVE visual settings for ${key}…`;
    try { const data = await apiRequest(visualSettingsUrl(key)); currentVisualSettings = data; mappingFolders = mappingRows(data); mappingSelected = new Set(mappingFolders.filter(folder => folder.inclusion_state === 'included').map(folder => folder.id)); els.visualMixMode.value = mappingOrderMode(data); renderMapping(); }
    catch (error) { mappingFolders = []; mappingSelected = new Set(); currentVisualSettings = null; els.mappingFolders.innerHTML = ''; els.mappingStatus.textContent = `LIVE mapping load failed: ${error.message}`; }
  }
  async function saveMapping() {
    const key = els.mappingSong.value; if (!key) return;
    const prior = Array.isArray(currentVisualSettings?.folder_mappings) ? currentVisualSettings.folder_mappings : [];
    const priorExcluded = new Map(prior.filter(item => String(item.inclusion_state || item.state).toLowerCase() === 'excluded').map(item => [String(item.folder_id || item.folderId), item]));
    const folderMappings = [];
    for (const folder of mappingFolders) { if (mappingSelected.has(folder.id)) folderMappings.push({ folder_id: folder.id, inclusion_state: 'included' }); else if (priorExcluded.has(folder.id)) folderMappings.push({ folder_id: folder.id, inclusion_state: 'excluded' }); }
    const payload = { order_mode: els.visualMixMode.value, folder_mappings: folderMappings, asset_mappings: Array.isArray(currentVisualSettings?.asset_mappings) ? currentVisualSettings.asset_mappings : [] };
    els.saveMapping.disabled = true; els.mappingStatus.textContent = 'Saving canonical PROD song visual settings…';
    try { const result = await apiRequest(visualSettingsUrl(key), { method: 'PUT', body: JSON.stringify(payload) }); currentVisualSettings = result; mappingFolders = mappingRows(result); mappingSelected = new Set(mappingFolders.filter(folder => folder.inclusion_state === 'included').map(folder => folder.id)); els.visualMixMode.value = mappingOrderMode(result); renderMapping(); els.mappingStatus.textContent = 'LIVE song visual mapping saved to PROD. Both players will use it.'; }
    catch (error) { els.mappingStatus.textContent = `LIVE mapping save failed: ${error.message}`; els.saveMapping.disabled = false; }
  }

  function assetsUrl(folderId, assetId = '') { const base = `${FOLDERS_URL}/${encodeURIComponent(folderId)}/assets`; return assetId ? `${base}/${encodeURIComponent(assetId)}` : base; }
  function renderAssets() {
    if (!activeFolder) { els.assetsList.innerHTML = ''; return; }
    if (!activeAssets.length) { els.assetsList.innerHTML = '<p class="muted">No assets in this LIVE folder.</p>'; return; }
    els.assetsList.innerHTML = activeAssets.map(asset => `<article class="vl-asset" data-asset-id="${escapeHtml(asset.id)}"><div class="vl-asset-head"><div><strong>${escapeHtml(asset.file_name)}</strong><br><span class="vl-pill">${escapeHtml(asset.asset_type)}</span> <span class="vl-pill">${escapeHtml(asset.status)}</span></div><a class="button-link" href="${escapeHtml(asset.public_url)}" target="_blank" rel="noopener">Open Media</a></div><div class="vl-asset-fields"><label class="full">Caption<input class="asset-caption" value="${escapeHtml(asset.caption)}" /></label><label class="full">Alt Text<input class="asset-alt" value="${escapeHtml(asset.alt_text)}" /></label><label class="full">Notes<textarea class="asset-notes">${escapeHtml(asset.notes)}</textarea></label><label class="full">Shopify Product URLs<textarea class="asset-products">${escapeHtml(asset.shopify_product_urls.join('\n'))}</textarea></label><label>Status<select class="asset-status"><option value="active" ${asset.status === 'active' ? 'selected' : ''}>Active</option><option value="hidden" ${asset.status === 'hidden' ? 'selected' : ''}>Hidden</option></select></label></div><div class="vl-actions"><button class="save-asset" type="button" data-asset-id="${escapeHtml(asset.id)}">Save Metadata</button><button class="secondary hide-asset" type="button" data-asset-id="${escapeHtml(asset.id)}">Hide Asset</button></div></article>`).join('');
  }
  async function loadAssets() {
    if (!activeFolder) return; els.refreshAssets.disabled = true; els.assetMessage.textContent = `Loading LIVE assets for ${activeFolder.folder_name}…`;
    try { activeAssets = assetRows(await apiRequest(assetsUrl(activeFolder.id))); renderAssets(); els.assetMessage.textContent = `Loaded ${activeAssets.length} LIVE asset${activeAssets.length === 1 ? '' : 's'} from PROD.`; els.assetMeta.textContent = `${activeFolder.folder_slug} · ${activeFolder.id}`; }
    catch (error) { activeAssets = []; renderAssets(); els.assetMessage.textContent = `LIVE asset load failed: ${error.message}`; }
    finally { els.refreshAssets.disabled = false; }
  }
  async function openAssets(folder) { activeFolder = folder; els.assetHeading.textContent = `LIVE Assets: ${folder.folder_name}`; els.assetCard.classList.remove('vl-hidden'); await loadAssets(); els.assetCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function closeAssets() { activeFolder = null; activeAssets = []; els.assetsList.innerHTML = ''; els.assetCard.classList.add('vl-hidden'); }
  async function saveAsset(assetId) {
    if (!activeFolder) return; const card = els.assetsList.querySelector(`[data-asset-id="${CSS.escape(assetId)}"]`); const asset = activeAssets.find(item => item.id === assetId); if (!card || !asset) return;
    const payload = { status: card.querySelector('.asset-status')?.value || asset.status, caption: clean(card.querySelector('.asset-caption')?.value), alt_text: clean(card.querySelector('.asset-alt')?.value), notes: clean(card.querySelector('.asset-notes')?.value), shopify_product_urls: splitValues(card.querySelector('.asset-products')?.value) };
    els.assetMessage.textContent = `Saving LIVE asset ${asset.file_name}…`;
    try { await apiRequest(assetsUrl(activeFolder.id, assetId), { method: 'PUT', body: JSON.stringify(payload) }); await loadAssets(); els.assetMessage.textContent = 'LIVE asset metadata saved to PROD.'; }
    catch (error) { els.assetMessage.textContent = `LIVE asset save failed: ${error.message}`; }
  }
  async function hideAsset(assetId) {
    if (!activeFolder) return; const asset = activeAssets.find(item => item.id === assetId); if (!asset) return; els.assetMessage.textContent = `Hiding LIVE asset ${asset.file_name}…`;
    try { await apiRequest(assetsUrl(activeFolder.id, assetId), { method: 'DELETE' }); await loadAssets(); await loadFolders(); els.assetMessage.textContent = 'LIVE asset hidden in PROD.'; }
    catch (error) { els.assetMessage.textContent = `LIVE asset hide failed: ${error.message}`; }
  }

  function validateUpload(file, type) { if (!file) return 'Choose a file first.'; if (type === 'clip') return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4') ? '' : 'Video clips must be MP4.'; return ['image/jpeg','image/png','image/webp'].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name) ? '' : 'Images must be JPG, PNG, or WEBP.'; }
  function assertProdUploadTarget(uploadUrl, publicUrl) {
    let upload; let publicMedia; try { upload = new URL(uploadUrl); publicMedia = new URL(publicUrl); } catch { throw new Error('Blocked Video Library upload because presign returned an invalid URL.'); }
    const uploadHost = upload.hostname.toLowerCase(); const publicHost = publicMedia.hostname.toLowerCase();
    if (uploadHost.includes(DEV_MEDIA_BUCKET) || publicHost === DEV_CDN_HOST) throw new Error('Blocked Video Library upload because PROD presign returned a DEV media target.');
    if (!uploadHost.includes(PROD_MEDIA_BUCKET)) throw new Error('Blocked Video Library upload because PROD presign returned an unknown storage target.');
    if (publicHost !== PROD_CDN_HOST && !publicHost.includes(PROD_MEDIA_BUCKET)) throw new Error('Blocked Video Library upload because PROD presign returned an unknown public media host.');
    return true;
  }
  async function uploadAsset() {
    if (!activeFolder) return; const file = els.uploadFile.files?.[0]; const type = els.uploadType.value; const validation = validateUpload(file, type); if (validation) { els.assetMessage.textContent = validation; return; }
    els.uploadAsset.disabled = true; els.assetMessage.textContent = 'Requesting secure PROD upload URL…';
    try {
      const presign = await apiRequest(PRESIGN_URL, { method: 'POST', body: JSON.stringify({ filename: file.name, content_type: file.type || (type === 'clip' ? 'video/mp4' : 'image/jpeg'), purpose: type === 'clip' ? 'visual_folder_clip' : 'visual_folder_image', folder_slug: activeFolder.folder_slug || slugify(activeFolder.folder_name), folder_id: activeFolder.id }) });
      const uploadUrl = presign.upload_url || presign.uploadUrl; const publicUrl = presign.public_url || presign.publicUrl; if (!uploadUrl || !publicUrl) throw new Error('PROD presign response did not return upload and public URLs.'); assertProdUploadTarget(uploadUrl, publicUrl);
      const contentType = file.type || presign.content_type || presign.contentType || (type === 'clip' ? 'video/mp4' : 'image/jpeg'); els.assetMessage.textContent = 'Uploading file to canonical PROD media storage…';
      const put = await fetch(uploadUrl, { method: presign.method || 'PUT', mode: 'cors', credentials: 'omit', headers: presign.headers || { 'Content-Type': contentType }, body: file }); if (!put.ok) throw new Error(`PROD storage upload failed with status ${put.status}.`);
      await apiRequest(assetsUrl(activeFolder.id), { method: 'POST', body: JSON.stringify({ asset_type: type, file_name: file.name, s3_key: presign.key || presign.object_key || '', public_url: publicUrl, thumbnail_url: publicUrl, content_type: contentType, size_bytes: file.size, width: null, height: null, ratio_label: '', caption: clean(els.uploadCaption.value), alt_text: clean(els.uploadAlt.value), notes: clean(els.uploadNotes.value), shopify_product_urls: type === 'clip' ? splitValues(els.uploadProducts.value) : [] }) });
      els.uploadFile.value = ''; els.uploadCaption.value = ''; els.uploadAlt.value = ''; els.uploadNotes.value = ''; els.uploadProducts.value = ''; await loadAssets(); await loadFolders(); els.assetMessage.textContent = 'LIVE visual asset uploaded to PROD and is available to both players.';
    } catch (error) { els.assetMessage.textContent = `LIVE upload failed: ${error.message}`; }
    finally { els.uploadAsset.disabled = false; }
  }

  els.saveToken.addEventListener('click', async () => { const token = clean(els.token.value); if (!token) return; localStorage.setItem(env.tokenStorageKey, token); updateTokenStatus(); await Promise.all([loadFolders(), loadSongs()]); });
  els.clearToken.addEventListener('click', () => { localStorage.removeItem(env.tokenStorageKey); updateTokenStatus(); folders = []; renderFolders(); });
  els.search.addEventListener('input', renderFolders); els.refresh.addEventListener('click', loadFolders); els.newFolder.addEventListener('click', () => fillFolderEditor({})); els.cancelFolder.addEventListener('click', closeFolderEditor); els.form.addEventListener('submit', saveFolder);
  els.mappingSong.addEventListener('change', loadMapping); els.reloadMapping.addEventListener('click', loadMapping); els.saveMapping.addEventListener('click', saveMapping);
  els.mappingFolders.addEventListener('change', event => { const input = event.target.closest('input[type="checkbox"]'); if (!input) return; if (input.checked) mappingSelected.add(input.value); else mappingSelected.delete(input.value); els.mappingStatus.textContent = `${mappingSelected.size} explicit LIVE folder${mappingSelected.size === 1 ? '' : 's'} included for this song.`; });
  els.closeAssets.addEventListener('click', closeAssets); els.refreshAssets.addEventListener('click', loadAssets); els.uploadAsset.addEventListener('click', uploadAsset);
  els.body.addEventListener('click', event => { const edit = event.target.closest('.edit-folder[data-folder-id]'); const files = event.target.closest('.manage-assets[data-folder-id]'); const button = edit || files; if (!button) return; const folder = folders.find(item => item.id === button.dataset.folderId); if (!folder) return; if (edit) fillFolderEditor(folder); else openAssets(folder); });
  els.assetsList.addEventListener('click', event => { const save = event.target.closest('.save-asset[data-asset-id]'); const hide = event.target.closest('.hide-asset[data-asset-id]'); if (save) saveAsset(save.dataset.assetId); if (hide) hideAsset(hide.dataset.assetId); });

  updateTokenStatus();
  if (getToken()) Promise.all([loadFolders(), loadSongs()]);
})();
