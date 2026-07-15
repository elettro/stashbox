-- SEED_RADIO_DEV_FROM_PROD.sql
-- Manual approval required before running.
-- Purpose: copy safe baseline data from production schema radio into true DEV schema radio_dev.
-- Safety: writes only to radio_dev; never writes to radio. Existing non-empty DEV tables are skipped.
-- Production statistics/event history should not be fully copied into DEV unless explicitly desired.

BEGIN;

DO $$
DECLARE
  table_name text;
  inserted_count bigint;
  source_regclass regclass;
  target_regclass regclass;
  target_count bigint;
  seed_tables text[] := ARRAY[
    'songs',
    'albums',
    'song_specific_products',
    'ads',
    'ad_settings',
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
  FOREACH table_name IN ARRAY seed_tables LOOP
    SELECT to_regclass(format('radio.%I', table_name)) INTO source_regclass;
    SELECT to_regclass(format('radio_dev.%I', table_name)) INTO target_regclass;

    IF source_regclass IS NULL THEN
      RAISE NOTICE 'Skipping %.% because source table does not exist.', 'radio', table_name;
    ELSIF target_regclass IS NULL THEN
      RAISE NOTICE 'Skipping %.% because target table does not exist. Run CREATE_RADIO_DEV_SCHEMA.sql first.', 'radio_dev', table_name;
    ELSE
      EXECUTE format('SELECT count(*) FROM radio_dev.%I', table_name) INTO target_count;
      IF target_count > 0 THEN
        RAISE NOTICE 'Skipping %.% because it already has % rows.', 'radio_dev', table_name, target_count;
      ELSE
        EXECUTE format('INSERT INTO radio_dev.%I SELECT * FROM radio.%I', table_name, table_name);
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        RAISE NOTICE 'Seeded %.% with % rows copied from %.%.', 'radio_dev', table_name, inserted_count, 'radio', table_name;
      END IF;
    END IF;
  END LOOP;
END $$;

-- DEV should have its own ad_settings row. This writes only to radio_dev.
INSERT INTO radio_dev.ad_settings (
  id,
  ads_enabled,
  break_method,
  ads_per_break,
  target_ad_seconds,
  break_interval,
  updated_at
)
VALUES ('dev', true, 'count', 1, 30, 1, now())
ON CONFLICT (id) DO NOTHING;

-- radio_events is intentionally not seeded. Keep DEV event/stat history separate from production.
-- Optional tiny sample for manual testing only; leave commented unless explicitly approved.
-- INSERT INTO radio_dev.radio_events (...column list...)
-- VALUES (...sample values...);

COMMIT;
