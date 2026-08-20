-- 20260820_verify_dev_hot_path_indexes.sql
-- Read-only verification for the DEV-only hot-path indexes.
-- Safe to run in DBeaver; contains SELECT/EXPLAIN only.

SET search_path TO radio_dev;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'radio_dev'
  AND tablename IN ('radio_events', 'visuals_folder_assets')
ORDER BY tablename, indexname;

-- Recent-event path used by admin/public-safe recent event reads.
EXPLAIN (COSTS TRUE, VERBOSE FALSE)
SELECT *
FROM radio_dev.radio_events
ORDER BY created_at DESC NULLS LAST
LIMIT 50;

-- Recent like/share activity path used by the notification activity engine.
EXPLAIN (COSTS TRUE, VERBOSE FALSE)
SELECT song_key, event_type, created_at
FROM radio_dev.radio_events
WHERE event_type IN ('like', 'share')
  AND created_at >= now() - interval '8 hours'
ORDER BY created_at DESC
LIMIT 20;

-- VEC folder-asset path. Replace the placeholder with a real folder id when reviewing the plan.
EXPLAIN (COSTS TRUE, VERBOSE FALSE)
SELECT *
FROM radio_dev.visuals_folder_assets
WHERE folder_id = '__VERIFY_FOLDER_ID__'
  AND status <> 'hidden'
  AND public_url IS NOT NULL
  AND public_url <> ''
ORDER BY created_at ASC, file_name ASC NULLS LAST;
