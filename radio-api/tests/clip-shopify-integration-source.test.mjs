import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const api = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
const cms = fs.readFileSync(new URL('../../radio/visual-experience/dev/index.html', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../../radio/dev/app.js', import.meta.url), 'utf8');

test('folder asset API persists and returns clip Shopify URLs', () => {
  assert.match(api, /shopify_product_urls/);
  assert.match(api, /normalizeClipShopifyProductUrls/);
  assert.match(api, /Shopify Product URLs must contain valid HTTP or HTTPS URLs/);
  assert.match(api, /product_source: body\.product_source/);
});

test('Visual Experience CMS exposes clip product editing and verified save', () => {
  assert.match(cms, /Shopify Product URLs/);
  assert.match(cms, /data-field="shopify_product_urls"/);
  assert.match(cms, /data-save-details/);
  assert.match(cms, /Asset details saved and verified/);
});

test('DEV player isolates clip commerce from media playback', () => {
  assert.match(player, /from '\.\/clip-commerce\.mjs'/);
  assert.match(player, /onActiveVisualChange/);
  assert.match(player, /clipCommerceState/);
  assert.match(player, /product_source: clipCommerceState\.productSource/);
  assert.doesNotMatch(player, /handleActiveVisualChange[\s\S]{0,600}(audioRef|setMediaMode|setVisualIndex|pause\(|play\()/);
});


test('clip product schema auto-migration is DEV-only and production remains compatible', () => {
  assert.match(api, /\['dev', 'development'\]\.includes\(getRuntimeEnv\(\)\)/);
  assert.match(api, /ADD COLUMN IF NOT EXISTS shopify_product_urls/);
  assert.match(api, /columns\.has\('shopify_product_urls'\)/);
  assert.match(api, /const productUpdateSql = supportsClipProducts/);
});
