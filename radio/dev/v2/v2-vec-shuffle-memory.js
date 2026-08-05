(() => {
  'use strict';

  if (window.StashboxVecShuffleMemory) return;

  const STORAGE_KEY = 'stashbox_vec_clip_history_v2';
  const MAX_SONGS = 120;
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();

  function canonicalUrl(value) {
    const source = clean(value)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
    if (!source) return '';
    try {
      const url = new URL(source, window.location.href);
      url.hash = '';
      ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature'].forEach(key => url.searchParams.delete(key));
      return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
    } catch (_) {
      return source.toLowerCase();
    }
  }

  function clipKey(clip) {
    return canonicalUrl(clip?.url || clip?.public_url || clip?.src || clip?.asset_url)
      || lower(clip?.id || clip?.asset_id || clip?.key);
  }

  function sourceKey(clip) {
    return clean(clip?.source || clip?.folderId || clip?.folder_id || clip?.source_id || 'unknown');
  }

  function randomInt(max) {
    if (!Number.isFinite(max) || max <= 1) return 0;
    try {
      const range = 0x100000000;
      const limit = range - (range % max);
      const values = new Uint32Array(1);
      do { crypto.getRandomValues(values); } while (values[0] >= limit);
      return values[0] % max;
    } catch (_) {
      return Math.floor(Math.random() * max);
    }
  }

  function shuffle(list) {
    const output = [...list];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(store) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) {}
  }

  function pruneStore(store) {
    const cutoff = Date.now() - MAX_AGE_MS;
    Object.keys(store).forEach(songKey => {
      const rows = Array.isArray(store[songKey]) ? store[songKey] : [];
      store[songKey] = rows.filter(row => Number(row?.time || 0) >= cutoff && clean(row?.key));
      if (!store[songKey].length) delete store[songKey];
    });
    const songKeys = Object.keys(store);
    if (songKeys.length > MAX_SONGS) {
      songKeys
        .sort((a, b) => Math.max(...store[b].map(row => row.time || 0), 0) - Math.max(...store[a].map(row => row.time || 0), 0))
        .slice(MAX_SONGS)
        .forEach(songKey => delete store[songKey]);
    }
    return store;
  }

  function historyFor(songKey) {
    const store = pruneStore(readStore());
    return Array.isArray(store[clean(songKey)]) ? store[clean(songKey)] : [];
  }

  function recentLimit(poolSize) {
    if (poolSize <= 2) return 1;
    return Math.max(8, Math.min(40, Math.ceil(poolSize * 0.35)));
  }

  function balanceSources(list, previousSource = '') {
    const buckets = new Map();
    list.forEach(clip => {
      const source = sourceKey(clip);
      if (!buckets.has(source)) buckets.set(source, []);
      buckets.get(source).push(clip);
    });
    buckets.forEach((clips, source) => buckets.set(source, shuffle(clips)));

    const output = [];
    let lastSource = previousSource;
    while ([...buckets.values()].some(bucket => bucket.length)) {
      let sources = [...buckets.entries()]
        .filter(([, bucket]) => bucket.length)
        .map(([source]) => source);
      const alternatives = sources.filter(source => source !== lastSource);
      if (alternatives.length) sources = alternatives;
      const source = sources[randomInt(sources.length)];
      const clip = buckets.get(source).shift();
      output.push(clip);
      lastSource = source;
    }
    return output;
  }

  function dedupe(clips) {
    const seen = new Set();
    return (Array.isArray(clips) ? clips : []).filter(clip => {
      const key = clipKey(clip);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function build(songKey, clips) {
    const unique = dedupe(clips);
    if (unique.length <= 1) return unique;

    const history = historyFor(songKey);
    const limit = recentLimit(unique.length);
    const recentRows = history.slice(-limit);
    const recentKeys = new Set(recentRows.map(row => row.key));
    const lastRow = history.at(-1) || null;

    const fresh = unique.filter(clip => !recentKeys.has(clipKey(clip)));
    const recent = unique.filter(clip => recentKeys.has(clipKey(clip)));
    const output = [
      ...balanceSources(shuffle(fresh), lastRow?.source || ''),
      ...balanceSources(shuffle(recent), fresh.length ? sourceKey(fresh.at(-1)) : (lastRow?.source || ''))
    ];

    const lastKey = lastRow?.key || '';
    if (output.length > 1 && clipKey(output[0]) === lastKey) {
      const replacement = output.findIndex((clip, index) => index > 0 && clipKey(clip) !== lastKey);
      if (replacement > 0) [output[0], output[replacement]] = [output[replacement], output[0]];
    }
    return output;
  }

  function mark(songKey, clip) {
    const normalizedSongKey = clean(songKey);
    const key = clipKey(clip);
    if (!normalizedSongKey || !key) return;

    const store = pruneStore(readStore());
    const rows = Array.isArray(store[normalizedSongKey]) ? store[normalizedSongKey] : [];
    const withoutDuplicate = rows.filter(row => row.key !== key);
    withoutDuplicate.push({ key, source: sourceKey(clip), time: Date.now() });
    const keep = Math.max(40, recentLimit(Math.max(40, withoutDuplicate.length)) * 2);
    store[normalizedSongKey] = withoutDuplicate.slice(-keep);
    writeStore(store);
  }

  function wasRecent(songKey, clip, limit = 12) {
    const key = clipKey(clip);
    if (!key) return false;
    const history = historyFor(songKey);
    return history.slice(-Math.max(1, Number(limit) || 12)).some(row => row.key === key);
  }

  function last(songKey) {
    const history = historyFor(songKey);
    return history.at(-1) || null;
  }

  function inspect(songKey) {
    return historyFor(songKey).map(row => ({ ...row }));
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const songKey = clean(event?.detail?.songKey);
    const asset = event?.detail?.asset;
    const type = lower(asset?.type || asset?.asset_type || asset?.media_type);
    const url = clean(asset?.url || asset?.public_url || asset?.src || asset?.asset_url);
    const video = type === 'clip' || type === 'video' || type.includes('video') || type.includes('clip') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url);
    if (!songKey || !asset || !video) return;
    window.setTimeout(() => mark(songKey, asset), 900);
  });

  window.StashboxVecShuffleMemory = Object.freeze({
    build,
    mark,
    wasRecent,
    last,
    clipKey,
    inspect,
    clear: songKey => {
      const store = readStore();
      if (songKey) delete store[clean(songKey)];
      else Object.keys(store).forEach(key => delete store[key]);
      writeStore(store);
    }
  });
})();