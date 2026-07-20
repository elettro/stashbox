from pathlib import Path

controller_path = Path('radio-admin/dev/vec/vec-controller.js')
styles_path = Path('radio-admin/dev/styles.css')
test_path = Path('radio-api/tests/vec-lab-product-cart-badges.test.mjs')

controller = controller_path.read_text(encoding='utf-8')
styles = styles_path.read_text(encoding='utf-8')

helper_anchor = """  function normalizeAssetType(asset) {
    return (asset?.asset_type || asset?.type || '').toLowerCase() === 'clip' ? 'clip' : 'image';
  }
"""
helper_replacement = """  function normalizeAssetType(asset) {
    return (asset?.asset_type || asset?.type || '').toLowerCase() === 'clip' ? 'clip' : 'image';
  }

  function normalizeAssetProductUrls(value) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\\r?\\n|,/)
        : [];
    const seen = new Set();
    return raw.map(clean).filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function getAssetProductLinkCount(asset) {
    if (normalizeAssetType(asset) !== 'clip') return 0;
    return normalizeAssetProductUrls(
      asset?.shopify_product_urls ??
      asset?.shopifyProductUrls ??
      asset?.shopify_product_url ??
      asset?.shopifyProductUrl ??
      []
    ).length;
  }

  function renderAssetProductLinkBadge(asset) {
    const productCount = getAssetProductLinkCount(asset);
    if (!productCount) return '';
    const label = productCount === 1 ? '1 linked product' : `${productCount} linked products`;
    const countMarkup = productCount > 1 ? `<strong aria-hidden=\"true\">${productCount}</strong>` : '';
    return `<span class=\"vec-product-link-badge\" role=\"img\" aria-label=\"${label}\" title=\"${label}\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 4h2l2.2 9.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 7H7\"/><circle cx=\"10\" cy=\"19\" r=\"1.4\"/><circle cx=\"18\" cy=\"19\" r=\"1.4\"/></svg>${countMarkup}</span>`;
  }
"""
if 'function renderAssetProductLinkBadge(asset)' not in controller:
    if helper_anchor not in controller:
        raise SystemExit('normalizeAssetType anchor not found')
    controller = controller.replace(helper_anchor, helper_replacement, 1)

normalize_anchor = """      uploaded_at: asset.uploaded_at || asset.uploadedAt || asset.upload_timestamp || asset.uploadTimestamp || '',
    };
"""
normalize_replacement = """      uploaded_at: asset.uploaded_at || asset.uploadedAt || asset.upload_timestamp || asset.uploadTimestamp || '',
      shopify_product_urls: normalizeAssetProductUrls(
        asset.shopify_product_urls ??
        asset.shopifyProductUrls ??
        asset.shopify_product_url ??
        asset.shopifyProductUrl ??
        []
      ),
    };
"""
if 'shopify_product_urls: normalizeAssetProductUrls(' not in controller:
    if normalize_anchor not in controller:
        raise SystemExit('normalizeAsset return anchor not found')
    controller = controller.replace(normalize_anchor, normalize_replacement, 1)

render_functions = [
    ('renderBorrowedAssetCard', "      <span class=\"vec-folder-asset-thumb\">${media}</span>"),
    ('renderAssetPreview', "      <span class=\"vec-folder-asset-thumb\">${media}</span>"),
    ('renderSongAssetCard', "      <span class=\"vec-folder-asset-thumb\">${media}</span>"),
]
for function_name, thumb_anchor in render_functions:
    start = controller.find(f'  function {function_name}(')
    if start < 0:
        raise SystemExit(f'{function_name} not found')
    end = controller.find('\n  function ', start + 10)
    if end < 0:
        end = len(controller)
    block = controller[start:end]
    if 'renderAssetProductLinkBadge(asset)' not in block:
        media_anchor = '    const media = '
        media_pos = block.find(media_anchor)
        if media_pos < 0:
            raise SystemExit(f'{function_name} media anchor not found')
        statement_end = block.find(';\n', media_pos)
        if statement_end < 0:
            raise SystemExit(f'{function_name} media statement end not found')
        statement_end += 2
        block = block[:statement_end] + '    const productLinkBadge = renderAssetProductLinkBadge(asset);\n' + block[statement_end:]
        if thumb_anchor not in block:
            raise SystemExit(f'{function_name} thumbnail anchor not found')
        block = block.replace(thumb_anchor, "      <span class=\"vec-folder-asset-thumb\">${productLinkBadge}${media}</span>", 1)
        controller = controller[:start] + block + controller[end:]

css_marker = '/* VEC Lab clip-linked Shopify product cart badges. */'
css_block = """

/* VEC Lab clip-linked Shopify product cart badges. */
.vec-lab-page .vec-folder-asset-thumb,
#vecControllerMount .vec-folder-asset-thumb {
  position: relative;
}

.vec-lab-page .vec-product-link-badge,
#vecControllerMount .vec-product-link-badge {
  position: absolute;
  top: 0.42rem;
  left: 0.42rem;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  min-width: 1.75rem;
  min-height: 1.75rem;
  border: 1px solid rgba(255, 217, 121, 0.88);
  border-radius: 999px;
  background: rgba(8, 12, 9, 0.9);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.48);
  color: #ffd979;
  padding: 0.28rem 0.45rem;
  pointer-events: none;
}

.vec-lab-page .vec-product-link-badge svg,
#vecControllerMount .vec-product-link-badge svg {
  width: 0.96rem;
  height: 0.96rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vec-lab-page .vec-product-link-badge strong,
#vecControllerMount .vec-product-link-badge strong {
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 950;
  line-height: 1;
}
"""
if css_marker not in styles:
    styles = styles.rstrip() + css_block + '\n'

controller_path.write_text(controller, encoding='utf-8')
styles_path.write_text(styles, encoding='utf-8')

test_path.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const controller = fs.readFileSync(new URL('../../radio-admin/dev/vec/vec-controller.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../radio-admin/dev/styles.css', import.meta.url), 'utf8');

test('VEC Lab preserves clip Shopify product URLs during asset normalization', () => {
  assert.match(controller, /shopify_product_urls: normalizeAssetProductUrls/);
  assert.match(controller, /shopifyProductUrls/);
});

test('cart badge renders only for clips with linked products', () => {
  assert.match(controller, /if \(normalizeAssetType\(asset\) !== 'clip'\) return 0/);
  assert.match(controller, /if \(!productCount\) return ''/);
  assert.match(controller, /productCount > 1/);
  assert.match(controller, /vec-product-link-badge/);
  assert.equal((controller.match(/\$\{productLinkBadge\}\$\{media\}/g) || []).length, 3);
});

test('cart badge is positioned in the upper-left and does not intercept card clicks', () => {
  assert.match(styles, /\.vec-product-link-badge[\s\S]*top: 0\.42rem/);
  assert.match(styles, /\.vec-product-link-badge[\s\S]*left: 0\.42rem/);
  assert.match(styles, /\.vec-product-link-badge[\s\S]*pointer-events: none/);
});
""", encoding='utf-8')
