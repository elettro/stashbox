-- VALIDATE_RADIO_DEV_SCHEMA.sql
-- Read-only validation for the true DEV schema radio_dev.
-- This script performs SELECT-only checks and does not write to radio or radio_dev.

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
), key_tables(table_name) AS (
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

SELECT 'row_count_compare' AS check_name, 'songs' AS table_name, (SELECT count(*) FROM radio.songs) AS radio_count, (SELECT count(*) FROM radio_dev.songs) AS radio_dev_count
UNION ALL SELECT 'row_count_compare', 'albums', (SELECT count(*) FROM radio.albums), (SELECT count(*) FROM radio_dev.albums)
UNION ALL SELECT 'row_count_compare', 'song_specific_products', (SELECT count(*) FROM radio.song_specific_products), (SELECT count(*) FROM radio_dev.song_specific_products)
UNION ALL SELECT 'row_count_compare', 'ads', (SELECT count(*) FROM radio.ads), (SELECT count(*) FROM radio_dev.ads)
UNION ALL SELECT 'row_count_compare', 'ad_settings', (SELECT count(*) FROM radio.ad_settings), (SELECT count(*) FROM radio_dev.ad_settings)
UNION ALL SELECT 'row_count_compare', 'visuals_folders', (SELECT count(*) FROM radio.visuals_folders), (SELECT count(*) FROM radio_dev.visuals_folders)
UNION ALL SELECT 'row_count_compare', 'visuals_folder_artist_matches', (SELECT count(*) FROM radio.visuals_folder_artist_matches), (SELECT count(*) FROM radio_dev.visuals_folder_artist_matches)
UNION ALL SELECT 'row_count_compare', 'visuals_folder_genre_matches', (SELECT count(*) FROM radio.visuals_folder_genre_matches), (SELECT count(*) FROM radio_dev.visuals_folder_genre_matches)
UNION ALL SELECT 'row_count_compare', 'visuals_folder_mood_matches', (SELECT count(*) FROM radio.visuals_folder_mood_matches), (SELECT count(*) FROM radio_dev.visuals_folder_mood_matches)
UNION ALL SELECT 'row_count_compare', 'visuals_folder_song_matches', (SELECT count(*) FROM radio.visuals_folder_song_matches), (SELECT count(*) FROM radio_dev.visuals_folder_song_matches)
UNION ALL SELECT 'row_count_compare', 'visuals_folder_assets', (SELECT count(*) FROM radio.visuals_folder_assets), (SELECT count(*) FROM radio_dev.visuals_folder_assets)
UNION ALL SELECT 'row_count_compare', 'song_visual_assets', (SELECT count(*) FROM radio.song_visual_assets), (SELECT count(*) FROM radio_dev.song_visual_assets)
UNION ALL SELECT 'row_count_compare', 'song_visual_recipes', (SELECT count(*) FROM radio.song_visual_recipes), (SELECT count(*) FROM radio_dev.song_visual_recipes)
UNION ALL SELECT 'row_count_compare', 'song_visuals_folders', (SELECT count(*) FROM radio.song_visuals_folders), (SELECT count(*) FROM radio_dev.song_visuals_folders)
UNION ALL SELECT 'row_count_compare', 'radio_events_keep_dev_empty_or_tiny', (SELECT count(*) FROM radio.radio_events), (SELECT count(*) FROM radio_dev.radio_events)
ORDER BY table_name;

SELECT
  'dev_ad_settings_row' AS check_name,
  CASE
    WHEN to_regclass('radio_dev.ad_settings') IS NULL THEN 'missing_table'
    WHEN EXISTS (SELECT 1 FROM radio_dev.ad_settings WHERE id = 'dev') THEN 'present'
    ELSE 'missing_row'
  END AS status;

SELECT
  'production_write_safety' AS check_name,
  'This validation script is SELECT-only and contains no INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER statements.' AS status;
