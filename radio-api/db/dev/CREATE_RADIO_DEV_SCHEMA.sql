-- CREATE_RADIO_DEV_SCHEMA.sql
-- Manual approval required before running.
-- Purpose: create the true DEV PostgreSQL schema radio_dev without modifying radio.
-- Safety: non-destructive; does not DROP, TRUNCATE, DELETE, INSERT into, UPDATE, or ALTER radio.
-- Run manually in DBeaver only after a production backup and change approval.

BEGIN;

CREATE SCHEMA IF NOT EXISTS radio_dev;

DO $$
DECLARE
  table_name text;
  source_regclass regclass;
  target_regclass regclass;
  expected_tables text[] := ARRAY[
    'songs',
    'albums',
    'song_specific_products',
    'ads',
    'ad_settings',
    'radio_events',
    'visuals_folders',
    'visuals_folder_artist_matches',
    'visuals_folder_genre_matches',
    'visuals_folder_mood_matches',
    'visuals_folder_song_matches',
    'visuals_folder_assets',
    'song_visual_assets',
    'song_visual_recipes',
    'song_visuals_folders'
  ];
BEGIN
  FOREACH table_name IN ARRAY expected_tables LOOP
    SELECT to_regclass(format('radio.%I', table_name)) INTO source_regclass;
    SELECT to_regclass(format('radio_dev.%I', table_name)) INTO target_regclass;

    IF source_regclass IS NULL THEN
      RAISE NOTICE 'Skipping %.% because source table does not exist.', 'radio', table_name;
    ELSIF target_regclass IS NOT NULL THEN
      RAISE NOTICE 'Skipping %.% because target table already exists.', 'radio_dev', table_name;
    ELSE
      -- LIKE INCLUDING ALL copies columns, defaults, generated expressions, identity,
      -- storage, comments, indexes, constraints, and statistics where PostgreSQL supports it.
      -- Inspect foreign keys, sequence ownership, index names, and extension-backed defaults
      -- after creation; complex objects may require manual DEV-specific follow-up.
      EXECUTE format(
        'CREATE TABLE radio_dev.%I (LIKE radio.%I INCLUDING ALL)',
        table_name,
        table_name
      );
      RAISE NOTICE 'Created %.% from %.% with LIKE INCLUDING ALL.', 'radio_dev', table_name, 'radio', table_name;
    END IF;
  END LOOP;
END $$;

-- DEV extension: clip-linked Shopify products for reusable VEC folder assets.
-- This runs after the production-like table clone above and remains isolated to radio_dev.
ALTER TABLE IF EXISTS radio_dev.visuals_folder_assets
  ADD COLUMN IF NOT EXISTS shopify_product_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Fallback only: ensure a DEV ad settings table can exist even if the production
-- ad_settings table was absent when cloning. This writes only to radio_dev.
CREATE TABLE IF NOT EXISTS radio_dev.ad_settings (
  id text PRIMARY KEY DEFAULT 'dev',
  ads_enabled boolean DEFAULT true,
  break_method text DEFAULT 'count',
  ads_per_break integer DEFAULT 1,
  target_ad_seconds integer DEFAULT 30,
  break_interval integer DEFAULT 1,
  updated_at timestamp DEFAULT now()
);

COMMIT;
