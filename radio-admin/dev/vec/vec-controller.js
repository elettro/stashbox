(function () {
  const API_ROOT = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev';
  const SONGS_API_URL = `${API_ROOT}/admin/songs`;
  const VISUALS_FOLDERS_API_URL = `${API_ROOT}/admin/visuals/folders`;
  const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';

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

  async function adminFetchJson(url) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (!token) throw new Error('Save an admin token in the dev admin first.');
    const response = await fetch(url, { headers: { 'x-admin-token': token } });
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
      status: clean(asset.status) || 'active',
      created_at: asset.created_at || asset.createdAt || '',
      updated_at: asset.updated_at || asset.updatedAt || '',
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
        <button class="vec-toggle is-on" type="button" disabled aria-pressed="${value}" name="${name}">${onOffLabel(value)}</button>
      </label>
    `;
  }

  function renderReadonlySelect(label, name, value, options) {
    return `
      <label class="vec-field">
        <span>${label}</span>
        <select name="${name}" class="vec-select" disabled>
          ${optionMarkup(options, value)}
        </select>
      </label>
    `;
  }

  function getSelectedFolders(state) {
    const selectedIds = state.selectedFolderIds || new Set();
    return (state.visualFolders || []).filter((folder) => selectedIds.has(folder.id));
  }

  function buildPreviewSequence(state) {
    if (!state.songContext) return [];
    const title = state.songContext.display_title || state.songContext.song_name || 'Untitled song';
    const artworkUrl = getArtworkUrl(state.songContext);
    const localVisuals = Array.isArray(state.localPreviewVisuals) ? state.localPreviewVisuals : [];
    const sequence = [];

    if (state.artworkRules.startWithArtwork && artworkUrl) {
      sequence.push({ type: 'artwork', label: 'Official artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: state.artworkRules.startDurationSeconds || 4 });
    }

    localVisuals.forEach((visual, index) => {
      if (!visual) return;
      sequence.push({
        type: visual.type || 'placeholder',
        label: visual.label || `Local preview visual ${index + 1}`,
        url: clean(visual.url),
        alt: visual.alt || visual.label || `Local preview visual ${index + 1}`,
        durationSeconds: visual.durationSeconds || 4,
      });
    });

    const selectedFolders = getSelectedFolders(state);
    const firstThumbnailFolder = selectedFolders.find((folder) => folder.thumbnail_url);
    if (firstThumbnailFolder?.thumbnail_url) {
      sequence.push({ type: 'visual-folder', label: `${firstThumbnailFolder.folder_name} folder selected`, url: firstThumbnailFolder.thumbnail_url, alt: `${firstThumbnailFolder.folder_name} preview thumbnail`, durationSeconds: 4 });
    } else if (selectedFolders.length) {
      sequence.push({ type: 'visual-folder', label: `${selectedFolders.length} Visual Library folder${selectedFolders.length === 1 ? '' : 's'} selected`, durationSeconds: 4 });
    }

    if (!sequence.length && artworkUrl) {
      sequence.push({ type: 'artwork', label: 'Official artwork', url: artworkUrl, alt: `${title} official artwork`, durationSeconds: 4 });
    }

    if (!sequence.length) {
      sequence.push({ type: 'fallback', label: 'Fallback visual', durationSeconds: 4 });
    }

    return sequence;
  }

  function renderPreview(songContext, previewState) {
    if (!songContext) {
      return '<span class="vec-preview-badge">Preview Mode</span><p>Select a song to preview its visual experience.</p>';
    }
    const title = songContext.display_title || songContext.song_name || 'Untitled song';
    const genre = clean(songContext.genre);
    const visual = previewState.sequence[previewState.index] || { type: 'fallback', label: 'Fallback visual' };
    const isPlaying = previewState.isPlaying;
    const visualMarkup = visual.url
      ? `<img src="${escapeHtml(visual.url)}" alt="${escapeHtml(visual.alt || visual.label || title)}" />`
      : '<div class="vec-artwork-fallback" aria-label="No artwork available">No artwork</div>';
    return `
      <span class="vec-preview-badge">Preview Mode</span>
      <div class="vec-preview-song ${isPlaying ? 'is-playing' : 'is-paused'}">
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

  function renderSummary(songContext, artworkRules, selectedFolders = []) {
    const title = songContext ? (songContext.display_title || songContext.song_name || 'Untitled song') : 'None';
    const artist = songContext?.artist || '—';
    const songKey = songContext?.song_key || '—';
    const artworkStatus = songContext && getArtworkUrl(songContext) ? 'Artwork available' : 'No artwork available';
    const selectedImages = selectedFolders.reduce((total, folder) => total + (folder.images_count || 0), 0);
    const selectedClips = selectedFolders.reduce((total, folder) => total + (folder.clips_count || 0), 0);
    const selectedNames = selectedFolders.map((folder) => folder.folder_name).join(', ') || 'None selected';
    return `
      <p class="vec-empty-state">${songContext ? `Selected song context loaded for ${escapeHtml(title)}.` : 'No song selected yet.'}</p>
      <div class="vec-summary-grid">
        <div class="vec-summary-card"><strong>Selected song</strong><span>${escapeHtml(title)}</span></div>
        <div class="vec-summary-card"><strong>Artist</strong><span>${escapeHtml(artist)}</span></div>
        <div class="vec-summary-card"><strong>Song key</strong><span>${escapeHtml(songKey)}</span></div>
        <div class="vec-summary-card"><strong>Official artwork</strong><span>${artworkStatus}</span></div>
        <div class="vec-summary-card"><strong>Selected folders</strong><span>${selectedFolders.length} folder${selectedFolders.length === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card vec-summary-wide"><strong>Selected folder names</strong><span>${escapeHtml(selectedNames)}</span></div>
        <div class="vec-summary-card"><strong>Selected images</strong><span>${selectedImages} image${selectedImages === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card"><strong>Selected clips</strong><span>${selectedClips} clip${selectedClips === 1 ? '' : 's'}</span></div>
        <div class="vec-summary-card"><strong>Artwork rules</strong><span>Start ${onOffLabel(artworkRules.startWithArtwork)} · ${secondsLabel(artworkRules.startDurationSeconds)} · End ${onOffLabel(artworkRules.endWithArtwork)} · ${secondsLabel(artworkRules.endDurationSeconds)} · Re-present ${onOffLabel(artworkRules.rePresentArtwork)} every ${secondsLabel(artworkRules.repeatEverySeconds)}</span></div>
        <div class="vec-summary-card"><strong>Shuffle mode</strong><span>Randomize · avoid repeats</span></div>
      </div>`;
  }

  function latestTime(value) {
    const time = Date.parse(value?.updated_at || value?.created_at || '');
    return Number.isFinite(time) ? time : 0;
  }

  function getFolderAssetState(state, folderId) {
    return state.folderAssets.get(folderId) || { loading: false, error: '', assets: [] };
  }

  function renderAssetPreview(asset, folderId) {
    const type = normalizeAssetType(asset);
    const title = asset.caption || asset.file_name || 'Visual asset';
    const url = clean(asset.public_url);
    const media = !url
      ? `<span>${type === 'clip' ? 'MP4' : 'IMG'}</span>`
      : (type === 'clip'
        ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`);
    return `<button type="button" class="vec-folder-asset-card ${type === 'clip' ? 'is-clip' : 'is-image'}" data-vec-preview-asset="${escapeHtml(folderId)}:${escapeHtml(asset.id)}" ${url ? '' : 'disabled'} aria-label="Preview ${escapeHtml(title)}">
      <span class="vec-folder-asset-thumb">${media}</span>
      <span class="vec-folder-asset-meta"><strong>${escapeHtml(title)}</strong><small>${type === 'clip' ? 'Video clip' : 'Image'}${asset.status === 'hidden' ? ' · hidden' : ''}</small></span>
    </button>`;
  }

  function renderFolderAssets(state, folder) {
    const assetState = getFolderAssetState(state, folder.id);
    if (assetState.loading) return '<div class="vec-folder-assets"><p class="vec-empty-state">Loading folder visuals...</p></div>';
    if (assetState.error) return `<div class="vec-folder-assets"><p class="vec-empty-state vec-error-state">${escapeHtml(assetState.error)}</p></div>`;
    const assets = [...(assetState.assets || [])].sort((a, b) => latestTime(b) - latestTime(a));
    if (!assets.length) return '<div class="vec-folder-assets"><p class="vec-empty-state">No images or video clips found for this folder yet.</p></div>';
    const clips = assets.filter((asset) => normalizeAssetType(asset) === 'clip');
    const images = assets.filter((asset) => normalizeAssetType(asset) === 'image');
    return `<div class="vec-folder-assets">
      <div class="vec-folder-assets-head"><strong>Folder visuals</strong><span>${images.length} image${images.length === 1 ? '' : 's'} · ${clips.length} clip${clips.length === 1 ? '' : 's'}</span></div>
      <div class="vec-folder-asset-grid">${assets.map((asset) => renderAssetPreview(asset, folder.id)).join('')}</div>
    </div>`;
  }

  function renderFolderCards(state) {
    if (!state.songContext) return '<p class="vec-empty-state">Select a song before choosing Visual Library folders.</p>';
    if (state.visualFoldersLoading) return '<p class="vec-empty-state">Loading real Visual Library folders...</p>';
    if (state.visualFoldersError) return `<p class="vec-empty-state vec-error-state">${escapeHtml(state.visualFoldersError)}</p>`;
    if (!state.visualFolders.length) return '<p class="vec-empty-state">No Visual Library folders are available yet.</p>';
    return state.visualFolders.map((folder) => {
      const selected = state.selectedFolderIds.has(folder.id);
      const typeLabel = FOLDER_TYPE_LABELS[folder.folder_type] || folder.folder_type || 'General';
      const statusLabel = FOLDER_STATUS_LABELS[folder.status] || folder.status || 'Active';
      const dateLabel = formatDate(folder.updated_at || folder.created_at);
      const expanded = state.expandedFolderIds.has(folder.id);
      const selectionLabel = selected ? 'Folder included. Click to exclude this folder.' : 'Folder excluded. Click to include this folder.';
      return `<article class="vec-folder-card ${selected ? 'is-selected' : 'is-unselected'} ${expanded ? 'is-expanded' : ''}">
        <div class="vec-folder-card-top">
          <div class="vec-folder-card-main">
            <div class="vec-folder-card-head"><h3>${escapeHtml(folder.folder_name)}</h3><span class="vec-folder-status ${folder.status === 'hidden' ? 'is-hidden' : 'is-active'}">${escapeHtml(statusLabel)}</span></div>
            <div class="vec-folder-badges"><span>${escapeHtml(typeLabel)}</span><span>${folder.images_count} images</span><span>${folder.clips_count} clips</span>${folder.asset_count ? `<span>${folder.asset_count} assets</span>` : ''}</div>
            ${folder.description ? `<p>${escapeHtml(folder.description)}</p>` : '<p>No description available.</p>'}
            ${dateLabel ? `<small>${folder.updated_at ? 'Updated' : 'Created'} ${escapeHtml(dateLabel)}</small>` : ''}
          </div>
          <div class="vec-folder-actions">
            <button type="button" class="vec-folder-status-light ${selected ? 'is-on' : 'is-off'}" data-vec-folder-toggle="${escapeHtml(folder.id)}" aria-pressed="${selected}" aria-label="${selectionLabel}" title="${selectionLabel}"><span class="sr-only">${selected ? 'Included' : 'Excluded'}</span></button>
            <button type="button" class="vec-folder-expand" data-vec-folder-expand="${escapeHtml(folder.id)}" aria-expanded="${expanded}">${expanded ? 'Hide visuals' : 'Show visuals'}</button>
          </div>
        </div>
        ${expanded ? renderFolderAssets(state, folder) : ''}
      </article>`;
    }).join('');
  }

  function initVecController(container, options = {}) {
    if (!container) return null;
    const initialSongContext = options.songContext ? createSongContext(options.songContext) : null;
    const state = { mode: options.mode || 'lab', songKey: options.songKey || initialSongContext?.song_key || '', songs: [], songContext: initialSongContext, artworkRules: { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) }, localPreviewVisuals: options.localPreviewVisuals || [], visualFolders: normalizeFoldersResponse(options.visualFolders || []), visualFoldersLoading: false, visualFoldersError: '', selectedFolderIds: new Set(options.selectedFolderIds || []), expandedFolderIds: new Set(), folderAssets: new Map(), previewModalAsset: null };
    const previewState = { sequence: buildPreviewSequence(state), index: 0, isPlaying: false, timerId: null };

    container.innerHTML = `
      <section class="card vec-section" aria-labelledby="songSelectorHeading">
        <div class="panel-header vec-section-header"><div><p class="eyebrow">Song</p><h2 id="songSelectorHeading">Select Song</h2><p class="vec-copy">Select a song to simulate the song context for this VEC Lab.</p></div></div>
        <label class="vec-label" for="songSelect">Song</label>
        <select id="songSelect" class="vec-select" data-vec-song-select><option value="">Loading songs...</option></select>
        <p class="vec-microcopy" data-vec-song-status>Loading real Songs CMS data from the existing dev admin songs API.</p>
      </section>
      <section class="card vec-section" aria-labelledby="vecPreviewHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Preview</p><h2 id="vecPreviewHeading">VEC Preview</h2><p class="vec-copy">Preview only — local audio only; does not count plays, ads, skips, or stats.</p></div></div><div class="vec-preview-window" aria-label="Visual experience preview" data-vec-preview></div><div class="vec-audio-preview" data-vec-audio-preview aria-label="Local preview audio scrubber"><p class="vec-audio-message" data-vec-audio-message>Select a song to load preview audio.</p><div class="vec-scrubber-row"><span data-vec-current-time>0:00</span><input type="range" min="0" max="0" step="0.01" value="0" data-vec-scrubber aria-label="Preview audio time scrubber" disabled /><span data-vec-duration>--:--</span></div></div><div class="vec-button-row" aria-label="Preview controls"><button type="button" data-vec-preview-play>Play Preview</button><button type="button" data-vec-preview-pause>Pause</button><button type="button" data-vec-preview-restart>Restart</button><button type="button" data-vec-preview-next>Next Visual</button></div></section>
      <section class="card vec-section" aria-labelledby="artworkControllerHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Artwork</p><h2 id="artworkControllerHeading">Official Song Artwork Controller</h2><p class="vec-copy">Plan how the official song artwork anchors the visual experience at the start, end, and throughout playback.</p></div></div><div data-vec-artwork-status></div><div class="vec-control-grid" role="group" aria-label="Official song artwork controller">${renderReadonlyToggle('Start with artwork', state.artworkRules.startWithArtwork, 'start_with_artwork')}${renderReadonlySelect('Start duration', 'start_artwork_duration_seconds', state.artworkRules.startDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('End with artwork', state.artworkRules.endWithArtwork, 'end_with_artwork')}${renderReadonlySelect('End duration', 'end_artwork_duration_seconds', state.artworkRules.endDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('Re-present artwork', state.artworkRules.rePresentArtwork, 're_present_artwork')}${renderReadonlySelect('Repeat every', 'repeat_artwork_every_seconds', state.artworkRules.repeatEverySeconds, REPEAT_OPTIONS)}</div></section>
      <section class="card vec-section" aria-labelledby="songAssetsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Song Assets</p><h2 id="songAssetsHeading">Song-Only Visual Assets</h2><p class="vec-copy">Assets uploaded here will apply only to the selected song.</p></div></div><div class="vec-two-column"><article class="vec-placeholder-panel"><h3>Image upload placeholder</h3><p>Song-specific still image upload wiring will come later.</p></article><article class="vec-placeholder-panel"><h3>Video clip upload placeholder</h3><p>Song-specific clip upload wiring will come later.</p></article></div><div class="vec-thumbnail-grid" aria-label="Empty thumbnail grid placeholder"><p>No song-only visual assets yet.</p></div></section>
      <section class="card vec-section" aria-labelledby="folderCardsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Folders</p><h2 id="folderCardsHeading">Visual Library Folders</h2><p class="vec-copy">Select reusable Visual Library folders to include in this song’s local VEC recipe draft.</p></div></div><div class="vec-folder-grid" data-vec-folder-grid></div></section>
      <section class="card vec-section" aria-labelledby="shuffleSettingsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Shuffle</p><h2 id="shuffleSettingsHeading">Controlled Shuffle Settings</h2><p class="vec-copy">Set basic rules for how selected visuals should rotate during the song.</p></div></div><div class="vec-control-grid" role="group" aria-label="Controlled shuffle settings"><label class="vec-field"><span>Order mode</span><select class="vec-select" disabled><option>Manual Order</option><option selected>Randomize</option><option>Newest First</option></select></label><label class="vec-field"><span>Max assets from same folder in a row</span><input type="text" value="1" readonly disabled /></label><label class="vec-field"><span>Max assets per folder per play</span><input type="text" value="All" readonly disabled /></label><label class="vec-field"><span>Avoid repeating same asset</span><button class="vec-toggle is-on" type="button" disabled aria-pressed="true">ON</button></label></div></section>
      <section class="card vec-section" aria-labelledby="recipeSummaryHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Recipe</p><h2 id="recipeSummaryHeading">Recipe Summary</h2></div></div><div data-vec-summary></div></section>
      <section class="card vec-section vec-save-panel" aria-labelledby="vecSaveHeading"><div><p class="eyebrow">Save / Reset</p><h2 id="vecSaveHeading">Save / Reset</h2><p class="vec-copy">Recipe saving will be wired in a later PR.</p></div><div class="vec-button-row"><button type="button" disabled>Save VEC Recipe</button><button type="button" disabled>Reset Unsaved Changes</button></div></section><div class="vec-media-modal hidden" data-vec-media-modal role="dialog" aria-modal="true" aria-labelledby="vecMediaModalTitle"></div>`;

    const elements = {
      select: container.querySelector('[data-vec-song-select]'),
      status: container.querySelector('[data-vec-song-status]'),
      preview: container.querySelector('[data-vec-preview]'),
      artworkStatus: container.querySelector('[data-vec-artwork-status]'),
      summary: container.querySelector('[data-vec-summary]'),
      folderGrid: container.querySelector('[data-vec-folder-grid]'),
      playButton: container.querySelector('[data-vec-preview-play]'),
      pauseButton: container.querySelector('[data-vec-preview-pause]'),
      restartButton: container.querySelector('[data-vec-preview-restart]'),
      nextButton: container.querySelector('[data-vec-preview-next]'),
      audioMessage: container.querySelector('[data-vec-audio-message]'),
      scrubber: container.querySelector('[data-vec-scrubber]'),
      currentTime: container.querySelector('[data-vec-current-time]'),
      duration: container.querySelector('[data-vec-duration]'),
      mediaModal: container.querySelector('[data-vec-media-modal]'),
    };

    const previewAudio = new Audio();
    previewAudio.preload = 'metadata';

    function stopPreviewTimer() {
      if (previewState.timerId) window.clearTimeout(previewState.timerId);
      previewState.timerId = null;
    }

    function schedulePreviewTick() {
      stopPreviewTimer();
      if (!previewState.isPlaying || !previewState.sequence.length) return;
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

    function syncVisualToAudioTime() {
      if (!getAudioUrl(state.songContext)) return;
      previewState.index = getVisualIndexForTime(previewAudio.currentTime || 0);
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
      const [folderId, ...assetParts] = String(key || '').split(':');
      const assetId = assetParts.join(':');
      const folder = state.visualFolders.find((item) => item.id === folderId);
      const asset = getFolderAssetState(state, folderId).assets.find((item) => String(item.id) === assetId);
      return { folder, asset };
    }

    function renderMediaModal() {
      if (!elements.mediaModal) return;
      if (!state.previewModalAsset) {
        elements.mediaModal.classList.add('hidden');
        elements.mediaModal.innerHTML = '';
        return;
      }
      const { folder, asset } = findAssetByModalKey(state.previewModalAsset);
      if (!asset) { state.previewModalAsset = null; renderMediaModal(); return; }
      const type = normalizeAssetType(asset);
      const title = asset.caption || asset.file_name || 'Visual asset preview';
      const url = clean(asset.public_url);
      const media = type === 'clip'
        ? `<video src="${escapeHtml(url)}" controls autoplay playsinline></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(asset.alt_text || title)}" />`;
      elements.mediaModal.classList.remove('hidden');
      elements.mediaModal.innerHTML = `<div class="vec-media-dialog">
        <div class="vec-media-dialog-head"><div><p class="eyebrow">${escapeHtml(folder?.folder_name || 'Folder visual')}</p><h2 id="vecMediaModalTitle">${escapeHtml(title)}</h2></div><button type="button" class="vec-media-close" data-vec-close-modal>Close</button></div>
        <div class="vec-media-stage">${media}</div>
        <p class="vec-media-caption">${escapeHtml(asset.alt_text || asset.file_name || '')}</p>
      </div>`;
    }

    function renderDynamic() {
      previewState.sequence = buildPreviewSequence(state);
      if (previewState.index >= previewState.sequence.length) previewState.index = 0;
      const hasSong = Boolean(state.songContext);
      elements.preview.innerHTML = renderPreview(state.songContext, previewState);
      elements.artworkStatus.innerHTML = renderArtworkStatus(state.songContext);
      elements.folderGrid.innerHTML = renderFolderCards(state);
      elements.summary.innerHTML = renderSummary(state.songContext, state.artworkRules, getSelectedFolders(state));
      [elements.playButton, elements.pauseButton, elements.restartButton, elements.nextButton].forEach((button) => { if (button) button.disabled = !hasSong; });
      if (elements.playButton) elements.playButton.disabled = !hasSong || previewState.isPlaying;
      if (elements.pauseButton) elements.pauseButton.disabled = !hasSong || !previewState.isPlaying;
      container.dataset.vecPreviewState = hasSong ? (previewState.isPlaying ? 'playing' : 'paused') : 'empty';
      renderMediaModal();
    }

    function startPreview() {
      if (!state.songContext) return;
      previewState.isPlaying = true;
      syncVisualToAudioTime();
      const playPromise = getAudioUrl(state.songContext) ? previewAudio.play() : null;
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => { previewState.isPlaying = false; renderDynamic(); updateScrubber(); });
      }
      renderDynamic();
      schedulePreviewTick();
    }

    function pausePreview() {
      previewState.isPlaying = false;
      previewAudio.pause();
      stopPreviewTimer();
      updateScrubber();
      renderDynamic();
    }

    function restartPreview() {
      previewState.index = 0;
      if (getAudioUrl(state.songContext)) previewAudio.currentTime = 0;
      updateScrubber();
      renderDynamic();
      schedulePreviewTick();
    }

    function nextPreviewVisual({ keepPlaying = previewState.isPlaying } = {}) {
      if (!state.songContext || !previewState.sequence.length) return;
      previewState.index = previewState.sequence.length > 1 ? (previewState.index + 1) % previewState.sequence.length : 0;
      previewState.isPlaying = keepPlaying;
      renderDynamic();
      schedulePreviewTick();
    }

    function setSongContext(songOrContext) {
      pausePreview();
      state.songContext = createSongContext(songOrContext);
      state.songKey = state.songContext?.song_key || '';
      state.selectedFolderIds = new Set();
      state.expandedFolderIds = new Set();
      state.previewModalAsset = null;
      previewState.index = 0;
      loadPreviewAudio();
      if (elements.select && elements.select.value !== state.songKey) elements.select.value = state.songKey;
      renderDynamic();
      return state.songContext;
    }

    elements.folderGrid.addEventListener('click', (event) => {
      const previewButton = event.target.closest('[data-vec-preview-asset]');
      if (previewButton) {
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
          }).catch((error) => {
            state.folderAssets.set(folderId, { loading: false, error: error.message || 'Could not load folder visuals.', assets: [] });
          }).finally(renderDynamic);
        } else renderDynamic();
        return;
      }
      const button = event.target.closest('[data-vec-folder-toggle]');
      if (!button || !state.songContext) return;
      const folderId = button.dataset.vecFolderToggle;
      if (state.selectedFolderIds.has(folderId)) state.selectedFolderIds.delete(folderId);
      else state.selectedFolderIds.add(folderId);
      renderDynamic();
    });

    elements.mediaModal.addEventListener('click', (event) => {
      if (event.target === elements.mediaModal || event.target.closest('[data-vec-close-modal]')) {
        state.previewModalAsset = null;
        renderDynamic();
      }
    });

    elements.select.addEventListener('change', () => {
      const selected = state.songs.find((song) => getSongKey(song) === elements.select.value);
      setSongContext(selected || null);
    });
    elements.playButton.addEventListener('click', startPreview);
    elements.pauseButton.addEventListener('click', pausePreview);
    elements.restartButton.addEventListener('click', restartPreview);
    elements.nextButton.addEventListener('click', () => nextPreviewVisual({ keepPlaying: previewState.isPlaying }));
    previewAudio.addEventListener('loadedmetadata', updateScrubber);
    previewAudio.addEventListener('durationchange', updateScrubber);
    previewAudio.addEventListener('timeupdate', updateScrubber);
    previewAudio.addEventListener('ended', () => {
      previewState.isPlaying = false;
      stopPreviewTimer();
      updateScrubber();
      renderDynamic();
    });
    elements.scrubber.addEventListener('input', () => {
      if (!getAudioUrl(state.songContext)) return;
      previewAudio.currentTime = Number(elements.scrubber.value) || 0;
      syncVisualToAudioTime();
      updateScrubber();
      renderDynamic();
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
          if (initialSong) setSongContext(initialSong);
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
