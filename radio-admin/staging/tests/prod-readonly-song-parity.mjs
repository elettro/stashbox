import fs from 'node:fs/promises';

const DEV_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_BASE = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const endpoints = {
  devPublic: `${DEV_BASE}/radio/songs`,
  prodPublic: `${PROD_BASE}/radio/songs`,
  devAdmin: `${DEV_BASE}/admin/songs`,
  prodAdmin: `${PROD_BASE}/admin/songs`
};

const startedAt = new Date().toISOString();
const requests = [];

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['songs', 'items', 'rows', 'data', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function songKey(song) {
  return String(song?.song_key || song?.songKey || song?.key || song?.slug || song?.id || '').trim();
}

function coverage(list, fields) {
  const total = list.length || 1;
  return Object.fromEntries(fields.map(field => [field, {
    present: list.filter(song => song?.[field] !== undefined && song?.[field] !== null && song?.[field] !== '').length,
    percent: Number((100 * list.filter(song => song?.[field] !== undefined && song?.[field] !== null && song?.[field] !== '').length / total).toFixed(1))
  }]));
}

async function readonlyGet(name, url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'follow'
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  requests.push({ name, method: 'GET', url, status: response.status, ok: response.ok });
  return { status: response.status, ok: response.ok, body, text };
}

const [devPublic, prodPublic, devAdmin, prodAdmin] = await Promise.all([
  readonlyGet('devPublic', endpoints.devPublic),
  readonlyGet('prodPublic', endpoints.prodPublic),
  readonlyGet('devAdminUnauthenticated', endpoints.devAdmin),
  readonlyGet('prodAdminUnauthenticated', endpoints.prodAdmin)
]);

if (!devPublic.ok) throw new Error(`DEV public song catalog failed: ${devPublic.status}`);
if (!prodPublic.ok) throw new Error(`PROD public song catalog failed: ${prodPublic.status}`);

const devSongs = rows(devPublic.body);
const prodSongs = rows(prodPublic.body);
if (!devSongs.length) throw new Error('DEV public song catalog returned zero songs.');
if (!prodSongs.length) throw new Error('PROD public song catalog returned zero songs.');

const devKeys = new Set(devSongs.map(songKey).filter(Boolean));
const prodKeys = new Set(prodSongs.map(songKey).filter(Boolean));
const devOnly = [...devKeys].filter(key => !prodKeys.has(key)).sort();
const prodOnly = [...prodKeys].filter(key => !devKeys.has(key)).sort();
const shared = [...prodKeys].filter(key => devKeys.has(key)).sort();

const requiredPlayerAliases = {
  identity: ['song_key', 'songKey', 'key', 'slug', 'id'],
  title: ['display_title', 'song_name', 'title'],
  artist: ['artist', 'artist_name'],
  playableMedia: ['audio_url', 'audioUrl', 'audio_stream_url', 'stream_url', 'mp3_url', 'video_link', 'video_url']
};

function missingAliasGroups(list) {
  return list.map((song, index) => ({
    index,
    song_key: songKey(song),
    missing: Object.entries(requiredPlayerAliases)
      .filter(([, aliases]) => !aliases.some(alias => song?.[alias] !== undefined && song?.[alias] !== null && song?.[alias] !== ''))
      .map(([group]) => group)
  })).filter(row => row.missing.length);
}

const modernFields = [
  'song_key', 'song_name', 'display_title', 'artist', 'album_name', 'genre',
  'audio_url', 'audio_stream_url', 'video_link', 'song_artwork_url',
  'enhanced_visuals_enabled', 'shuffle_visuals', 'visual_still_duration_seconds',
  'visual_assets', 'public_visibility', 'featured', 'explicit', 'live_recording',
  'spotify_url', 'apple_music_url', 'youtube_music_url', 'official_song_page_url',
  'shop_url', 'mood_tags', 'public_track_note', 'show_public_note'
];

const report = {
  phase: 'Phase 4 PROD read-only validation',
  startedAt,
  completedAt: new Date().toISOString(),
  safety: {
    methodsUsed: [...new Set(requests.map(request => request.method))],
    adminTokenUsed: false,
    writesAttempted: false
  },
  requests,
  endpointStatus: {
    devPublic: devPublic.status,
    prodPublic: prodPublic.status,
    devAdminUnauthenticated: devAdmin.status,
    prodAdminUnauthenticated: prodAdmin.status
  },
  catalog: {
    devCount: devSongs.length,
    prodCount: prodSongs.length,
    sharedCount: shared.length,
    devOnlyCount: devOnly.length,
    prodOnlyCount: prodOnly.length,
    devOnly,
    prodOnly,
    sharedSample: shared.slice(0, 25)
  },
  productionContract: {
    missingRequiredAliasGroups: missingAliasGroups(prodSongs),
    fieldCoverage: coverage(prodSongs, modernFields)
  },
  devContract: {
    missingRequiredAliasGroups: missingAliasGroups(devSongs),
    fieldCoverage: coverage(devSongs, modernFields)
  },
  conclusion: null
};

const prodMissing = report.productionContract.missingRequiredAliasGroups;
if (prodMissing.length) {
  report.conclusion = 'BLOCKED: production public catalog contains songs missing player-required identity/title/artist/media aliases.';
} else if (devOnly.length || prodOnly.length) {
  report.conclusion = 'STRUCTURALLY COMPATIBLE BUT CATALOGS DIFFER: production can be the canonical source, but DEV-only/PROD-only song differences must be intentionally resolved before player cutover.';
} else {
  report.conclusion = 'STRUCTURALLY COMPATIBLE AND CATALOG KEYS MATCH: production public catalog is a viable canonical read source for both players.';
}

await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/phase4-prod-readonly-song-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (report.safety.methodsUsed.some(method => method !== 'GET')) throw new Error('Safety violation: non-GET request detected.');
if (prodMissing.length) process.exitCode = 2;
