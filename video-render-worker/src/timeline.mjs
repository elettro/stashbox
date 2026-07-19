import crypto from 'node:crypto';

function stringValue(value) {
  return String(value || '').trim();
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function hashSeed(seed) {
  const digest = crypto.createHash('sha256').update(String(seed || 'stashbox-video-factory')).digest();
  return digest.readUInt32LE(0);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seed) {
  const result = [...items];
  const random = mulberry32(hashSeed(seed));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function normalizeRenderAsset(asset, index = 0) {
  const type = ['clip', 'video'].includes(String(asset?.type || asset?.asset_type || asset?.media_type || '').toLowerCase())
    ? 'clip'
    : 'image';
  const url = stringValue(asset?.url || asset?.public_url || asset?.src);
  if (!url) return null;

  return {
    asset_id: stringValue(asset?.id || asset?.asset_id) || `asset-${index + 1}`,
    type,
    url,
    source: stringValue(asset?.source || asset?.folder_name || asset?.folder_id) || 'vec',
    file_name: stringValue(asset?.file_name || asset?.filename),
    created_at: stringValue(asset?.created_at),
    manual_order: Number.isFinite(Number(asset?.manual_order)) ? Number(asset.manual_order) : null
  };
}

function orderedPool(assets, orderMode, seed, cycle) {
  if (orderMode === 'newest_first') {
    return [...assets].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  }
  if (orderMode === 'manual') {
    return [...assets].sort((left, right) => Number(left.manual_order ?? 999999) - Number(right.manual_order ?? 999999));
  }
  return seededShuffle(assets, `${seed}:cycle:${cycle}`);
}

function avoidImmediateRepeat(pool, previousId) {
  if (pool.length < 2 || !previousId || pool[0].asset_id !== previousId) return pool;
  const result = [...pool];
  [result[0], result[1]] = [result[1], result[0]];
  return result;
}

export function buildRenderTimeline(options = {}) {
  const totalDuration = positiveNumber(options.total_duration_seconds, 30);
  const segmentDuration = positiveNumber(options.segment_duration_seconds, 8);
  const orderMode = ['random', 'manual', 'newest_first'].includes(String(options.order_mode || '').toLowerCase())
    ? String(options.order_mode).toLowerCase()
    : 'random';
  const seed = stringValue(options.seed) || 'stashbox-video-factory';
  const assets = (Array.isArray(options.assets) ? options.assets : [])
    .map(normalizeRenderAsset)
    .filter(Boolean);

  if (!assets.length) {
    const artworkUrl = stringValue(options.artwork_url);
    assets.push({
      asset_id: artworkUrl ? 'song-artwork' : 'branded-black-fallback',
      type: artworkUrl ? 'image' : 'color',
      url: artworkUrl,
      source: artworkUrl ? 'song-artwork' : 'fallback',
      file_name: '',
      created_at: '',
      manual_order: null
    });
  }

  const timeline = [];
  let currentTime = 0;
  let cycle = 0;
  let previousId = '';

  while (currentTime < totalDuration - 0.001) {
    let pool = orderedPool(assets, orderMode, seed, cycle);
    pool = avoidImmediateRepeat(pool, previousId);

    for (const asset of pool) {
      if (currentTime >= totalDuration - 0.001) break;
      const duration = Math.min(segmentDuration, totalDuration - currentTime);
      timeline.push({
        index: timeline.length,
        asset_id: asset.asset_id,
        type: asset.type,
        url: asset.url,
        source: asset.source,
        start_seconds: Math.round(currentTime * 1000) / 1000,
        duration_seconds: Math.round(duration * 1000) / 1000,
        end_seconds: Math.round((currentTime + duration) * 1000) / 1000
      });
      currentTime += duration;
      previousId = asset.asset_id;
    }
    cycle += 1;
  }

  return timeline;
}
