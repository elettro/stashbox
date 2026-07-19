import { normalizeVisualSettingsResponse } from './visual-settings.mjs';

const nativeFetch = globalThis.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('Video Factory renderer requires the built-in fetch implementation.');
}

globalThis.fetch = async function videoFactoryFetch(input, init) {
  const response = await nativeFetch(input, init);
  const requestUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');

  if (!/\/radio\/songs\/[^/]+\/visual-settings(?:\?|$)/.test(requestUrl)) {
    return response;
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes('application/json')) {
    return response;
  }

  let body;
  try {
    body = await response.clone().json();
  } catch (_) {
    return response;
  }

  const normalized = normalizeVisualSettingsResponse(body);
  const adaptedBody = {
    ...body,
    assets: normalized.assets,
    eligible_assets: Array.isArray(body?.eligible_assets) ? body.eligible_assets : normalized.assets,
    renderer_asset_field: normalized.assetField,
    renderer_eligible_asset_count: normalized.eligibleAssetCount
  };

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');

  return new Response(JSON.stringify(adaptedBody), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

await import('./index.mjs');
