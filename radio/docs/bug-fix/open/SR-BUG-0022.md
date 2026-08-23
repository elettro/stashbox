# SR-BUG-0022 — Logged-in production profile fails to load on iPhone Safari

- **Status:** Investigating
- **Verification:** Pending
- **Severity:** High
- **Area:** Profile / Auth
- **Environment:** PROD Mobile Safari
- **Reported:** 2026-08-23

## Symptom

A listener is visibly logged in on production Stashbox Radio, but opening the profile page at `/radio/profile/` fails with:

- `PROFILE COULD NOT LOAD`
- `Load failed`

The failure was reproduced by the user on iPhone Safari on 2026-08-23.

## Current evidence

The profile boot waits for the production session restore gate, then loads `/radio/me` plus preferences, favorites, playlists, history, follows, and the public song catalog. The profile treats `/radio/me` as required. If that request rejects at the browser fetch layer, Safari surfaces `Load failed` and the whole profile renders the error screen.

Production account routing auto-syncs a valid Cognito identity into the listener account table, so a missing local profile row should not by itself cause this browser-level `Load failed` message.

The production wrapper emits CORS headers for account routes, but the existing release smoke test does not exercise the browser preflight for authenticated `/radio/me` requests. A failed API Gateway preflight or similar browser-network failure remains the leading investigation path.

## Investigation plan

1. Probe production `OPTIONS /radio/me` with an Origin and `authorization` request header.
2. Probe the same preflight with `authorization,x-cognito-id-token`.
3. Confirm the unauthenticated and invalid-token `/radio/me` responses still include browser-safe CORS headers.
4. Repair the production route or front-end request path based on the observed failure.
5. Add a permanent production release smoke test for authenticated-profile CORS preflight so this regression is blocked in future releases.

## Related files

- `radio/profile/index.html`
- `radio/profile/profile-session-loader.js`
- `radio/profile/profile.js`
- `radio/profile/profile-fetch-repair.js`
- `radio/v2-session-manager.js`
- `radio/v2-auth-sheet.js`
- `radio-api/video-factory/entry.mjs`
- `radio-api/auth.mjs`
- `.github/workflows/release-radio-v2-prod-backend.yml`

## Fix

Pending production diagnostic.

## Verification

Pending iPhone Safari retest after repair.
