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

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function buildArtworkAnchors(totalDuration, artworkUrl, rules = {}, segmentDuration = 8) {
  if (!artworkUrl) return [];

  const startDuration = rules.start_with_artwork
    ? Math.min(totalDuration, Math.max(0, Number(rules.start_duration_seconds || 0) || 0))
    : 0;
  const endDuration = rules.end_with_artwork
    ? Math.min(totalDuration, Math.max(0, Number(rules.end_duration_seconds || 0) || 0))
    : 0;
  const endStart = Math.max(0, totalDuration - endDuration);
  const anchors = [];

  if (startDuration > 0) {
    anchors.push({ start: 0, end: startDuration, kind: 'start' });
  }

  const repeatEvery = Math.max(0, Number(rules.repeat_every_seconds || 0) || 0);
  if (rules.re_present_artwork && repeatEvery > 0) {
    const repeatDuration = startDuration > 0 ? startDuration : Math.min(segmentDuration, 4);
    for (let start = repeatEvery; start < endStart - 0.001; start += repeatEvery) {
      if (start < startDuration - 0.001) continue;
      if (start + repeatDuration > endStart + 0.001) break;
      anchors.push({ start, end: start + repeatDuration, kind: 'repeat' });
    }
  }

  if (endDuration > 0) {
    anchors.push({ start: endStart, end: totalDuration, kind: 'end' });
  }

  const merged = [];
  for (const anchor of anchors.sort((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last && anchor.start <= last.end + 0.001) {
      last.end = Math.max(last.end, anchor.end);
      last.kind = `${last.kind}+${anchor.kind}`;
    } else {
      merged.push({ ...anchor });
    }
  }
  return merged;
}

export function buildRenderTimeline(options = {}) {
  const totalDuration = positiveNumber(options.total_duration_seconds, 30);
  const segmentDuration = positiveNumber(options.segment_duration_seconds, 8);
  const orderMode = ['random', 'manual', 'newest_first'].includes(String(options.order_mode || '').toLowerCase())
    ? String(options.order_mode).toLowerCase()
    : 'random';
  const seed = stringValue(options.seed) || 'stashbox-video-factory';
  const artworkUrl = stringValue(options.artwork_url);
  const rawAssets = Array.isArray(options.assets) ? options.assets : [];
  const embeddedArtworkRules = rawAssets.find(asset => asset?.renderer_artwork_rules)?.renderer_artwork_rules || {};
  const artworkRules = options.artwork_rules || embeddedArtworkRules;
  const assets = rawAssets.map(normalizeRenderAsset).filter(Boolean);

  if (!assets.length) {
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

  const artworkAnchors = buildArtworkAnchors(totalDuration, artworkUrl, artworkRules, segmentDuration);
  const timeline = [];
  let currentTime = 0;
  let cycle = 0;
  let previousId = '';
  let pool = [];
  let poolIndex = 0;

  function appendSegment(asset, duration, sourceOverride = '') {
    if (duration <= 0.001) return;
    timeline.push({
      index: timeline.length,
      asset_id: asset.asset_id,
      type: asset.type,
      url: asset.url,
      source: sourceOverride || asset.source,
      start_seconds: roundTime(currentTime),
      duration_seconds: roundTime(duration),
      end_seconds: roundTime(currentTime + duration)
    });
    currentTime += duration;
    previousId = asset.asset_id;
  }

  function nextAsset() {
    if (poolIndex >= pool.length) {
      pool = avoidImmediateRepeat(orderedPool(assets, orderMode, seed, cycle), previousId);
      poolIndex = 0;
      cycle += 1;
    }
    const asset = pool[poolIndex];
    poolIndex += 1;
    return asset;
  }

  function fillContentUntil(targetTime) {
    while (currentTime < targetTime - 0.001) {
      const asset = nextAsset();
      appendSegment(asset, Math.min(segmentDuration, targetTime - currentTime));
    }
  }

  for (const anchor of artworkAnchors) {
    if (currentTime < anchor.start - 0.001) fillContentUntil(anchor.start);
    if (currentTime < anchor.end - 0.001) {
      const start = Math.max(currentTime, anchor.start);
      currentTime = start;
      appendSegment({
        asset_id: 'song-artwork',
        type: 'image',
        url: artworkUrl,
        source: 'song-artwork'
      }, anchor.end - start, `song-artwork-${anchor.kind}`);
    }
  }

  fillContentUntil(totalDuration);
  return timeline;
}
