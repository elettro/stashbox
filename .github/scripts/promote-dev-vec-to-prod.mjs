import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEV = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION = 'us-east-1';
const DEV_FUNCTION = 'stashbox-radio-api-dev-v2';
const PROD_FUNCTION = 'stashbox-radio-api-prod-v2';
const REPORT_PATH = 'radio/docs/diagnostics/DEV_TO_PROD_VEC_PROMOTION_LATEST.json';
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

fs.mkdirSync('radio/docs/diagnostics', { recursive: true });

const report = {
  started_at: new Date().toISOString(),
  source: 'TRUE DEV radio_dev via DEV API',
  target: 'PROD radio via prod-v2 API',
  policy: 'content-only; additive/update promotion; no deletes; no users, analytics, likes, shares, playlists, or history',
  dev_song_count: 0,
  prod_song_count: 0,
  dev_folder_count: 0,
  prod_folder_count_before: 0,
  folders_created: [],
  folders_reused: [],
  folder_failures: [],
  folder_assets_examined: 0,
  folder_assets_created: 0,
  folder_assets_reused: 0,
  folder_asset_failures: [],
  direct_assets_examined: 0,
  direct_assets_created: 0,
  direct_assets_reused: 0,
  direct_asset_failures: [],
  recipes_found_in_dev: 0,
  recipes_saved_to_prod: 0,
  recipe_failures: [],
  visual_settings_saved: 0,
  visual_settings_skipped: 0,
  visual_settings_failures: [],
  verification: {},
  fatal_error: null
};

function writeReport() {
  report.finished_at = new Date().toISOString();
  const criticalFailures = report.folder_failures.length + report.folder_asset_failures.length + report.direct_asset_failures.length + report.recipe_failures.length;
  report.ok = !report.fatal_error && criticalFailures === 0;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
}

function lambdaAdminToken(functionName) {
  const raw = execFileSync('aws', [
    'lambda', 'get-function-configuration',
    '--function-name', functionName,
    '--region', REGION,
    '--output', 'json'
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const vars = JSON.parse(raw)?.Environment?.Variables || {};
  const token = String(vars.ADMIN_TOKEN || vars.RADIO_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error(`No ADMIN_TOKEN or RADIO_ADMIN_TOKEN is configured on ${functionName}.`);
  return token;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, { method = 'GET', token = '', body, attempts = 6 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const headers = { Accept: 'application/json' };
    if (token) headers['x-admin-token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (response.ok) return data;
      const error = new Error(`${method} ${url} -> HTTP ${response.status}: ${data.error || data.message || text.slice(0, 400)}`);
      error.status = response.status;
      lastError = error;
      if (!RETRYABLE.has(response.status) || attempt === attempts) throw error;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if ((status && !RETRYABLE.has(status)) || attempt === attempts) throw error;
    }
    await sleep(Math.min(8000, 500 * (2 ** (attempt - 1))));
  }
  throw lastError || new Error(`Request failed: ${method} ${url}`);
}

function listSongs(body) {
  if (Array.isArray(body)) return body;
  return body?.songs || body?.items || body?.data || [];
}
function listFolders(body) {
  if (Array.isArray(body)) return body;
  return body?.folders || body?.items || body?.data || [];
}
function listAssets(body) {
  if (Array.isArray(body)) return body;
  return body?.assets || body?.items || body?.results || body?.data?.assets || body?.data || [];
}
function songKey(song) {
  return String(song?.song_key || song?.songKey || '').trim();
}
function folderIdentity(folder) {
  return String(folder?.folder_slug || folder?.folder_name || folder?.folderName || '').trim().toLowerCase();
}
function assetUrl(asset) {
  return String(asset?.public_url || asset?.publicUrl || asset?.url || '').trim();
}
function assetId(asset) {
  return String(asset?.id || asset?.asset_id || '').trim();
}
function unwrapRecipe(body) {
  if (!body || body.found === false) return null;
  return body.recipe || body.data?.recipe || null;
}

function folderPayload(folder) {
  return {
    folder_name: folder.folder_name || folder.folderName || '',
    folder_type: folder.folder_type || folder.folderType || 'general',
    description: folder.description || '',
    status: folder.status || 'active',
    priority: folder.priority || 'medium',
    notes: folder.notes || '',
    relevant_artists: Array.isArray(folder.relevant_artists) ? folder.relevant_artists : [],
    relevant_genres: Array.isArray(folder.relevant_genres) ? folder.relevant_genres : [],
    relevant_moods: Array.isArray(folder.relevant_moods) ? folder.relevant_moods : [],
    relevant_songs: Array.isArray(folder.relevant_songs) ? folder.relevant_songs : []
  };
}

function directAssetPayload(songKeyValue, asset) {
  return {
    song_key: songKeyValue,
    asset_type: asset.asset_type || asset.type || 'image',
    file_name: asset.file_name || asset.filename || '',
    s3_key: asset.s3_key || asset.key || '',
    public_url: assetUrl(asset),
    thumbnail_url: asset.thumbnail_url || asset.thumbnailUrl || assetUrl(asset),
    content_type: asset.content_type || asset.contentType || '',
    size_bytes: asset.size_bytes || asset.sizeBytes || null,
    width: asset.width || null,
    height: asset.height || null,
    ratio_label: asset.ratio_label || asset.ratioLabel || '',
    caption: asset.caption || '',
    alt_text: asset.alt_text || asset.altText || '',
    notes: asset.notes || ''
  };
}

function deepRemap(value, folderMap, assetMap) {
  if (Array.isArray(value)) return value.map(item => deepRemap(item, folderMap, assetMap));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'folder_id' || key === 'folderId') && typeof child === 'string' && folderMap.has(child)) {
        output[key] = folderMap.get(child);
      } else {
        output[key] = deepRemap(child, folderMap, assetMap);
      }
    }
    return output;
  }
  if (typeof value === 'string') {
    if (folderMap.has(value)) return folderMap.get(value);
    if (assetMap.has(value)) return assetMap.get(value);
  }
  return value;
}

