CREATE TABLE IF NOT EXISTS radio.song_visual_recipes (
  song_key TEXT PRIMARY KEY,
  recipe JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
