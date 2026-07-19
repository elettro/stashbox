function stringValue(value) {
  return String(value || '').trim();
}

export function normalizeVisualSettingsResponse(body = {}) {
  const eligibleAssets = Array.isArray(body?.eligible_assets)
    ? body.eligible_assets
    : [];
  const legacyAssets = Array.isArray(body?.assets)
    ? body.assets
    : [];
  const assets = eligibleAssets.length ? eligibleAssets : legacyAssets;

  return {
    orderMode: stringValue(body?.order_mode) || 'random',
    assets,
    fallback: body?.fallback || {},
    eligibleAssetCount: assets.length,
    assetField: eligibleAssets.length ? 'eligible_assets' : legacyAssets.length ? 'assets' : 'none'
  };
}
