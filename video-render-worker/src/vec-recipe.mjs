function stringValue(value) {
  return String(value || '').trim();
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeOrderMode(value) {
  const mode = stringValue(value).toLowerCase().replace(/[ -]+/g, '_');
  if (mode === 'manual') return 'manual';
  if (mode === 'newest_first') return 'newest_first';
  return 'random';
}

function selectedIds(section = {}) {
  const excluded = new Set([
    ...stringArray(section.excluded_clip_ids),
    ...stringArray(section.excluded_image_ids)
  ]);
  return unique([
    ...stringArray(section.active_clip_ids),
    ...stringArray(section.active_image_ids)
  ]).filter(id => !excluded.has(id));
}

function assetId(asset) {
  return stringValue(asset?.id || asset?.asset_id);
}

function assetType(asset) {
  return ['clip', 'video'].includes(stringValue(asset?.asset_type || asset?.type || asset?.media_type).toLowerCase())
    ? 'clip'
    : 'image';
}

function assetUrl(asset) {
  return stringValue(asset?.public_url || asset?.url || asset?.src);
}

function selectAssets(allAssets, ids, source, extra = {}) {
  const wanted = new Set(ids);
  return (Array.isArray(allAssets) ? allAssets : [])
    .filter(asset => wanted.has(assetId(asset)) && assetUrl(asset))
    .map(asset => ({
      ...asset,
      id: assetId(asset),
      asset_id: assetId(asset),
      type: assetType(asset),
      asset_type: assetType(asset),
      url: assetUrl(asset),
      public_url: assetUrl(asset),
      source,
      ...extra
    }));
}

function normalizeArtworkRules(recipe = {}) {
  const rules = recipe.artwork || recipe.artwork_rules || {};
  return {
    start_with_artwork: Boolean(rules.start_with_artwork),
    start_duration_seconds: Math.max(0, Number(rules.start_duration_seconds || 0) || 0),
    end_with_artwork: Boolean(rules.end_with_artwork),
    end_duration_seconds: Math.max(0, Number(rules.end_duration_seconds || 0) || 0),
    re_present_artwork: Boolean(rules.re_present_artwork),
    repeat_every_seconds: Math.max(0, Number(rules.repeat_every_seconds || 0) || 0)
  };
}

function normalizeRenderSettings(recipe = {}) {
  const settings = recipe.render_settings || recipe.renderSettings || {};
  const duration = Number(settings.still_image_duration_seconds ?? settings.stillImageDurationSeconds);
  return {
    still_image_duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.min(30, duration) : 3,
    ken_burns_enabled: settings.ken_burns_enabled !== false && settings.kenBurnsEnabled !== false
  };
}

async function loadSongAssets(request, songKey) {
  if (!songKey) return [];
  const body = await request(`/admin/vec/song-assets?song_key=${encodeURIComponent(songKey)}`);
  return Array.isArray(body?.assets)
    ? body.assets
    : [...(Array.isArray(body?.clips) ? body.clips : []), ...(Array.isArray(body?.images) ? body.images : [])];
}

export async function resolveVecRecipeVisuals({ songKey, request } = {}) {
  const normalizedSongKey = stringValue(songKey);
  if (!normalizedSongKey) throw new Error('VEC recipe resolution requires a song key.');
  if (typeof request !== 'function') throw new Error('VEC recipe resolution requires an API request function.');

  const recipeBody = await request(`/admin/vec/recipe?song_key=${encodeURIComponent(normalizedSongKey)}`);
  if (!recipeBody?.found || !recipeBody?.recipe) {
    return {
      found: false,
      source: 'vec-recipe-not-found',
      orderMode: 'random',
      assets: [],
      artworkRules: normalizeArtworkRules(),
      renderSettings: normalizeRenderSettings(),
      recipe: null,
      missingAssetIds: []
    };
  }

  const recipe = recipeBody.recipe;
  const visualMode = stringValue(recipe.visual_mode || 'custom').toLowerCase();
  const orderMode = normalizeOrderMode(recipe.shuffle?.order_mode || recipe.order_mode);
  const artworkRules = normalizeArtworkRules(recipe);
  const renderSettings = normalizeRenderSettings(recipe);

  if (visualMode === 'artwork_only') {
    return {
      found: true,
      source: 'vec-recipe',
      visualMode,
      orderMode,
      assets: [],
      artworkRules,
      renderSettings,
      recipe,
      selectedAssetIds: [],
      missingAssetIds: []
    };
  }

  const selectedAssetIds = [];
  const resolvedAssets = [];

  const directIds = selectedIds(recipe.song_assets);
  if (directIds.length) {
    selectedAssetIds.push(...directIds);
    const directAssets = await loadSongAssets(request, normalizedSongKey);
    resolvedAssets.push(...selectAssets(directAssets, directIds, 'vec-song-assets', {
      source_song_key: normalizedSongKey
    }));
  }

  for (const folder of Array.isArray(recipe.folders) ? recipe.folders : []) {
    if (!folder?.enabled) continue;
    const folderId = stringValue(folder.folder_id || folder.id);
    const ids = selectedIds(folder);
    if (!folderId || !ids.length) continue;
    selectedAssetIds.push(...ids);
    const body = await request(`/radio/visuals/folders/${encodeURIComponent(folderId)}/assets`);
    resolvedAssets.push(...selectAssets(body?.assets, ids, 'vec-folder', {
      folder_id: folderId,
      folder_name: stringValue(body?.folder_name)
    }));
  }

  for (const borrowed of Array.isArray(recipe.borrowed_song_assets) ? recipe.borrowed_song_assets : []) {
    if (!borrowed?.enabled) continue;
    const sourceSongKey = stringValue(borrowed.source_song_key || borrowed.song_key);
    const ids = selectedIds(borrowed);
    if (!sourceSongKey || !ids.length) continue;
    selectedAssetIds.push(...ids);
    const borrowedAssets = await loadSongAssets(request, sourceSongKey);
    resolvedAssets.push(...selectAssets(borrowedAssets, ids, 'vec-borrowed-song-assets', {
      source_song_key: sourceSongKey
    }));
  }

  const dedupedAssets = [];
  const seen = new Set();
  for (const asset of resolvedAssets) {
    const id = assetId(asset);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    dedupedAssets.push(asset);
  }

  const expectedIds = unique(selectedAssetIds);
  const missingAssetIds = expectedIds.filter(id => !seen.has(id));

  return {
    found: true,
    source: 'vec-recipe',
    visualMode,
    orderMode,
    assets: dedupedAssets,
    artworkRules,
    renderSettings,
    recipe,
    selectedAssetIds: expectedIds,
    missingAssetIds
  };
}
