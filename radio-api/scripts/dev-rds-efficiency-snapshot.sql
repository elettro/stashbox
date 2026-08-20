-- Stashbox Radio TRUE DEV — read-only RDS efficiency snapshot
-- 2026-08-20
-- SAFE: SELECT-only. Does not reset PostgreSQL statistics or change schema/data.

-- 1) Confirm target and basic database size.
SELECT
  current_database() AS database_name,
  current_user AS connected_user,
  to_regnamespace('radio_dev') IS NOT NULL AS radio_dev_exists,
  pg_size_pretty(pg_database_size(current_database())) AS database_size,
  now() AS captured_at;

-- 2) Database-wide activity counters and PostgreSQL buffer-cache effectiveness.
SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_pct,
  tup_returned,
  tup_fetched,
  tup_inserted,
  tup_updated,
  tup_deleted,
  temp_files,
  pg_size_pretty(temp_bytes) AS temp_bytes,
  deadlocks,
  stats_reset
FROM pg_stat_database
WHERE datname = current_database();

-- 3) Current connections grouped by application/state.
SELECT
  COALESCE(NULLIF(application_name, ''), '(unnamed)') AS application_name,
  state,
  COUNT(*)::int AS connections,
  MIN(backend_start) AS oldest_backend,
  MAX(state_change) AS latest_state_change
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
GROUP BY 1, 2
ORDER BY connections DESC, application_name, state;

-- 4) radio_dev table footprint. Largest/highest-growth tables appear first.
SELECT
  c.relname AS table_name,
  c.reltuples::bigint AS estimated_rows,
  pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'radio_dev'
  AND c.relkind = 'r'
ORDER BY total_bytes DESC, c.relname;

-- 5) Table access patterns. High seq_tup_read on growing tables is a query/index target.
SELECT
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_live_tup,
  n_dead_tup,
  last_analyze,
  last_autoanalyze,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'radio_dev'
ORDER BY seq_tup_read DESC, seq_scan DESC, relname;

-- 6) Index usage and index footprint.
SELECT
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'radio_dev'
ORDER BY idx_scan DESC, relname, indexrelname;

-- 7) Confirm whether pg_stat_statements is available for query-level profiling.
SELECT EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_stat_statements'
) AS pg_stat_statements_installed;

-- 8) TRUE DEV Lambda pooled connections specifically.
SELECT
  pid,
  application_name,
  state,
  backend_start,
  state_change,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE application_name = 'stashbox-radio-dev-lambda-reuse'
ORDER BY backend_start;
