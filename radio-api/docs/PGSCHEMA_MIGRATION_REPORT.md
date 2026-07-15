# PGSCHEMA Migration Report

Date: 2026-07-15
Scope: `radio-api/index.mjs` code preparation only.

## Summary

`radio-api/index.mjs` now supports schema selection through `PGSCHEMA` for true DEV/PROD database schema separation.

- Default behavior remains production-compatible: when `PGSCHEMA` is unset, the schema is `radio`.
- `PGSCHEMA` is validated with a strict safe-identifier allowlist: letters, numbers, and underscores only.
- Qualified application table names are emitted as safely quoted names in the form `"schema"."table"`.
- `information_schema` checks that previously targeted `table_schema = 'radio'` now use the configured schema.
- No route names, response shapes, upload behavior, or S3 behavior were intentionally changed.

## Helpers added

- `getDbSchema()` reads `process.env.PGSCHEMA`, defaults to `radio`, validates the schema identifier, and rejects unsafe names.
- `qname(tableName)` validates the table name and returns a quoted qualified table name.

## Tables migrated to dynamic schema references

The migration covered the practical hardcoded references for:

- `songs`
- `ads`
- `ad_settings`
- `radio_events`
- `albums`
- `song_specific_products`
- `visuals_folders`
- `visuals_folder_artist_matches`
- `visuals_folder_genre_matches`
- `visuals_folder_mood_matches`
- `visuals_folder_song_matches`
- `visuals_folder_assets`
- `song_visual_assets`
- `song_visual_recipes`
- `song_visuals_folders`

## Remaining hardcoded `radio.` references

Requested search command:

```bash
rg "radio\." radio-api/index.mjs
```

Result at migration time:

```text
// Used for true DEV/PROD database schema separation. Default is production schema radio.
```

There are no remaining SQL table references using hardcoded `radio.`. The only remaining match is the required helper comment text and is not a database table reference.

## Production default

Production remains unchanged when `PGSCHEMA` is unset because `getDbSchema()` defaults to `radio`.

## Syntax check

```bash
node --check radio-api/index.mjs
```

Result: passed.

## Risk areas

- Dynamic schema behavior depends on the DEV schema having the same tables, columns, constraints, indexes, and compatible lookup data as production where routes expect them.
- Foreign-key metadata and auto-created album logic now inspect the configured schema; mismatched DEV constraints may alter validation outcomes compared with production.
- Stats/event table discovery now prefers the configured schema before public fallback event tables; dashboards should be checked against DEV seed data.
- Runtime DDL helpers now target the configured schema. Ensure the DEV database user has required privileges in `radio_dev`, and production users retain existing privileges in `radio`.

## Manual QA checklist

1. Run Lambda locally or in a safe DEV environment with `PGSCHEMA=radio_dev` and confirm `/radio/songs` reads from DEV data.
2. Confirm admin song create/update writes only to `radio_dev.songs`.
3. Confirm play, like, share, and ad event tracking writes only to DEV event/ad tables.
4. Confirm ad settings read/write uses the configured schema and `AD_SETTINGS_ID=dev` in DEV.
5. Confirm visuals folder CRUD and song visual assets read/write use `radio_dev` tables.
6. Confirm upload presigning still returns the expected S3 bucket/key shape and does not depend on database schema.
7. Repeat a smoke test with `PGSCHEMA` unset and verify production-targeted SQL still resolves to `radio`.
8. Test invalid schema values such as `radio-dev`, `radio.dev`, or `radio;drop` and confirm startup/request handling rejects them before SQL execution.
