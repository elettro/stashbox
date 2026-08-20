-- 20260820_dev_hot_path_indexes.sql
-- Purpose: reduce avoidable PostgreSQL work on the highest-confidence Stashbox Radio DEV hot paths.
-- Scope: radio_dev only. This migration must never modify the production radio schema.
-- Behavior: index-only optimization; no rows, event semantics, API payloads, or public/player behavior are changed.

BEGIN;

SET LOCAL search_path TO radio_dev;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '90s';

DO $$
BEGIN
  IF current_schema() <> 'radio_dev' THEN
    RAISE EXCEPTION 'Refusing to run hot-path index migration outside radio_dev.';
  END IF;

  IF to_regnamespace('radio_dev') IS NULL THEN
    RAISE EXCEPTION 'radio_dev schema does not exist.';
  END IF;
END
$$;

-- Helper policy:
-- 1) Prefer an existing equivalent index, even if it has a different name.
-- 2) Only create an index when the table/columns used by the real query exist.
-- 3) Keep the event-table index set deliberately small because radio_events is append-heavy.

DO $$
DECLARE
  has_created_at boolean;
  has_event_type boolean;
  has_song_key boolean;
BEGIN
  IF to_regclass('radio_dev.radio_events') IS NULL THEN
    RAISE NOTICE 'Skipping radio_events indexes: radio_dev.radio_events does not exist.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'radio_events' AND column_name = 'created_at'
  ) INTO has_created_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'radio_events' AND column_name = 'event_type'
  ) INTO has_event_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'radio_events' AND column_name = 'song_key'
  ) INTO has_song_key;

  -- Supports listEvents(), publicRecentEvents(), product/referrer/device recent rows,
  -- and any other ORDER BY created_at DESC LIMIT N request without scanning/sorting the table.
  IF has_created_at AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'radio_dev'
      AND tablename = 'radio_events'
      AND lower(regexp_replace(indexdef, '\s+', ' ', 'g')) ~ '\(created_at( desc)?([,\)])'
  ) THEN
    EXECUTE 'CREATE INDEX radio_events_created_at_desc_idx ON radio_dev.radio_events (created_at DESC)';
    RAISE NOTICE 'Created radio_events_created_at_desc_idx.';
  ELSE
    RAISE NOTICE 'Skipped created_at index: equivalent leading created_at index already exists or column is unavailable.';
  END IF;

  -- Directly matches the recent like/share activity query and supports other event-type/time windows.
  -- This is a general two-column index rather than many per-event partial indexes so write amplification stays bounded.
  IF has_event_type AND has_created_at AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'radio_dev'
      AND tablename = 'radio_events'
      AND lower(regexp_replace(indexdef, '\s+', ' ', 'g')) ~ '\(event_type, created_at( desc)?([,\)])'
  ) THEN
    EXECUTE 'CREATE INDEX radio_events_event_type_created_at_idx ON radio_dev.radio_events (event_type, created_at DESC)';
    RAISE NOTICE 'Created radio_events_event_type_created_at_idx.';
  ELSE
    RAISE NOTICE 'Skipped event_type/created_at index: equivalent composite index already exists or columns are unavailable.';
  END IF;

  -- Guardrail only: song_key is on the write/update and join path throughout Radio.
  -- The production-cloned schema should already carry this; create it only if no leading song_key index survived cloning.
  IF has_song_key AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'radio_dev'
      AND tablename = 'radio_events'
      AND lower(regexp_replace(indexdef, '\s+', ' ', 'g')) ~ '\(song_key([,\)])'
  ) THEN
    EXECUTE 'CREATE INDEX radio_events_song_key_idx ON radio_dev.radio_events (song_key)';
    RAISE NOTICE 'Created radio_events_song_key_idx.';
  ELSE
    RAISE NOTICE 'Skipped radio_events song_key index: equivalent leading song_key index already exists or column is unavailable.';
  END IF;
END
$$;

DO $$
DECLARE
  has_folder_id boolean;
  has_status boolean;
  has_created_at boolean;
  has_public_url boolean;
BEGIN
  IF to_regclass('radio_dev.visuals_folder_assets') IS NULL THEN
    RAISE NOTICE 'Skipping VEC folder-asset index: radio_dev.visuals_folder_assets does not exist.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'visuals_folder_assets' AND column_name = 'folder_id'
  ) INTO has_folder_id;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'visuals_folder_assets' AND column_name = 'status'
  ) INTO has_status;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'visuals_folder_assets' AND column_name = 'created_at'
  ) INTO has_created_at;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'radio_dev' AND table_name = 'visuals_folder_assets' AND column_name = 'public_url'
  ) INTO has_public_url;

  -- Matches getVisualsFolderAssets(): folder_id equality + active/public assets + created_at ordering.
  -- The partial predicate keeps this index small and avoids indexing hidden/unusable assets.
  IF has_folder_id AND has_status AND has_created_at AND has_public_url
     AND NOT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'radio_dev'
         AND tablename = 'visuals_folder_assets'
         AND lower(indexdef) LIKE '%folder_id%'
         AND lower(indexdef) LIKE '%created_at%'
         AND lower(indexdef) LIKE '%where%'
         AND lower(indexdef) LIKE '%status%'
     ) THEN
    EXECUTE $index$
      CREATE INDEX visuals_folder_assets_active_folder_created_idx
      ON radio_dev.visuals_folder_assets (folder_id, created_at ASC)
      WHERE status <> 'hidden' AND public_url IS NOT NULL AND public_url <> ''
    $index$;
    RAISE NOTICE 'Created visuals_folder_assets_active_folder_created_idx.';
  ELSE
    RAISE NOTICE 'Skipped VEC folder-asset composite index: equivalent partial index already exists or required columns are unavailable.';
  END IF;
END
$$;

-- Refresh planner statistics only for tables that actually exist.
DO $$
BEGIN
  IF to_regclass('radio_dev.radio_events') IS NOT NULL THEN
    EXECUTE 'ANALYZE radio_dev.radio_events';
  END IF;
  IF to_regclass('radio_dev.visuals_folder_assets') IS NOT NULL THEN
    EXECUTE 'ANALYZE radio_dev.visuals_folder_assets';
  END IF;
END
$$;

COMMIT;
