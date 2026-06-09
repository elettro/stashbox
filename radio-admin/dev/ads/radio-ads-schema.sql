CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS radio.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  internal_title text NOT NULL,
  description text,
  ad_type text NOT NULL DEFAULT 'Stashbox Radio Branding',

  video_url text NOT NULL,
  click_url text,

  ad_ratio_label text DEFAULT 'Auto Detect',
  video_width integer,
  video_height integer,

  frequency text NOT NULL DEFAULT 'Medium',
  skip_after_seconds integer DEFAULT 5,
  no_skipping boolean NOT NULL DEFAULT false,

  active boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,

  genre_targeting text,
  mood_targeting text,
  artist_targeting text,
  song_targeting text,

  start_date date DEFAULT CURRENT_DATE,
  end_date date,

  notes text,

  views integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ads_active_hidden_check CHECK (NOT (active AND hidden))
);

CREATE INDEX IF NOT EXISTS ads_active_idx ON radio.ads(active);
CREATE INDEX IF NOT EXISTS ads_hidden_idx ON radio.ads(hidden);
CREATE INDEX IF NOT EXISTS ads_ad_type_idx ON radio.ads(ad_type);
CREATE INDEX IF NOT EXISTS ads_start_date_idx ON radio.ads(start_date);
CREATE INDEX IF NOT EXISTS ads_end_date_idx ON radio.ads(end_date);