async function optionalRequest(url, options = {}) {
  try {
    return { ok: true, body: await request(url, options) };
  } catch (error) {
    if ([404, 405].includes(Number(error?.status || 0))) return { ok: false, skipped: true, error };
    return { ok: false, skipped: false, error };
  }
}

async function main() {
  const devToken = lambdaAdminToken(DEV_FUNCTION);
  const prodToken = lambdaAdminToken(PROD_FUNCTION);

  const [devSongsBody, prodSongsBody, devFoldersBody, prodFoldersBody] = await Promise.all([
    request(`${DEV}/radio/songs`),
    request(`${PROD}/radio/songs`),
    request(`${DEV}/radio/admin/visuals/folders`, { token: devToken }),
    request(`${PROD}/radio/admin/visuals/folders`, { token: prodToken })
  ]);

  const devSongs = listSongs(devSongsBody);
  const prodSongs = listSongs(prodSongsBody);
  const devFolders = listFolders(devFoldersBody);
  const prodFolders = listFolders(prodFoldersBody);
  report.dev_song_count = devSongs.length;
  report.prod_song_count = prodSongs.length;
  report.dev_folder_count = devFolders.length;
  report.prod_folder_count_before = prodFolders.length;

  const prodKeys = new Set(prodSongs.map(songKey).filter(Boolean).map(key => key.toLowerCase()));
  const folderMap = new Map();
  const assetMap = new Map();
  const prodFolderByIdentity = new Map(prodFolders.map(folder => [folderIdentity(folder), folder]));

  // 1. Reuse/update matching folders or create missing folders. Folder IDs cannot
  // be forced through the API, so preserve a DEV -> PROD folder ID map.
  for (const devFolder of devFolders) {
    const devId = String(devFolder.id || '').trim();
    if (!devId) continue;
    const identity = folderIdentity(devFolder);
    try {
      let prodFolder = prodFolderByIdentity.get(identity);
      if (prodFolder) {
        const prodId = String(prodFolder.id);
        await request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodId)}`, {
          method: 'PUT', token: prodToken, body: folderPayload(devFolder)
        });
        folderMap.set(devId, prodId);
        report.folders_reused.push({ dev_id: devId, prod_id: prodId, folder_name: devFolder.folder_name || '' });
      } else {
        const created = await request(`${PROD}/radio/admin/visuals/folders`, {
          method: 'POST', token: prodToken, body: folderPayload(devFolder)
        });
        prodFolder = created?.folder || created?.data?.folder || created?.data || null;
        const prodId = String(prodFolder?.id || '').trim();
        if (!prodId) throw new Error(`Folder create returned no id for ${devFolder.folder_name || devId}.`);
        folderMap.set(devId, prodId);
        prodFolderByIdentity.set(identity, prodFolder);
        report.folders_created.push({ dev_id: devId, prod_id: prodId, folder_name: devFolder.folder_name || '' });
      }
      await sleep(80);
    } catch (error) {
      report.folder_failures.push({ dev_folder_id: devId, folder_name: devFolder.folder_name || '', error: error.message });
    }
  }

  // 2. Copy folder assets. The folder-asset API accepts an explicit asset id, so
  // preserve DEV asset IDs whenever possible. If PROD already has the same URL,
  // map the DEV asset id to that existing PROD id instead of duplicating media.
  for (const devFolder of devFolders) {
    const devFolderId = String(devFolder.id || '').trim();
    const prodFolderId = folderMap.get(devFolderId);
    if (!devFolderId || !prodFolderId) continue;
    try {
      const [devAssetsBody, prodAssetsBody] = await Promise.all([
        request(`${DEV}/radio/admin/visuals/folders/${encodeURIComponent(devFolderId)}/assets`, { token: devToken }),
        request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodFolderId)}/assets`, { token: prodToken })
      ]);
      const devAssets = listAssets(devAssetsBody);
      const prodAssets = listAssets(prodAssetsBody);
      const prodById = new Map(prodAssets.map(asset => [assetId(asset), asset]).filter(([id]) => id));
      const prodByUrl = new Map(prodAssets.map(asset => [assetUrl(asset), asset]).filter(([url]) => url));
      report.folder_assets_examined += devAssets.length;

      for (const devAsset of devAssets) {
        const devAssetId = assetId(devAsset);
        const url = assetUrl(devAsset);
        if (!devAssetId || !url) continue;
        try {
          const sameId = prodById.get(devAssetId);
          const sameUrl = prodByUrl.get(url);
          if (sameId || sameUrl) {
            const prodAsset = sameId || sameUrl;
            assetMap.set(devAssetId, assetId(prodAsset));
            report.folder_assets_reused += 1;
            continue;
          }
          const created = await request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodFolderId)}/assets`, {
            method: 'POST', token: prodToken, body: { ...devAsset, id: devAssetId, folder_id: prodFolderId }
          });
          const prodAsset = created?.asset || created?.data?.asset || created?.data || null;
          const prodAssetId = assetId(prodAsset) || devAssetId;
          assetMap.set(devAssetId, prodAssetId);
          prodById.set(prodAssetId, prodAsset || { id: prodAssetId, public_url: url });
          prodByUrl.set(url, prodAsset || { id: prodAssetId, public_url: url });
          report.folder_assets_created += 1;
          await sleep(60);
        } catch (error) {
          report.folder_asset_failures.push({ dev_folder_id: devFolderId, prod_folder_id: prodFolderId, asset_id: devAssetId, public_url: url, error: error.message });
        }
      }
    } catch (error) {
      report.folder_asset_failures.push({ dev_folder_id: devFolderId, prod_folder_id: prodFolderId, asset_id: null, error: error.message });
    }
  }

  // 3. Copy Direct Only song assets. Their API generates a new UUID, so capture
  // a DEV -> PROD asset map by existing URL or newly created response.
  for (const song of devSongs) {
    const key = songKey(song);
    if (!key || !prodKeys.has(key.toLowerCase())) continue;
    const encoded = encodeURIComponent(key);
    try {
      const [devDirectBody, prodDirectBody] = await Promise.all([
        request(`${DEV}/radio/admin/vec/song-assets?song_key=${encoded}`, { token: devToken }),
        request(`${PROD}/radio/admin/vec/song-assets?song_key=${encoded}`, { token: prodToken })
      ]);
      const devDirect = listAssets(devDirectBody);
      const prodDirect = listAssets(prodDirectBody);
      const prodByUrl = new Map(prodDirect.map(asset => [assetUrl(asset), asset]).filter(([url]) => url));
      report.direct_assets_examined += devDirect.length;
      for (const devAsset of devDirect) {
        const devAssetId = assetId(devAsset);
        const url = assetUrl(devAsset);
        if (!devAssetId || !url) continue;
        try {
          const existing = prodByUrl.get(url);
          if (existing) {
            assetMap.set(devAssetId, assetId(existing));
            report.direct_assets_reused += 1;
            continue;
          }
          const created = await request(`${PROD}/radio/admin/vec/song-assets`, {
            method: 'POST', token: prodToken, body: directAssetPayload(key, devAsset)
          });
          const prodAsset = created?.asset || created?.data?.asset || created?.data || null;
          const prodAssetId = assetId(prodAsset);
          if (!prodAssetId) throw new Error(`Direct asset create returned no id for ${key} ${url}`);
          assetMap.set(devAssetId, prodAssetId);
          prodByUrl.set(url, prodAsset);
          report.direct_assets_created += 1;
          await sleep(60);
        } catch (error) {
          report.direct_asset_failures.push({ song_key: key, asset_id: devAssetId, public_url: url, error: error.message });
        }
      }
    } catch (error) {
      report.direct_asset_failures.push({ song_key: key, asset_id: null, error: error.message });
    }
  }

  // 4. Promote the canonical VEC recipe for every DEV song. Preserve PROD's
  // prepared artwork block while replacing DEV-controlled VEC behavior, and
  // remap folder/direct-asset IDs to their production counterparts.
  for (const song of devSongs) {
    const key = songKey(song);
    if (!key || !prodKeys.has(key.toLowerCase())) continue;
    const encoded = encodeURIComponent(key);
    try {
      const devRecipeBody = await request(`${DEV}/radio/vec/recipe?song_key=${encoded}`);
      const devRecipe = unwrapRecipe(devRecipeBody);
      if (!devRecipe) continue;
      report.recipes_found_in_dev += 1;

      let prodRecipe = {};
      try {
        prodRecipe = unwrapRecipe(await request(`${PROD}/radio/vec/recipe?song_key=${encoded}`)) || {};
      } catch {}

      const merged = { ...prodRecipe, ...devRecipe };
      if (prodRecipe.prepared_artwork_images && !devRecipe.prepared_artwork_images) merged.prepared_artwork_images = prodRecipe.prepared_artwork_images;
      if (prodRecipe.prepared_artwork_updated_at && !devRecipe.prepared_artwork_updated_at) merged.prepared_artwork_updated_at = prodRecipe.prepared_artwork_updated_at;
      const remapped = deepRemap(merged, folderMap, assetMap);

      await request(`${PROD}/radio/admin/vec/recipe`, {
        method: 'PUT', token: prodToken, body: { song_key: key, recipe: remapped }
      });
      report.recipes_saved_to_prod += 1;
      await sleep(80);
    } catch (error) {
      report.recipe_failures.push({ song_key: key, error: error.message });
    }
  }

  // 5. Also promote the older Visual Source Controller settings where that API
  // exists. This is supplemental; current V2 playback is recipe-driven, so a
  // missing legacy table/route is reported but does not fail the VEC promotion.
  for (const song of devSongs) {
    const key = songKey(song);
    if (!key || !prodKeys.has(key.toLowerCase())) continue;
    const encoded = encodeURIComponent(key);
    const devSettings = await optionalRequest(`${DEV}/radio/admin/songs/${encoded}/visual-settings`, { token: devToken, attempts: 3 });
    if (!devSettings.ok) {
      report.visual_settings_skipped += 1;
      if (!devSettings.skipped) report.visual_settings_failures.push({ song_key: key, side: 'dev-read', error: devSettings.error.message });
      continue;
    }
    const remapped = deepRemap(devSettings.body, folderMap, assetMap);
    const save = await optionalRequest(`${PROD}/radio/admin/songs/${encoded}/visual-settings`, {
      method: 'PUT', token: prodToken, body: remapped, attempts: 3
    });
    if (save.ok) report.visual_settings_saved += 1;
    else {
      report.visual_settings_skipped += 1;
      if (!save.skipped) report.visual_settings_failures.push({ song_key: key, side: 'prod-write', error: save.error.message });
    }
    await sleep(40);
  }

  // 6. Verification: folder counts and a deterministic sample of DEV recipes.
  const prodFoldersAfter = listFolders(await request(`${PROD}/radio/admin/visuals/folders`, { token: prodToken }));
  const sampleKeys = devSongs.map(songKey).filter(Boolean).slice(0, 12);
  const samples = [];
  for (const key of sampleKeys) {
    const encoded = encodeURIComponent(key);
    try {
      const body = await request(`${PROD}/radio/vec/recipe?song_key=${encoded}`);
      const recipe = unwrapRecipe(body);
      samples.push({
        song_key: key,
        found: Boolean(recipe),
        visual_mode: recipe?.visual_mode || '',
        folder_count: Array.isArray(recipe?.folders) ? recipe.folders.length : 0,
        direct_clip_count: Array.isArray(recipe?.song_assets?.active_clip_ids) ? recipe.song_assets.active_clip_ids.length : 0,
        prepared_artwork_count: recipe?.prepared_artwork_images ? Object.keys(recipe.prepared_artwork_images).filter(k => recipe.prepared_artwork_images[k]).length : 0
      });
    } catch (error) {
      samples.push({ song_key: key, error: error.message });
    }
  }
  report.verification = {
    prod_folder_count_after: prodFoldersAfter.length,
    expected_dev_folder_count: devFolders.length,
    folder_map_count: folderMap.size,
    asset_map_count: assetMap.size,
    sample_recipes: samples
  };
}

try {
  await main();
} catch (error) {
  report.fatal_error = error?.stack || error?.message || String(error);
} finally {
  writeReport();
  console.log(JSON.stringify(report, null, 2));
}

if (!report.ok) process.exit(2);
