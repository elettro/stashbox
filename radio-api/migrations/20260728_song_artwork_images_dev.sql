BEGIN;

CREATE TABLE IF NOT EXISTS radio_dev.song_artwork_images (
  song_key TEXT PRIMARY KEY,
  song_artwork_16x9_url TEXT,
  song_artwork_9x16_url TEXT,
  song_artwork_3x4_url TEXT,
  song_artwork_4x5_url TEXT,
  song_artwork_21x9_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radio_dev.song_artwork_images
  ADD COLUMN IF NOT EXISTS song_artwork_16x9_url TEXT,
  ADD COLUMN IF NOT EXISTS song_artwork_9x16_url TEXT,
  ADD COLUMN IF NOT EXISTS song_artwork_3x4_url TEXT,
  ADD COLUMN IF NOT EXISTS song_artwork_4x5_url TEXT,
  ADD COLUMN IF NOT EXISTS song_artwork_21x9_url TEXT;

COMMIT;
