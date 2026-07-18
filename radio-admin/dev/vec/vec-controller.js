(function () {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS_API_URL = `${API_ROOT}/admin/songs`;
  const VISUALS_FOLDERS_API_URL = `${API_ROOT}/admin/visuals/folders`;
  const VEC_RECIPE_API_URL = `${API_ROOT}/admin/vec/recipe`;
  const VEC_SONG_ASSETS_API_URL = `${API_ROOT}/admin/vec/song-assets`;
  const UPLOAD_PRESIGN_API_URL = `${API_ROOT}/admin/uploads/presign`;
  const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';

  const DEFAULT_SHUFFLE_RULES = {
    orderMode: 'randomize',
    maxSameFolderInRow: 1,
    maxAssetsPerFolder: 'all',
    avoidRepeats: true,
  };

  const ORDER_MODE_LABELS = { manual: 'Manual Order', randomize: 'Randomize', newest: 'Newest First' };
  const MAX_SAME_FOLDER_LABELS = { 1: '1', 2: '2', 3: '3', none: 'No limit' };
  const MAX_ASSETS_PER_FOLDER_LABELS = { 1: '1', 2: '2', 3: '3', 5: '5', all: 'All' };

  const DEFAULT_ARTWORK_RULES = {
    startWithArtwork: true,
    startDurationSeconds: 4,
    endWithArtwork: true,
    endDurationSeconds: 4,
    rePresentArtwork: true,
    repeatEverySeconds: 60,
  };

  const DURATION_OPTIONS = [2, 3, 4, 5, 8, 10];
  const REPEAT_OPTIONS = [30, 45, 60, 90, 120];
  const VISUAL_MODE_CUSTOM = 'custom';
  const VISUAL_MODE_ARTWORK_ONLY = 'artwork_only';
  const SONG_CONTEXT_FIELDS = [
    'song_key',
    'song_name',
    'display_title',
    'artist',
    'album_name',
    'genre',
    'secondary_genre',
    'mood',
    'languages',
    'song_artwork_url',
    'audio_url',
    'video_link',
    'public_visibility',
  ];

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[char]));
  }

  function getFirstString(source, fields) {
    for (const field of fields) {
      const value = clean(source?.[field]);
      if (value) return value;
    }
    return '';
  }

  function secondsLabel(value) {
    return `${value} seconds`;
  }

  function onOffLabel(value) {
    return value ? 'ON' : 'OFF';
  }

  function optionMarkup(values, selectedValue) {
    return values
      .map((value) => `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${secondsLabel(value)}</option>`)
      .join('');
  }

  const FOLDER_TYPE_LABELS = { general: 'General', artist: 'Artist', song: 'Song', genre: 'Genre', mood: 'Mood', promo: 'Promo', seasonal: 'Seasonal' };
  const FOLDER_STATUS_LABELS = { active: 'Active', hidden: 'Hidden' };

  function normalizeValue(value, labels, fallback) {
    const key = clean(value).toLowerCase();
    return Object.prototype.hasOwnProperty.call(labels, key) ? key : fallback;
  }

  function normalizeCount(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) return number;
    }
    return 0;
  }

  function slugify(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function normalizeVisualFolder(folder) {
    if (!folder || typeof folder !== 'object') return null;
    const folderName = getFirstString(folder, ['folder_name', 'name', 'title']);
    const id = getFirstString(folder, ['id', 'folder_id', 'folder_slug', 'slug']) || slugify(folderName);
    if (!id || !folderName) return null;
    return {
      id,
      folder_name: folderName,
      folder_slug: getFirstString(folder, ['folder_slug', 'slug']) || slugify(folderName),
      folder_type: normalizeValue(folder.folder_type || folder.type, FOLDER_TYPE_LABELS, 'general'),
      description: clean(folder.description),
      status: normalizeValue(folder.status, FOLDER_STATUS_LABELS, 'active'),
      images_count: normalizeCount(folder.images_count, folder.image_count),
      clips_count: normalizeCount(folder.clips_count, folder.clip_count, folder.video_clip_count, folder.video_count),
      asset_count: normalizeCount(folder.asset_count, folder.assets_count, folder.total_count),
      created_at: folder.created_at || folder.createdAt || '',
      updated_at: folder.updated_at || folder.updatedAt || '',
      thumbnail_url: getFirstString(folder, ['thumbnail_url', 'thumbnailUrl', 'image_url', 'preview_url', 'cover_url']),
    };
  }

  function normalizeFoldersResponse(data) {
    if (typeof data?.body === 'string') {
      try { return normalizeFoldersResponse(JSON.parse(data.body)); } catch { return []; }
    }
    const list = Array.isArray(data) ? data : (Array.isArray(data?.folders) ? data.folders : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.body) ? data.body : [])));
    return list.map(normalizeVisualFolder).filter(Boolean);
  }

  function normalizeSongsResponse(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.songs)) return data.songs;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.body)) return data.body;
    if (typeof data?.body === 'string') {
      try {
        return normalizeSongsResponse(JSON.parse(data.body));
      } catch {
        return [];
      }
    }
    return [];
  }

  async function adminFetchJson(url, options = {}) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (!token) throw new Error('Save an admin token in the dev admin first.');
    const headers = { 'x-admin-token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) throw new Error(data?.error || data?.message || response.statusText || 'Request failed.');
    return data;
  }

  function folderAssetsApiUrl(folderId) {
    return `${VISUALS_FOLDERS_API_URL}/${encodeURIComponent(folderId)}/assets`;
  }

  function isBackendPendingError(error) {
    return /404|not found/i.test(error?.message || '');
  }

  async function fetchVisualFolders() {
    return normalizeFoldersResponse(await adminFetchJson(VISUALS_FOLDERS_API_URL));
  }

  function normalizeAssetType(asset) {
    return (asset?.asset_type || asset?.type || '').toLowerCase() === 'clip' ? 'clip' : 'image';
  }

  function normalizeAsset(asset) {
    if (!asset || typeof asset !== 'object') return null;
    const id = getFirstString(asset, ['id', 'asset_id', 's3_key', 'public_url', 'file_name']);
    const publicUrl = getFirstString(asset, ['public_url', 'url', 'asset_url', 'src']);
    const fileName = getFirstString(asset, ['file_name', 'name', 'title']) || 'Untitled visual asset';
    if (!id && !publicUrl) return null;
    return {
      id: id || publicUrl,
      asset_type: normalizeAssetType(asset),
      file_name: fileName,
      public_url: publicUrl,
      content_type: getFirstString(asset, ['content_type', 'mime_type']),
      caption: clean(asset.caption),
      alt_text: clean(asset.alt_text),
      notes: getFirstString(asset, ['notes', 'note', 'description', 'asset_notes', 'video_notes']),
      status: clean(asset.status) || 'active',
      created_at: asset.created_at || asset.createdAt || '',
      updated_at: asset.updated_at || asset.updatedAt || '',
      uploaded_at: asset.uploaded_at || asset.uploadedAt || asset.upload_timestamp || asset.uploadTimestamp || '',
    };
  }

  function normalizeAssetsResponse(data) {
    if (typeof data?.body === 'string') {
      try { return normalizeAssetsResponse(JSON.parse(data.body)); } catch { return []; }
    }
    const list = Array.isArray(data) ? data : (Array.isArray(data?.assets) ? data.assets : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.body) ? data.body : [])));
    return list.map(normalizeAsset).filter(Boolean);
  }

  async function fetchFolderAssets(folderId) {
    try {
      return normalizeAssetsResponse(await adminFetchJson(folderAssetsApiUrl(folderId)));
    } catch (error) {
      if (isBackendPendingError(error)) return [];
      throw error;
    }
  }

  async function fetchSongs() {
    return normalizeSongsResponse(await adminFetchJson(SONGS_API_URL));
  }

  function recipeApiUrl(songKey) {
    return `${VEC_RECIPE_API_URL}?song_key=${encodeURIComponent(songKey)}`;
  }

  async function fetchRecipe(songKey) {
    return adminFetchJson(recipeApiUrl(songKey));
  }

  async function putRecipe(songKey, recipe) {
    return adminFetchJson(VEC_RECIPE_API_URL, { method: 'PUT', body: JSON.stringify({ song_key: songKey, recipe }) });
  }

  function songAssetsApiUrl(songKey) {
    return `${VEC_SONG_ASSETS_API_URL}?song_key=${encodeURIComponent(songKey)}`;
  }

  async function fetchSongAssets(songKey) {
    return normalizeAssetsResponse(await adminFetchJson(songAssetsApiUrl(songKey)));
  }

  async function createSongAsset(payload) {
    return adminFetchJson(VEC_SONG_ASSETS_API_URL, { method: 'POST', body: JSON.stringify(payload) });
  }

  async function deleteSongAsset(assetId) {
    return adminFetchJson(`${VEC_SONG_ASSETS_API_URL}/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
  }

  async function presignUpload(payload) {
    return adminFetchJson(UPLOAD_PRESIGN_API_URL, { method: 'POST', body: JSON.stringify(payload) });
  }

  function getSongKey(song) {
    return getFirstString(song, ['song_key', 'key', 'slug', 'id', 'track_id', 'track_key']);
  }

  function getSongTitle(song) {
    return getFirstString(song, ['display_title', 'song_name', 'title', 'name']) || 'Untitled song';
  }

  function getArtworkUrl(songContext) {
    return getFirstString(songContext, ['song_artwork_url', 'artwork_url', 'cover_art_url', 'imageUrl']);
  }

  function getAudioUrl(songContext) {
    return getFirstString(songContext, ['audio_url', 'audioUrl']);
  }

  function formatPreviewTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainingSeconds = wholeSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  function createSongContext(song) {
    if (!song) return null;
    const context = {};
    SONG_CONTEXT_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(song, field)) context[field] = song[field];
    });
    context.song_key = clean(context.song_key) || getSongKey(song);
    context.display_title = clean(context.display_title) || getSongTitle(song);
    context.song_name = clean(context.song_name || song.song_name || song.title || song.name);
    context.artist = clean(context.artist);
    return context;
  }

  function sortSongs(songList) {
    return [...songList].sort((a, b) => {
      const bDate = Date.parse(b.updated_at || b.updatedAt || b.created_at || b.createdAt || '');
      const aDate = Date.parse(a.updated_at || a.updatedAt || a.created_at || a.createdAt || '');
      if (!Number.isNaN(bDate) && !Number.isNaN(aDate) && bDate !== aDate) return bDate - aDate;
      return getSongTitle(a).localeCompare(getSongTitle(b), undefined, { sensitivity: 'base' });
    });
  }

  function renderReadonlyToggle(label, value, name) {
    return `
      <label class="vec-field vec-toggle-field">
        <span>${label}</span>
        <button class="vec-toggle ${value ? 'is-on' : 'is-off'}" type="button" aria-pressed="${value}" name="${name}" data-vec-artwork-toggle="${name}">${onOffLabel(value)}</button>
      </label>
    `;
  }

  function renderReadonlySelect(label, name, value, options) {
    return `
      <label class="vec-field">
        <span>${label}</span>
        <select name="${name}" class="vec-select" data-vec-artwork-select="${name}">
          ${optionMarkup(options, value)}
        </select>
      </label>
    `;
  }


  function getBorrowedInclusionMap(state, sourceSongKey) {
    if (!state.borrowedAssetInclusionBySource) state.borrowedAssetInclusionBySource = new Map();
    if (!state.borrowedAssetInclusionBySource.has(sourceSongKey)) state.borrowedAssetInclusionBySource.set(sourceSongKey, new Map());
    return state.borrowedAssetInclusionBySource.get(sourceSongKey);
  }

  function initializeBorrowedAssetInclusion(state, sourceSongKey, assets = []) {
    const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
    assets.forEach((asset) => { if (!inclusion.has(asset.id)) inclusion.set(asset.id, true); });
  }

  function isBorrowedAssetIncluded(state, sourceSongKey, asset) {
    return getBorrowedInclusionMap(state, sourceSongKey).get(asset.id) !== false;
  }

  function getBorrowedAssetState(state, sourceSongKey) {
    return state.borrowedAssetsBySource.get(sourceSongKey) || { loading: false, error: '', assets: [] };
  }

  function getBorrowedSourceEnabledMap(state) {
    if (!state.borrowedSourceEnabledBySource) state.borrowedSourceEnabledBySource = new Map();
    return state.borrowedSourceEnabledBySource;
  }

  function isBorrowedSourceEnabled(state, sourceSongKey) {
    const enabledMap = getBorrowedSourceEnabledMap(state);
    return enabledMap.get(sourceSongKey) !== false;
  }

  function setBorrowedSourceEnabled(state, sourceSongKey, enabled) {
    getBorrowedSourceEnabledMap(state).set(sourceSongKey, enabled !== false);
  }

  function getBorrowedSourceSongKeys(state) {
    return [...(state.borrowedSourceSongKeys || new Set())].filter((sourceSongKey) => sourceSongKey && sourceSongKey !== state.songKey);
  }

  function getActiveBorrowedAssetCounts(state) {
    return getBorrowedSourceSongKeys(state).reduce((counts, sourceSongKey) => {
      if (!isBorrowedSourceEnabled(state, sourceSongKey)) return counts;
      const assetState = getBorrowedAssetState(state, sourceSongKey);
      (assetState.assets || []).forEach((asset) => {
        if (clean(asset.status).toLowerCase() === 'hidden' || !isBorrowedAssetIncluded(state, sourceSongKey, asset)) return;
        if (normalizeAssetType(asset) === 'clip') counts.clips += 1; else counts.images += 1;
      });
      counts.sourceSongs += 1;
      return counts;
    }, { images: 0, clips: 0, sourceSongs: 0 });
  }

  function getActiveBorrowedSongAssets(state) {
    const visuals = [];
    getBorrowedSourceSongKeys(state).forEach((sourceSongKey) => {
      if (!isBorrowedSourceEnabled(state, sourceSongKey)) return;
      const assetState = getBorrowedAssetState(state, sourceSongKey);
      const sourceSong = (state.songs || []).find((song) => getSongKey(song) === sourceSongKey);
      const sourceTitle = sourceSong ? getSongTitle(sourceSong) : sourceSongKey;
      (assetState.assets || []).forEach((asset) => {
        const url = clean(asset.public_url);
        if (!url || clean(asset.status).toLowerCase() === 'hidden' || !isBorrowedAssetIncluded(state, sourceSongKey, asset)) return;
        const type = normalizeAssetType(asset);
        const title = asset.caption || asset.file_name || 'Borrowed song visual';
        visuals.push({
          type, folderId: `borrowed:${sourceSongKey}`, assetId: asset.id, folderName: `Borrowed from ${sourceTitle}`,
          label: title, url, alt: asset.alt_text || title, durationSeconds: type === 'clip' ? 6 : 4,
          created_at: asset.created_at || '', updated_at: asset.updated_at || '', uploaded_at: asset.uploaded_at || '',
        });
      });
    });
    return visuals;
  }

  function getBorrowedAssetToggleState(state, sourceSongKey, assets = []) {
    if (!assets.length) return 'off';
    const includedCount = assets.filter((asset) => isBorrowedAssetIncluded(state, sourceSongKey, asset)).length;
    if (includedCount === assets.length) return 'on';
    if (includedCount === 0) return 'off';
    return 'mixed';
  }

  function renderBorrowedAssetCard(state, sourceSongKey, asset) {
    const type = normalizeAssetType(asset);
    const title = asset.caption || asset.file_name || 'Borrowed song visual';
    const url = clean(asset.public_url);
    const included = isBorrowedAssetIncluded(state, sourceSongKey, asset);
    const media = !url ? `<span>${type === 'clip' ? 'CLIP' : 'IMG'}</span>` : (type === 'clip' ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`);
    return `<div class="vec-folder-asset-card vec-song-asset-card ${type === 'clip' ? 'is-clip' : 'is-image'} ${included ? 'is-included' : 'is-excluded'} ${url ? '' : 'is-disabled'}" data-vec-borrow-preview-asset="${escapeHtml(sourceSongKey)}:${escapeHtml(asset.id)}" role="button" tabindex="${url ? '0' : '-1'}" aria-label="Preview ${escapeHtml(title)}" aria-disabled="${url ? 'false' : 'true'}">
      <span class="vec-folder-asset-thumb">${media}</span>
      <button type="button" class="vec-asset-status-light ${included ? 'is-on' : 'is-off'}" data-vec-borrow-asset-toggle="${escapeHtml(sourceSongKey)}:${escapeHtml(asset.id)}" aria-pressed="${included}" aria-label="${included ? 'Exclude this borrowed visual' : 'Include this borrowed visual'}"><span class="sr-only">${included ? 'Included' : 'Excluded'}</span></button>
      <span class="vec-folder-asset-meta"><strong>${escapeHtml(title)}</strong><small>${type === 'clip' ? 'Video clip' : 'Image'}${asset.status === 'hidden' ? ' · hidden' : ''}</small></span>
    </div>`;
  }

  function renderBorrowedSourceGroup(state, sourceKey) {
    const sourceSong = (state.songs || []).find((song) => getSongKey(song) === sourceKey);
    const sourceTitle = sourceSong ? getSongTitle(sourceSong) : sourceKey;
    const assetState = getBorrowedAssetState(state, sourceKey);
    const assets = [...(assetState.assets || [])].sort((a, b) => latestTime(b) - latestTime(a));
    const sourceEnabled = isBorrowedSourceEnabled(state, sourceKey);
    const counts = sourceEnabled ? assets.reduce((total, asset) => { if (clean(asset.status).toLowerCase() !== 'hidden' && isBorrowedAssetIncluded(state, sourceKey, asset)) { if (normalizeAssetType(asset) === 'clip') total.clips += 1; else total.images += 1; } return total; }, { images: 0, clips: 0 }) : { images: 0, clips: 0 };
    const savedCounts = assets.reduce((total, asset) => { if (clean(asset.status).toLowerCase() !== 'hidden' && isBorrowedAssetIncluded(state, sourceKey, asset)) { if (normalizeAssetType(asset) === 'clip') total.clips += 1; else total.images += 1; } return total; }, { images: 0, clips: 0 });
    const toggleState = getBorrowedAssetToggleState(state, sourceKey, assets);
    return `<article class="vec-folder-card vec-borrow-source-card is-selected ${sourceEnabled ? 'is-borrow-enabled' : 'is-borrow-disabled'}" data-vec-borrow-source-card="${escapeHtml(sourceKey)}">
      <div class="vec-folder-card-top">
        <div class="vec-folder-card-main">
          <div class="vec-folder-card-head"><h3>${escapeHtml(sourceTitle)}</h3><span class="vec-folder-status is-active">Borrowed source</span></div>
          <p class="vec-folder-active-count">Active: ${counts.images + counts.clips} · Excluded: ${Math.max(0, assets.length - counts.images - counts.clips)} · Total: ${assets.length}</p>
          <small>${escapeHtml(sourceKey)}</small>
        </div>
        <div class="vec-folder-actions"><button type="button" class="vec-toggle ${sourceEnabled ? 'is-on' : 'is-off'}" data-vec-borrow-source-enabled="${escapeHtml(sourceKey)}" aria-pressed="${sourceEnabled}">Borrowed Song ${sourceEnabled ? 'ON' : 'OFF'}</button><button type="button" class="vec-folder-expand" data-vec-borrow-source-remove="${escapeHtml(sourceKey)}">Remove Borrowed Song</button></div>
      </div>
      ${assetState.loading ? '<p class="vec-empty-state">Loading borrowed source assets...</p>' : ''}
      ${assetState.error ? `<p class="vec-empty-state vec-error-state">${escapeHtml(assetState.error)}</p>` : ''}
      ${!sourceEnabled ? `<p class="vec-empty-state vec-borrow-disabled-note">This borrowed song is OFF and ignored in the preview. Saved selections preserved: ${savedCounts.images} image${savedCounts.images === 1 ? '' : 's'} · ${savedCounts.clips} clip${savedCounts.clips === 1 ? '' : 's'}.</p>` : ''}
      ${!assetState.loading && !assetState.error ? `<div class="vec-folder-assets-controls vec-song-assets-controls" aria-label="Borrowed visual inclusion controls for ${escapeHtml(sourceTitle)}"><p class="vec-folder-active-count">Active: ${counts.images + counts.clips} · Excluded: ${Math.max(0, assets.length - counts.images - counts.clips)} · Total: ${assets.length}</p>${assets.length ? `<div class="vec-folder-toggle-all"><button type="button" class="vec-folder-toggle-all-button is-on ${toggleState === 'on' ? 'is-active' : ''}" data-vec-borrow-assets-toggle="${escapeHtml(sourceKey)}" data-vec-borrow-assets-toggle-value="on" aria-pressed="${toggleState === 'on'}">All On</button><button type="button" class="vec-folder-toggle-all-button is-off ${toggleState === 'off' ? 'is-active' : ''}" data-vec-borrow-assets-toggle="${escapeHtml(sourceKey)}" data-vec-borrow-assets-toggle-value="off" aria-pressed="${toggleState === 'off'}">All Off</button>${toggleState === 'mixed' ? '<em>Mixed</em>' : ''}</div>` : ''}</div>` : ''}
      ${!assetState.loading && !assetState.error ? (assets.length ? `<div class="vec-folder-asset-grid vec-song-asset-grid">${assets.map((asset) => renderBorrowedAssetCard(state, sourceKey, asset)).join('')}</div>` : '<p class="vec-empty-state">No song-only images or clips found for this source song.</p>') : ''}
    </article>`;
  }

  function renderBorrowedSongAssets(state) {
    if (!state.songContext) return '<p class="vec-empty-state">Select a current song before borrowing visuals.</p>';
    const currentKey = state.songKey || '';
    const selectedKey = state.borrowedSourceSongSelect || '';
    const options = (state.songs || []).filter((song) => getSongKey(song)).map((song) => {
      const songKey = getSongKey(song);
      const isCurrent = songKey === currentKey;
      const artist = clean(song.artist);
      const label = `${getSongTitle(song)}${artist ? ` — ${artist}` : ''}${isCurrent ? ' (current song)' : ''}`;
      return `<option value="${escapeHtml(songKey)}"${selectedKey === songKey ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const sourceKeys = getBorrowedSourceSongKeys(state);
    return `<div class="vec-song-assets-manager vec-borrow-assets-manager">
      <div class="vec-upload-row"><label class="vec-field"><span>Choose Source Song</span><select class="vec-select" data-vec-borrow-source-song><option value="">Choose Source Song</option>${options}</select></label><button type="button" class="vec-placeholder-button" data-vec-add-borrowed-song>Add Borrowed Song</button></div>
      ${state.borrowedSourceSongMessage ? `<p class="vec-empty-state ${state.borrowedSourceSongMessageIsError ? 'vec-error-state' : ''}">${escapeHtml(state.borrowedSourceSongMessage)}</p>` : ''}
      ${!sourceKeys.length ? '<p class="vec-empty-state">Choose a different source song, then click Add Borrowed Song to load its song-only assets.</p>' : ''}
      ${sourceKeys.map((sourceKey) => renderBorrowedSourceGroup(state, sourceKey)).join('')}
    </div>`;
  }

  function getSelectedFolders(state) {
    const selectedIds = state.selectedFolderIds || new Set();
    return (state.visualFolders || []).filter((folder) => selectedIds.has(folder.id));
  }

  function getActiveSongAssets(state) {
    return (state.songAssets || [])
      .filter((asset) => clean(asset.status).toLowerCase() !== 'hidden' && isSongAssetIncluded(state, asset))
      .map((asset) => ({
        type: normalizeAssetType(asset),
        folderId: `song:${state.songKey || 'selected'}`,
        assetId: asset.id,
        folderName: 'Song-only assets',
        label: asset.caption || asset.file_name || 'Song-only visual',
        url: clean(asset.public_url),
        alt: asset.alt_text || asset.caption || asset.file_name || 'Song-only visual',
        durationSeconds: normalizeAssetType(asset) === 'clip' ? 6 : 4,
        created_at: asset.created_at || '', updated_at: asset.updated_at || '', uploaded_at: asset.uploaded_at || '',
      }))
      .filter((visual) => visual.url);
  }

  function getActiveFolderAssets(state, selectedFolders = getSelectedFolders(state)) {
    const visuals = [];
    selectedFolders.forEach((folder) => {
      const assets = [...(getFolderAssetState(state, folder.id).assets || [])].sort((a, b) => latestTime(b) - latestTime(a));
      assets.forEach((asset) => {
        const url = clean(asset.public_url);
        if (!url || clean(asset.status).toLowerCase() === 'hidden' || !isAssetIncluded(state, folder.id, asset)) return;
        const type = normalizeAssetType(asset);
        const title = asset.caption || asset.file_name || `${folder.folder_name} visual`;
        visuals.push({
          type,
          folderId: folder.id,
          assetId: asset.id,
          folderName: folder.folder_name,
          label: title,
          url,
          alt: asset.alt_text || title,
          durationSeconds: type === 'clip' ? 6 : 4,
          created_at: asset.created_at || '',
          updated_at: asset.updated_at || '',
          uploaded_at: asset.uploaded_at || '',
        });
      });
    });
    return visuals;
  }

  function getPreviewSequenceCounts(sequence = []) {
    return sequence.reduce((counts, visual) => {
      if (visual.type === 'artwork') counts.artwork += 1;
      else if (visual.type === 'clip') counts.clips += 1;
      else if (visual.type === 'image') counts.images += 1;
      return counts;
    }, { artwork: 0, images: 0, clips: 0 });
  }

  function getAssetTimestamp(visual) {
    const time = Date.parse(visual?.updated_at || visual?.created_at || visual?.uploaded_at || '');
    return Number.isFinite(time) ? time : 0;
  }

  function shuffleVisuals(visuals) {
    const shuffled = [...visuals];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function applyFolderPlayLimit(visuals, maxAssetsPerFolder) {
    if (maxAssetsPerFolder === 'all') return visuals;
    const maxPerFolder = Number(maxAssetsPerFolder);
    if (!Number.isFinite(maxPerFolder) || maxPerFolder <= 0) return visuals;
    const counts = new Map();
    return visuals.filter((visual) => {
      const count = counts.get(visual.folderId) || 0;
      if (count >= maxPerFolder) return false;
      counts.set(visual.folderId, count + 1);
      return true;
    });
  }

  function applySameFolderRowLimit(visuals, maxSameFolderInRow) {
    if (maxSameFolderInRow === 'none') return visuals;
    const maxInRow = Number(maxSameFolderInRow);
    if (!Number.isFinite(maxInRow) || maxInRow <= 0 || visuals.length < 2) return visuals;
    const remaining = [...visuals];
    const ordered = [];
    while (remaining.length) {
      const lastFolder = ordered[ordered.length - 1]?.folderId;
      let runLength = 0;
      for (let index = ordered.length - 1; index >= 0 && ordered[index].folderId === lastFolder; index -= 1) runLength += 1;
      let nextIndex = 0;
      if (lastFolder && runLength >= maxInRow) {
        const alternativeIndex = remaining.findIndex((visual) => visual.folderId !== lastFolder);
        if (alternativeIndex >= 0) nextIndex = alternativeIndex;
      }
      ordered.push(remaining.splice(nextIndex, 1)[0]);
    }
    return ordered;
  }

  function orderActiveAssets(activeAssets, shuffleRules) {
    let orderedAssets = [...activeAssets];
    if (shuffleRules.orderMode === 'randomize') {
      orderedAssets = shuffleVisuals(orderedAssets);
    } else if (shuffleRules.orderMode === 'newest') {
      // TODO: If visual library assets do not include created/updated/upload timestamps, this falls back to the current displayed order.
      orderedAssets = orderedAssets
        .map((visual, index) => ({ visual, index, time: getAssetTimestamp(visual) }))
        .sort((a, b) => (b.time - a.time) || (a.index - b.index))
        .map((item) => item.visual);
    }
    orderedAssets = applyFolderPlayLimit(orderedAssets, shuffleRules.maxAssetsPerFolder);
    orderedAssets = applySameFolderRowLimit(orderedAssets, shuffleRules.maxSameFolderInRow);
    return orderedAssets;
  }

  function buildPreviewSequence(state) {
    if (!state.songContext) return [];
    const title = state.songContext.display_title || state.songContext.song_name || 'Untitled song';
    const artworkUrl = getArtworkUrl(state.songContext);
    if (state.visualMode === VISUAL_MODE_ARTWORK_ONLY) {
      return [{ type: 'artwork', label: 'Artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: 9999 }];
    }
    const selectedFolders = getSelectedFolders(state);
    const activeAssets = [...getActiveSongAssets(state), ...getActiveBorrowedSongAssets(state), ...getActiveFolderAssets(state, selectedFolders)];
    const shuffleRules = { ...DEFAULT_SHUFFLE_RULES, ...(state.shuffleRules || {}) };
    const orderedAssets = orderActiveAssets(activeAssets, shuffleRules);
    const sequence = [];

    if (state.artworkRules.startWithArtwork && artworkUrl) {
      sequence.push({ type: 'artwork', label: 'Artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: state.artworkRules.startDurationSeconds || 4 });
    }

    orderedAssets.forEach((visual) => sequence.push(visual));

    if (state.artworkRules.rePresentArtwork && artworkUrl && orderedAssets.length && !sequence.some((visual) => visual.type === 'artwork')) {
      sequence.unshift({ type: 'artwork', label: 'Artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: state.artworkRules.startDurationSeconds || 4 });
    }

    if (!sequence.length && artworkUrl) {
      sequence.push({ type: 'artwork', label: 'Artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: 4 });
    }

    return sequence;
  }

  function renderPreview(songContext, previewState) {
    if (!songContext) {
      return '<span class="vec-preview-badge">Preview Mode</span><p>Select a song to preview its visual experience.</p>';
    }
    const title = songContext.display_title || songContext.song_name || 'Untitled song';
    const genre = clean(songContext.genre);
    const visual = previewState.sequence[previewState.index] || null;
    const isPlaying = previewState.isPlaying;
    if (!visual) {
      return `
        <span class="vec-preview-badge">Preview Mode</span>
        <div class="vec-preview-song is-empty ${isPlaying ? 'is-playing' : 'is-paused'}">
          <div class="vec-artwork-fallback" aria-label="No active visuals selected">No active visuals selected for this song.</div>
          <div class="vec-preview-meta">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(songContext.artist || 'Artist unavailable')}</span>
            <small>No active visuals selected</small>
          </div>
        </div>`;
    }
    const visualTypeLabel = visual.type === 'clip' ? 'Video clip' : (visual.type === 'image' ? 'Image' : 'Artwork');
    const visualMarkup = visual.url
      ? (visual.type === 'clip'
        ? `<video src="${escapeHtml(visual.url)}" muted playsinline preload="metadata" ${isPlaying ? 'autoplay' : ''} data-vec-preview-video></video>`
        : `<img src="${escapeHtml(visual.url)}" alt="${escapeHtml(visual.alt || visual.label || title)}" />`)
      : '<div class="vec-artwork-fallback" aria-label="No artwork available">No artwork</div>';
    return `
      <span class="vec-preview-badge">Preview Mode</span>
      <span class="vec-visual-type-badge">${escapeHtml(visualTypeLabel)}</span>
      <div class="vec-preview-song ${isPlaying ? 'is-playing' : 'is-paused'} is-${escapeHtml(visual.type || 'visual')}">
        ${visualMarkup}
        <div class="vec-preview-meta">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(songContext.artist || 'Artist unavailable')}</span>
          ${genre ? `<em>${escapeHtml(genre)}</em>` : ''}
          <small>${escapeHtml(visual.label || 'Preview visual')} · ${isPlaying ? 'Playing local preview' : 'Paused local preview'}</small>
        </div>
      </div>
    `;
  }

  function renderArtworkStatus(songContext) {
    const artworkUrl = getArtworkUrl(songContext);
    if (!songContext) return '<p class="vec-artwork-status">Select a song to inspect official artwork.</p>';
    return `
      <div class="vec-artwork-status ${artworkUrl ? 'has-artwork' : ''}">
        ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="Official artwork thumbnail" />` : '<span class="vec-artwork-dot" aria-hidden="true"></span>'}
        <strong>${artworkUrl ? 'Artwork available' : 'No artwork available'}</strong>
      </div>
    `;
  }

  function getAssetInclusionMap(state, folderId) {
    if (!state.assetInclusionByFolder.has(folderId)) state.assetInclusionByFolder.set(folderId, new Map());
    return state.assetInclusionByFolder.get(folderId);
  }

  function initializeFolderAssetInclusion(state, folderId, assets = []) {
    const inclusion = getAssetInclusionMap(state, folderId);
    assets.forEach((asset) => {
      if (!inclusion.has(asset.id)) inclusion.set(asset.id, true);
    });
  }

  function getSongAssetInclusionMap(state) {
    if (!state.songAssetInclusion) state.songAssetInclusion = new Map();
    return state.songAssetInclusion;
  }

  function initializeSongAssetInclusion(state, assets = []) {
    const inclusion = getSongAssetInclusionMap(state);
    assets.forEach((asset) => { if (!inclusion.has(asset.id)) inclusion.set(asset.id, true); });
  }

  function isSongAssetIncluded(state, asset) {
    const inclusion = getSongAssetInclusionMap(state);
    return inclusion.get(asset.id) !== false;
  }

  function getActiveSongAssetCounts(state) {
    return (state.songAssets || []).reduce((counts, asset) => {
      if (clean(asset.status).toLowerCase() === 'hidden' || !isSongAssetIncluded(state, asset)) return counts;
      if (normalizeAssetType(asset) === 'clip') counts.clips += 1; else counts.images += 1;
      return counts;
    }, { images: 0, clips: 0 });
  }

  function isAssetIncluded(state, folderId, asset) {
    folderId = String(folderId);
    if (!state.selectedFolderIds.has(folderId)) return false;
    const inclusion = getAssetInclusionMap(state, folderId);
    return inclusion.get(asset.id) !== false;
  }

  function getActiveAssetCounts(state, folder) {
    const folderId = String(folder.id);
    if (!state.selectedFolderIds.has(folderId)) return { images: 0, clips: 0 };
    const assetState = getFolderAssetState(state, folderId);
    const assets = assetState.assets || [];
    if (!assets.length) return { images: folder.images_count || 0, clips: folder.clips_count || 0 };
    return assets.reduce((counts, asset) => {
      if (clean(asset.status).toLowerCase() === 'hidden' || !isAssetIncluded(state, folderId, asset)) return counts;
      if (normalizeAssetType(asset) === 'clip') counts.clips += 1;
      else counts.images += 1;
      return counts;
    }, { images: 0, clips: 0 });
  }

  function getFolderAssetToggleState(state, folderId, assets = []) {
    if (!assets.length || !state.selectedFolderIds.has(folderId)) return 'off';
    const includedCount = assets.filter((asset) => isAssetIncluded(state, folderId, asset)).length;
    if (includedCount === assets.length) return 'on';
    if (includedCount === 0) return 'off';
    return 'mixed';
  }

  function getSongAssetToggleState(state, assets = []) {
    if (!assets.length) return 'off';
    const includedCount = assets.filter((asset) => isSongAssetIncluded(state, asset)).length;
    if (includedCount === assets.length) return 'on';
    if (includedCount === 0) return 'off';
    return 'mixed';
  }

  function getSelectedActiveAssetCounts(state, selectedFolders = getSelectedFolders(state)) {
    const songCounts = getActiveSongAssetCounts(state);
    const borrowedCounts = getActiveBorrowedAssetCounts(state);
    return selectedFolders.reduce((totals, folder) => {
      const counts = getActiveAssetCounts(state, folder);
      totals.images += counts.images;
      totals.clips += counts.clips;
      return totals;
    }, { images: songCounts.images + borrowedCounts.images, clips: songCounts.clips + borrowedCounts.clips });
  }

  function renderSummary(songContext, artworkRules, shuffleRules = DEFAULT_SHUFFLE_RULES, selectedFolders = [], activeCounts = { images: 0, clips: 0 }, previewSequence = [], currentVisual = null, recipeMeta = {}, borrowedCounts = { images: 0, clips: 0 }, visualMode = VISUAL_MODE_CUSTOM) {
    const title = songContext ? (songContext.display_title || songContext.song_name || 'Untitled song') : 'None';
    const artist = songContext?.artist || '—';
    const songKey = songContext?.song_key || '—';
    const artworkStatus = songContext && getArtworkUrl(songContext) ? 'Artwork available' : 'No artwork available';
    const recipeStatus = songContext ? (recipeMeta.dirty ? 'Unsaved changes' : (recipeMeta.status || 'Saved')) : 'No song selected';
    const lastSaved = recipeMeta.updatedAt ? new Date(recipeMeta.updatedAt).toLocaleString() : 'Never';
    const selectedImages = activeCounts.images || 0;
    const selectedClips = activeCounts.clips || 0;
    const selectedNames = selectedFolders.map((folder) => folder.folder_name).join(', ') || 'None selected';
    const visualModeLabel = visualMode === VISUAL_MODE_ARTWORK_ONLY ? 'Song Artwork Only' : 'Custom';
    const sequenceCounts = getPreviewSequenceCounts(previewSequence);
    const sequenceTotal = previewSequence.length;
    const sequenceLabel = `${sequenceCounts.artwork} artwork + ${sequenceCounts.images} images + ${sequenceCounts.clips} clips`;
    const currentLabel = currentVisual ? `${currentVisual.type === 'clip' ? 'Video clip' : (currentVisual.type === 'image' ? 'Image' : 'Artwork')}: ${currentVisual.label || 'Preview visual'}` : 'None';
    const orderModeLabel = ORDER_MODE_LABELS[shuffleRules.orderMode] || ORDER_MODE_LABELS.randomize;
    const maxSameFolderLabel = MAX_SAME_FOLDER_LABELS[shuffleRules.maxSameFolderInRow] || String(shuffleRules.maxSameFolderInRow || '1');
    const maxAssetsPerFolderLabel = MAX_ASSETS_PER_FOLDER_LABELS[shuffleRules.maxAssetsPerFolder] || String(shuffleRules.maxAssetsPerFolder || 'All');
    return `
      <p class="vec-empty-state">${songContext ? `Selected song context loaded for ${escapeHtml(title)}.` : 'No song selected yet.'}</p>
      <div class="vec-summary-grid">
        <div class="vec-summary-card"><strong>Selected song</strong><span>${escapeHtml(title)}</span></div>
        <div class="vec-summary-card"><strong>Artist</strong><span>${escapeHtml(artist)}</span></div>
        <div class="vec-summary-card"><strong>Song key</strong><span>${escapeHtml(songKey)}</span></div>
        <div class="vec-summary-card"><strong>Official artwork</strong><span>${artworkStatus}</span></div>
        <div class="vec-summary-card"><strong>Mode</strong><span>${escapeHtml(visualModeLabel)}</span></div>
        <div class="vec-summary-card"><strong>Saved status</strong><span>${escapeHtml(recipeStatus)}</span></div>
        <div class="vec-summary-card"><strong>Last saved</strong><span>${escapeHtml(lastSaved)}</span></div>
        <div class="vec-summary-card"><strong>Selected folders</strong><span>${selectedFolders.length} folder${selectedFolders.length === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card vec-summary-wide"><strong>Selected folder names</strong><span>${escapeHtml(selectedNames)}</span></div>
        <div class="vec-summary-card"><strong>Active image count</strong><span>${selectedImages} image${selectedImages === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card"><strong>Active clip count</strong><span>${selectedClips} clip${selectedClips === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card"><strong>Borrowed assets</strong><span>${borrowedCounts.images || 0} images · ${borrowedCounts.clips || 0} clips · ${borrowedCounts.sourceSongs || 0} source songs</span></div>
        <div class="vec-summary-card"><strong>Preview sequence count</strong><span>${sequenceTotal} visual${sequenceTotal === 1 ? '' : 's'}: ${escapeHtml(sequenceLabel)}</span></div>
        <div class="vec-summary-card"><strong>Order mode</strong><span>${escapeHtml(orderModeLabel)}</span></div>
        <div class="vec-summary-card"><strong>Max same folder in row</strong><span>${escapeHtml(maxSameFolderLabel)}</span></div>
        <div class="vec-summary-card"><strong>Max assets per folder</strong><span>${escapeHtml(maxAssetsPerFolderLabel)}</span></div>
        <div class="vec-summary-card"><strong>Avoid repeats</strong><span>${onOffLabel(shuffleRules.avoidRepeats)}</span></div>
        <div class="vec-summary-card"><strong>Current visual</strong><span>${escapeHtml(currentLabel)}</span></div>
        <div class="vec-summary-card"><strong>Artwork rules</strong><span>Start ${onOffLabel(artworkRules.startWithArtwork)} · ${secondsLabel(artworkRules.startDurationSeconds)} · End ${onOffLabel(artworkRules.endWithArtwork)} · ${secondsLabel(artworkRules.endDurationSeconds)} · Re-present ${onOffLabel(artworkRules.rePresentArtwork)} every ${secondsLabel(artworkRules.repeatEverySeconds)}</span></div>
      </div>`;
  }

  function latestTime(value) {
    const time = Date.parse(value?.updated_at || value?.created_at || '');
    return Number.isFinite(time) ? time : 0;
  }

  function getFolderAssetState(state, folderId) {
    return state.folderAssets.get(folderId) || { loading: false, error: '', assets: [] };
  }

  function renderAssetPreview(state, asset, folderId) {
    const type = normalizeAssetType(asset);
    const title = asset.caption || asset.file_name || 'Visual asset';
    const url = clean(asset.public_url);
    const included = isAssetIncluded(state, folderId, asset);
    const toggleLabel = included ? 'Exclude this visual' : 'Include this visual';
    const media = !url
      ? `<span>${type === 'clip' ? 'MP4' : 'IMG'}</span>`
      : (type === 'clip'
        ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`);
    return `<div class="vec-folder-asset-card ${type === 'clip' ? 'is-clip' : 'is-image'} ${included ? 'is-included' : 'is-excluded'} ${url ? '' : 'is-disabled'}" data-vec-preview-asset="${escapeHtml(folderId)}:${escapeHtml(asset.id)}" role="button" tabindex="${url ? '0' : '-1'}" aria-label="Preview ${escapeHtml(title)}" aria-disabled="${url ? 'false' : 'true'}">
      <span class="vec-folder-asset-thumb">${media}</span>
      <button type="button" class="vec-asset-status-light ${included ? 'is-on' : 'is-off'}" data-vec-asset-toggle="${escapeHtml(folderId)}:${escapeHtml(asset.id)}" aria-pressed="${included}" aria-label="${toggleLabel}" title="${toggleLabel}"><span class="sr-only">${toggleLabel}</span></button>
      <span class="vec-folder-asset-meta"><strong>${escapeHtml(title)}</strong><small>${type === 'clip' ? 'Video clip' : 'Image'}${asset.status === 'hidden' ? ' · hidden' : ''}</small></span>
    </div>`;
  }

  function renderFolderAssets(state, folder) {
    const assetState = getFolderAssetState(state, folder.id);
    if (assetState.loading) return '<div class="vec-folder-assets"><p class="vec-empty-state">Loading folder visuals...</p></div>';
    if (assetState.error) return `<div class="vec-folder-assets"><p class="vec-empty-state vec-error-state">${escapeHtml(assetState.error)}</p></div>`;
    const assets = [...(assetState.assets || [])].sort((a, b) => latestTime(b) - latestTime(a));
    if (!assets.length) return '<div class="vec-folder-assets"><p class="vec-empty-state">No reusable Visual Library assets are currently registered for this folder.</p></div>';
    initializeFolderAssetInclusion(state, folder.id, assets);
    const clips = assets.filter((asset) => normalizeAssetType(asset) === 'clip');
    const images = assets.filter((asset) => normalizeAssetType(asset) === 'image');
    const activeCounts = getActiveAssetCounts(state, folder);
    const toggleState = getFolderAssetToggleState(state, folder.id, assets);
    return `<div class="vec-folder-assets">
      <div class="vec-folder-assets-head"><strong>Folder visuals</strong><span>${images.length} image${images.length === 1 ? '' : 's'} · ${clips.length} clip${clips.length === 1 ? '' : 's'}</span></div>
      <div class="vec-folder-assets-controls" aria-label="Folder visual inclusion controls">
        <p class="vec-folder-active-count">Active: ${activeCounts.images + activeCounts.clips} · Excluded: ${Math.max(0, assets.length - activeCounts.images - activeCounts.clips)} · Total: ${assets.length}</p>
        <div class="vec-folder-toggle-all" aria-label="Toggle all visuals in this folder">
          <span>Toggle All:</span>
          <button type="button" class="vec-folder-toggle-all-button is-on ${toggleState === 'on' ? 'is-active' : ''}" data-vec-folder-assets-toggle="${escapeHtml(folder.id)}" data-vec-folder-assets-toggle-value="on" aria-pressed="${toggleState === 'on'}">All On</button>
          <button type="button" class="vec-folder-toggle-all-button is-off ${toggleState === 'off' ? 'is-active' : ''}" data-vec-folder-assets-toggle="${escapeHtml(folder.id)}" data-vec-folder-assets-toggle-value="off" aria-pressed="${toggleState === 'off'}">All Off</button>
          ${toggleState === 'mixed' ? '<em>Mixed</em>' : ''}
        </div>
      </div>
      <div class="vec-folder-asset-grid">${assets.map((asset) => renderAssetPreview(state, asset, folder.id)).join('')}</div>
    </div>`;
  }



  function renderSongAssetCard(state, asset) {
    const type = normalizeAssetType(asset);
    const title = asset.caption || asset.file_name || 'Song-only visual asset';
    const url = clean(asset.public_url);
    const included = isSongAssetIncluded(state, asset);
    const media = !url ? `<span>${type === 'clip' ? 'CLIP' : 'IMG'}</span>` : (type === 'clip' ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`);
    return `<div class="vec-folder-asset-card vec-song-asset-card ${type === 'clip' ? 'is-clip' : 'is-image'} ${included ? 'is-included' : 'is-excluded'} ${url ? '' : 'is-disabled'}" data-vec-song-preview-asset="${escapeHtml(asset.id)}" role="button" tabindex="${url ? '0' : '-1'}" aria-label="Preview ${escapeHtml(title)}" aria-disabled="${url ? 'false' : 'true'}">
      <span class="vec-folder-asset-thumb">${media}</span>
      <button type="button" class="vec-asset-status-light ${included ? 'is-on' : 'is-off'}" data-vec-song-asset-toggle="${escapeHtml(asset.id)}" aria-pressed="${included}" aria-label="${included ? 'Exclude this song-only visual' : 'Include this song-only visual'}"><span class="sr-only">${included ? 'Included' : 'Excluded'}</span></button>
      <span class="vec-folder-asset-meta"><strong>${escapeHtml(title)}</strong><small>${type === 'clip' ? 'Video clip' : 'Image'}${asset.status === 'hidden' ? ' · hidden' : ''}</small></span>
      <button type="button" class="vec-song-asset-delete" data-vec-song-asset-delete="${escapeHtml(asset.id)}">Delete</button>
    </div>`;
  }

  function renderSongAssets(state) {
    if (!state.songContext) return '<p class="vec-empty-state">Select a song to manage song-only visual assets.</p>';
    const counts = getActiveSongAssetCounts(state);
    const assets = [...(state.songAssets || [])].sort((a, b) => latestTime(b) - latestTime(a));
    const message = state.songAssetUploadMessage || (state.songAssetsLoading ? 'Loading song-only assets...' : (state.songAssetsError || ''));
    const toggleState = getSongAssetToggleState(state, assets);
    return `<div class="vec-song-assets-manager">
      <div class="vec-upload-row">
        <label class="vec-placeholder-button">Upload image<input class="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-vec-song-upload="image" /></label>
        <label class="vec-placeholder-button">Upload video clip<input class="sr-only" type="file" accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" data-vec-song-upload="clip" /></label>
      </div>
      <div class="vec-song-dropzone" data-vec-song-dropzone>Drag and drop song-only images or clips here.</div>
      <div class="vec-folder-assets-controls vec-song-assets-controls" aria-label="Song-only visual inclusion controls">
        <p class="vec-folder-active-count">Active: ${counts.images + counts.clips} · Excluded: ${Math.max(0, assets.length - counts.images - counts.clips)} · Total: ${assets.length}</p>
        ${assets.length ? `<div class="vec-folder-toggle-all" aria-label="Toggle all song-only visuals">
          <button type="button" class="vec-folder-toggle-all-button is-on ${toggleState === 'on' ? 'is-active' : ''}" data-vec-song-assets-toggle="on" aria-pressed="${toggleState === 'on'}">All On</button>
          <button type="button" class="vec-folder-toggle-all-button is-off ${toggleState === 'off' ? 'is-active' : ''}" data-vec-song-assets-toggle="off" aria-pressed="${toggleState === 'off'}">All Off</button>
          ${toggleState === 'mixed' ? '<em>Mixed</em>' : ''}
        </div>` : ''}
      </div>
      ${state.songAssetUploading ? '<p class="vec-empty-state">Uploading song-only asset...</p>' : ''}
      ${message ? `<p class="vec-empty-state ${state.songAssetsError ? 'vec-error-state' : ''}">${escapeHtml(message)}</p>` : ''}
      ${assets.length ? `<div class="vec-folder-asset-grid vec-song-asset-grid">${assets.map((asset) => renderSongAssetCard(state, asset)).join('')}</div>` : '<p class="vec-empty-state">No song-only images or clips uploaded yet.</p>'}
    </div>`;
  }

  function getFilteredVisualFolders(state) {
    const search = clean(state.folderSearch).toLowerCase();
    const type = clean(state.folderTypeFilter).toLowerCase();
    const active = clean(state.folderActiveFilter).toLowerCase();
    return (state.visualFolders || []).filter((folder) => {
      const matchesSearch = !search || [folder.folder_name, folder.description, folder.folder_slug].some((value) => clean(value).toLowerCase().includes(search));
      const matchesType = !type || type === 'all' || folder.folder_type === type;
      const selected = state.selectedFolderIds.has(String(folder.id));
      const matchesActive = !active || active === 'all' || (active === 'active' ? selected : !selected);
      return matchesSearch && matchesType && matchesActive;
    });
  }

  function renderFolderToolbar(state) {
    const typeOptions = [['all', 'All types'], ...Object.entries(FOLDER_TYPE_LABELS).map(([value, label]) => [value, label])];
    return `<div class="vec-folder-toolbar" aria-label="Visual Library folder filters">
      <label class="vec-toolbar-field"><span>Search folders</span><input type="search" data-vec-folder-search value="${escapeHtml(state.folderSearch || '')}" placeholder="Search folders" aria-label="Search folders" /></label>
      <label class="vec-toolbar-field"><span>Folder type</span><select data-vec-folder-type-filter aria-label="Filter by folder type">${typeOptions.map(([value, label]) => `<option value="${escapeHtml(value)}"${(state.folderTypeFilter || 'all') === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
      <label class="vec-toolbar-field"><span>Folder state</span><select data-vec-folder-active-filter aria-label="Filter active, inactive, or all folders"><option value="all"${(state.folderActiveFilter || 'all') === 'all' ? ' selected' : ''}>All</option><option value="active"${state.folderActiveFilter === 'active' ? ' selected' : ''}>Active</option><option value="inactive"${state.folderActiveFilter === 'inactive' ? ' selected' : ''}>Inactive</option></select></label>
      <button type="button" class="vec-folder-collapse-all" data-vec-collapse-folders>Collapse All</button>
    </div>`;
  }

  function renderFolderCards(state) {
    if (!state.songContext) return '<p class="vec-empty-state">Select a song before choosing Visual Library folders.</p>';
    if (state.visualFoldersLoading) return '<p class="vec-empty-state">Loading real Visual Library folders...</p>';
    if (state.visualFoldersError) return `<p class="vec-empty-state vec-error-state">${escapeHtml(state.visualFoldersError)}</p>`;
    if (!state.visualFolders.length) return '<p class="vec-empty-state">No Visual Library folders are available yet.</p>';
    const folders = getFilteredVisualFolders(state);
    if (!folders.length) return '<p class="vec-empty-state">No folders match the current filters.</p>';
    return folders.map((folder) => {
      const folderId = String(folder.id);
      const selected = state.selectedFolderIds.has(folderId);
      const typeLabel = FOLDER_TYPE_LABELS[folder.folder_type] || folder.folder_type || 'General';
      const statusLabel = FOLDER_STATUS_LABELS[folder.status] || folder.status || 'Active';
      const dateLabel = formatDate(folder.updated_at || folder.created_at);
      const expanded = state.expandedFolderIds.has(folderId);
      const selectionLabel = selected ? 'Folder included. Click to exclude this folder.' : 'Folder excluded. Click to include this folder.';
      const activeCounts = getActiveAssetCounts(state, folder);
      return `<article class="vec-folder-card ${selected ? 'is-selected' : 'is-unselected'} ${expanded ? 'is-expanded' : ''}">
        <div class="vec-folder-summary vec-folder-card-top">
          <div class="vec-folder-card-main">
            <div class="vec-folder-card-head"><div class="vec-folder-title-area"><h3>${escapeHtml(folder.folder_name)}</h3><span class="vec-folder-status ${folder.status === 'hidden' ? 'is-hidden' : 'is-active'}">${escapeHtml(statusLabel)}</span></div></div>
            <div class="vec-folder-badges"><span>${escapeHtml(typeLabel)}</span></div>
            ${folder.description ? `<p>${escapeHtml(folder.description)}</p>` : '<p>No description available.</p>'}
            <div class="vec-folder-summary-counts"><span>${folder.images_count} images</span><span>${folder.clips_count} clips</span><span>${activeCounts.images + activeCounts.clips} active</span></div>
            ${dateLabel ? `<small>${folder.updated_at ? 'Updated' : 'Created'} ${escapeHtml(dateLabel)}</small>` : ''}
          </div>
          <div class="vec-folder-actions">
            <label class="vec-folder-toggle-label"><span>Active</span><button type="button" class="vec-folder-status-light ${selected ? 'is-on' : 'is-off'}" data-vec-folder-toggle="${escapeHtml(folderId)}" aria-pressed="${selected}" aria-label="${selectionLabel}" title="${selectionLabel}"><span class="sr-only">${selected ? 'Included' : 'Excluded'}</span></button></label>
            <button type="button" class="vec-folder-expand" data-vec-folder-expand="${escapeHtml(folderId)}" aria-expanded="${expanded}">${expanded ? 'Collapse Assets' : 'Expand Assets'}</button>
          </div>
        </div>
        ${expanded ? renderFolderAssets(state, { ...folder, id: folderId }) : ''}
      </article>`;
    }).join('');
  }

  function initVecController(container, options = {}) {
    if (!container) return null;
    const initialSongContext = options.songContext ? createSongContext(options.songContext) : null;
    const state = { mode: options.mode || 'lab', visualMode: options.visualMode === VISUAL_MODE_ARTWORK_ONLY ? VISUAL_MODE_ARTWORK_ONLY : VISUAL_MODE_CUSTOM, songKey: options.songKey || initialSongContext?.song_key || '', songs: [], songContext: initialSongContext, artworkRules: { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) }, shuffleRules: { ...DEFAULT_SHUFFLE_RULES, ...(options.shuffleRules || {}) }, localPreviewVisuals: options.localPreviewVisuals || [], visualFolders: normalizeFoldersResponse(options.visualFolders || []), visualFoldersLoading: false, visualFoldersError: '', selectedFolderIds: new Set((options.selectedFolderIds || []).map(String)), expandedFolderIds: new Set(), folderAssets: new Map(), songAssets: [], songAssetsLoading: false, songAssetsError: '', songAssetUploading: false, songAssetUploadMessage: '', songAssetInclusion: new Map(), borrowedSourceSongKey: '', borrowedSourceSongKeys: new Set(), borrowedSourceSongSelect: '', borrowedSourceSongMessage: '', borrowedSourceSongMessageIsError: false, borrowedAssetsBySource: new Map(), borrowedAssetInclusionBySource: new Map(), borrowedSourceEnabledBySource: new Map(), assetInclusionByFolder: new Map(), previewModalAsset: null, folderSearch: '', folderTypeFilter: 'all', folderActiveFilter: 'all', savedRecipe: null, savedRecipeUpdatedAt: '', dirty: false, recipeLoading: false, recipeStatus: '' };
    const previewState = { sequence: buildPreviewSequence(state), index: 0, isPlaying: false, timerId: null, preloadCache: new Map(), artworkOverride: null, endArtworkActive: false, lastRepeatSlot: 0 };

    container.innerHTML = `
      <section class="card vec-section" aria-labelledby="songSelectorHeading">
        <div class="panel-header vec-section-header"><div><p class="eyebrow">Song</p><h2 id="songSelectorHeading">Select Song</h2><p class="vec-copy">Select a song to simulate the song context for this VEC Lab.</p></div></div>
        <label class="vec-label" for="songSelect">Song</label>
        <select id="songSelect" class="vec-select" data-vec-song-select><option value="">Loading songs...</option></select>
        <p class="vec-microcopy" data-vec-song-status>Loading real Songs CMS data from the existing dev admin songs API.</p>
      </section>
      <section class="card vec-section" aria-labelledby="vecPreviewHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Preview</p><h2 id="vecPreviewHeading">VEC Preview</h2><p class="vec-copy">Preview only — local audio only; does not count plays, ads, skips, or stats.</p></div></div><div class="vec-preview-window" aria-label="Visual experience preview" data-vec-preview></div><div class="vec-audio-preview" data-vec-audio-preview aria-label="Local preview audio scrubber"><p class="vec-audio-message" data-vec-audio-message>Select a song to load preview audio.</p><div class="vec-scrubber-row"><span data-vec-current-time>0:00</span><input type="range" min="0" max="0" step="0.01" value="0" data-vec-scrubber aria-label="Preview audio time scrubber" disabled /><span data-vec-duration>--:--</span></div></div><div class="vec-button-row" aria-label="Preview controls"><button type="button" data-vec-preview-play>Play Preview</button><button type="button" data-vec-preview-pause>Pause</button><button type="button" data-vec-preview-restart>Restart</button><button type="button" data-vec-preview-next>Next Visual</button></div></section>
      <section class="card vec-section" aria-labelledby="artworkControllerHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Artwork</p><h2 id="artworkControllerHeading">Official Artwork</h2><p class="vec-copy">Plan how the official song artwork anchors the visual experience at the start, end, and throughout playback.</p></div></div><div data-vec-artwork-status></div><div class="vec-artwork-only-control"><label class="vec-field vec-toggle-field"><span>Use Song Artwork Only</span><button class="vec-toggle is-off" type="button" aria-pressed="false" data-vec-artwork-only-toggle>OFF</button></label><p class="vec-microcopy">Shows only the official song artwork for the full song and ignores song-only assets, borrowed assets, and visual library folders.</p><p class="vec-artwork-only-note hidden" data-vec-artwork-only-note>Artwork Only Mode is active. Other visual sources are ignored for this song.</p></div><div class="vec-control-grid" role="group" aria-label="Official song artwork controller">${renderReadonlyToggle('Start with artwork', state.artworkRules.startWithArtwork, 'start_with_artwork')}${renderReadonlySelect('Start duration', 'start_artwork_duration_seconds', state.artworkRules.startDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('End with artwork', state.artworkRules.endWithArtwork, 'end_with_artwork')}${renderReadonlySelect('End duration', 'end_artwork_duration_seconds', state.artworkRules.endDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('Re-present artwork', state.artworkRules.rePresentArtwork, 're_present_artwork')}${renderReadonlySelect('Repeat every', 'repeat_artwork_every_seconds', state.artworkRules.repeatEverySeconds, REPEAT_OPTIONS)}</div></section>
      <section class="card vec-section" aria-labelledby="songAssetsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Song Assets</p><h2 id="songAssetsHeading">Song-Only Assets</h2><p class="vec-copy">Active upload path: images and clips uploaded directly for this selected song only.</p></div></div><div data-vec-song-assets></div></section>
      <section class="card vec-section" aria-labelledby="folderCardsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Folders</p><h2 id="folderCardsHeading">Visual Library Folders</h2><p class="vec-copy">Reusable Visual Library folders are selectable sources only; manage new song-level media in Song-Only Assets.</p></div></div><div data-vec-folder-toolbar></div><div class="vec-folder-grid" data-vec-folder-grid></div></section>
      <section class="card vec-section" aria-labelledby="borrowSongsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Borrow</p><h2 id="borrowSongsHeading">Borrow From Other Songs</h2><p class="vec-copy">Reuse visuals from another song without copying or moving the files.</p></div></div><div data-vec-borrow-assets></div></section>
      <section class="card vec-section" aria-labelledby="shuffleSettingsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Shuffle</p><h2 id="shuffleSettingsHeading">Controlled Shuffle</h2><p class="vec-copy">Set basic rules for how selected visuals should rotate during the song.</p></div></div><div class="vec-control-grid" role="group" aria-label="Controlled shuffle settings"><label class="vec-field"><span>Order mode</span><select class="vec-select" data-vec-order-mode><option value="manual">Manual Order</option><option value="randomize">Randomize</option><option value="newest">Newest First</option></select></label><label class="vec-field"><span>Max assets from same folder in a row</span><select class="vec-select" data-vec-max-same-folder><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="none">No limit</option></select></label><label class="vec-field"><span>Max assets per folder per play</span><select class="vec-select" data-vec-max-folder-assets><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="5">5</option><option value="all">All</option></select></label><label class="vec-field"><span>Avoid repeating same asset</span><button class="vec-toggle is-on" type="button" data-vec-avoid-repeats aria-pressed="true">ON</button></label></div></section>
      <section class="card vec-section vec-save-panel" aria-labelledby="vecSaveHeading"><div class="vec-save-content"><p class="eyebrow">Save / Reset</p><h2 id="vecSaveHeading">Save / Reset</h2><p class="vec-copy">Save and reload this dev-only VEC recipe for the selected song.</p><p class="vec-microcopy" data-vec-recipe-status>No song selected.</p><div class="vec-recipe-summary-block" aria-labelledby="recipeSummaryHeading"><h3 id="recipeSummaryHeading">Recipe Summary</h3><div data-vec-summary></div></div></div><div class="vec-button-row"><button type="button" data-vec-save-recipe disabled>Save VEC Recipe</button><button type="button" data-vec-reset-recipe disabled>Reset Unsaved Changes</button></div></section><div class="vec-media-modal hidden" data-vec-media-modal role="dialog" aria-modal="true" aria-labelledby="vecMediaModalTitle"></div>`;

    const elements = {
      select: container.querySelector('[data-vec-song-select]'),
      status: container.querySelector('[data-vec-song-status]'),
      preview: container.querySelector('[data-vec-preview]'),
      artworkStatus: container.querySelector('[data-vec-artwork-status]'),
      summary: container.querySelector('[data-vec-summary]'),
      folderGrid: container.querySelector('[data-vec-folder-grid]'),
      folderToolbar: container.querySelector('[data-vec-folder-toolbar]'),
      playButton: container.querySelector('[data-vec-preview-play]'),
      pauseButton: container.querySelector('[data-vec-preview-pause]'),
      restartButton: container.querySelector('[data-vec-preview-restart]'),
      nextButton: container.querySelector('[data-vec-preview-next]'),
      audioMessage: container.querySelector('[data-vec-audio-message]'),
      scrubber: container.querySelector('[data-vec-scrubber]'),
      currentTime: container.querySelector('[data-vec-current-time]'),
      duration: container.querySelector('[data-vec-duration]'),
      mediaModal: container.querySelector('[data-vec-media-modal]'),
      songAssets: container.querySelector('[data-vec-song-assets]'),
      borrowAssets: container.querySelector('[data-vec-borrow-assets]'),
      orderMode: container.querySelector('[data-vec-order-mode]'),
      maxSameFolder: container.querySelector('[data-vec-max-same-folder]'),
      maxFolderAssets: container.querySelector('[data-vec-max-folder-assets]'),
      avoidRepeats: container.querySelector('[data-vec-avoid-repeats]'),
      artworkOnlyToggle: container.querySelector('[data-vec-artwork-only-toggle]'),
      artworkOnlyNote: container.querySelector('[data-vec-artwork-only-note]'),
      saveRecipe: container.querySelector('[data-vec-save-recipe]'),
      resetRecipe: container.querySelector('[data-vec-reset-recipe]'),
      recipeStatus: container.querySelector('[data-vec-recipe-status]'),
    };

    // Song-specific VEC recipe draft state stays in this dev-only controller; /radio/dev/ does not consume it yet.
    const previewAudio = new Audio();
    previewAudio.preload = 'metadata';

    function stopPreviewTimer() {
      if (previewState.timerId) window.clearTimeout(previewState.timerId);
      previewState.timerId = null;
    }

    function schedulePreviewTick() {
      stopPreviewTimer();
      if (!previewState.isPlaying || !previewState.sequence.length || previewState.artworkOverride) return;
      const visual = previewState.sequence[previewState.index] || {};
      const durationMs = Math.max(1, Number(visual.durationSeconds) || 4) * 1000;
      previewState.timerId = window.setTimeout(() => {
        nextPreviewVisual({ keepPlaying: true });
      }, durationMs);
    }

    function getVisualIndexForTime(seconds) {
      const sequence = previewState.sequence || [];
      if (!sequence.length || !Number.isFinite(seconds) || seconds <= 0) return 0;
      const cycleSeconds = sequence.reduce((total, visual) => total + Math.max(1, Number(visual.durationSeconds) || 4), 0);
      let position = cycleSeconds > 0 ? seconds % cycleSeconds : 0;
      for (let index = 0; index < sequence.length; index += 1) {
        position -= Math.max(1, Number(sequence[index].durationSeconds) || 4);
        if (position < 0) return index;
      }
      return 0;
    }

    function syncPreviewArtworkOverride() {
      const artworkUrl = getArtworkUrl(state.songContext);
      const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
      const currentTime = Number.isFinite(previewAudio.currentTime) ? previewAudio.currentTime : 0;
      const rules = state.artworkRules || DEFAULT_ARTWORK_RULES;
      const secondsRemaining = duration > 0 ? Math.max(0, duration - currentTime) : Infinity;
      const forceEndArtwork = Boolean(rules.endWithArtwork && artworkUrl && duration > 0 && secondsRemaining <= (Number(rules.endDurationSeconds) || 4));
      if (forceEndArtwork) {
        previewState.artworkOverride = { type: 'artwork', label: 'Ending artwork', url: artworkUrl, alt: `${state.songContext?.display_title || state.songContext?.song_name || 'Song'} official artwork`, durationSeconds: Number(rules.endDurationSeconds) || 4, overrideType: 'end' };
        previewState.endArtworkActive = true;
        stopPreviewTimer();
        return;
      }
      if (previewState.artworkOverride?.overrideType === 'end') previewState.artworkOverride = null;
      previewState.endArtworkActive = false;
      if (!rules.rePresentArtwork || !artworkUrl || duration <= 0 || secondsRemaining <= (Number(rules.endDurationSeconds) || 4)) return;
      const repeatEvery = Number(rules.repeatEverySeconds) || 60;
      const repeatSlot = Math.floor(currentTime / repeatEvery);
      if (repeatSlot > 0 && repeatSlot !== previewState.lastRepeatSlot) {
        previewState.lastRepeatSlot = repeatSlot;
        previewState.artworkOverride = { type: 'artwork', label: 'Repeated artwork', url: artworkUrl, alt: `${state.songContext?.display_title || state.songContext?.song_name || 'Song'} official artwork`, durationSeconds: Number(rules.startDurationSeconds) || 4, overrideType: 'repeat', slot: repeatSlot };
        stopPreviewTimer();
        window.setTimeout(() => {
          if (previewState.artworkOverride?.overrideType === 'repeat' && previewState.artworkOverride.slot === repeatSlot) {
            previewState.artworkOverride = null;
            syncVisualToAudioTime();
            updatePreviewOnly();
            schedulePreviewTick();
          }
        }, Math.max(1, Number(rules.startDurationSeconds) || 4) * 1000);
      }
    }

    function getEffectivePreviewVisual() {
      return previewState.artworkOverride || previewState.sequence[previewState.index] || null;
    }

    function syncVisualToAudioTime() {
      if (!getAudioUrl(state.songContext)) return;
      syncPreviewArtworkOverride();
      if (!previewState.artworkOverride) previewState.index = getVisualIndexForTime(previewAudio.currentTime || 0);
    }

    function updateScrubber() {
      const hasAudio = Boolean(getAudioUrl(state.songContext));
      const duration = Number.isFinite(previewAudio.duration) ? previewAudio.duration : 0;
      const currentTime = Number.isFinite(previewAudio.currentTime) ? previewAudio.currentTime : 0;
      if (elements.currentTime) elements.currentTime.textContent = formatPreviewTime(currentTime);
      if (elements.duration) elements.duration.textContent = duration ? formatPreviewTime(duration) : '--:--';
      if (elements.scrubber) {
        elements.scrubber.disabled = !hasAudio || !duration;
        elements.scrubber.max = duration ? String(duration) : '0';
        elements.scrubber.value = String(Math.min(currentTime, duration || 0));
      }
      if (elements.audioMessage) {
        elements.audioMessage.textContent = hasAudio
          ? 'Local preview audio loaded. Playback starts only when you click Play Preview.'
          : 'No audio URL available for this song. Visual preview only.';
      }
    }

    function loadPreviewAudio() {
      const audioUrl = getAudioUrl(state.songContext);
      previewAudio.pause();
      previewAudio.removeAttribute('src');
      previewAudio.load();
      if (audioUrl) {
        previewAudio.src = audioUrl;
        previewAudio.currentTime = 0;
        previewAudio.load();
      }
      updateScrubber();
    }

    function findAssetByModalKey(key) {
      const modalKey = String(key || '');
      if (modalKey.startsWith('song:')) {
        const assetId = modalKey.slice(5);
        const asset = state.songAssets.find((item) => String(item.id) === assetId);
        return { folder: null, asset, sourceLabel: 'Song-only asset' };
      }
      if (modalKey.startsWith('borrow:')) {
        const rest = modalKey.slice(7);
        const [sourceSongKey, ...assetParts] = rest.split(':');
        const assetId = assetParts.join(':');
        const asset = getBorrowedAssetState(state, sourceSongKey).assets.find((item) => String(item.id) === assetId);
        const sourceSong = state.songs.find((song) => getSongKey(song) === sourceSongKey);
        return { folder: null, asset, sourceLabel: `Borrowed from ${sourceSong ? getSongTitle(sourceSong) : sourceSongKey}` };
      }
      const [folderId, ...assetParts] = modalKey.split(':');
      const assetId = assetParts.join(':');
      const folder = state.visualFolders.find((item) => item.id === folderId);
      const asset = getFolderAssetState(state, folderId).assets.find((item) => String(item.id) === assetId);
      return { folder, asset, sourceLabel: folder?.folder_name || 'Folder visual' };
    }


    function isModalAssetIncluded(modalKey) {
      const key = String(modalKey || '');
      const { folder, asset } = findAssetByModalKey(key);
      if (!asset) return false;
      if (key.startsWith('song:')) return isSongAssetIncluded(state, asset);
      if (key.startsWith('borrow:')) {
        const rest = key.slice(7);
        const [sourceSongKey] = rest.split(':');
        return isBorrowedAssetIncluded(state, sourceSongKey, asset);
      }
      return folder ? isAssetIncluded(state, folder.id, asset) : false;
    }

    function toggleModalAssetInclusion() {
      const key = String(state.previewModalAsset || '');
      const { folder, asset } = findAssetByModalKey(key);
      if (!asset) return;
      if (key.startsWith('song:')) {
        const inclusion = getSongAssetInclusionMap(state);
        inclusion.set(asset.id, inclusion.get(asset.id) === false);
      } else if (key.startsWith('borrow:')) {
        const rest = key.slice(7);
        const [sourceSongKey] = rest.split(':');
        const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
        inclusion.set(asset.id, inclusion.get(asset.id) === false);
      } else if (folder && state.selectedFolderIds.has(String(folder.id))) {
        const inclusion = getAssetInclusionMap(state, String(folder.id));
        inclusion.set(asset.id, inclusion.get(asset.id) === false);
      } else {
        return;
      }
      markDirty();
      renderDynamic();
    }

    function renderMediaModal() {
      if (!elements.mediaModal) return;
      if (!state.previewModalAsset) {
        elements.mediaModal.classList.add('hidden');
        elements.mediaModal.innerHTML = '';
        return;
      }
      const { asset, sourceLabel } = findAssetByModalKey(state.previewModalAsset);
      if (!asset) { state.previewModalAsset = null; renderMediaModal(); return; }
      const type = normalizeAssetType(asset);
      const title = asset.caption || asset.file_name || 'Visual asset preview';
      const url = clean(asset.public_url);
      const notes = clean(asset.notes);
      const included = isModalAssetIncluded(state.previewModalAsset);
      const statusLabel = included ? 'Included in recipe: ON' : 'Included in recipe: OFF';
      const toggleLabel = included ? 'Exclude this visual from this VEC recipe' : 'Include this visual in this VEC recipe';
      const media = type === 'clip'
        ? `<video src="${escapeHtml(url)}" controls autoplay playsinline></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`;
      elements.mediaModal.classList.remove('hidden');
      elements.mediaModal.innerHTML = `<div class="vec-media-dialog">
        <div class="vec-media-dialog-head"><div><p class="eyebrow">${escapeHtml(sourceLabel || 'Visual asset')}</p><h2 id="vecMediaModalTitle">${escapeHtml(title)}</h2></div><button type="button" class="vec-media-close" data-vec-close-modal aria-label="Close preview">×</button></div>
        <button type="button" class="vec-modal-status-toggle ${included ? 'is-on' : 'is-off'}" data-vec-modal-asset-toggle aria-pressed="${included}" aria-label="${escapeHtml(toggleLabel)}"><span class="vec-modal-status-dot" aria-hidden="true"></span>${escapeHtml(statusLabel)}</button>
        <div class="vec-media-stage">${media}</div>
        ${type === 'clip' && notes ? `<p class="vec-media-notes">${escapeHtml(notes)}</p>` : ''}
        <p class="vec-media-caption">${escapeHtml(asset.alt_text || asset.file_name || '')}</p>
      </div>`;
    }

    function getVisualKey(visual) {
      if (!visual) return 'empty';
      return [visual.type || 'visual', visual.url || '', visual.label || '', visual.alt || ''].join('::');
    }

    function getNextVisual() {
      if (!previewState.sequence.length) return null;
      const nextIndex = previewState.sequence.length > 1 ? (previewState.index + 1) % previewState.sequence.length : previewState.index;
      return previewState.sequence[nextIndex] || null;
    }

    function preloadPreviewVisual(visual) {
      if (!visual?.url) return;
      const key = getVisualKey(visual);
      if (previewState.preloadCache.has(key)) return;
      if (previewState.preloadCache.size > 8) previewState.preloadCache.delete(previewState.preloadCache.keys().next().value);
      if (visual.type === 'clip') {
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = visual.url;
        video.load();
        previewState.preloadCache.set(key, video);
        return;
      }
      const image = new Image();
      image.src = visual.url;
      previewState.preloadCache.set(key, image);
    }

    function ensurePreviewShell() {
      if (elements.preview.querySelector('[data-vec-preview-stage]')) return;
      elements.preview.innerHTML = `
        <span class="vec-preview-badge">Preview Mode</span>
        <span class="vec-visual-type-badge hidden" data-vec-visual-type></span>
        <div class="vec-preview-song is-empty is-paused" data-vec-preview-card>
          <div class="vec-preview-stage" data-vec-preview-stage aria-live="polite"></div>
          <div class="vec-preview-meta">
            <strong data-vec-preview-title>VEC Preview</strong>
            <span data-vec-preview-artist>Artist unavailable</span>
            <em class="hidden" data-vec-preview-genre></em>
            <small data-vec-preview-status>Select a song to preview its visual experience.</small>
          </div>
        </div>`;
    }

    function createPreviewLayer(visual, title) {
      const layer = document.createElement('div');
      layer.className = `vec-preview-layer is-${escapeHtml(visual?.type || 'empty')}`;
      layer.dataset.vecVisualKey = getVisualKey(visual);
      if (!visual) {
        const message = document.createElement('p');
        message.textContent = 'Select a song to preview its visual experience.';
        layer.appendChild(message);
        return layer;
      }
      if (!visual.url) {
        const fallback = document.createElement('div');
        fallback.className = 'vec-artwork-fallback';
        fallback.setAttribute('aria-label', 'No artwork available');
        fallback.textContent = 'No artwork';
        layer.appendChild(fallback);
        return layer;
      }
      if (visual.type === 'clip') {
        const video = document.createElement('video');
        video.src = visual.url;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.controls = false;
        video.dataset.vecPreviewVideo = '';
        video.onended = () => { if (!previewState.artworkOverride) nextPreviewVisual({ keepPlaying: previewState.isPlaying }); };
        layer.appendChild(video);
        return layer;
      }
      const image = document.createElement('img');
      image.src = visual.url;
      image.alt = visual.alt || visual.label || title || 'Preview visual';
      layer.appendChild(image);
      return layer;
    }

    function waitForPreviewLayer(layer) {
      const media = layer.querySelector('img, video');
      if (!media) return Promise.resolve();
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        window.setTimeout(finish, 900);
        if (media.tagName === 'IMG') {
          if (media.complete) finish();
          else { media.addEventListener('load', finish, { once: true }); media.addEventListener('error', finish, { once: true }); }
          return;
        }
        if (media.readyState >= 2) finish();
        else { media.addEventListener('canplay', finish, { once: true }); media.addEventListener('loadeddata', finish, { once: true }); media.addEventListener('error', finish, { once: true }); media.load(); }
      });
    }

    function syncPreviewVideoPlayback() {
      elements.preview?.querySelectorAll('[data-vec-preview-video]').forEach((video) => {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.controls = false;
        const active = video.closest('.vec-preview-layer')?.classList.contains('is-active');
        if (previewState.isPlaying && active) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
        } else {
          video.pause();
          if (!active) video.currentTime = 0;
        }
      });
    }

    async function updatePreviewMedia() {
      ensurePreviewShell();
      const title = state.songContext ? (state.songContext.display_title || state.songContext.song_name || 'Untitled song') : 'VEC Preview';
      const visual = state.songContext ? getEffectivePreviewVisual() : null;
      const nextKey = getVisualKey(visual);
      const stage = elements.preview.querySelector('[data-vec-preview-stage]');
      const activeLayer = stage.querySelector('.vec-preview-layer.is-active');
      if (activeLayer?.dataset.vecVisualKey === nextKey) { syncPreviewVideoPlayback(); return; }
      const transitionId = (previewState.transitionId || 0) + 1;
      previewState.transitionId = transitionId;
      const nextLayer = createPreviewLayer(visual, title);
      nextLayer.classList.add('is-next');
      stage.appendChild(nextLayer);
      await waitForPreviewLayer(nextLayer);
      if (previewState.transitionId !== transitionId) { nextLayer.remove(); return; }
      window.requestAnimationFrame(() => {
        nextLayer.classList.remove('is-next');
        nextLayer.classList.add('is-active');
        if (activeLayer) activeLayer.classList.add('is-fading-out');
        syncPreviewVideoPlayback();
        window.setTimeout(() => {
          stage.querySelectorAll('.vec-preview-layer.is-fading-out').forEach((layer) => {
            layer.querySelectorAll('video').forEach((video) => { video.pause(); video.currentTime = 0; });
            layer.remove();
          });
          preloadPreviewVisual(getNextVisual());
        }, 360);
      });
    }

    function updatePreviewChrome() {
      ensurePreviewShell();
      const hasSong = Boolean(state.songContext);
      const title = hasSong ? (state.songContext.display_title || state.songContext.song_name || 'Untitled song') : 'VEC Preview';
      const artist = hasSong ? (state.songContext.artist || 'Artist unavailable') : 'Artist unavailable';
      const genre = hasSong ? clean(state.songContext.genre) : '';
      const visual = hasSong ? getEffectivePreviewVisual() : null;
      const visualTypeLabel = visual ? (visual.type === 'clip' ? 'Video clip' : (visual.type === 'image' ? 'Image' : 'Artwork')) : '';
      const card = elements.preview.querySelector('[data-vec-preview-card]');
      card.className = `vec-preview-song ${previewState.isPlaying ? 'is-playing' : 'is-paused'} is-${escapeHtml(visual?.type || 'empty')}`;
      elements.preview.querySelector('[data-vec-preview-title]').textContent = title;
      elements.preview.querySelector('[data-vec-preview-artist]').textContent = artist;
      const genreEl = elements.preview.querySelector('[data-vec-preview-genre]');
      genreEl.textContent = genre;
      genreEl.classList.toggle('hidden', !genre);
      const typeBadge = elements.preview.querySelector('[data-vec-visual-type]');
      typeBadge.textContent = visualTypeLabel;
      typeBadge.classList.toggle('hidden', !visualTypeLabel);
      elements.preview.querySelector('[data-vec-preview-status]').textContent = !hasSong
        ? 'Select a song to preview its visual experience.'
        : (visual ? `${visual.label || 'Preview visual'} · ${previewState.isPlaying ? 'Playing local preview' : 'Paused local preview'}` : 'No active visuals selected');
    }

    function updatePreviewControls() {
      const hasSong = Boolean(state.songContext);
      [elements.playButton, elements.pauseButton, elements.restartButton, elements.nextButton].forEach((button) => { if (button) button.disabled = !hasSong; });
      if (elements.playButton) elements.playButton.disabled = !hasSong || previewState.isPlaying;
      if (elements.pauseButton) elements.pauseButton.disabled = !hasSong || !previewState.isPlaying;
      container.dataset.vecPreviewState = hasSong ? (previewState.isPlaying ? 'playing' : 'paused') : 'empty';
    }

    function updatePreviewOnly() {
      updatePreviewChrome();
      updatePreviewMedia();
      updatePreviewControls();
      syncPreviewVideoPlayback();
      preloadPreviewVisual(getNextVisual());
    }


    function syncArtworkControls() {
      container.querySelectorAll('[data-vec-artwork-toggle]').forEach((button) => {
        const name = button.dataset.vecArtworkToggle;
        const value = name === 'start_with_artwork' ? state.artworkRules.startWithArtwork
          : (name === 'end_with_artwork' ? state.artworkRules.endWithArtwork : state.artworkRules.rePresentArtwork);
        button.classList.toggle('is-on', Boolean(value));
        button.classList.toggle('is-off', !value);
        button.setAttribute('aria-pressed', String(Boolean(value)));
        button.textContent = onOffLabel(Boolean(value));
      });
      container.querySelectorAll('[data-vec-artwork-select]').forEach((select) => {
        const name = select.dataset.vecArtworkSelect;
        if (name === 'start_artwork_duration_seconds') select.value = String(state.artworkRules.startDurationSeconds);
        if (name === 'end_artwork_duration_seconds') select.value = String(state.artworkRules.endDurationSeconds);
        if (name === 'repeat_artwork_every_seconds') select.value = String(state.artworkRules.repeatEverySeconds);
      });
    }

    function syncVisualModeControls() {
      const artworkOnly = state.visualMode === VISUAL_MODE_ARTWORK_ONLY;
      if (elements.artworkOnlyToggle) {
        elements.artworkOnlyToggle.classList.toggle('is-on', artworkOnly);
        elements.artworkOnlyToggle.classList.toggle('is-off', !artworkOnly);
        elements.artworkOnlyToggle.setAttribute('aria-pressed', String(artworkOnly));
        elements.artworkOnlyToggle.textContent = onOffLabel(artworkOnly);
      }
      if (elements.artworkOnlyNote) elements.artworkOnlyNote.classList.toggle('hidden', !artworkOnly);
      container.classList.toggle('is-artwork-only-mode', artworkOnly);
    }

    function syncShuffleControls() {
      if (elements.orderMode) elements.orderMode.value = state.shuffleRules.orderMode;
      if (elements.maxSameFolder) elements.maxSameFolder.value = state.shuffleRules.maxSameFolderInRow;
      if (elements.maxFolderAssets) elements.maxFolderAssets.value = state.shuffleRules.maxAssetsPerFolder;
      if (elements.avoidRepeats) {
        elements.avoidRepeats.classList.toggle('is-on', state.shuffleRules.avoidRepeats);
        elements.avoidRepeats.classList.toggle('is-off', !state.shuffleRules.avoidRepeats);
        elements.avoidRepeats.setAttribute('aria-pressed', String(state.shuffleRules.avoidRepeats));
        elements.avoidRepeats.textContent = onOffLabel(state.shuffleRules.avoidRepeats);
      }
    }


    function markDirty() {
      if (!state.songContext || state.recipeLoading) return;
      state.dirty = true;
      state.recipeStatus = 'Unsaved changes';
    }


    function buildBorrowedSongAssetsRecipe() {
      const sourceKeys = getBorrowedSourceSongKeys(state);
      return sourceKeys.map((sourceSongKey) => {
        const recipe = { source_song_key: sourceSongKey, enabled: isBorrowedSourceEnabled(state, sourceSongKey), active_image_ids: [], active_clip_ids: [], excluded_image_ids: [], excluded_clip_ids: [] };
        const assets = getBorrowedAssetState(state, sourceSongKey).assets || [];
        const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
        if (assets.length) {
          assets.forEach((asset) => {
            const id = asset.id || clean(asset.public_url);
            if (!id) return;
            const included = isBorrowedAssetIncluded(state, sourceSongKey, asset);
            const target = normalizeAssetType(asset) === 'clip' ? (included ? recipe.active_clip_ids : recipe.excluded_clip_ids) : (included ? recipe.active_image_ids : recipe.excluded_image_ids);
            target.push(id);
          });
        } else {
          inclusion.forEach((included, id) => {
            (included ? recipe.active_image_ids : recipe.excluded_image_ids).push(id);
          });
        }
        return recipe;
      }).filter((recipe) => recipe.source_song_key && recipe.source_song_key !== state.songKey);
    }

    function buildCurrentRecipe() {
      const songAssetRecipe = { active_image_ids: [], active_clip_ids: [], excluded_image_ids: [], excluded_clip_ids: [] };
      (state.songAssets || []).forEach((asset) => {
        const id = asset.id || clean(asset.public_url);
        if (!id) return;
        const included = isSongAssetIncluded(state, asset);
        const target = normalizeAssetType(asset) === 'clip' ? (included ? songAssetRecipe.active_clip_ids : songAssetRecipe.excluded_clip_ids) : (included ? songAssetRecipe.active_image_ids : songAssetRecipe.excluded_image_ids);
        target.push(id);
      });
      const selectedFolders = getSelectedFolders(state);
      const folders = selectedFolders.map((folder) => {
        const assets = getFolderAssetState(state, folder.id).assets || [];
        const active_image_ids = [];
        const active_clip_ids = [];
        const excluded_image_ids = [];
        const excluded_clip_ids = [];
        assets.forEach((asset) => {
          const id = asset.id || clean(asset.public_url);
          if (!id) return;
          const included = isAssetIncluded(state, folder.id, asset);
          const target = normalizeAssetType(asset) === 'clip'
            ? (included ? active_clip_ids : excluded_clip_ids)
            : (included ? active_image_ids : excluded_image_ids);
          target.push(id);
        });
        return { folder_id: folder.id, enabled: true, active_image_ids, active_clip_ids, excluded_image_ids, excluded_clip_ids };
      });
      return {
        version: 1,
        song_key: state.songKey,
        visual_mode: state.visualMode === VISUAL_MODE_ARTWORK_ONLY ? VISUAL_MODE_ARTWORK_ONLY : VISUAL_MODE_CUSTOM,
        artwork: {
          start_with_artwork: Boolean(state.artworkRules.startWithArtwork),
          start_duration_seconds: Number(state.artworkRules.startDurationSeconds) || 4,
          end_with_artwork: Boolean(state.artworkRules.endWithArtwork),
          end_duration_seconds: Number(state.artworkRules.endDurationSeconds) || 4,
          re_present_artwork: Boolean(state.artworkRules.rePresentArtwork),
          repeat_every_seconds: Number(state.artworkRules.repeatEverySeconds) || 60,
        },
        folders,
        song_assets: songAssetRecipe,
        borrowed_song_assets: buildBorrowedSongAssetsRecipe(),
        shuffle: {
          order_mode: state.shuffleRules.orderMode,
          max_same_folder_in_row: state.shuffleRules.maxSameFolderInRow,
          max_assets_per_folder_per_play: state.shuffleRules.maxAssetsPerFolder,
          avoid_repeating_same_asset: Boolean(state.shuffleRules.avoidRepeats),
        },
        updated_at: new Date().toISOString(),
      };
    }

    function resetLocalRecipeState() {
      state.artworkRules = { ...DEFAULT_ARTWORK_RULES };
      state.shuffleRules = { ...DEFAULT_SHUFFLE_RULES };
      state.visualMode = VISUAL_MODE_CUSTOM;
      state.selectedFolderIds = new Set();
      state.expandedFolderIds = new Set();
      state.assetInclusionByFolder = new Map();
      state.songAssetInclusion = new Map();
      state.borrowedSourceSongKey = '';
      state.borrowedSourceSongKeys = new Set();
      state.borrowedSourceSongSelect = '';
      state.borrowedSourceSongMessage = '';
      state.borrowedSourceSongMessageIsError = false;
      state.borrowedAssetsBySource = new Map();
      state.borrowedAssetInclusionBySource = new Map();
      state.borrowedSourceEnabledBySource = new Map();
      previewState.index = 0;
      previewState.artworkOverride = null;
      previewState.endArtworkActive = false;
      previewState.lastRepeatSlot = 0;
    }

    function applyRecipe(recipe) {
      state.recipeLoading = true;
      resetLocalRecipeState();
      if (recipe && typeof recipe === 'object') {
        state.visualMode = recipe.visual_mode === VISUAL_MODE_ARTWORK_ONLY ? VISUAL_MODE_ARTWORK_ONLY : VISUAL_MODE_CUSTOM;
        const artwork = recipe.artwork || {};
        state.artworkRules = {
          startWithArtwork: artwork.start_with_artwork !== false,
          startDurationSeconds: Number(artwork.start_duration_seconds) || DEFAULT_ARTWORK_RULES.startDurationSeconds,
          endWithArtwork: artwork.end_with_artwork !== false,
          endDurationSeconds: Number(artwork.end_duration_seconds) || DEFAULT_ARTWORK_RULES.endDurationSeconds,
          rePresentArtwork: artwork.re_present_artwork !== false,
          repeatEverySeconds: Number(artwork.repeat_every_seconds) || DEFAULT_ARTWORK_RULES.repeatEverySeconds,
        };
        const shuffle = recipe.shuffle || {};
        state.shuffleRules = {
          orderMode: shuffle.order_mode || DEFAULT_SHUFFLE_RULES.orderMode,
          maxSameFolderInRow: String(shuffle.max_same_folder_in_row || DEFAULT_SHUFFLE_RULES.maxSameFolderInRow),
          maxAssetsPerFolder: String(shuffle.max_assets_per_folder_per_play || DEFAULT_SHUFFLE_RULES.maxAssetsPerFolder),
          avoidRepeats: shuffle.avoid_repeating_same_asset !== false,
        };
        const songAssetsRecipe = recipe.song_assets || {};
        [...(songAssetsRecipe.active_image_ids || []), ...(songAssetsRecipe.active_clip_ids || [])].forEach((id) => getSongAssetInclusionMap(state).set(String(id), true));
        [...(songAssetsRecipe.excluded_image_ids || []), ...(songAssetsRecipe.excluded_clip_ids || [])].forEach((id) => getSongAssetInclusionMap(state).set(String(id), false));
        initializeSongAssetInclusion(state, state.songAssets || []);
        const borrowedRecipes = Array.isArray(recipe.borrowed_song_assets) ? recipe.borrowed_song_assets : [];
        borrowedRecipes.forEach((borrowedRecipe, index) => {
          const sourceSongKey = clean(borrowedRecipe.source_song_key);
          if (!sourceSongKey || sourceSongKey === state.songKey) return;
          state.borrowedSourceSongKeys.add(sourceSongKey);
          setBorrowedSourceEnabled(state, sourceSongKey, borrowedRecipe.enabled !== false);
          if (!state.borrowedSourceSongKey || index === 0) state.borrowedSourceSongKey = sourceSongKey;
          const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
          [...(borrowedRecipe.active_image_ids || []), ...(borrowedRecipe.active_clip_ids || [])].forEach((id) => inclusion.set(String(id), true));
          [...(borrowedRecipe.excluded_image_ids || []), ...(borrowedRecipe.excluded_clip_ids || [])].forEach((id) => inclusion.set(String(id), false));
          loadBorrowedAssetsForSource(sourceSongKey, { markAsDirty: false });
        });
        (Array.isArray(recipe.folders) ? recipe.folders : []).forEach((folderRecipe) => {
          const folderId = clean(folderRecipe.folder_id);
          if (!folderId || folderRecipe.enabled === false) return;
          state.selectedFolderIds.add(folderId);
          const inclusion = getAssetInclusionMap(state, folderId);
          [...(folderRecipe.active_image_ids || []), ...(folderRecipe.active_clip_ids || [])].forEach((id) => inclusion.set(String(id), true));
          [...(folderRecipe.excluded_image_ids || []), ...(folderRecipe.excluded_clip_ids || [])].forEach((id) => inclusion.set(String(id), false));
          if (!state.folderAssets.has(folderId)) {
            state.folderAssets.set(folderId, { loading: true, error: '', assets: [] });
            fetchFolderAssets(folderId).then((assets) => {
              state.folderAssets.set(folderId, { loading: false, error: '', assets });
              initializeFolderAssetInclusion(state, folderId, assets);
            }).catch((error) => {
              state.folderAssets.set(folderId, { loading: false, error: error.message || 'Could not load folder visuals.', assets: [] });
            }).finally(renderDynamic);
          }
        });
      }
      state.recipeLoading = false;
      state.dirty = false;
      state.recipeStatus = recipe ? 'Saved' : 'No saved recipe; using defaults.';
    }

    async function loadRecipeForCurrentSong() {
      if (!state.songKey) { resetLocalRecipeState(); renderDynamic(); return; }
      state.recipeLoading = true;
      state.recipeStatus = 'Loading saved recipe...';
      renderDynamic();
      try {
        const data = await fetchRecipe(state.songKey);
        state.savedRecipe = data?.recipe || null;
        state.savedRecipeUpdatedAt = data?.updated_at || data?.recipe?.updated_at || '';
        applyRecipe(state.savedRecipe);
      } catch (error) {
        state.recipeStatus = error.message || 'Could not load recipe.';
      } finally {
        state.recipeLoading = false;
        renderDynamic();
      }
    }

    async function saveCurrentRecipe() {
      if (!state.songKey) return false;
      state.recipeStatus = 'Saving recipe...';
      renderDynamic();
      try {
        const data = await putRecipe(state.songKey, buildCurrentRecipe());
        state.savedRecipe = data?.recipe || null;
        state.savedRecipeUpdatedAt = data?.updated_at || data?.recipe?.updated_at || '';
        state.dirty = false;
        state.recipeStatus = 'Saved';
        return true;
      } catch (error) {
        state.recipeStatus = error.message || 'Could not save recipe.';
        return false;
      } finally { renderDynamic(); }
    }

    async function persistRecipeChange(previousRecipe, actionLabel = 'status update') {
      if (state.recipeSaveInFlight) return;
      state.recipeSaveInFlight = true;
      state.recipeStatus = `Saving ${actionLabel}...`;
      renderDynamic();
      try {
        const data = await putRecipe(state.songKey, buildCurrentRecipe());
        const confirmed = await fetchRecipe(state.songKey);
        state.savedRecipe = confirmed?.recipe || data?.recipe || null;
        state.savedRecipeUpdatedAt = confirmed?.updated_at || data?.updated_at || state.savedRecipe?.updated_at || '';
        state.dirty = false;
        state.recipeStatus = 'Saved';
      } catch (error) {
        applyRecipe(previousRecipe || state.savedRecipe || null);
        state.recipeStatus = `${error.message || 'Could not save visual status.'} Previous status restored.`;
      } finally {
        state.recipeSaveInFlight = false;
        renderDynamic();
      }
    }

    function renderDynamic() {
      previewState.sequence = buildPreviewSequence(state);
      if (previewState.index >= previewState.sequence.length) previewState.index = 0;
      syncPreviewArtworkOverride();
      updatePreviewOnly();
      elements.artworkStatus.innerHTML = renderArtworkStatus(state.songContext);
      if (elements.songAssets) elements.songAssets.innerHTML = renderSongAssets(state);
      if (elements.borrowAssets) elements.borrowAssets.innerHTML = renderBorrowedSongAssets(state);
      if (elements.folderToolbar) elements.folderToolbar.innerHTML = state.songContext ? renderFolderToolbar(state) : '';
      elements.folderGrid.innerHTML = renderFolderCards(state);
      const selectedFolders = getSelectedFolders(state);
      syncArtworkControls();
      syncVisualModeControls();
      syncShuffleControls();
      elements.summary.innerHTML = renderSummary(state.songContext, state.artworkRules, state.shuffleRules, selectedFolders, getSelectedActiveAssetCounts(state, selectedFolders), previewState.sequence, previewState.sequence[previewState.index], { dirty: state.dirty, status: state.recipeStatus, updatedAt: state.savedRecipeUpdatedAt }, getActiveBorrowedAssetCounts(state), state.visualMode);
      if (elements.saveRecipe) elements.saveRecipe.disabled = !state.songContext || state.recipeLoading;
      if (elements.resetRecipe) elements.resetRecipe.disabled = !state.songContext || state.recipeLoading;
      if (elements.recipeStatus) elements.recipeStatus.textContent = state.songContext ? (state.dirty ? 'Unsaved changes' : (state.recipeStatus || 'Saved')) : 'No song selected.';
      renderMediaModal();
    }

    function startPreview() {
      if (!state.songContext) return;
      previewState.isPlaying = true;
      syncVisualToAudioTime();
      const playPromise = getAudioUrl(state.songContext) ? previewAudio.play() : null;
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => { previewState.isPlaying = false; updatePreviewOnly(); updateScrubber(); });
      }
      updatePreviewOnly();
      schedulePreviewTick();
    }

    function pausePreview() {
      previewState.isPlaying = false;
      previewAudio.pause();
      stopPreviewTimer();
      syncVisualToAudioTime();
      updateScrubber();
      updatePreviewOnly();
    }

    function restartPreview() {
      previewState.index = 0;
      previewState.artworkOverride = null;
      previewState.endArtworkActive = false;
      previewState.lastRepeatSlot = 0;
      if (getAudioUrl(state.songContext)) previewAudio.currentTime = 0;
      updateScrubber();
      updatePreviewOnly();
      schedulePreviewTick();
    }

    function nextPreviewVisual({ keepPlaying = previewState.isPlaying } = {}) {
      if (!state.songContext || !previewState.sequence.length) return;
      if (previewState.artworkOverride) return;
      previewState.index = previewState.sequence.length > 1 ? (previewState.index + 1) % previewState.sequence.length : 0;
      previewState.isPlaying = keepPlaying;
      updatePreviewOnly();
      schedulePreviewTick();
    }

    function setSongContext(songOrContext) {
      pausePreview();
      state.songContext = createSongContext(songOrContext);
      state.songKey = state.songContext?.song_key || '';
      state.visualMode = VISUAL_MODE_CUSTOM;
      state.selectedFolderIds = new Set();
      state.expandedFolderIds = new Set();
      state.previewModalAsset = null;
      state.assetInclusionByFolder = new Map();
      state.songAssetInclusion = new Map();
      state.borrowedSourceSongKey = '';
      state.borrowedSourceSongKeys = new Set();
      state.borrowedSourceSongSelect = '';
      state.borrowedSourceSongMessage = '';
      state.borrowedSourceSongMessageIsError = false;
      state.borrowedAssetsBySource = new Map();
      state.borrowedAssetInclusionBySource = new Map();
      state.borrowedSourceEnabledBySource = new Map();
      previewState.preloadCache = new Map();
      previewState.index = 0;
      loadPreviewAudio();
      if (elements.select && elements.select.value !== state.songKey) elements.select.value = state.songKey;
      state.dirty = false;
      state.recipeStatus = state.songContext ? 'Loading saved recipe...' : 'No song selected.';
      renderDynamic();
      return state.songContext;
    }




    async function loadBorrowedAssetsForSource(sourceSongKey, { markAsDirty = true } = {}) {
      if (!sourceSongKey || sourceSongKey === state.songKey) return;
      state.borrowedSourceSongKey = sourceSongKey;
      state.borrowedSourceSongKeys.add(sourceSongKey);
      if (!getBorrowedSourceEnabledMap(state).has(sourceSongKey)) setBorrowedSourceEnabled(state, sourceSongKey, true);
      state.borrowedAssetsBySource.set(sourceSongKey, { loading: true, error: '', assets: getBorrowedAssetState(state, sourceSongKey).assets || [] });
      renderDynamic();
      try {
        const assets = await fetchSongAssets(sourceSongKey);
        state.borrowedAssetsBySource.set(sourceSongKey, { loading: false, error: '', assets });
        initializeBorrowedAssetInclusion(state, sourceSongKey, assets);
        if (markAsDirty) markDirty();
      } catch (error) {
        state.borrowedAssetsBySource.set(sourceSongKey, { loading: false, error: error.message || 'Could not load borrowed source song assets.', assets: [] });
      } finally {
        renderDynamic();
      }
    }

    function toggleBorrowedAsset(sourceSongKey, assetId) {
      const asset = getBorrowedAssetState(state, sourceSongKey).assets.find((item) => String(item.id) === String(assetId));
      if (!asset) return;
      const previousRecipe = buildCurrentRecipe();
      const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
      inclusion.set(asset.id, inclusion.get(asset.id) === false);
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, 'borrowed clip status');
    }

    function toggleBorrowedSourceEnabled(sourceSongKey) {
      if (!(state.borrowedSourceSongKeys || new Set()).has(sourceSongKey)) return;
      const previousRecipe = buildCurrentRecipe();
      setBorrowedSourceEnabled(state, sourceSongKey, !isBorrowedSourceEnabled(state, sourceSongKey));
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, 'borrowed source status');
    }

    function setBorrowedAssetInclusion(sourceSongKey, includeAssets) {
      const assets = getBorrowedAssetState(state, sourceSongKey).assets || [];
      if (!assets.length) return;
      const previousRecipe = buildCurrentRecipe();
      const inclusion = getBorrowedInclusionMap(state, sourceSongKey);
      assets.forEach((asset) => inclusion.set(asset.id, includeAssets));
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, includeAssets ? 'all on' : 'all off');
    }

    async function loadSongAssetsForCurrentSong() {
      if (!state.songKey) { state.songAssets = []; renderDynamic(); return; }
      state.songAssetsLoading = true;
      state.songAssetsError = '';
      renderDynamic();
      try {
        state.songAssets = await fetchSongAssets(state.songKey);
        initializeSongAssetInclusion(state, state.songAssets);
      } catch (error) {
        state.songAssets = [];
        state.songAssetsError = error.message || 'Could not load song-only assets.';
      } finally {
        state.songAssetsLoading = false;
        renderDynamic();
      }
    }

    function inferUploadType(file, requestedType = '') {
      const type = String(requestedType || '').toLowerCase();
      if (type === 'image' || type === 'clip') return type;
      return String(file?.type || '').startsWith('video/') ? 'clip' : 'image';
    }

    async function uploadSongAssetFile(file, requestedType = '') {
      if (!state.songContext || !file) return;
      const assetType = inferUploadType(file, requestedType);
      state.songAssetUploading = true;
      state.songAssetUploadMessage = `Uploading ${file.name}...`;
      state.songAssetsError = '';
      renderDynamic();
      try {
        const purpose = assetType === 'clip' ? 'song_visual_clip' : 'song_visual_image';
        const presign = await presignUpload({ filename: file.name, content_type: file.type || 'application/octet-stream', purpose, song_key: state.songKey, artist: state.songContext.artist || 'stashbox' });
        const uploadResponse = await fetch(presign.uploadUrl || presign.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type || presign.contentType || 'application/octet-stream' }, body: file });
        if (!uploadResponse.ok) {
          const statusText = uploadResponse.status ? `HTTP ${uploadResponse.status}` : 'unknown status';
          throw new Error(`S3 upload failed (${statusText}).`);
        }
        const saved = await createSongAsset({ song_key: state.songKey, asset_type: assetType, file_name: file.name, s3_key: presign.key, public_url: presign.publicUrl || presign.public_url, thumbnail_url: presign.publicUrl || presign.public_url, content_type: file.type || presign.contentType, size_bytes: file.size });
        const asset = normalizeAsset(saved.asset || saved);
        if (asset) {
          state.songAssets = [asset, ...state.songAssets.filter((item) => item.id !== asset.id)];
          getSongAssetInclusionMap(state).set(asset.id, true);
        } else await loadSongAssetsForCurrentSong();
        state.songAssetUploadMessage = `Uploaded ${file.name}.`;
        markDirty();
      } catch (error) {
        state.songAssetUploadMessage = '';
        state.songAssetsError = error.message || 'Upload failed.';
      } finally {
        state.songAssetUploading = false;
        renderDynamic();
      }
    }

    async function deleteSongAssetById(assetId) {
      if (!assetId || !window.confirm('Remove this song-only asset from this song? This only removes this one song-only asset record.')) return;
      state.songAssetUploadMessage = 'Deleting song-only asset...';
      renderDynamic();
      try {
        await deleteSongAsset(assetId);
        getSongAssetInclusionMap(state).delete(assetId);
        state.songAssetUploadMessage = 'Song-only asset removed.';
        await loadSongAssetsForCurrentSong();
        markDirty();
      } catch (error) {
        state.songAssetsError = error.message || 'Could not delete song-only asset.';
      } finally { renderDynamic(); }
    }

    function toggleAssetInclusion(toggle) {
      const [folderId, ...assetParts] = String(toggle.dataset.vecAssetToggle || '').split(':');
      const assetId = assetParts.join(':');
      const asset = getFolderAssetState(state, folderId).assets.find((item) => String(item.id) === assetId);
      if (!asset || !state.selectedFolderIds.has(folderId)) return;
      const previousRecipe = buildCurrentRecipe();
      const inclusion = getAssetInclusionMap(state, folderId);
      inclusion.set(asset.id, inclusion.get(asset.id) === false);
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, 'clip status');
    }

    function setFolderAssetInclusion(toggle) {
      const folderId = toggle.dataset.vecFolderAssetsToggle;
      const includeAssets = toggle.dataset.vecFolderAssetsToggleValue === 'on';
      const assets = getFolderAssetState(state, folderId).assets || [];
      if (!assets.length || !state.selectedFolderIds.has(folderId)) return;
      const previousRecipe = buildCurrentRecipe();
      const inclusion = getAssetInclusionMap(state, folderId);
      assets.forEach((asset) => inclusion.set(asset.id, includeAssets));
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, includeAssets ? 'all on' : 'all off');
    }

    function setSongAssetInclusion(includeAssets) {
      const assets = state.songAssets || [];
      if (!assets.length) return;
      const previousRecipe = buildCurrentRecipe();
      const inclusion = getSongAssetInclusionMap(state);
      assets.forEach((asset) => inclusion.set(asset.id, includeAssets));
      markDirty();
      renderDynamic();
      persistRecipeChange(previousRecipe, includeAssets ? 'all on' : 'all off');
    }




    elements.borrowAssets?.addEventListener('change', (event) => {
      const select = event.target.closest('[data-vec-borrow-source-song]');
      if (!select) return;
      state.borrowedSourceSongSelect = select.value;
      state.borrowedSourceSongMessage = '';
      state.borrowedSourceSongMessageIsError = false;
      renderDynamic();
    });

    elements.borrowAssets?.addEventListener('keydown', (event) => {
      const previewButton = event.target.closest('[data-vec-borrow-preview-asset]');
      if (previewButton && !event.target.closest('[data-vec-borrow-asset-toggle]') && (event.key === 'Enter' || event.key === ' ') && previewButton.getAttribute('aria-disabled') !== 'true') {
        event.preventDefault();
        state.previewModalAsset = `borrow:${previewButton.dataset.vecBorrowPreviewAsset}`;
        renderDynamic();
        return;
      }
      const toggle = event.target.closest('[data-vec-borrow-asset-toggle]');
      if (!toggle || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      const [sourceSongKey, ...assetParts] = String(toggle.dataset.vecBorrowAssetToggle || '').split(':');
      toggleBorrowedAsset(sourceSongKey, assetParts.join(':'));
    });

    elements.borrowAssets?.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-vec-add-borrowed-song]');
      if (addButton) {
        event.preventDefault();
        const sourceSongKey = state.borrowedSourceSongSelect || '';
        state.borrowedSourceSongMessageIsError = true;
        if (!sourceSongKey) state.borrowedSourceSongMessage = 'Choose Source Song';
        else if (sourceSongKey === state.songKey) state.borrowedSourceSongMessage = 'Current song assets are already managed under Song-Only Assets.';
        else if ((state.borrowedSourceSongKeys || new Set()).has(sourceSongKey)) state.borrowedSourceSongMessage = 'This source song is already added.';
        else {
          state.borrowedSourceSongMessage = '';
          state.borrowedSourceSongMessageIsError = false;
          loadBorrowedAssetsForSource(sourceSongKey);
          return;
        }
        renderDynamic();
        return;
      }
      const removeButton = event.target.closest('[data-vec-borrow-source-remove]');
      if (removeButton) {
        event.preventDefault();
        const sourceSongKey = removeButton.dataset.vecBorrowSourceRemove;
        if (!window.confirm('Remove this borrowed song from this recipe? Source song assets will not be deleted.')) return;
        state.borrowedSourceSongKeys.delete(sourceSongKey);
        state.borrowedAssetsBySource.delete(sourceSongKey);
        state.borrowedAssetInclusionBySource.delete(sourceSongKey);
        state.borrowedSourceEnabledBySource.delete(sourceSongKey);
        if (state.borrowedSourceSongKey === sourceSongKey) state.borrowedSourceSongKey = getBorrowedSourceSongKeys(state)[0] || '';
        state.borrowedSourceSongMessage = '';
        state.borrowedSourceSongMessageIsError = false;
        markDirty();
        renderDynamic();
        return;
      }
      const sourceEnabledToggle = event.target.closest('[data-vec-borrow-source-enabled]');
      if (sourceEnabledToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleBorrowedSourceEnabled(sourceEnabledToggle.dataset.vecBorrowSourceEnabled);
        return;
      }
      const toggleAll = event.target.closest('[data-vec-borrow-assets-toggle]');
      if (toggleAll) {
        event.preventDefault();
        event.stopPropagation();
        setBorrowedAssetInclusion(toggleAll.dataset.vecBorrowAssetsToggle, toggleAll.dataset.vecBorrowAssetsToggleValue === 'on');
        return;
      }
      const toggle = event.target.closest('[data-vec-borrow-asset-toggle]');
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const [sourceSongKey, ...assetParts] = String(toggle.dataset.vecBorrowAssetToggle || '').split(':');
        toggleBorrowedAsset(sourceSongKey, assetParts.join(':'));
        return;
      }
      const previewButton = event.target.closest('[data-vec-borrow-preview-asset]');
      if (previewButton && previewButton.getAttribute('aria-disabled') !== 'true') {
        state.previewModalAsset = `borrow:${previewButton.dataset.vecBorrowPreviewAsset}`;
        renderDynamic();
      }
    });

    elements.songAssets?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-vec-song-upload]');
      if (!input?.files?.length) return;
      [...input.files].forEach((file) => uploadSongAssetFile(file, input.dataset.vecSongUpload));
      input.value = '';
    });

    elements.songAssets?.addEventListener('keydown', (event) => {
      const previewButton = event.target.closest('[data-vec-song-preview-asset]');
      if (previewButton && !event.target.closest('[data-vec-song-asset-toggle], [data-vec-song-asset-delete]') && (event.key === 'Enter' || event.key === ' ') && previewButton.getAttribute('aria-disabled') !== 'true') {
        event.preventDefault();
        state.previewModalAsset = `song:${previewButton.dataset.vecSongPreviewAsset}`;
        renderDynamic();
      }
    });

    elements.songAssets?.addEventListener('click', (event) => {
      const toggleAll = event.target.closest('[data-vec-song-assets-toggle]');
      if (toggleAll) {
        event.preventDefault();
        event.stopPropagation();
        setSongAssetInclusion(toggleAll.dataset.vecSongAssetsToggle === 'on');
        return;
      }
      const toggle = event.target.closest('[data-vec-song-asset-toggle]');
      if (toggle) {
        const asset = state.songAssets.find((item) => String(item.id) === String(toggle.dataset.vecSongAssetToggle));
        if (!asset) return;
        const previousRecipe = buildCurrentRecipe();
        const inclusion = getSongAssetInclusionMap(state);
        inclusion.set(asset.id, inclusion.get(asset.id) === false);
        markDirty();
        renderDynamic();
        persistRecipeChange(previousRecipe, 'clip status');
        return;
      }
      const deleteButton = event.target.closest('[data-vec-song-asset-delete]');
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        deleteSongAssetById(deleteButton.dataset.vecSongAssetDelete);
        return;
      }
      const previewButton = event.target.closest('[data-vec-song-preview-asset]');
      if (previewButton && previewButton.getAttribute('aria-disabled') !== 'true') {
        state.previewModalAsset = `song:${previewButton.dataset.vecSongPreviewAsset}`;
        renderDynamic();
      }
    });

    elements.songAssets?.addEventListener('dragover', (event) => {
      if (!state.songContext) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    elements.songAssets?.addEventListener('drop', (event) => {
      if (!state.songContext) return;
      event.preventDefault();
      [...(event.dataTransfer?.files || [])].forEach((file) => uploadSongAssetFile(file));
    });

    elements.folderToolbar?.addEventListener('input', (event) => {
      const search = event.target.closest('[data-vec-folder-search]');
      if (!search) return;
      state.folderSearch = search.value;
      renderDynamic();
    });

    elements.folderToolbar?.addEventListener('change', (event) => {
      const typeFilter = event.target.closest('[data-vec-folder-type-filter]');
      const activeFilter = event.target.closest('[data-vec-folder-active-filter]');
      if (typeFilter) state.folderTypeFilter = typeFilter.value || 'all';
      if (activeFilter) state.folderActiveFilter = activeFilter.value || 'all';
      if (typeFilter || activeFilter) renderDynamic();
    });

    elements.folderToolbar?.addEventListener('click', (event) => {
      const collapseButton = event.target.closest('[data-vec-collapse-folders]');
      if (!collapseButton) return;
      state.expandedFolderIds.clear();
      renderDynamic();
    });

    elements.folderGrid.addEventListener('keydown', (event) => {
      const previewButton = event.target.closest('[data-vec-preview-asset]');
      if (previewButton && !event.target.closest('[data-vec-asset-toggle]') && (event.key === 'Enter' || event.key === ' ') && previewButton.getAttribute('aria-disabled') !== 'true') {
        event.preventDefault();
        state.previewModalAsset = previewButton.dataset.vecPreviewAsset;
        renderDynamic();
        return;
      }
      const assetToggle = event.target.closest('[data-vec-asset-toggle]');
      if (!assetToggle || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggleAssetInclusion(assetToggle);
    });

    elements.folderGrid.addEventListener('click', (event) => {
      const folderAssetsToggle = event.target.closest('[data-vec-folder-assets-toggle]');
      if (folderAssetsToggle) {
        event.preventDefault();
        event.stopPropagation();
        setFolderAssetInclusion(folderAssetsToggle);
        return;
      }
      const assetToggle = event.target.closest('[data-vec-asset-toggle]');
      if (assetToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleAssetInclusion(assetToggle);
        return;
      }
      const previewButton = event.target.closest('[data-vec-preview-asset]');
      if (previewButton && previewButton.getAttribute('aria-disabled') !== 'true') {
        state.previewModalAsset = previewButton.dataset.vecPreviewAsset;
        renderDynamic();
        return;
      }
      const expandButton = event.target.closest('[data-vec-folder-expand]');
      if (expandButton && state.songContext) {
        const folderId = expandButton.dataset.vecFolderExpand;
        if (state.expandedFolderIds.has(folderId)) {
          state.expandedFolderIds.delete(folderId);
          renderDynamic();
          return;
        }
        state.expandedFolderIds.add(folderId);
        if (!state.folderAssets.has(folderId)) {
          state.folderAssets.set(folderId, { loading: true, error: '', assets: [] });
          renderDynamic();
          fetchFolderAssets(folderId).then((assets) => {
            state.folderAssets.set(folderId, { loading: false, error: '', assets });
            if (state.selectedFolderIds.has(folderId)) initializeFolderAssetInclusion(state, folderId, assets);
          }).catch((error) => {
            state.folderAssets.set(folderId, { loading: false, error: error.message || 'Could not load folder visuals.', assets: [] });
          }).finally(renderDynamic);
        } else renderDynamic();
        return;
      }
      const button = event.target.closest('[data-vec-folder-toggle]');
      if (!button || !state.songContext) return;
      const folderId = button.dataset.vecFolderToggle;
      if (state.selectedFolderIds.has(folderId)) {
        state.selectedFolderIds.delete(folderId);
        markDirty();
      } else {
        state.selectedFolderIds.add(folderId);
        markDirty();
        initializeFolderAssetInclusion(state, folderId, getFolderAssetState(state, folderId).assets || []);
        if (!state.folderAssets.has(folderId)) {
          state.folderAssets.set(folderId, { loading: true, error: '', assets: [] });
          fetchFolderAssets(folderId).then((assets) => {
            state.folderAssets.set(folderId, { loading: false, error: '', assets });
            initializeFolderAssetInclusion(state, folderId, assets);
          }).catch((error) => {
            state.folderAssets.set(folderId, { loading: false, error: error.message || 'Could not load folder visuals.', assets: [] });
          }).finally(renderDynamic);
        }
      }
      renderDynamic();
    });

    elements.mediaModal.addEventListener('click', (event) => {
      const modalToggle = event.target.closest('[data-vec-modal-asset-toggle]');
      if (modalToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleModalAssetInclusion();
        return;
      }
      if (event.target === elements.mediaModal || event.target.closest('[data-vec-close-modal]')) {
        state.previewModalAsset = null;
        renderDynamic();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.previewModalAsset) {
        state.previewModalAsset = null;
        renderDynamic();
      }
    });


    elements.artworkOnlyToggle?.addEventListener('click', () => {
      state.visualMode = state.visualMode === VISUAL_MODE_ARTWORK_ONLY ? VISUAL_MODE_CUSTOM : VISUAL_MODE_ARTWORK_ONLY;
      previewState.index = 0;
      markDirty();
      renderDynamic();
    });

    elements.orderMode.addEventListener('change', () => {
      state.shuffleRules.orderMode = elements.orderMode.value;
      markDirty();
      renderDynamic();
    });
    elements.maxSameFolder.addEventListener('change', () => {
      state.shuffleRules.maxSameFolderInRow = elements.maxSameFolder.value;
      markDirty();
      renderDynamic();
    });
    elements.maxFolderAssets.addEventListener('change', () => {
      state.shuffleRules.maxAssetsPerFolder = elements.maxFolderAssets.value;
      markDirty();
      renderDynamic();
    });
    elements.avoidRepeats.addEventListener('click', () => {
      state.shuffleRules.avoidRepeats = !state.shuffleRules.avoidRepeats;
      markDirty();
      renderDynamic();
    });

    container.querySelectorAll('[data-vec-artwork-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.vecArtworkToggle;
        if (name === 'start_with_artwork') state.artworkRules.startWithArtwork = !state.artworkRules.startWithArtwork;
        if (name === 'end_with_artwork') state.artworkRules.endWithArtwork = !state.artworkRules.endWithArtwork;
        if (name === 're_present_artwork') state.artworkRules.rePresentArtwork = !state.artworkRules.rePresentArtwork;
        markDirty();
        renderDynamic();
      });
    });
    container.querySelectorAll('[data-vec-artwork-select]').forEach((select) => {
      select.addEventListener('change', () => {
        const name = select.dataset.vecArtworkSelect;
        const value = Number(select.value);
        if (name === 'start_artwork_duration_seconds') state.artworkRules.startDurationSeconds = value;
        if (name === 'end_artwork_duration_seconds') state.artworkRules.endDurationSeconds = value;
        if (name === 'repeat_artwork_every_seconds') state.artworkRules.repeatEverySeconds = value;
        markDirty();
        renderDynamic();
      });
    });
    elements.saveRecipe.addEventListener('click', saveCurrentRecipe);
    elements.resetRecipe.addEventListener('click', () => { applyRecipe(state.savedRecipe); renderDynamic(); });

    elements.select.addEventListener('change', () => {
      const selected = state.songs.find((song) => getSongKey(song) === elements.select.value);
      if (state.dirty && !window.confirm('Discard unsaved VEC recipe changes for this song?')) { elements.select.value = state.songKey; return; }
      setSongContext(selected || null);
      loadSongAssetsForCurrentSong();
      loadRecipeForCurrentSong();
    });
    elements.playButton.addEventListener('click', startPreview);
    elements.pauseButton.addEventListener('click', pausePreview);
    elements.restartButton.addEventListener('click', restartPreview);
    elements.nextButton.addEventListener('click', () => nextPreviewVisual({ keepPlaying: previewState.isPlaying }));
    previewAudio.addEventListener('loadedmetadata', updateScrubber);
    previewAudio.addEventListener('durationchange', updateScrubber);
    previewAudio.addEventListener('timeupdate', () => { syncVisualToAudioTime(); updateScrubber(); updatePreviewOnly(); });
    previewAudio.addEventListener('ended', () => {
      previewState.isPlaying = false;
      stopPreviewTimer();
      updateScrubber();
      updatePreviewOnly();
    });
    elements.scrubber.addEventListener('input', () => {
      if (!getAudioUrl(state.songContext)) return;
      previewAudio.currentTime = Number(elements.scrubber.value) || 0;
      syncVisualToAudioTime();
      updateScrubber();
      updatePreviewOnly();
    });

    if (state.songContext) loadPreviewAudio();
    renderDynamic();
    container.dataset.vecMode = state.mode;

    if (state.mode === 'lab') {
      state.visualFoldersLoading = true;
      renderDynamic();
      fetchVisualFolders().then((folders) => {
        state.visualFolders = folders;
        state.visualFoldersError = '';
      }).catch((error) => {
        state.visualFolders = [];
        state.visualFoldersError = error.message || 'Could not load Visual Library folders.';
      }).finally(() => {
        state.visualFoldersLoading = false;
        renderDynamic();
      });

      fetchSongs().then((songList) => {
        state.songs = sortSongs(songList).filter((song) => getSongKey(song));
        elements.select.innerHTML = `<option value="">Select a song...</option>${state.songs.map((song) => {
          const songKey = getSongKey(song);
          const artist = clean(song.artist);
          const label = `${getSongTitle(song)}${artist ? ` — ${artist}` : ''}`;
          return `<option value="${escapeHtml(songKey)}">${escapeHtml(label)}</option>`;
        }).join('')}`;
        elements.select.disabled = false;
        elements.status.textContent = `Loaded ${state.songs.length} song${state.songs.length === 1 ? '' : 's'} from the existing dev Songs CMS API.`;
        if (state.songKey) {
          const initialSong = state.songs.find((song) => getSongKey(song) === state.songKey);
          if (initialSong) { setSongContext(initialSong); loadSongAssetsForCurrentSong(); loadRecipeForCurrentSong(); }
        }
      }).catch((error) => {
        elements.select.innerHTML = '<option value="">Songs unavailable</option>';
        elements.select.disabled = true;
        elements.status.textContent = error.message;
      });
    } else {
      elements.select.disabled = true;
      elements.status.textContent = 'Embedded mode receives song context from its parent page.';
    }

    return { state, setSongContext, getSongContext: () => state.songContext, buildPreviewSequence: () => buildPreviewSequence(state), startPreview, pausePreview, restartPreview, nextPreviewVisual };
  }

  window.StashboxVecController = { initVecController, DEFAULT_ARTWORK_RULES, buildPreviewSequence };
})();
