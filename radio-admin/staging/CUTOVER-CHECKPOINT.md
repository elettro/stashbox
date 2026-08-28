# Stashbox Radio Admin Unification — Pre-Cutover Checkpoint

Date: 2026-08-28
Issue: #1077

## Git checkpoints

- Current production/main checkpoint: `99ac45fc8c45abdc062a8471ead627567f509484`
- Immutable rollback branch created: `checkpoint/admin-unification-precutover-20260828`
- Migration/reference branch: `feature/admin-unification-1077`
- Migration/reference tested head: `731d6ef1c85f7404c9014fe25a68e36302ea2461`
- Materialized cutover candidate branch: `feature/admin-unification-1077-cutover-candidate`
- Candidate QA head before this documentation commit: `9a4492e41c84f8afe31701a1349a8d539cc7287f`

## Verified data state

Phase 4 live GET-only parity validation found:

- DEV public song catalog: 84 songs
- PROD public song catalog: 84 songs
- Song-key parity: 84/84
- DEV-only song keys: 0
- PROD-only song keys: 0
- PROD exposes all player-required song fields
- Both protected `/admin/songs` routes return 401 without an admin token

## Candidate behavior

The materialized candidate has been browser-QA tested in isolation.

Player candidate:

- `/radio/` mobile reads the canonical PROD song catalog.
- `/radio/desktop/` reads the canonical PROD song catalog.
- `/radio/dev/v2/` mobile reads the same canonical PROD song catalog.
- `/radio/dev/v2/desktop/` reads the same canonical PROD song catalog.
- DEV song-catalog fallback is removed from the candidate canonical source.
- The canonical catalog guard is read-only.
- DEV/V2 VEC, auth, analytics, Ads and other development behavior remain environment-specific.

Unified Admin candidate:

- Song CMS targets the canonical PROD song environment.
- Song CMS uses the separate `radio_admin_token_prod` namespace.
- Audio/visual/artwork uploads are restricted to `stashbox-radio-media-prod-us-east-1`.
- Production Song CMS writes remain hard-locked.
- The committed configuration still has `productionWritesApproved: false`, `stagingProdWritesAllowed: false`, and PROD `writesAllowedInStaging: false`.

## QA evidence

- Final mocked canonical write rehearsal: PASS — workflow run `33220652299`.
  - Metadata PUT rehearsed against mocked PROD.
  - Audio presign + PROD S3 PUT rehearsed.
  - Artwork presign + PROD S3 PUT + artwork PATCH rehearsed.
  - No DEV requests were allowed.
  - The committed PROD write locks remained closed after the test.
- Materialized candidate locked QA: PASS — workflow run `33220878519`.
  - Candidate diff matched the planned production-facing files.
  - Both player families routed song reads to canonical PROD.
  - Candidate Admin read PROD successfully.
  - Candidate Admin writes were blocked before network.

## Existing fallbacks that must remain available through cutover

- Existing modern DEV Admin: `/radio-admin/dev/`
- Existing ancient PROD Admin: `/radio-admin/`
- Planned legacy location after cutover: `/radio-admin/legacy/`
- Existing production player: `/radio/`
- Existing DEV/V2 player: `/radio/dev/v2/`

Do not delete the existing DEV Admin or ancient PROD Admin during initial cutover.

## Git rollback

If a frontend cutover is deployed and needs immediate rollback, restore the production frontend to:

`checkpoint/admin-unification-precutover-20260828`

which points exactly to:

`99ac45fc8c45abdc062a8471ead627567f509484`

The candidate branch is disposable and can be deleted without altering the checkpoint branch or current main.

## PROD infrastructure checkpoint still required before the first real write/cutover

These have NOT been created or changed during Phase 4 read-only validation:

- RDS production snapshot for schema/database state used by `radio`
- Lambda production version/alias checkpoint for `stashbox-radio-api-prod-v2`
- API Gateway production configuration/export for `je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2`
- S3 production media configuration/versioning checkpoint for `stashbox-radio-media-prod-us-east-1`
- Production admin token/auth configuration checkpoint

Those infrastructure backup actions must happen immediately before controlled PROD-write testing or cutover, not during read-only validation.

## Next approval boundary

The next step that changes real production state is a controlled PROD Song CMS write test. Do not perform it without explicit approval.

Recommended first live write:

1. Select one existing non-critical/test song.
2. Change one harmless reversible metadata field.
3. Verify the change through the unified Admin.
4. Verify the same song data is visible from both `/radio/` and `/radio/dev/v2/` canonical reads.
5. Revert the metadata field and verify the revert.
6. Stop immediately on any route, token, media, or schema discrepancy.
