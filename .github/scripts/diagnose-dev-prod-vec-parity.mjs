import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEV = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION = 'us-east-1';
const FUNCTIONS = {
  dev: 'stashbox-radio-api-dev-v2',
  prod: 'stashbox-radio-api-prod-v2'
};
const OUT = 'radio/docs/diagnostics/DEV_PROD_VEC_PARITY_LATEST.json';
fs.mkdirSync('radio/docs/diagnostics', { recursive: true });

function adminToken(functionName) {
  const raw = execFileSync('aws', [
    'lambda','get-function-configuration','--function-name',functionName,'--region',REGION,'--output','json'
  ], { encoding: 'utf8' });
  const vars = JSON.parse(raw)?.Environment?.Variables || {};
  return String(vars.ADMIN_TOKEN || vars.RADIO_ADMIN_TOKEN || '').trim();
}

async function req(url, token = '') {
  const headers = { Accept: 'application/json' };
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0,1000) }; }
  return { status: res.status, ok: res.ok, body };
}

function list(body, keys = []) {
  if (Array.isArray(body)) return body;
  for (const key of keys) if (Array.isArray(body?.[key])) return body[key];
  if (Array.isArray(body?.data)) return body.data;
  return [];
}
function key(song) { return String(song?.song_key || song?.songKey || song?.id || '').trim(); }
function assets(body) { return list(body, ['assets','items','results']); }
function type(asset) {
  const value = String(asset?.asset_type || asset?.type || asset?.media_type || asset?.content_type || asset?.kind || '').toLowerCase();
  const url = String(asset?.public_url || asset?.url || asset?.asset_url || asset?.media_url || asset?.file_url || asset?.src || '');
  return value.includes('clip') || value.includes('video') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url) ? 'video' : 'image';
}

const result = { started_at: new Date().toISOString(), environments: {}, samples: [], fatal_error: null };
try {
  const tokens = { dev: adminToken(FUNCTIONS.dev), prod: adminToken(FUNCTIONS.prod) };
  for (const [env, base] of Object.entries({ dev: DEV, prod: PROD })) {
    const songsRes = await req(`${base}/radio/songs`);
    const songs = list(songsRes.body, ['songs','items']);
    const foldersPublic = await req(`${base}/radio/visuals/folders`);
    const foldersAdmin = await req(`${base}/radio/admin/visuals/folders`, tokens[env]);
    const foldersAdminAlt = await req(`${base}/admin/visuals/folders`, tokens[env]);
    result.environments[env] = {
      songs_status: songsRes.status,
      songs_count: songs.length,
      folders_public_status: foldersPublic.status,
      folders_public_shape: Array.isArray(foldersPublic.body) ? 'array' : Object.keys(foldersPublic.body || {}).slice(0,20),
      folders_public_count: list(foldersPublic.body, ['folders','items','results']).length,
      folders_admin_status: foldersAdmin.status,
      folders_admin_shape: Array.isArray(foldersAdmin.body) ? 'array' : Object.keys(foldersAdmin.body || {}).slice(0,20),
      folders_admin_count: list(foldersAdmin.body, ['folders','items','results']).length,
      folders_admin_alt_status: foldersAdminAlt.status,
      folders_admin_alt_shape: Array.isArray(foldersAdminAlt.body) ? 'array' : Object.keys(foldersAdminAlt.body || {}).slice(0,20),
      folders_admin_alt_count: list(foldersAdminAlt.body, ['folders','items','results']).length,
      sample_song_keys: songs.slice(0,5).map(key)
    };
  }

  const devSongs = list((await req(`${DEV}/radio/songs`)).body, ['songs','items']);
  const prodSongs = list((await req(`${PROD}/radio/songs`)).body, ['songs','items']);
  const prodSet = new Set(prodSongs.map(key).map(v => v.toLowerCase()));
  const common = devSongs.filter(s => prodSet.has(key(s).toLowerCase()));
  for (const song of common.slice(0,12)) {
    const songKey = key(song);
    if (!songKey) continue;
    const encoded = encodeURIComponent(songKey);
    const sample = { song_key: songKey };
    for (const [env, base] of Object.entries({ dev: DEV, prod: PROD })) {
      const recipe = await req(`${base}/radio/vec/recipe?song_key=${encoded}`);
      const songAssets = await req(`${base}/radio/vec/song-assets?song_key=${encoded}`);
      const rows = assets(songAssets.body);
      sample[env] = {
        recipe_status: recipe.status,
        recipe_keys: Object.keys(recipe.body || {}).slice(0,20),
        recipe: recipe.body,
        assets_status: songAssets.status,
        asset_count: rows.length,
        video_count: rows.filter(a => type(a) === 'video').length,
        image_count: rows.filter(a => type(a) === 'image').length,
        sample_assets: rows.slice(0,3).map(a => ({
          id: a.id || a.asset_id || '',
          type: type(a),
          url: a.public_url || a.url || a.asset_url || a.media_url || ''
        }))
      };
    }
    result.samples.push(sample);
  }
  result.finished_at = new Date().toISOString();
} catch (error) {
  result.fatal_error = error?.stack || error?.message || String(error);
  result.finished_at = new Date().toISOString();
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.fatal_error) process.exit(2);
