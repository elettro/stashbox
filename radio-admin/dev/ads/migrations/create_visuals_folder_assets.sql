
-- Visual Library folder assets used by /radio/visual-experience/dev/ and VEC Lab.
CREATE TABLE IF NOT EXISTS radio.visuals_folder_assets (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES radio.visuals_folders(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'image',
  file_name TEXT,
  s3_key TEXT,
  public_url TEXT NOT NULL,
  thumbnail_url TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  ratio_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  caption TEXT,
  alt_text TEXT,
  notes TEXT,
  shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visuals_folder_assets_type_check CHECK (asset_type IN ('image', 'clip')),
  CONSTRAINT visuals_folder_assets_status_check CHECK (status IN ('active', 'hidden'))
);

CREATE INDEX IF NOT EXISTS visuals_folder_assets_folder_idx ON radio.visuals_folder_assets(folder_id);
CREATE INDEX IF NOT EXISTS visuals_folder_assets_type_idx ON radio.visuals_folder_assets(asset_type);
