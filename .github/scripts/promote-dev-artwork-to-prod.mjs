import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEV = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION = 'us-east-1';
const DEV_FUNCTION = 'stashbox-radio-api-dev-v2';
const PROD_FUNCTION = 'stashbox-radio-api-prod-v2';
const REPORT_PATH = 'radio/docs/diagnostics/DEV_TO_PROD_ARTWORK_PROMOTION_LATEST.json';
const artworkFields = [
  'song_artwork_url',
  'song_artwork_16x9_url',
  'song_artwork_9x16_url',
  'song_artwork_3x4_url',
  'song_artwork_4x5_url',
  'song_artwork_21x9_url'
];

fs.mkdirSync('radio/docs/diagnostics', { recursive: true });

const report = {
  started_at: new Date().toISOString(),
  source: 'radio_dev via TRUE DEV API',
  target: 'radio via PROD v2 API',
  policy: 'content-only; create missing songs; copy canonical artwork; never delete production songs or touch analytics/users',
  dev_song_count: 0,
  prod_song_count_before: 0,
  created_missing_songs: [],
  song_create_failures: [],
  artwork_songs_examined: 0,
  artwork_songs_with_any: 0,
  artwork_complete_six_in_dev: 0,
  artwork_patched: [],
  artwork_failures: [],
  ratio_source_counts: Object.fromEntries(artworkFields.map(field => [field, 0])),
  fatal_error: null
};

function writeReport() {
  report.finished_at = new Date().toISOString();
  report.ok = !report.fatal_error && report.song_create_failures.length === 0 && report.artwork_failures.length === 0;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
}

function lambdaAdminToken(functionName) {
  const raw = execFileSync('aws', [
    'lambda', 'get-function-configuration',
    '--function-name', functionName,
    '--region', REGION,
    '--output', 'json'
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const body = JSON.parse(raw);
  const vars = body?.Environment?.Variables || {};
  const token = String(vars.ADMIN_TOKEN || vars.RADIO_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error(`No ADMIN_TOKEN or RADIO_ADMIN_TOKEN is configured on ${functionName}.`);
  return token;
}

async function request(url, { method = 'GET', token = '', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers['x-admin-token'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${method} ${url} -> HTTP ${response.status}: ${data.error || data.message || text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function listSongs(body) {
  if (Array.isArray(body)) return body;
  return body?.songs || body?.items || body?.data || [];
}

function songKey(song) {
  return String(song?.song_key || song?.songKey || '').trim();
}

function patchFromMedia(media) {
  const images = media?.artwork_images || {};
  return {
    song_artwork_url: media?.song_artwork_url || media?.song_artwork_1x1_url || images['1x1'] || '',
    song_artwork_16x9_url: media?.song_artwork_16x9_url || images['16x9'] || '',
    song_artwork_9x16_url: media?.song_artwork_9x16_url || images['9x16'] || '',
    song_artwork_3x4_url: media?.song_artwork_3x4_url || images['3x4'] || '',
    song_artwork_4x5_url: media?.song_artwork_4x5_url || images['4x5'] || '',
    song_artwork_21x9_url: media?.song_artwork_21x9_url || images['21x9'] || ''
  };
}

async function main() {
  const devToken = lambdaAdminToken(DEV_FUNCTION);
  const prodToken = lambdaAdminToken(PROD_FUNCTION);

  const [devSongsBody, prodSongsBody] = await Promise.all([
    request(`${DEV}/admin/songs`, { token: devToken }),
    request(`${PROD}/admin/songs`, { token: prodToken })
  ]);
  const devSongs = listSongs(devSongsBody);
  const prodSongs = listSongs(prodSongsBody);
  report.dev_song_count = devSongs.length;
  report.prod_song_count_before = prodSongs.length;

  const prodKeys = new Set(prodSongs.map(songKey).filter(Boolean).map(key => key.toLowerCase()));

  for (const song of devSongs) {
    const key = songKey(song);
    if (!key || prodKeys.has(key.toLowerCase())) continue;
    try {
      await request(`${PROD}/admin/songs`, { method: 'POST', token: prodToken, body: song });
      report.created_missing_songs.push(key);
      prodKeys.add(key.toLowerCase());
    } catch (error) {
      report.song_create_failures.push({ song_key: key, error: error.message });
    }
  }

  for (const song of devSongs) {
    const key = songKey(song);
    if (!key || !prodKeys.has(key.toLowerCase())) continue;
    report.artwork_songs_examined += 1;
    const encoded = encodeURIComponent(key);
    try {
      const devArtwork = await request(`${DEV}/radio/admin/songs/${encoded}/artwork-images`, { token: devToken });
      const patch = patchFromMedia(devArtwork?.media || {});
      const present = artworkFields.filter(field => String(patch[field] || '').trim());
      if (!present.length) continue;
      report.artwork_songs_with_any += 1;
      if (present.length === 6) report.artwork_complete_six_in_dev += 1;
      present.forEach(field => { report.ratio_source_counts[field] += 1; });

      // Never clear a PROD ratio when DEV has no source for that ratio.
      const body = Object.fromEntries(present.map(field => [field, patch[field]]));
      const saved = await request(`${PROD}/radio/admin/songs/${encoded}/artwork-images`, {
        method: 'PATCH', token: prodToken, body
      });
      const prodImages = saved?.media?.artwork_images || {};
      report.artwork_patched.push({
        song_key: key,
        ratios_copied: present.length,
        complete_six_source: present.length === 6,
        prod_completion: saved?.media?.completion || null,
        prod_ratios_present: Object.values(prodImages).filter(Boolean).length
      });
    } catch (error) {
      report.artwork_failures.push({ song_key: key, error: error.message });
    }
  }
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
