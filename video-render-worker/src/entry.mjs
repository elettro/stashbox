import { normalizeVisualSettingsResponse } from './visual-settings.mjs';
import { resolveVecRecipeVisuals } from './vec-recipe.mjs';

const nativeFetch = globalThis.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('Video Factory renderer requires the built-in fetch implementation.');
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return { error: text.slice(0, 500) };
  }
}

function requestHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  const overrides = new Headers(init?.headers || undefined);
  overrides.forEach((value, name) => headers.set(name, value));
  headers.set('accept', 'application/json');
  return headers;
}

async function apiRequestFromOriginal(requestUrl, input, init, pathname) {
  const routeMarker = '/radio/songs/';
  const markerIndex = requestUrl.indexOf(routeMarker);
  if (markerIndex < 0) throw new Error('Unable to resolve the Video Factory API base URL.');
  const apiBase = requestUrl.slice(0, markerIndex);
  const response = await nativeFetch(`${apiBase}${pathname}`, {
    method: 'GET',
    headers: requestHeaders(input, init)
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body.error || `VEC API returned ${response.status}.`);
  }
  return body;
}

globalThis.fetch = async function videoFactoryFetch(input, init) {
  const response = await nativeFetch(input, init);
  const requestUrl = typeof input === 'string' || input instanceof URL
    ? String(input)
    : String(input?.url || '');
  const routeMatch = requestUrl.match(/\/radio\/songs\/([^/?]+)\/visual-settings(?:\?|$)/);

  if (!routeMatch) return response;

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes('application/json')) return response;

  let body;
  try {
    body = await response.clone().json();
  } catch (_) {
    return response;
  }

  let adaptedBody;
  try {
    const songKey = decodeURIComponent(routeMatch[1]);
    const vec = await resolveVecRecipeVisuals({
      songKey,
      request: pathname => apiRequestFromOriginal(requestUrl, input, init, pathname)
    });

    if (vec.found) {
      const assets = vec.assets.length
        ? vec.assets.map((asset, index) => index === 0
          ? { ...asset, renderer_artwork_rules: vec.artworkRules, renderer_render_settings: vec.renderSettings }
          : asset)
        : [{ renderer_control: 'artwork-rules', renderer_artwork_rules: vec.artworkRules, renderer_render_settings: vec.renderSettings }];
      adaptedBody = {
        ...body,
        order_mode: vec.orderMode,
        assets,
        eligible_assets: vec.assets,
        fallback: {
          uses_artwork: vec.assets.length === 0,
          eligible_visual_count: vec.assets.length
        },
        renderer_source: vec.source,
        renderer_visual_mode: vec.visualMode,
        renderer_render_settings: vec.renderSettings,
        renderer_manual_sequence: vec.manualSequence || [],
        renderer_selected_asset_ids: vec.selectedAssetIds,
        renderer_missing_asset_ids: vec.missingAssetIds,
        renderer_vec_recipe: vec.recipe
      };
    }
  } catch (error) {
    console.warn('[Video Factory Worker] Live VEC recipe resolution failed. Trying Song CMS visual settings.', error.message);
  }

  if (!adaptedBody) {
    const normalized = normalizeVisualSettingsResponse(body);
    adaptedBody = {
      ...body,
      assets: normalized.assets,
      eligible_assets: Array.isArray(body?.eligible_assets) ? body.eligible_assets : normalized.assets,
      renderer_asset_field: normalized.assetField,
      renderer_eligible_asset_count: normalized.eligibleAssetCount,
      renderer_source: 'song-cms-visual-settings'
    };
  }

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
