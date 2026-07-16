-- VE-10B Song-Level Visual Source Controller manual migration.
-- Target schema: radio_dev only. Do not run against production schema radio.
-- Safe to run from DBeaver after selecting the shared RDS connection used for TRUE DEV.

CREATE TABLE IF NOT EXISTS radio_dev.song_visual_settings (
  song_key TEXT PRIMARY KEY,
  order_mode TEXT NOT NULL DEFAULT 'random',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT song_visual_settings_order_mode_check CHECK (order_mode IN ('random', 'manual', 'newest_first'))
);
COMMENT ON TABLE radio_dev.song_visual_settings IS 'VE-10B per-song visual order mode for TRUE DEV only.';
COMMENT ON COLUMN radio_dev.song_visual_settings.song_key IS 'Matches radio_dev.songs.song_key for the configured song.';

CREATE TABLE IF NOT EXISTS radio_dev.song_visual_folder_mappings (
  song_key TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  inclusion_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (song_key, folder_id),
  CONSTRAINT song_visual_folder_mappings_state_check CHECK (inclusion_state IN ('included', 'excluded'))
);
COMMENT ON TABLE radio_dev.song_visual_folder_mappings IS 'VE-10B per-song include/exclude state for Visuals Folders in TRUE DEV.';

CREATE INDEX IF NOT EXISTS song_visual_folder_mappings_folder_id_idx
  ON radio_dev.song_visual_folder_mappings(folder_id);

CREATE TABLE IF NOT EXISTS radio_dev.song_visual_asset_mappings (
  song_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_scope TEXT NOT NULL DEFAULT 'folder',
  inclusion_state TEXT NOT NULL,
  manual_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (song_key, asset_id),
  CONSTRAINT song_visual_asset_mappings_scope_check CHECK (asset_scope IN ('direct', 'folder')),
  CONSTRAINT song_visual_asset_mappings_state_check CHECK (inclusion_state IN ('included', 'excluded'))
);
COMMENT ON TABLE radio_dev.song_visual_asset_mappings IS 'VE-10B per-song include/exclude state and optional manual order for direct and folder visual assets in TRUE DEV.';
COMMENT ON COLUMN radio_dev.song_visual_asset_mappings.manual_order IS 'Optional basic manual order value; NULL means no explicit manual position.';

CREATE INDEX IF NOT EXISTS song_visual_asset_mappings_asset_id_idx
  ON radio_dev.song_visual_asset_mappings(asset_id);
