import process from 'node:process';

const API = process.env.VEC_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const ORIGIN = process.env.VEC_ORIGIN || 'https://stashbox.com';
const CONCURRENCY = Math.max(1, Number(process.env.ARTWORK_AUDIT_CONCURRENCY || 8));

function clean(value) {
  return String(value ?? '').trim();
}

function unwrap(value) {
  if (typeof value?.body === 'string') {
    try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
  }
  return value;
}

function rows(value) {
  value = unwrap(value);
  if (Array.isArray(value)) return value;
  for (const key of ['songs', 'items', 'data']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function exact9x16(payload) {
  const data = unwrap(payload) || {};
  const media = data.media || data.data?.media || data.data || data;
  const images = media?.artwork_images && typeof media.artwork_images === 'object'
    ? media.artwork_images
    : (media?.images && typeof media.images === 'object' ? media.images : {});
  const resolved = media?.resolved_artwork?.['9x16'] || data?.resolved_artwork?.['9x16'] || {};
  const resolvedExact = clean(resolved?.source_ratio) === '9x16' ? resolved?.url : '';
  return clean(
    images['9x16'] ||
    media?.song_artwork_9x16_url ||
    data?.song_artwork_9x16_url ||
    resolvedExact
  );
}

async function getJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Origin: ORIGIN },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const allowOrigin = clean(response.headers.get('access-control-allow-origin'));
  if (!allowOrigin) throw new Error('Missing Access-Control-Allow-Origin');
  return body;
}

async function probeImage(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      Origin: ORIGIN,
      Range: 'bytes=0-1023',
    },
  });
  const ok = response.ok || response.status === 206;
  const contentType = clean(response.headers.get('content-type')).toLowerCase();
  const extensionLooksLikeImage = /\.(png|jpe?g|webp)(?:$|[?#])/i.test(response.url || url);
  if (!ok) throw new Error(`Artwork URL returned HTTP ${response.status}`);
  if (!contentType.startsWith('image/') && !extensionLooksLikeImage) {
    throw new Error(`Artwork URL returned ${contentType || 'an unknown content type'}`);
  }
  return {
    status: response.status,
    contentType,
    finalUrl: response.url,
  };
}

async function auditSong(song) {
  const songKey = clean(song?.song_key || song?.songKey || song?.key || song?.id);
  const title = clean(song?.display_title || song?.song_name || song?.title || songKey);
  if (!songKey) return { songKey, title, ok: false, error: 'Missing song key' };

  try {
    const payload = await getJson(`${API}/radio/songs/${encodeURIComponent(songKey)}/artwork-images`);
    const url = exact9x16(payload);
    if (!url) throw new Error('Canonical artwork payload has no exact 9x16 URL');
    const probe = await probeImage(url);
    return { songKey, title, ok: true, url, probe };
  } catch (error) {
    return { songKey, title, ok: false, error: error?.message || String(error) };
  }
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

const catalog = await getJson(`${API}/radio/songs?artwork_audit=${Date.now()}`);
const songs = rows(catalog).filter(song => clean(song?.song_key || song?.songKey || song?.key || song?.id));
if (!songs.length) throw new Error('Live song catalog returned no songs.');

const results = await mapLimit(songs, CONCURRENCY, auditSong);
const failures = results.filter(result => !result.ok);

console.log(`Exact 9x16 artwork audit: ${results.length - failures.length}/${results.length} songs passed.`);
for (const failure of failures) {
  console.error(`FAIL ${failure.songKey} | ${failure.title} | ${failure.error}`);
}

if (failures.length) process.exitCode = 1;
