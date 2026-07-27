BEGIN;

CREATE SCHEMA IF NOT EXISTS social_factory_dev;
SET LOCAL search_path TO social_factory_dev;

DO $$
BEGIN
  IF current_schema() <> 'social_factory_dev' THEN
    RAISE EXCEPTION 'Refusing to run Social Factory migration outside social_factory_dev.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS social_campaigns (
  id BIGSERIAL PRIMARY KEY,
  song_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'youtube',
  status TEXT NOT NULL DEFAULT 'inactive',
  start_date DATE,
  end_date DATE,
  posting_pressure TEXT NOT NULL DEFAULT 'standard',
  review_window_hours INTEGER NOT NULL DEFAULT 24,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_campaigns_status_check CHECK (
    status IN ('draft', 'inactive', 'review', 'active', 'paused', 'completed', 'archived')
  ),
  CONSTRAINT social_campaigns_pressure_check CHECK (
    posting_pressure IN ('low', 'standard', 'aggressive', 'custom')
  ),
  CONSTRAINT social_campaigns_review_window_check CHECK (
    review_window_hours IN (0, 24, 48, 72)
  ),
  CONSTRAINT social_campaigns_date_check CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS social_campaigns_song_idx
  ON social_campaigns (song_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_accounts (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  channel_id TEXT,
  connection_status TEXT NOT NULL DEFAULT 'not_connected',
  secret_reference TEXT,
  token_status TEXT NOT NULL DEFAULT 'unknown',
  last_verified_at TIMESTAMPTZ,
  last_successful_upload_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_accounts_platform_check CHECK (
    platform IN ('youtube', 'facebook', 'instagram', 'tiktok')
  ),
  CONSTRAINT social_accounts_connection_check CHECK (
    connection_status IN ('not_connected', 'connected', 'degraded', 'revoked', 'error')
  ),
  CONSTRAINT social_accounts_token_check CHECK (
    token_status IN ('unknown', 'valid', 'expiring', 'expired', 'revoked', 'error')
  ),
  UNIQUE (platform, channel_id)
);

CREATE TABLE IF NOT EXISTS social_post_reasons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_posts (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'youtube',
  content_type TEXT NOT NULL,
  format TEXT NOT NULL,
  duration_seconds INTEGER,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  post_reason_id BIGINT REFERENCES social_post_reasons(id),
  thumbnail_url TEXT,
  playlist_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ,
  render_lock_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  published_platform_id TEXT,
  published_url TEXT,
  error_information JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_posts_platform_check CHECK (
    platform IN ('youtube', 'facebook', 'instagram', 'tiktok')
  ),
  CONSTRAINT social_posts_content_type_check CHECK (
    content_type IN ('short', 'full_video', 'image', 'carousel', 'community_post')
  ),
  CONSTRAINT social_posts_format_check CHECK (
    format IN ('9:16', '16:9', '1:1', '4:5', 'text', 'poll')
  ),
  CONSTRAINT social_posts_status_check CHECK (
    status IN (
      'planned', 'rendering', 'ready_for_review', 'held', 'approved', 'scheduled',
      'uploading', 'processing', 'published', 'skipped', 'cancelled', 'failed', 'deleted'
    )
  ),
  CONSTRAINT social_posts_duration_check CHECK (
    duration_seconds IS NULL OR duration_seconds > 0
  )
);

CREATE INDEX IF NOT EXISTS social_posts_schedule_idx
  ON social_posts (platform, status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_campaign_idx
  ON social_posts (campaign_id, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_song_idx
  ON social_posts (song_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_render_jobs (
  id BIGSERIAL PRIMARY KEY,
  social_post_id BIGINT REFERENCES social_posts(id) ON DELETE SET NULL,
  song_id TEXT NOT NULL,
  vec_recipe TEXT,
  vec_folders JSONB NOT NULL DEFAULT '[]'::jsonb,
  format TEXT NOT NULL,
  duration_seconds INTEGER,
  audio_section JSONB NOT NULL DEFAULT '{}'::jsonb,
  opening_clip_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  render_status TEXT NOT NULL DEFAULT 'queued',
  s3_output_url TEXT,
  thumbnail_output_url TEXT,
  error_information JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_render_jobs_status_check CHECK (
    render_status IN ('queued', 'claimed', 'rendering', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT social_render_jobs_duration_check CHECK (
    duration_seconds IS NULL OR duration_seconds > 0
  )
);

CREATE INDEX IF NOT EXISTS social_render_jobs_status_idx
  ON social_render_jobs (render_status, created_at);

CREATE TABLE IF NOT EXISTS social_activity_log (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES social_campaigns(id) ON DELETE SET NULL,
  social_post_id BIGINT REFERENCES social_posts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_activity_actor_check CHECK (
    actor_type IN ('system', 'user', 'gpt', 'publisher', 'renderer')
  )
);

CREATE INDEX IF NOT EXISTS social_activity_recent_idx
  ON social_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS social_activity_campaign_idx
  ON social_activity_log (campaign_id, created_at DESC);

INSERT INTO social_post_reasons (code, name, description)
VALUES
  ('chorus_highlight', 'Chorus highlight', 'Feature a strong chorus hook.'),
  ('lyric_moment', 'Lyric moment', 'Feature a lyric-led section.'),
  ('full_song_video', 'Full-song video', 'Publish a complete 16:9 song video.'),
  ('alternate_vec_edit', 'Alternate VEC edit', 'Use a different VEC recipe or clip order.'),
  ('playlist_promotion', 'Playlist promotion', 'Promote a destination playlist.'),
  ('catalog_revival', 'Catalog revival', 'Reintroduce an existing song.'),
  ('song_introduction', 'Song introduction', 'Introduce the song and its central hook.'),
  ('artist_story', 'Artist story', 'Share artist context or background.'),
  ('merchandise', 'Merchandise', 'Connect the song to relevant merchandise.'),
  ('community_question', 'Community question', 'Prompt audience participation.')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

COMMIT;
