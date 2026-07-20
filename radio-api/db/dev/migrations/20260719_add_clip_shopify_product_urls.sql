-- DEV only: allow reusable VEC folder clips to carry Shopify product URLs.
-- Apply against the schema selected by the DEV Lambda PGSCHEMA value.

ALTER TABLE radio_dev.visuals_folder_assets
  ADD COLUMN IF NOT EXISTS shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN radio_dev.visuals_folder_assets.shopify_product_urls IS
  'Ordered, deduplicated Shopify product URLs associated with this VEC clip. Images retain an empty array.';

UPDATE radio_dev.visuals_folder_assets
SET shopify_product_urls = '[]'::jsonb
WHERE shopify_product_urls IS NULL;

ALTER TABLE radio_dev.visuals_folder_assets
  DROP CONSTRAINT IF EXISTS visuals_folder_assets_shopify_product_urls_array_check;

ALTER TABLE radio_dev.visuals_folder_assets
  ADD CONSTRAINT visuals_folder_assets_shopify_product_urls_array_check
  CHECK (jsonb_typeof(shopify_product_urls) = 'array');
