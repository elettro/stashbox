# SR-BUG-0017 — First mobile login can stall on “Logging In…” while retry succeeds immediately

- **Status:** Fixed
- **Verification:** Verified
- **Severity:** High
- **Area:** Auth / Login
- **Environment:** DEV V2 Mobile
- **Reported:** 2026-08-21
- **Fixed:** 2026-08-21
- **Verified:** 2026-08-21

## Symptom

On mobile DEV V2, the first login attempt could remain on the green `Logging In…` status for 20+ seconds. Repeating the same login immediately afterward completed very quickly.

## Root cause

The V2 fast-login module was dynamically injected by `v2-login-direct.js`. On a cold mobile page, the login form could be submitted before that module finished loading. The first submission could therefore fall through to the older auth-sheet handler, which waits for `/radio/me` account hydration after Cognito authentication before completing the login UI. Once the fast-login module was loaded, subsequent attempts used the fast path and completed immediately.

## Fix

`v2-login-direct.js` now treats the fast-login module as a required first-login dependency. If a login submit happens before the module is ready, the submission is held, the fast module is loaded, and the form is replayed through the fast handler. It no longer falls through to the slower legacy `/radio/me`-gated completion path.

The fix does not change Cognito credential validation, playback, VEC behavior, listener event collection, or production routes.

## Files changed

- `radio/dev/v2/v2-login-direct.js`

## Fix commit

- `528fed478d645d96083d58a2cea289df41b0e28d`

## Verification

User explicitly verified on 2026-08-21 that the next mobile login completed very fast on the first attempt after the repair.

## Future repair guidance

If first-login latency returns while immediate retry remains fast, verify that `StashboxV2LoginFastPath` is installed before the login submission is allowed to reach the legacy auth-sheet handler. Do not solve this by increasing AWS capacity unless measurements show a separate backend latency problem.
