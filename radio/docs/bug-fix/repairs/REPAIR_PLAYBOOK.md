# Stashbox Radio Repair Playbook

Use this directory for reusable troubleshooting and repair knowledge extracted from resolved bugs.

## Start here

1. Identify the visible symptom.
2. Search `../BUG_INDEX.md` for a matching bug.
3. Search the relevant system-area playbook below.
4. Inspect the current code and current runtime state.
5. Reuse a previous solution only when the current root cause matches.

## System playbooks

- `PLAYER_REPAIRS.md` - audio transport, media surface, artwork, titles, gestures, playback state.
- `VEC_REPAIRS.md` - visual recipes, image/video rotation, clip ownership, transitions, folders, duplicate/repeat behavior.
- `VIDEO_FACTORY_REPAIRS.md` - rendering, jobs, receipts, social export, ratios, publishing handoff.
- `AUTH_REPAIRS.md` - login, signup, sessions, passwords, roles, account state.
- `ADS_REPAIRS.md` - ad upload, targeting, playback, skip/mute behavior.
- `NOTIFICATIONS_REPAIRS.md` - notification feed, freshness, delivery, seen state.
- `API_REPAIRS.md` - Lambda/API Gateway, request/response, database, S3, permissions, CORS.

## Cross-system diagnostic order

When scope is unclear, check in this order:

1. Reproduction and environment.
2. Browser console/runtime state.
3. Current song/item/job identity.
4. Frontend ownership/state transitions.
5. API response and record identity.
6. Database/source data.
7. S3/media asset validity.
8. Deployment/build mismatch.
9. Regression against previous fixing commit.

## Repair record requirements

A reusable repair entry should contain:

- Symptom pattern.
- Fast diagnostic checks.
- Known root causes.
- Successful repair.
- Files or services commonly involved.
- Regression checks.
- Related SR-BUG IDs.

The goal is fast diagnosis without blindly repeating historical patches.