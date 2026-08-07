import process from 'node:process';

const API = process.env.VEC_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const SONG_KEY = process.env.VEC_SONG_KEY || 'freedom-street-002b-stashbox';
const ORIGIN = process.env.VEC_ORIGIN || 'https://stashbox.com';

async function json(url) {
  const response = await fetch(url, { headers: { Origin: ORIGIN }, cache: 'no-store' });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 300)}`);
  return { body, allowOrigin: response.headers.get('access-control-allow-origin') || '' };
}

function rows(value, names = ['assets', 'items', 'data']) {
  if (typeof value?.body === 'string') {
    try { value = JSON.parse(value.body); } catch (_) {}
  }
  if (Array.isArray(value)) return value;
  for (const name of names) if (Array.isArray(value?.[name])) return value[name];
  return [];
}

function clean(value) { return String(value ?? '').trim(); }
function id(asset) { return clean(asset?.id || asset?.asset_id || asset?.assetId || asset?.s3_key || asset?.key); }
function candidates(asset) {
  return [
    ['public_url', asset?.public_url],
    ['url', asset?.url],
    ['asset_url', asset?.asset_url],
    ['src', asset?.src],
    ['file_url', asset?.file_url],
    ['video_url', asset?.video_url],
    ['clip_url', asset?.clip_url],
    ['media_url', asset?.media_url],
    ['source_url', asset?.source_url],
    ['preview_url', asset?.preview_url],
    ['cloudfront_url', asset?.cloudfront_url],
    ['s3_url', asset?.s3_url],
  ].map(([field, value]) => ({ field, value: clean(value) })).filter(item => item.value);
}

async function probeMedia(url) {
  if (!/^https?:\/\//i.test(url)) return { url, ok: false, reason: 'not-http' };
  try {
    const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1', Origin: ORIGIN }, redirect: 'follow' });
    return {
      url,
      ok: response.ok || response.status === 206,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      contentLength: response.headers.get('content-length') || '',
      acceptRanges: response.headers.get('accept-ranges') || '',
      allowOrigin: response.headers.get('access-control-allow-origin') || '',
      finalUrl: response.url,
    };
  } catch (error) {
    return { url, ok: false, reason: error?.message || String(error) };
  }
}

const recipeResponse = await json(`${API}/radio/vec/recipe?song_key=${encodeURIComponent(SONG_KEY)}`);
const recipe = recipeResponse.body?.recipe || recipeResponse.body?.data?.recipe || recipeResponse.body?.data || recipeResponse.body || {};
const folderRecipes = Array.isArray(recipe.folders) ? recipe.folders.filter(folder => folder?.enabled !== false) : [];
const selected = [];

for (const folder of folderRecipes) {
  const folderId = clean(folder.folder_id || folder.id || folder.key);
  const response = await json(`${API}/radio/visuals/folders/${encodeURIComponent(folderId)}/assets`);
  const assets = rows(response.body);
  const active = new Set(Array.isArray(folder.active_clip_ids) ? folder.active_clip_ids.map(clean) : []);
  console.log(`\nFOLDER ${folderId} CORS=${response.allowOrigin} ASSETS=${assets.length} SELECTED=${active.size}`);
  for (const asset of assets) {
    if (active.size && !active.has(id(asset))) continue;
    const choices = candidates(asset);
    const preferred = choices.find(item => /^https?:\/\//i.test(item.value)) || choices[0] || null;
    const probe = preferred ? await probeMedia(preferred.value) : { ok: false, reason: 'no-url' };
    const item = {
      folderId,
      id: id(asset),
      type: clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.mime_type || asset?.content_type),
      filename: clean(asset?.filename || asset?.file_name || asset?.name || asset?.title),
      choices,
      preferred,
      probe,
    };
    selected.push(item);
    console.log(JSON.stringify(item));
  }
}

const usable = selected.filter(item => item.probe?.ok && /^video\//i.test(item.probe?.contentType || ''));
console.log(`\nSUMMARY selected=${selected.length} usableVideoResponses=${usable.length}`);
if (!selected.length || !usable.length) process.exitCode = 1;
