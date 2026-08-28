# Stashbox Radio Admin migration staging

Tracking: GitHub issue #1077

This directory is the isolated Phase 2 workspace for consolidating the modern Radio Admin without changing the current DEV Admin, ancient PROD Admin, or production player.

## Hard guardrails

- Do not modify `/radio-admin/dev/` as part of staging work.
- Do not replace `/radio-admin/` until explicit cutover approval.
- Do not modify `/radio/` during the staging build.
- Do not delete the ancient PROD Admin. At cutover it is intended to move to `/radio-admin/legacy/`.
- PROD writes are blocked in the staging environment manifest.
- PROD analytics freeze/protection remains in place until separate read-only validation proves the modern analytics safe.
- DEV and PROD Ads, VEC configuration, analytics, notifications, health, and job systems remain environment-specific.
- Social Factory remains a separate DEV service unless a PROD stack is explicitly designed and approved.

## Target song model

Songs are the exception to normal environment separation. The target architecture is one canonical LIVE song catalog keyed by the production song identity. Production `/radio/` and development `/radio/dev/v2/` should ultimately read the same real-song catalog, while development playback behavior, VEC configuration, test analytics, Ads, auth, and other experimental behavior remain DEV-specific.

No production song write is enabled by this staging build.

## Build sequence

1. Centralized environment and route manifest.
2. Shared staging shell/navigation.
3. Dashboard migration against DEV only.
4. Song CMS migration with canonical-song abstraction while still using DEV-only writes in staging.
5. Migrate VEC, Video Factory, Ads, Artists, Notifications, Bugs, Health, and Social Factory navigation with explicit module policies.
6. Complete DEV QA.
7. Separate Phase 4 PROD read-only validation.
8. PROD write testing only after explicit approval.
9. Snapshot/checkpoint and rollback plan.
10. Cutover only after explicit approval.

## Current status

Implemented on branch `feature/admin-unification-1077`:

- staging Dashboard reads DEV stats
- staging Song catalog reads/searches DEV songs
- Song create/edit against DEV only
- modern song metadata editor
- audio upload through DEV presign
- song-specific visual image/clip uploads through DEV presign
- six-image artwork workflow for 1:1, 9:16, 16:9, 3:4, 4:5, and 21:9
- Song editor dependent controls synchronize correctly after create/edit mode changes
- browser/CI smoke test with mocked DEV API and explicit PROD-request failure condition
- Song CMS browser QA is GREEN: render, create POST, edit PUT, dependent controls, console/page errors, and no-PROD guard all passed
- VEC controller and styles copied into an isolated staging module without changing `/radio-admin/dev/vec/`
- Video Factory copied into an isolated staging module with DEV-only API behavior and migration token bridging
- staging navigation now routes Dashboard, Songs, VEC and Video Factory within the isolated Admin

Production cutover and production writes remain explicitly unapproved.
