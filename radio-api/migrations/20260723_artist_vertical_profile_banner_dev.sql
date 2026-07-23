-- Artist vertical banner is a dedicated persistent RDS field. The Artist CMS
-- uploads through the proven Song CMS artwork presign flow, then saves this URL.
BEGIN;

ALTER TABLE radio_dev.artists
  ADD COLUMN IF NOT EXISTS vertical_banner_image_url TEXT;

COMMIT;
