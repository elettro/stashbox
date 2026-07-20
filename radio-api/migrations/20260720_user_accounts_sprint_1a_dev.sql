BEGIN;

SET LOCAL search_path TO radio_dev;

DO $$
BEGIN
  IF current_schema() <> 'radio_dev' THEN
    RAISE EXCEPTION 'Refusing to run user account migration outside radio_dev.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  cognito_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'suspended', 'deleted'))
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  granted_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  CONSTRAINT user_roles_role_check CHECK (role IN ('listener', 'premium_listener', 'artist', 'band_manager', 'label_staff', 'sponsor', 'administrator')),
  CONSTRAINT user_roles_status_check CHECK (status IN ('pending', 'approved', 'revoked'))
);

CREATE TABLE IF NOT EXISTS user_artist_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_key TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_key)
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_key TEXT NOT NULL,
  song_id TEXT,
  display_title TEXT,
  artist TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_key)
);

CREATE TABLE IF NOT EXISTS user_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_key TEXT NOT NULL,
  artist_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_key)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT playlists_visibility_check CHECK (visibility IN ('private', 'unlisted'))
);

CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_key TEXT NOT NULL,
  song_id TEXT,
  display_title TEXT,
  artist TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, song_key)
);

CREATE INDEX IF NOT EXISTS playlist_items_order_idx ON playlist_items (playlist_id, position, added_at);

CREATE TABLE IF NOT EXISTS user_listening_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_key TEXT NOT NULL,
  song_id TEXT,
  display_title TEXT,
  artist TEXT,
  event_type TEXT NOT NULL DEFAULT 'play_start',
  seconds_played NUMERIC NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  client_event_id TEXT,
  source TEXT NOT NULL DEFAULT 'public_player',
  listened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS user_history_recent_idx ON user_listening_history (user_id, listened_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS user_history_client_event_unique ON user_listening_history (user_id, client_event_id) WHERE client_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  autoplay_enabled BOOLEAN NOT NULL DEFAULT true,
  explicit_content_enabled BOOLEAN NOT NULL DEFAULT true,
  default_view_mode TEXT NOT NULL DEFAULT 'visual',
  preferred_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_artists JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT,
  target_user_id TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_audit_recent_idx ON account_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS anonymous_activity_merge_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_visitor_hash TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anonymous_visitor_hash, payload_fingerprint)
);

CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE INDEX IF NOT EXISTS api_rate_limit_expiry_idx ON api_rate_limit_buckets (expires_at);

CREATE TABLE IF NOT EXISTS user_notification_state (
  user_id TEXT NOT NULL,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  browser_push_enabled BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
