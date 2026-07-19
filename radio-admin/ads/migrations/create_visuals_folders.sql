-- Visuals Experience folder persistence (folders and match metadata only).
-- This migration intentionally does not create media upload, S3, song assignment, or player tables.

CREATE TABLE IF NOT EXISTS radio.visuals_folders (
  id text PRIMARY KEY,
  folder_name text NOT NULL,
  folder_slug text NOT NULL UNIQUE,
  folder_type text NOT NULL DEFAULT 'general',
  description text,
  status text NOT NULL DEFAULT 'active',
  priority text NOT NULL DEFAULT 'medium',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT visuals_folders_folder_type_check CHECK (folder_type IN ('general', 'artist', 'song', 'genre', 'mood', 'global', 'campaign', 'brand', 'location')),
  CONSTRAINT visuals_folders_status_check CHECK (status IN ('active', 'hidden')),
  CONSTRAINT visuals_folders_priority_check CHECK (priority IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS visuals_folders_folder_type_idx ON radio.visuals_folders(folder_type);
CREATE INDEX IF NOT EXISTS visuals_folders_status_idx ON radio.visuals_folders(status);
CREATE INDEX IF NOT EXISTS visuals_folders_priority_idx ON radio.visuals_folders(priority);

CREATE TABLE IF NOT EXISTS radio.visuals_folder_artist_matches (
  folder_id text NOT NULL,
  artist text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, artist),
  FOREIGN KEY (folder_id) REFERENCES radio.visuals_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS radio.visuals_folder_genre_matches (
  folder_id text NOT NULL,
  genre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, genre),
  FOREIGN KEY (folder_id) REFERENCES radio.visuals_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS radio.visuals_folder_mood_matches (
  folder_id text NOT NULL,
  mood text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, mood),
  FOREIGN KEY (folder_id) REFERENCES radio.visuals_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS radio.visuals_folder_song_matches (
  folder_id text NOT NULL,
  song_key text NOT NULL,
  song_title text,
  artist text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, song_key),
  FOREIGN KEY (folder_id) REFERENCES radio.visuals_folders(id) ON DELETE CASCADE
);
