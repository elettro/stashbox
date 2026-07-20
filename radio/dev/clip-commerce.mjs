export const CLIP_PRODUCT_HOLD_MS = 30_000;

export function normalizeCommerceProductUrls(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : [];

  const seen = new Set();
  const urls = [];

  for (const item of raw) {
    const candidate = String(item || '').trim();
    if (!candidate) continue;

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      continue;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) continue;

    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

function commerceProductKey(product) {
  const handle = String(product?.handle || '').trim().toLowerCase();
  if (handle) return `handle:${handle}`;

  for (const value of [product?.url, product?.onlineStoreUrl]) {
    const candidate = String(value || '').trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
      return `url:${parsed.origin.toLowerCase()}${pathname}`;
    } catch {
      return `url:${candidate.toLowerCase()}`;
    }
  }

  const id = String(product?.id || '').trim();
  return id ? `id:${id}` : '';
}

export function overlayClipProducts(clipProducts, baselineProducts, limit = Number.POSITIVE_INFINITY) {
  const clip = Array.isArray(clipProducts) ? clipProducts.filter(Boolean) : [];
  const baseline = Array.isArray(baselineProducts) ? baselineProducts.filter(Boolean) : [];
  const numericLimit = Number(limit);
  const maxItems = Number.isFinite(numericLimit)
    ? Math.max(0, Math.floor(numericLimit))
    : Number.POSITIVE_INFINITY;

  if (!clip.length) return baseline.slice(0, maxItems);

  const result = [];
  const seen = new Set();
  const append = product => {
    if (!product || result.length >= maxItems) return;
    const key = commerceProductKey(product);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    result.push(product);
  };

  clip.forEach(append);

  baseline.forEach(append);

  return result;
}

export function createClipCommerceState(songKey = '') {
  return {
    activeSongKey: String(songKey || ''),
    activeClipId: '',
    productSource: 'none',
    productUrls: [],
    lastClipProductUrls: [],
    lastClipId: '',
    clipProductShownAt: 0,
    clipProductExpiresAt: 0,
    clipProductSeenForSong: false
  };
}

function songFallbackState(state, songProductUrls) {
  if (songProductUrls.length) {
    return {
      ...state,
      productSource: 'song',
      productUrls: songProductUrls
    };
  }

  if (state.lastClipProductUrls.length) {
    return {
      ...state,
      productSource: 'clip',
      productUrls: state.lastClipProductUrls
    };
  }

  return {
    ...state,
    productSource: 'random',
    productUrls: []
  };
}

export function resolveClipCommerceState({
  state,
  songKey,
  asset,
  songProductUrls,
  now = Date.now(),
  holdMs = CLIP_PRODUCT_HOLD_MS
}) {
  const normalizedSongKey = String(songKey || '');
  const normalizedSongProducts = normalizeCommerceProductUrls(songProductUrls);
  const clipProductUrls = normalizeCommerceProductUrls(
    asset?.shopifyProductUrls ??
    asset?.shopify_product_urls ??
    asset?.shopifyProductUrl ??
    asset?.shopify_product_url ??
    []
  );
  const activeClipId = String(asset?.id || asset?.asset_id || asset?.key || '');

  let next = state && state.activeSongKey === normalizedSongKey
    ? { ...state }
    : createClipCommerceState(normalizedSongKey);

  next.activeSongKey = normalizedSongKey;
  next.activeClipId = activeClipId;

  if (clipProductUrls.length) {
    return {
      ...next,
      productSource: 'clip',
      productUrls: clipProductUrls,
      lastClipProductUrls: clipProductUrls,
      lastClipId: activeClipId,
      clipProductShownAt: now,
      clipProductExpiresAt: now + Math.max(0, Number(holdMs) || 0),
      clipProductSeenForSong: true
    };
  }

  if (next.lastClipProductUrls.length) {
    const holdExpired = next.clipProductExpiresAt > 0 && now >= next.clipProductExpiresAt;

    if (holdExpired && normalizedSongProducts.length) {
      return {
        ...next,
        productSource: 'song',
        productUrls: normalizedSongProducts
      };
    }

    if (next.productSource === 'song' && normalizedSongProducts.length) {
      return {
        ...next,
        productSource: 'song',
        productUrls: normalizedSongProducts
      };
    }

    return {
      ...next,
      productSource: 'clip',
      productUrls: next.lastClipProductUrls
    };
  }

  return songFallbackState(next, normalizedSongProducts);
}

export function resetClipCommerceForSong(songKey = '') {
  return createClipCommerceState(songKey);
}
