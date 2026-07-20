import assert from 'node:assert/strict';
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
