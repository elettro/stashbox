-- Dev-only song-level visual assets for /radio-admin/dev/vec/ Song-Only Assets.
CREATE TABLE IF NOT EXISTS radio.song_visual_assets (
  id TEXT PRIMARY KEY,
  song_key TEXT NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT song_visual_assets_type_check CHECK (asset_type IN ('image', 'clip')),
  CONSTRAINT song_visual_assets_status_check CHECK (status IN ('active', 'hidden'))
);

CREATE INDEX IF NOT EXISTS song_visual_assets_song_key_idx ON radio.song_visual_assets(song_key);
CREATE INDEX IF NOT EXISTS song_visual_assets_type_idx ON radio.song_visual_assets(asset_type);
