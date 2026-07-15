-- VALIDATE_RADIO_DEV_SCHEMA.sql
-- Read-only validation for the true DEV schema radio_dev.
-- This script performs SELECT-only checks and does not write to radio or radio_dev.
-- Run manually in DBeaver after CREATE_RADIO_DEV_SCHEMA.sql and SEED_RADIO_DEV_FROM_PROD.sql.

WITH expected_tables(table_name) AS (
  VALUES
    ('songs'),
    ('albums'),
    ('song_specific_products'),
    ('ads'),
    ('ad_settings'),
    ('radio_events'),
    ('visuals_folders'),
    ('visuals_folder_artist_matches'),
    ('visuals_folder_genre_matches'),
    ('visuals_folder_mood_matches'),
    ('visuals_folder_song_matches'),
    ('visuals_folder_assets'),
    ('song_visual_assets'),
    ('song_visual_recipes'),
    ('song_visuals_folders')
)
SELECT
  'expected_table_presence' AS check_name,
  e.table_name,
  CASE WHEN t.table_name IS NULL THEN 'missing' ELSE 'present' END AS radio_dev_status
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'radio_dev'
 AND t.table_name = e.table_name
 AND t.table_type = 'BASE TABLE'
ORDER BY e.table_name;

WITH expected_tables(table_name) AS (
  VALUES
    ('songs'),
    ('albums'),
    ('song_specific_products'),
    ('ads'),
    ('ad_settings'),
    ('radio_events'),
    ('visuals_folders'),
    ('visuals_folder_artist_matches'),
    ('visuals_folder_genre_matches'),
    ('visuals_folder_mood_matches'),
    ('visuals_folder_song_matches'),
    ('visuals_folder_assets'),
    ('song_visual_assets'),
    ('song_visual_recipes'),
    ('song_visuals_folders')
)
SELECT
  'expected_table_count' AS check_name,
  count(*) FILTER (WHERE t.table_name IS NOT NULL) AS radio_dev_expected_tables_found,
  count(*) AS expected_tables_total
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'radio_dev'
 AND t.table_name = e.table_name
 AND t.table_type = 'BASE TABLE';

SELECT
  'schema_table_count_compare' AS check_name,
  table_schema,
  count(*) AS base_table_count
FROM information_schema.tables
WHERE table_schema IN ('radio', 'radio_dev')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;

WITH key_tables(table_name) AS (
  VALUES
    ('songs'),
    ('radio_events'),
    ('ads'),
    ('ad_settings'),
    ('visuals_folders'),
    ('visuals_folder_assets'),
    ('song_visual_assets'),
    ('song_visual_recipes')
)
SELECT
  'key_table_presence' AS check_name,
  k.table_name,
  CASE WHEN t.table_name IS NULL THEN 'missing' ELSE 'present' END AS radio_dev_status
FROM key_tables k
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'radio_dev'
 AND t.table_name = k.table_name
 AND t.table_type = 'BASE TABLE'
ORDER BY k.table_name;

-- Row count comparison is generated dynamically so the validation script does not fail
-- if an optional expected table is absent. It still performs SELECT-only checks.
DO $$
DECLARE
  table_name text;
  radio_count bigint;
  radio_dev_count bigint;
  expected_tables text[] := ARRAY[
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
    'song_visuals_folders',
    'radio_events'
  ];
BEGIN
  RAISE NOTICE 'row_count_compare: table_name | radio_count | radio_dev_count';

  FOREACH table_name IN ARRAY expected_tables LOOP
    IF to_regclass(format('radio.%I', table_name)) IS NULL THEN
      RAISE NOTICE 'row_count_compare: % | missing_radio_table | n/a', table_name;
    ELSIF to_regclass(format('radio_dev.%I', table_name)) IS NULL THEN
      RAISE NOTICE 'row_count_compare: % | present | missing_radio_dev_table', table_name;
    ELSE
      EXECUTE format('SELECT count(*) FROM radio.%I', table_name) INTO radio_count;
      EXECUTE format('SELECT count(*) FROM radio_dev.%I', table_name) INTO radio_dev_count;
      RAISE NOTICE 'row_count_compare: % | % | %', table_name, radio_count, radio_dev_count;
    END IF;
  END LOOP;
END $$;

SELECT
  'dev_ad_settings_row' AS check_name,
  CASE
    WHEN to_regclass('radio_dev.ad_settings') IS NULL THEN 'missing_table'
    WHEN EXISTS (SELECT 1 FROM radio_dev.ad_settings WHERE id = 'dev') THEN 'present'
    ELSE 'missing_row'
  END AS status;

SELECT
  'production_write_safety' AS check_name,
  'This validation script is SELECT/DO-read-only only and contains no INSERT, UPDATE, DELETE, TRUNCATE, DROP, CREATE, or ALTER statements.' AS status;
