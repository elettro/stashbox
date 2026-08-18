import { spawnSync } from 'node:child_process';

const API = process.env.VEC_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const SONG_TITLE = process.env.DESKTOP_HEALTH_SONG_TITLE || 'Freedom Street';
const ORIGIN = process.env.V2_ORIGIN || 'https://stashbox.com';
const MAX_ASSETS = Number(process.env.VEC_ASSET_PROBE_COUNT || 5);

const clean = value => String(value ?? '').trim();
const unwrap = value => {
  if (typeof value?.body === 'string') {
    try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
  }
  return value;
};
const rows = (value, keys = ['assets', 'items', 'data']) => {
  value = unwrap(value);
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  if (value?.data && value.data !== value) return rows(value.data, keys);
  return [];
};
async function json(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Origin: ORIGIN } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return unwrap(body);
}
function recipeFrom(body) {
  body = unwrap(body) || {};
  return body.recipe || body.vec_recipe || body.data?.recipe || body.data || body;
}
function assetUrl(asset) {
  return clean(asset?.public_url || asset?.url || asset?.asset_url || asset?.src || asset?.file_url || asset?.s3_url || asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '');
}
function assetType(asset) {
  const type = clean(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.mime_type || asset?.kind).toLowerCase();
  const url = assetUrl(asset);
  return type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url) ? 'video' : 'image';
}
function folders(recipe) {
  const groups = [recipe?.folders, recipe?.approved_folders, recipe?.approvedFolders, recipe?.selected_folders, recipe?.selectedFolders, recipe?.visual_folders, recipe?.visualFolders, recipe?.folder_sources, recipe?.folderSources, recipe?.sources?.folders];
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    const items = Array.isArray(group) ? group : Array.isArray(group?.items) ? group.items : [];
    for (const folder of items) {
      if (!folder || folder.enabled === false) continue;
      const id = clean(folder.folder_id || folder.visual_folder_id || folder.folderId || folder.id || folder.key);
      if (id && !seen.has(id)) { seen.add(id); out.push(id); }
    }
  }
  return out;
}
async function probeUrl(url) {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { Origin: ORIGIN } }).catch(error => ({ error }));
  const range = await fetch(url, { headers: { Range: 'bytes=0-1048575', Origin: ORIGIN }, redirect: 'follow' }).catch(error => ({ error }));
  const headers = response => response?.headers ? {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    contentLength: response.headers.get('content-length') || '',
    acceptRanges: response.headers.get('accept-ranges') || '',
    contentRange: response.headers.get('content-range') || '',
    allowOrigin: response.headers.get('access-control-allow-origin') || '',
  } : { error: response?.error?.message || 'request failed' };
  let rangeBytes = 0;
  if (range?.arrayBuffer) {
    try { rangeBytes = (await range.arrayBuffer()).byteLength; } catch (_) {}
  }
  const ffprobe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,codec_long_name,profile,pix_fmt,width,height,r_frame_rate', '-of', 'json', url], { encoding: 'utf8', timeout: 30000 });
  let codec = null;
  try { codec = JSON.parse(ffprobe.stdout || '{}'); } catch (_) { codec = { raw: ffprobe.stdout || '' }; }
  return {
    url,
    head: headers(head),
    range: { ...headers(range), bytesRead: rangeBytes },
    ffprobe: {
      status: ffprobe.status,
      signal: ffprobe.signal,
      error: ffprobe.error?.message || '',
      stderr: clean(ffprobe.stderr).slice(0, 800),
      codec,
    },
  };
}

const catalog = rows(await json(`${API}/radio/songs`), ['songs', 'items', 'data']);
const song = catalog.find(item => clean(item.display_title || item.song_name || item.title).toLowerCase().includes(SONG_TITLE.toLowerCase())) || catalog[0];
if (!song) throw new Error('No song found');
const key = clean(song.song_key || song.songKey || song.id || song.key);
const recipe = recipeFrom(await json(`${API}/radio/vec/recipe?song_key=${encodeURIComponent(key)}`));
const assets = [];
const direct = rows(await json(`${API}/radio/vec/song-assets?song_key=${encodeURIComponent(key)}`));
assets.push(...direct);
for (const id of folders(recipe)) {
  try { assets.push(...rows(await json(`${API}/radio/visuals/folders/${encodeURIComponent(id)}/assets`))); } catch (_) {}
}
const unique = [];
const seen = new Set();
for (const asset of assets) {
  const url = assetUrl(asset);
  if (!url || seen.has(url)) continue;
  seen.add(url);
  unique.push({ url, type: assetType(asset), id: clean(asset.id || asset.asset_id || asset.key || url) });
}
const selected = unique.filter(asset => asset.type === 'video').slice(0, MAX_ASSETS);
if (!selected.length) selected.push(...unique.slice(0, MAX_ASSETS));
const probes = [];
for (const asset of selected) probes.push({ asset, delivery: await probeUrl(asset.url) });
const summary = {
  generatedAt: new Date().toISOString(),
  songKey: key,
  songTitle: clean(song.display_title || song.song_name || song.title),
  folderCount: folders(recipe).length,
  uniqueAssetCount: unique.length,
  videoCount: unique.filter(asset => asset.type === 'video').length,
  imageCount: unique.filter(asset => asset.type === 'image').length,
  probes,
};
console.log(JSON.stringify(summary, null, 2));
