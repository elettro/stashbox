# Radio true DEV schema runbook

This runbook describes how to manually create and validate the true DEV database schema `radio_dev` for the Stashbox Radio API.

## Scope and non-goals

This task creates repository files only. Do **not** deploy code, run AWS commands, connect automation to RDS, execute SQL from CI, change S3, change API Gateway, or change Lambda configuration as part of this repo change.

The canonical Lambda supports `PGSCHEMA`. Production must continue to use the default production schema `radio`. A later DEV-only Lambda environment update may set:

```text
PGSCHEMA=radio_dev
```

## Manual AWS/RDS context

Use the normal approved operations process to identify the correct RDS PostgreSQL instance and credentials. Do not infer or copy credentials into this repository. Open the connection manually in DBeaver using approved secrets handling. Confirm you are connected to the intended database before running any script.

Before executing SQL, verify all of the following in DBeaver:

- The connection points at the approved RDS PostgreSQL database.
- The production schema is named `radio`.
- The DEV schema to create is exactly `radio_dev`.
- You have an approved backup or snapshot of the production schema/database.
- You have approval to create and seed a DEV schema.

## Recommended schema creation approach

Use `radio-api/db/dev/CREATE_RADIO_DEV_SCHEMA.sql` first. It creates `radio_dev` and clones expected table structures from `radio` with PostgreSQL `CREATE TABLE ... (LIKE ... INCLUDING ALL)` when the source tables exist.

This is intentionally safer than hand-writing every column, constraint, default, and index from memory. It avoids destructive reset behavior and avoids modifying `radio`.

After creation, inspect the resulting schema manually because complex objects can require follow-up review:

- Foreign keys may still reference production-side tables or may need DEV-specific recreation depending on PostgreSQL behavior and existing definitions.
- Sequence ownership and identity behavior should be checked.
- Extension-backed defaults or indexes should be verified.
- Index names and constraint names may be generated or copied differently depending on PostgreSQL version.

Useful inspection queries after creation:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('radio', 'radio_dev')
ORDER BY table_schema, table_name;

SELECT conname, contype, conrelid::regclass AS table_name, confrelid::regclass AS references_table
FROM pg_constraint
WHERE connamespace = 'radio_dev'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'radio_dev'
ORDER BY tablename, indexname;

SELECT sequence_schema, sequence_name
FROM information_schema.sequences
WHERE sequence_schema = 'radio_dev'
ORDER BY sequence_name;
```

## Exact order to run later in DBeaver

1. **Back up production schema/database.** Use the approved RDS backup/snapshot process before any manual schema work.
2. **Run create script.** Open and execute `radio-api/db/dev/CREATE_RADIO_DEV_SCHEMA.sql` in DBeaver.
3. **Inspect cloned structure.** Review table presence, indexes, constraints, foreign keys, defaults, identity/sequence behavior, and extension dependencies.
4. **Run seed script.** Open and execute `radio-api/db/dev/SEED_RADIO_DEV_FROM_PROD.sql` in DBeaver.
5. **Run validate script.** Open and execute `radio-api/db/dev/VALIDATE_RADIO_DEV_SCHEMA.sql` in DBeaver and review every result set and notice.
6. **Manual QA.** Confirm representative reads against `radio_dev`, confirm DEV ad settings row `id = 'dev'`, and confirm `radio_events` remains empty or intentionally tiny.
7. **Later DEV Lambda env update only after approval.** Set the DEV Lambda environment variable `PGSCHEMA=radio_dev` in a separate approved deployment/change task.

## Seed behavior

`SEED_RADIO_DEV_FROM_PROD.sql` copies baseline content from `radio` into empty `radio_dev` tables for:

- `songs`
- `albums`
- `song_specific_products`
- `ads`
- `ad_settings`
- `visuals_folders`
- `visuals_folder_artist_matches`
- `visuals_folder_genre_matches`
- `visuals_folder_mood_matches`
- `visuals_folder_song_matches`
- `visuals_folder_assets`
- `song_visual_assets`
- `song_visual_recipes`
- `song_visuals_folders`

The script skips a DEV table if it already has rows. It also inserts a DEV-specific `ad_settings` row with `id = 'dev'` if that row does not already exist.

`radio_events` is intentionally not seeded. DEV event/stat history should stay separate from production. If a tiny sample is ever required, add an explicitly approved, column-specific sample insert in the commented section of the seed script.

## Validation expectations

`VALIDATE_RADIO_DEV_SCHEMA.sql` is SELECT-only. It checks:

- Expected table presence in `radio_dev`.
- Total expected tables found.
- Production versus DEV base table counts.
- Key tables: `songs`, `radio_events`, `ads`, `ad_settings`, `visuals_folders`, `visuals_folder_assets`, `song_visual_assets`, and `song_visual_recipes`.
- DEV ad settings row existence for `id = 'dev'`.
- A final safety note stating that the validation script contains no production write statements.

## Rollback if abandoned

If the DEV schema is abandoned before use, drop only `radio_dev` after explicit approval:

```sql
-- Manual rollback only after approval.
-- Never run this against radio.
DROP SCHEMA radio_dev CASCADE;
```

Never drop, truncate, or reset the production `radio` schema as part of DEV rollback.

## Risk notes

- **Foreign keys:** cloned constraints may reference production tables or may require manual recreation against `radio_dev`.
- **Indexes:** verify performance-critical and uniqueness indexes exist after cloning.
- **Sequences/identity columns:** verify defaults, ownership, and next values before DEV writes begin.
- **Extension dependencies:** extension-backed defaults, operators, index methods, or functions must exist in the target database.
- **Existing direct S3 URLs:** copied content may include direct production S3/public URLs; this task does not copy or modify S3 objects.
- **`radio_events`:** keep DEV events/stat history separate from production to prevent misleading analytics.
- **Re-runs:** create is idempotent for existing tables; seed skips non-empty DEV tables rather than destructively resetting them.

## Manual QA after schema exists

After validation passes and before any Lambda environment change:

1. In DBeaver, browse `radio_dev.songs`, `radio_dev.ads`, and visual tables and confirm expected rows are readable.
2. Confirm `radio_dev.ad_settings` contains `id = 'dev'`.
3. Confirm `radio_dev.radio_events` is empty unless a tiny sample was explicitly approved.
4. Confirm no manual statements were run against `radio` except read-only inspection and backup operations.
5. Confirm copied URLs and asset references are acceptable for DEV testing.
6. Capture validation results in the change record before setting `PGSCHEMA=radio_dev` later.
