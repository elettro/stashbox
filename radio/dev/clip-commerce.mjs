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
