from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)


def regex_once(source, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {count}')
    return updated


def add_visual_assets_column(path):
    source = read(path)
    if 'shopify_product_urls' in source:
        return

    if path.endswith('CREATE_RADIO_DEV_SCHEMA.sql'):
        anchor = "-- Fallback only: ensure a DEV ad settings table can exist even if the production\n"
        addition = """-- DEV extension: clip-linked Shopify products for reusable VEC folder assets.
-- This runs after the production-like table clone above and remains isolated to radio_dev.
ALTER TABLE IF EXISTS radio_dev.visuals_folder_assets
  ADD COLUMN IF NOT EXISTS shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

"""
        source = replace_once(source, anchor, addition + anchor, f'{path}: add DEV clip Shopify column')
        write(path, source)
        return

    marker_index = source.find('visuals_folder_assets')
    if marker_index < 0:
        raise RuntimeError(f'{path}: visuals_folder_assets block not found')
    start = source.rfind('CREATE TABLE', 0, marker_index + 1)
    end = source.find('\n);', marker_index)
    if start < 0 or end < 0:
        raise RuntimeError(f'{path}: visuals_folder_assets CREATE TABLE boundaries not found')
    end += 3
    block = source[start:end]
    if '  notes TEXT,\n' not in block:
        raise RuntimeError(f'{path}: notes column anchor not found in visuals_folder_assets block')
    block = block.replace(
        '  notes TEXT,\n',
        "  notes TEXT,\n  shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb,\n",
        1,
    )
    source = source[:start] + block + source[end:]
    write(path, source)


api_path = 'radio-api/index.mjs'
api = read(api_path)

if 'function normalizeClipShopifyProductUrls' not in api:
    helper = r'''function normalizeClipShopifyProductUrls(value, { strict = false } = {}) {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        raw = Array.isArray(parsed) ? parsed : trimmed.split(/\r?\n|,/);
      } catch (_) {
        raw = trimmed.split(/\r?\n|,/);
      }
    }
  } else if (value !== null && value !== undefined) {
    raw = [value];
  }

  const seen = new Set();
  const urls = [];
  const invalid = [];
  for (const item of raw) {
    const candidate = String(item || '').trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        invalid.push(candidate);
        continue;
      }
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    } catch (_) {
      invalid.push(candidate);
    }
  }

  return {
    urls,
    error: strict && invalid.length
      ? `Shopify Product URLs must contain valid HTTP or HTTPS URLs. Invalid value: ${invalid[0]}`
      : ''
  };
}

'''
    api = replace_once(
        api,
        'function normalizeFolderAssetPayload(body, folder) {',
        helper + 'function normalizeFolderAssetPayload(body, folder) {',
        'insert clip Shopify URL helper',
    )

if 'shopify_product_urls: mediaType ===' not in api:
    block_start = api.index('function normalizeVisualsFolderAsset(row) {')
    block_end = api.index('\n}\n\nasync function getVisualsFolderAssets', block_start)
    asset_block = api[block_start:block_end]
    asset_block = replace_once(
        asset_block,
        "    notes: row.notes || '',\n    created_at: row.created_at || '',",
        "    notes: row.notes || '',\n    shopify_product_urls: mediaType === 'clip' ? normalizeClipShopifyProductUrls(row.shopify_product_urls).urls : [],\n    shopifyProductUrls: mediaType === 'clip' ? normalizeClipShopifyProductUrls(row.shopify_product_urls).urls : [],\n    created_at: row.created_at || '',",
        'return clip Shopify URLs from asset API',
    )
    api = api[:block_start] + asset_block + api[block_end:]

api = api.replace(
    "const requiredColumns = ['id', 'folder_id', 'asset_type', 's3_key', 'public_url', 'status'];",
    "const requiredColumns = ['id', 'folder_id', 'asset_type', 's3_key', 'public_url', 'status', 'shopify_product_urls'];",
    1,
)

if 'const productUrlsValidation = assetType ===' not in api:
    api = replace_once(
        api,
        "  if (!publicUrl || !s3Key) return { error: 'public_url and s3_key are required.' };\n  return { payload: {",
        "  if (!publicUrl || !s3Key) return { error: 'public_url and s3_key are required.' };\n  const productUrlsValidation = assetType === 'clip'\n    ? normalizeClipShopifyProductUrls(body.shopify_product_urls ?? body.shopifyProductUrls ?? body.shopify_product_url ?? body.shopifyProductUrl, { strict: true })\n    : { urls: [], error: '' };\n  if (productUrlsValidation.error) return { error: productUrlsValidation.error };\n  return { payload: {",
        'validate clip Shopify URLs in asset payload',
    )

if 'shopify_product_urls: JSON.stringify(productUrlsValidation.urls)' not in api:
    api = replace_once(
        api,
        "    ratio_label: String(body.ratio_label || body.ratioLabel || ''),\n    caption: String(body.caption || ''),",
        "    ratio_label: String(body.ratio_label || body.ratioLabel || ''),\n    shopify_product_urls: JSON.stringify(productUrlsValidation.urls),\n    caption: String(body.caption || ''),",
        'store normalized clip Shopify URLs in asset payload',
    )

api = api.replace(
    "'ratio_label', 'status', 'caption', 'alt_text', 'notes']",
    "'ratio_label', 'status', 'caption', 'alt_text', 'notes', 'shopify_product_urls']",
    1,
)

if 'const insertPlaceholders = insertFields.map' not in api:
    api = replace_once(
        api,
        "  const values = insertFields.map((field) => field === 'status' ? 'active' : payload[field]);\n  const result = await client.query(\n    `INSERT INTO ${qname('visuals_folder_assets')} (${insertFields.join(', ')}) VALUES (${insertFields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,\n    values\n  );",
        "  const values = insertFields.map((field) => field === 'status' ? 'active' : payload[field]);\n  const insertPlaceholders = insertFields.map((field, index) => field === 'shopify_product_urls' ? `$${index + 1}::jsonb` : `$${index + 1}`);\n  const result = await client.query(\n    `INSERT INTO ${qname('visuals_folder_assets')} (${insertFields.join(', ')}) VALUES (${insertPlaceholders.join(', ')}) RETURNING *`,\n    values\n  );",
        'cast clip Shopify URLs during asset insert',
    )

if 'const hasShopifyProductUrls = Object.prototype.hasOwnProperty.call(body' not in api:
    update_function = r'''async function updateVisualsFolderAsset(folderId, assetId, body) {
  await ensureVisualsFolderAssetsSchema();
  const status = body.status === 'active' ? 'active' : body.status === 'hidden' ? 'hidden' : null;
  const hasShopifyProductUrls = Object.prototype.hasOwnProperty.call(body, 'shopify_product_urls') ||
    Object.prototype.hasOwnProperty.call(body, 'shopifyProductUrls') ||
    Object.prototype.hasOwnProperty.call(body, 'shopify_product_url') ||
    Object.prototype.hasOwnProperty.call(body, 'shopifyProductUrl');
  const productUrlsValidation = hasShopifyProductUrls
    ? normalizeClipShopifyProductUrls(body.shopify_product_urls ?? body.shopifyProductUrls ?? body.shopify_product_url ?? body.shopifyProductUrl, { strict: true })
    : { urls: [], error: '' };
  if (productUrlsValidation.error) return { statusCode: 400, body: { success: false, error: productUrlsValidation.error } };
  const productUrlsJson = hasShopifyProductUrls ? JSON.stringify(productUrlsValidation.urls) : null;
  const result = await client.query(
    `UPDATE ${qname('visuals_folder_assets')}
     SET status = COALESCE($3, status),
         caption = COALESCE($4, caption),
         alt_text = COALESCE($5, alt_text),
         notes = COALESCE($6, notes),
         shopify_product_urls = CASE
           WHEN asset_type = 'clip' THEN COALESCE($7::jsonb, shopify_product_urls)
           ELSE '[]'::jsonb
         END,
         updated_at = now()
     WHERE folder_id = $1 AND id = $2
     RETURNING *`,
    [folderId, assetId, status, body.caption ?? null, body.alt_text ?? body.altText ?? null, body.notes ?? null, productUrlsJson]
  );
  if (!result.rowCount) return { statusCode: 404, body: { success: false, error: 'Folder asset not found for that exact folder and asset ID.' } };
  return { statusCode: 200, body: { success: true, asset: normalizeVisualsFolderAsset(result.rows[0]) } };
}
'''
    api = regex_once(
        api,
        r'async function updateVisualsFolderAsset\(folderId, assetId, body\) \{.*?\n\}\n\nasync function hideVisualsFolderAsset',
        update_function + '\nasync function hideVisualsFolderAsset',
        'replace folder asset update function',
        re.S,
    )

if 'product_source: body.product_source' not in api:
    api = replace_once(
        api,
        "    product_url: body.product_url || body.productUrl || '',\n    share_url: body.share_url || body.shareUrl || '',",
        "    product_url: body.product_url || body.productUrl || '',\n    product_source: body.product_source || body.productSource || '',\n    visual_asset_id: body.visual_asset_id || body.visualAssetId || '',\n    visual_folder_id: body.visual_folder_id || body.visualFolderId || '',\n    share_url: body.share_url || body.shareUrl || '',",
        'add clip product tracking metadata',
    )

write(api_path, api)

add_visual_assets_column('radio-admin/dev/ads/migrations/create_visuals_folder_assets.sql')
add_visual_assets_column('radio-api/db/dev/CREATE_RADIO_DEV_SCHEMA.sql')
