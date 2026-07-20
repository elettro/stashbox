BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  internal_title TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'stashbox_news',
  image_url TEXT,
  action_label TEXT,
  action_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  priority INTEGER NOT NULL DEFAULT 50,
  pinned BOOLEAN NOT NULL DEFAULT false,
  dismissible BOOLEAN NOT NULL DEFAULT true,
  audience_type TEXT NOT NULL DEFAULT 'public',
  artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  publish_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT notifications_audience_check CHECK (audience_type IN ('public', 'all_registered_users', 'artist_followers', 'specific_users', 'premium_members'))
);

CREATE TABLE IF NOT EXISTS notification_events (
  id BIGSERIAL PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  anonymous_visitor_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_events_type_check CHECK (event_type IN ('view', 'open', 'click', 'dismiss'))
);

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

CREATE INDEX IF NOT EXISTS notifications_public_feed_idx
  ON notifications (status, audience_type, publish_at DESC, priority DESC);

CREATE INDEX IF NOT EXISTS notification_events_notification_idx
  ON notification_events (notification_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_events_user_idx
  ON notification_events (user_id, created_at DESC);

COMMIT;

-- Apply inside the active Stashbox Radio schema.
-- DEV: SET search_path TO radio_dev;
-- PROD later: SET search_path TO radio;
