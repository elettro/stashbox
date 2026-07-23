BEGIN;

ALTER TABLE radio_dev.artists
  ADD COLUMN IF NOT EXISTS vertical_banner_image_url TEXT;

COMMIT;
