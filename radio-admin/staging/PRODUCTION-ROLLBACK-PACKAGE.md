# Stashbox Radio Admin Migration Production Rollback Package

Date recorded: 2026-08-30
Issue: #1077
PR: #1081
Status: PRE-CUTOVER. NO LIVE PROD WRITE AUTHORIZED BY THIS DOCUMENT.

## Purpose

This package defines the exact rollback checkpoints and sequence required before any controlled production Song CMS write or unified Admin cutover.

## Source checkpoints

Migration branch:
`feature/admin-unification-1077`

Migration PR head at package creation:
`731d6ef1c85f7404c9014fe25a68e36302ea2461`

Green migration source head used for the disposable candidate:
`6267d1e72f5478cc2e17078ff6b0fe86282ab1e5`

Materialized locked candidate source commit:
`ce445c2b335cc4d5acaae93e8e6b09451497fc84`

Direct candidate QA head before checkpoint documentation:
`767ce24e3b5fa6ddc3f77d54d8d5463a73ffd830`

Disposable candidate branch:
`feature/admin-unification-1077-cutover-candidate`

Current production/main checkpoint observed before this package:
`fb934cec3720b0130a410e6d5e108bfc23698543`

## Existing production safety gates

The migration remains DRAFT and UNMERGED.

Production write gates remain CLOSED in the migration package:

- `productionWritesApproved: false`
- `stagingProdWritesAllowed: false`
- PROD `writesAllowedInStaging: false`

Do not change these gates as part of rollback preparation.

## Required infrastructure snapshots before first live PROD write

The following receipts must exist before a controlled PROD Song CMS write test:

1. RDS
   - Record DB instance/cluster identifier.
   - Create a manual production snapshot immediately before the write test.
   - Record snapshot identifier and creation timestamp below.

2. Lambda
   - Record the production Radio API function name.
   - Record currently deployed code/version/alias identifier.
   - If versioned aliases are used, record the active alias target.

3. API Gateway
   - Record production API ID, stage, and route mapping used by the canonical Song CMS.
   - Record current stage/deployment identifier.

4. S3
   - Confirm canonical PROD media bucket is `stashbox-radio-media-prod-us-east-1`.
   - Confirm bucket versioning state.
   - For any test media object, record the exact object key and prior version ID if replacing an object.

5. Static/Admin source
   - Record the exact main commit serving production immediately before cutover.
   - Record the exact candidate commit being promoted.

## Infrastructure receipt fields

RDS snapshot ID: PENDING
RDS snapshot timestamp: PENDING

PROD Lambda function/version: PENDING
PROD Lambda alias target: PENDING

PROD API Gateway ID/stage/deployment: PENDING

PROD S3 versioning state: PENDING

Pre-cutover production main SHA: `fb934cec3720b0130a410e6d5e108bfc23698543`
Candidate SHA selected for cutover: PENDING FINAL GATE

## Controlled PROD Song CMS write test rollback

The first live write must be metadata-only unless a separate media-write test is explicitly approved.

Before the write:

1. Select one existing non-critical PROD song.
2. GET and save the complete current song record.
3. Record song key, original value, field being changed, and timestamp.
4. Change one reversible metadata field only.
5. Verify the canonical PROD GET returns the changed value.
6. Restore the exact original value immediately.
7. Verify the canonical PROD GET again matches the saved original record.

Test song key: PENDING
Field changed: PENDING
Original value: PENDING
Temporary test value: PENDING
Write verification: PENDING
Rollback verification: PENDING

A failed restore is a STOP condition. Do not continue to cutover.

## Admin/static rollback sequence

If unified Admin cutover causes a regression:

1. Stop further Admin writes.
2. Restore the pre-cutover production source checkpoint.
3. Restore the previous canonical `/radio-admin/` route contents.
4. Restore previous player route source if the cutover included player routing.
5. Re-deploy the previously recorded production Lambda/API configuration if backend code changed.
6. Re-test `/radio/`, `/radio/desktop/`, `/radio/dev/v2/`, `/radio/dev/v2/desktop/`, and `/radio-admin/`.
7. Confirm PROD Song GET parity before reopening writes.

## RDS rollback sequence

For an isolated Song CMS metadata test, prefer record-level reversal from the saved original row rather than a full database restore.

Use the manual RDS snapshot only for a broader migration failure or data corruption event.

Do not restore the full database for a single successfully identified reversible row unless record-level recovery fails.

## S3 rollback sequence

If a later media write test is approved:

1. Never overwrite without recording the original key/version state.
2. If versioning is enabled, restore the previous object version.
3. If versioning is disabled, preserve the original object under a rollback key before replacement.
4. Restore the original song record URL after restoring the object.
5. Verify the media loads through the canonical player and Admin preview.

## Social Factory isolation check

Social Factory remains a separate DEV-only service during this migration.

Expected private route:
`/radio-admin/dev/social-factory/`

Canonical Admin entry route:
`/radio-admin/social-factory/`

The canonical entry must continue routing into the preserved DEV service. No Social Factory production migration is authorized by this package.

## Stop conditions

Stop immediately if any of the following occurs:

- PROD write gate is open before explicit approval.
- PROD and DEV tokens are no longer isolated.
- Song count/key parity changes unexpectedly.
- A test write cannot be reversed exactly.
- A media write targets a non-PROD bucket.
- Any canonical player loses access to the PROD song catalog.
- Social Factory begins targeting production resources.
- Required infrastructure receipt fields remain PENDING when a live write is about to begin.

## Approval gates

Gate A. Rollback package recorded in repository: COMPLETE.

Gate B. Infrastructure snapshot/receipt fields populated: PENDING.

Gate C. Explicit approval for one controlled reversible PROD Song CMS write test: PENDING.

Gate D. Controlled write and immediate rollback verified: PENDING.

Gate E. Explicit production cutover approval: PENDING.

Until Gates B through E are complete, PR #1081 remains DRAFT / UNMERGED and production cutover remains blocked.
