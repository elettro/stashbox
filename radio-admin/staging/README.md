# Stashbox Radio Admin migration staging

Issue: #1077
Branch: `feature/admin-unification-1077`
Target staging route: `/radio-admin/staging/`

## Guardrails

This workspace exists only for the isolated Admin migration build.

Do not use it as a production cutover until the staged migration has completed DEV QA, PROD read-only verification, explicit PROD write approval, backup/checkpoint work, and final cutover approval.

Explicitly untouched during the current build phase:

- `/radio-admin/dev/`
- existing `/radio-admin/`
- `/radio/`
- PROD RDS
- PROD Lambda
- PROD S3
- PROD API Gateway
- PROD auth/session behavior

## Implemented

- centralized DEV/PROD environment manifest
- separate target token namespaces
- hard block on PROD writes in staging
- staging Dashboard reads DEV summary/song stats
- staging Songs catalog reads and searches DEV songs
- staging Song CMS creates DEV songs with `POST /admin/songs`
- staging Song CMS edits DEV songs with `PUT /admin/songs/{song_key}`
- modern metadata fields included in the migrated editor
- six-image DEV artwork library ported for 1:1, 9:16, 16:9, 3:4, 4:5, and 21:9
- artwork upload uses the existing DEV `/admin/uploads/presign` flow and DEV artwork attach endpoint
- current legacy DEV admin token may be read as a fallback without deleting or modifying it

## Still to migrate

- audio/media upload workflow
- deeper visual asset management
- VEC
- Video Factory
- Ads
- Artists
- Notifications
- Bug Base integration
- environment-correct System Health
- Social Factory navigation/integration
- DEV staging QA
- PROD read-only validation
- controlled PROD write validation only after explicit approval
- backup/checkpoint and cutover workflow

## Target data policy

Songs become the canonical LIVE catalog eventually. DEV/V2 and production should read the same real song catalog after the migration is proven safe.

Ads, VEC configuration, analytics, notifications, health checks, and job/render systems remain environment-specific.

Social Factory remains a separate DEV-only service until an explicit PROD implementation exists.
