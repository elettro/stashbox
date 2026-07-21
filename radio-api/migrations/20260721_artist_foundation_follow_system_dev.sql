BEGIN;

SET LOCAL search_path TO radio_dev;

DO $$
BEGIN
  IF current_schema() <> 'radio_dev' THEN
    RAISE EXCEPTION 'Refusing to run artist foundation migration outside radio_dev.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  artist_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_name TEXT NOT NULL DEFAULT '',
  profile_image_url TEXT,
  banner_image_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website_url TEXT,
  spotify_url TEXT,
  apple_music_url TEXT,
  youtube_url TEXT,
  instagram_url TEXT,
  x_url TEXT,
  facebook_url TEXT,
  merch_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  featured BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artists_status_check CHECK (status IN ('draft', 'published', 'hidden'))
);

CREATE INDEX IF NOT EXISTS artists_public_idx ON artists (status, featured DESC, lower(name));

CREATE TABLE IF NOT EXISTS song_artists (
  song_key TEXT NOT NULL,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  artist_role TEXT NOT NULL DEFAULT 'primary',
  position INTEGER NOT NULL DEFAULT 0,
  display_credit TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (song_key, artist_id, artist_role),
  CONSTRAINT song_artists_role_check CHECK (artist_role IN ('primary', 'featured', 'remixer', 'producer'))
);

CREATE INDEX IF NOT EXISTS song_artists_artist_idx ON song_artists (artist_id, position, song_key);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  label_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS label_artists (
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'label',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_id, artist_id)
);

CREATE TABLE IF NOT EXISTS user_label_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, label_id)
);

ALTER TABLE user_artist_access ADD COLUMN IF NOT EXISTS artist_id TEXT;
ALTER TABLE user_artist_access ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS artist_id TEXT;
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS user_follows_artist_idx ON user_follows (artist_key, created_at);

CREATE TABLE IF NOT EXISTS artist_change_requests (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artist_change_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
);

-- Create canonical artist records from the existing song artist text.
WITH distinct_artists AS (
  SELECT DISTINCT trim(artist) AS artist_name
  FROM songs
  WHERE trim(COALESCE(artist, '')) <> ''
), normalized AS (
  SELECT
    artist_name,
    regexp_replace(regexp_replace(lower(artist_name), '&', ' and ', 'g'), '[^a-z0-9]+', '-', 'g') AS raw_slug
  FROM distinct_artists
), final_values AS (
  SELECT
    artist_name,
    trim(BOTH '-' FROM raw_slug) AS base_slug,
    substr(md5(lower(artist_name)), 1, 8) AS suffix,
    count(*) OVER (PARTITION BY trim(BOTH '-' FROM raw_slug)) AS slug_count
  FROM normalized
)
INSERT INTO artists (id, artist_key, slug, name, sort_name, status, created_by)
SELECT
  'artist-' || suffix,
  CASE WHEN base_slug = '' THEN 'artist-' || suffix WHEN slug_count > 1 THEN base_slug || '-' || suffix ELSE base_slug END,
  CASE WHEN base_slug = '' THEN 'artist-' || suffix WHEN slug_count > 1 THEN base_slug || '-' || suffix ELSE base_slug END,
  artist_name,
  artist_name,
  'published',
  'migration'
FROM final_values
ON CONFLICT (artist_key) DO UPDATE SET
  name = EXCLUDED.name,
  sort_name = CASE WHEN artists.sort_name = '' THEN EXCLUDED.sort_name ELSE artists.sort_name END,
  updated_at = now();

INSERT INTO song_artists (song_key, artist_id, artist_role, position, display_credit)
SELECT s.song_key, a.id, 'primary', 0, s.artist
FROM songs s
JOIN artists a ON lower(trim(a.name)) = lower(trim(s.artist))
WHERE trim(COALESCE(s.artist, '')) <> ''
ON CONFLICT (song_key, artist_id, artist_role) DO NOTHING;

UPDATE user_follows f
SET artist_id = a.id,
    artist_name = COALESCE(NULLIF(f.artist_name, ''), a.name),
    updated_at = now()
FROM artists a
WHERE f.artist_id IS NULL
  AND lower(f.artist_key) = lower(a.artist_key);

UPDATE user_artist_access access_row
SET artist_id = a.id,
    updated_at = now()
FROM artists a
WHERE access_row.artist_id IS NULL
  AND lower(access_row.artist_key) = lower(a.artist_key);

COMMIT;
