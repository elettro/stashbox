# Radio database scripts

This folder contains **manual-only** database preparation scripts for the Stashbox Radio API.

## Safety rules

- These scripts are repo artifacts only; committing them does not deploy anything.
- Do not run them from automation, Lambda startup, CI, or deployment scripts.
- Run them manually in DBeaver only after approval and after a production backup.
- The production schema is `radio`.
- The true DEV schema is `radio_dev`.
- Production remains the default runtime schema unless a later DEV Lambda environment change sets `PGSCHEMA=radio_dev`.

## Files

- `dev/CREATE_RADIO_DEV_SCHEMA.sql` creates `radio_dev` and clones table structure from `radio` when the source table exists.
- `dev/SEED_RADIO_DEV_FROM_PROD.sql` copies approved baseline data from `radio` to empty `radio_dev` tables without touching production.
- `dev/VALIDATE_RADIO_DEV_SCHEMA.sql` runs read-only checks for expected tables, source/DEV row counts, required key tables, and the DEV `ad_settings` row.

## Recommended workflow

1. Read `../docs/RADIO_DEV_SCHEMA_RUNBOOK.md`.
2. Back up the production `radio` schema.
3. Run `dev/CREATE_RADIO_DEV_SCHEMA.sql` manually in DBeaver.
4. Review the created schema and constraints/indexes.
5. Run `dev/SEED_RADIO_DEV_FROM_PROD.sql` manually in DBeaver.
6. Run `dev/VALIDATE_RADIO_DEV_SCHEMA.sql` manually in DBeaver.
7. Only after validation, update the DEV Lambda environment later to use `PGSCHEMA=radio_dev`.

Do not drop, truncate, or overwrite the production `radio` schema.
