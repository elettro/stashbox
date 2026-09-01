# Stashbox Radio Admin migration staging

Tracking: GitHub issue #1077

This directory is the isolated Phase 2 workspace for consolidating the modern Radio Admin without changing the current DEV Admin, ancient PROD Admin, or production player.

## Hard guardrails

- Do not modify `/radio-admin/dev/` as part of staging work.
- Do not replace `/radio-admin/` until explicit cutover approval.
- Do not modify `/radio/` during the staging build.
- Do not delete the ancient PROD Admin. At cutover it is intended to move to `/radio-admin/legacy/`.
- PROD reads and writes remain outside Phase 2. No production validation starts without explicit approval.
- PROD writes are blocked in the staging environment manifest.
- PROD analytics freeze/protection remains in place until separate read-only validation proves the modern analytics safe.
- DEV and PROD Ads, VEC configuration, analytics, notifications, health, and job systems remain environment-specific.
- Social Factory remains a separate DEV service unless a PROD stack is explicitly designed and approved.
- `/radio-admin/dev/` remains an untouched fallback during migration.

## Target song model

Songs are the exception to normal environment separation. The target architecture is one canonical LIVE song catalog keyed by the production song identity. Production `/radio/` and development `/radio/dev/v2/` should ultimately read the same real-song catalog, while development playback behavior, VEC configuration, test analytics, Ads, auth, and other experimental behavior remain DEV-specific.

No production song read/write migration is enabled by this Phase 2 staging build.

## Build sequence

1. Centralized environment and route manifest. **Complete.**
2. Shared staging shell/navigation. **Complete.**
3. Dashboard migration against DEV only. **Complete.**
4. Song CMS migration with canonical-song abstraction while still using DEV-only writes in staging. **Complete.**
5. Migrate VEC, Video Factory, Video Library, Ads, Artists, Notifications, Bugs, Health, and Social Factory navigation with explicit module policies. **Complete.**
6. Complete DEV QA. **Complete.**
7. Separate Phase 4 PROD read-only validation. **Not started; requires explicit approval.**
8. PROD write testing. **Not started; requires explicit approval.**
9. Snapshot/checkpoint and rollback plan. **Pending before any cutover.**
10. Cutover. **Not approved.**

## Phase 2 DEV checkpoint

Implemented on branch `feature/admin-unification-1077` and retained in draft PR #1081:

- centralized staging navigation and DEV/PROD environment policy in `admin-env.js`
- namespaced DEV token support with legacy DEV-token fallback where required
- staging Dashboard reading DEV private stats only
- Song catalog/search plus DEV song create/edit
- modern song metadata editor
- DEV audio presign/upload
- song-specific visual image/clip uploads through DEV presign
- six-image artwork workflow for 1:1, 9:16, 16:9, 3:4, 4:5, and 21:9
- Song editor dependent-control synchronization
- VEC controller behind DEV API/storage migration guards
- Video Factory draft/render/retry/cancel/archive/restore with DEV job/output guards
- Video Library folder create/edit, song-folder mapping and visual mix mode
- Video Library DEV media upload, asset metadata/status, and asset hide behavior
- Video Library duplicate filename safety: Skip, Replace, and Keep Both
- Ads settings, CRUD, and DEV video upload without browser fallback inventory
- Artist metadata, profile/horizontal/vertical media, and delegated-access administration
- Notification draft/create/edit/publish/archive lifecycle
- Bug Base shared read-only registry
- DEV System Health with zero-write/zero-PROD behavior and heavy dashboard-summary freeze
- Social Factory retained as a separate DEV-only service reached through unified navigation

## QA checkpoint

Browser and static CI coverage includes:

- Song CMS create/edit/media/artwork behavior and no-PROD guard
- migrated module startup/navigation behavior
- VEC API and storage boundaries
- Ads CRUD/settings/upload
- Artist metadata/media/access administration
- Notification lifecycle
- Video Factory write/action/signed-output boundaries
- Video Library folder/mapping/asset/upload behavior
- Video Library duplicate Skip / Replace / Keep Both behavior
- DEV System Health read-only behavior and analytics freeze

The latest completed pre-checkpoint branch run had the master staging workflow, Video Library workflow, Video Factory workflow, and System Health workflow all green. Final documentation/navigation checkpoint changes must also pass before Phase 2 is considered frozen.

## Explicitly not done

- no PROD API read validation
- no PROD database reads or writes for migration testing
- no production Song CMS writes
- no production Ads/VEC/Notifications/Artist/Video Factory writes
- no `/radio-admin/` replacement
- no `/radio-admin/legacy/` move
- no `/radio/` changes
- no merge of draft PR #1081 for cutover
- no production AWS configuration changes

Production read validation, production writes, and cutover remain explicitly unapproved.
