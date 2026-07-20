from pathlib import Path
import re


def replace_one(source: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return updated


api_path = Path("radio-api/index.mjs")
api = api_path.read_text(encoding="utf-8")

if "const isDevRuntime = ['dev', 'development'].includes(getRuntimeEnv());" not in api:
    ensure_pattern = r"async function ensureVisualsFolderAssetsSchema\(\) \{.*?\n\}\n\nfunction normalizeClipShopifyProductUrls"
    ensure_replacement = """async function ensureVisualsFolderAssetsSchema() {
  let columns = await getTableColumns(getDbSchema(), 'visuals_folder_assets');
  const requiredColumns = ['id', 'folder_id', 'asset_type', 's3_key', 'public_url', 'status'];
  if (!requiredColumns.every((column) => columns.has(column))) {
    const error = new Error(`${qname('visuals_folder_assets')} schema is missing required columns.`);
    error.statusCode = 501;
    throw error;
  }

  const isDevRuntime = ['dev', 'development'].includes(getRuntimeEnv());
  if (isDevRuntime && !columns.has('shopify_product_urls')) {
    await client.query(`ALTER TABLE ${qname('visuals_folder_assets')} ADD COLUMN IF NOT EXISTS shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb`);
    columns = await getTableColumns(getDbSchema(), 'visuals_folder_assets');
  }

  return columns;
}

function normalizeClipShopifyProductUrls"""
    api = replace_one(api, ensure_pattern, ensure_replacement, "folder asset schema function", re.S)

get_anchor = "async function getVisualsFolderAssets(folderId) {\n  let assets = [];"
get_replacement = "async function getVisualsFolderAssets(folderId) {\n  await ensureVisualsFolderAssetsSchema();\n  let assets = [];"
if get_anchor in api:
    api = api.replace(get_anchor, get_replacement, 1)
elif get_replacement not in api:
    raise RuntimeError("folder asset GET migration anchor not found")

update_pattern = r"async function updateVisualsFolderAsset\(folderId, assetId, body\) \{.*?\n\}\n\nasync function hideVisualsFolderAsset"
update_replacement = """async function updateVisualsFolderAsset(folderId, assetId, body) {
  const columns = await ensureVisualsFolderAssetsSchema();
  const status = body.status === 'active' ? 'active' : body.status === 'hidden' ? 'hidden' : null;
  const hasShopifyProductUrls = Object.prototype.hasOwnProperty.call(body, 'shopify_product_urls') ||
    Object.prototype.hasOwnProperty.call(body, 'shopifyProductUrls') ||
    Object.prototype.hasOwnProperty.call(body, 'shopify_product_url') ||
    Object.prototype.hasOwnProperty.call(body, 'shopifyProductUrl');
  const productUrlsValidation = hasShopifyProductUrls
    ? normalizeClipShopifyProductUrls(body.shopify_product_urls ?? body.shopifyProductUrls ?? body.shopify_product_url ?? body.shopifyProductUrl, { strict: true })
    : { urls: [], error: '' };
  if (productUrlsValidation.error) return { statusCode: 400, body: { success: false, error: productUrlsValidation.error } };

  const baseValues = [folderId, assetId, status, body.caption ?? null, body.alt_text ?? body.altText ?? null, body.notes ?? null];
  const supportsClipProducts = columns.has('shopify_product_urls');
  const productUrlsJson = supportsClipProducts && hasShopifyProductUrls ? JSON.stringify(productUrlsValidation.urls) : null;
  const productUpdateSql = supportsClipProducts
    ? `, shopify_product_urls = CASE WHEN asset_type = 'clip' THEN COALESCE($7::jsonb, shopify_product_urls) ELSE '[]'::jsonb END`
    : '';
  const values = supportsClipProducts ? [...baseValues, productUrlsJson] : baseValues;
  const result = await client.query(
    `UPDATE ${qname('visuals_folder_assets')}
     SET status = COALESCE($3, status),
         caption = COALESCE($4, caption),
         alt_text = COALESCE($5, alt_text),
         notes = COALESCE($6, notes)
         ${productUpdateSql},
         updated_at = now()
     WHERE folder_id = $1 AND id = $2
     RETURNING *`,
    values
  );
  if (!result.rowCount) return { statusCode: 404, body: { success: false, error: 'Folder asset not found for that exact folder and asset ID.' } };
  return { statusCode: 200, body: { success: true, asset: normalizeVisualsFolderAsset(result.rows[0]) } };
}

async function hideVisualsFolderAsset"""
api = replace_one(api, update_pattern, update_replacement, "folder asset update function", re.S)
api_path.write_text(api, encoding="utf-8")

source_test_path = Path("radio-api/tests/clip-shopify-integration-source.test.mjs")
source_tests = source_test_path.read_text(encoding="utf-8")
safety_marker = "test('clip product schema auto-migration is DEV-only and production remains compatible'"
if safety_marker not in source_tests:
    source_tests += """

test('clip product schema auto-migration is DEV-only and production remains compatible', () => {
  assert.match(api, /\['dev', 'development'\]\.includes\(getRuntimeEnv\(\)\)/);
  assert.match(api, /ADD COLUMN IF NOT EXISTS shopify_product_urls/);
  assert.match(api, /columns\.has\('shopify_product_urls'\)/);
  assert.match(api, /const productUpdateSql = supportsClipProducts/);
});
"""
    source_test_path.write_text(source_tests, encoding="utf-8")

smoke_path = Path("radio-api/scripts/smoke-test-true-dev.mjs")
smoke = smoke_path.read_text(encoding="utf-8")
if "async function checkVisualFolderAssetSchema" not in smoke:
    smoke_function = """
async function checkVisualFolderAssetSchema(results) {
  const foldersEndpoint = '/admin/visuals/folders';
  if (!ADMIN_TOKEN) {
    addResult(results, {
      name: 'visual folder clip-product schema', endpoint: foldersEndpoint,
      status: null, pass: true, required: false, skipped: true,
      reason: 'ADMIN_TOKEN is not set.'
    });
    return;
  }

  const foldersResult = await fetchJson(foldersEndpoint, { admin: true });
  const folders = Array.isArray(foldersResult.body?.folders) ? foldersResult.body.folders : [];
  if (foldersResult.status !== 200 || !folders.length) {
    addResult(results, {
      name: 'visual folder clip-product schema', endpoint: foldersEndpoint,
      status: foldersResult.status, pass: false,
      reason: foldersResult.status !== 200
        ? `Expected HTTP 200, got ${statusText(foldersResult.status)}.`
        : 'Expected at least one DEV Visuals Folder.'
    });
    return;
  }

  const folderId = folders[0].id;
  const assetsEndpoint = `/admin/visuals/folders/${encodeURIComponent(folderId)}/assets`;
  const assetsResult = await fetchJson(assetsEndpoint, { admin: true });
  const assets = Array.isArray(assetsResult.body?.assets) ? assetsResult.body.assets : [];
  const arraysValid = assets.every((asset) => Array.isArray(asset.shopify_product_urls));
  addResult(results, {
    name: 'visual folder clip-product schema', endpoint: assetsEndpoint,
    status: assetsResult.status,
    pass: assetsResult.status === 200 && arraysValid,
    reason: assetsResult.status !== 200
      ? `Expected HTTP 200, got ${statusText(assetsResult.status)}.`
      : arraysValid
        ? `Verified shopify_product_urls arrays on ${assets.length} asset(s).`
        : 'Expected every asset to return shopify_product_urls as an array.'
  });
}
"""
    anchor = "\nfunction printResults(results) {"
    if smoke.count(anchor) != 1:
        raise RuntimeError("smoke-test insertion anchor was not unique")
    smoke = smoke.replace(anchor, smoke_function + anchor, 1)
    call_anchor = "await checkAdminRoute(results, '/admin/visuals/folders');\n"
    if smoke.count(call_anchor) != 1:
        raise RuntimeError("smoke-test call anchor was not unique")
    smoke = smoke.replace(call_anchor, call_anchor + "await checkVisualFolderAssetSchema(results);\n", 1)
    smoke_path.write_text(smoke, encoding="utf-8")

print("Clip Shopify DEV source finalization complete.")
