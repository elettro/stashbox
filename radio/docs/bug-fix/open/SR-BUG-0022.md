# SR-BUG-0022 — Logged-in production profile fails to load on desktop and mobile

- **Status:** Fix v2 deployed, verification pending
- **Verification:** Pending desktop Chrome and mobile retest
- **Severity:** High
- **Area:** Profile / Auth
- **Environment:** PROD Desktop + Mobile
- **Reported:** 2026-08-23

## Symptom

A listener is visibly logged in on production Stashbox Radio, but opening the profile page at `/radio/profile/` fails with:

- `PROFILE COULD NOT LOAD`
- `Failed to fetch` or `Load failed`

The failure was first reproduced on iPhone Safari. A later retest on 2026-08-23 reproduced the same production failure on desktop Chrome and mobile.

## Findings

The production profile boot restores the V2 listener session before loading the profile application. The profile then loads `/radio/me` plus preferences, favorites, playlists, history, follows, and the public song catalog.

A live production CORS diagnostic passed:

- `/radio/auth/config` returned `200` with the expected CORS headers.
- Unauthenticated `/radio/me` returned `401` with CORS.
- Invalid-token `/radio/me` returned `401` with CORS.
- `OPTIONS /radio/me` with `authorization` returned `204`.
- `OPTIONS /radio/me` with `authorization,x-cognito-id-token` returned `204`.

This ruled out API Gateway browser preflight as the primary cause.

The first repair changed `profile-fetch-repair.js` so authenticated profile calls stayed inside the renewable `v2-session-manager.js` fetch path. That repair was correct, but the profile page still referenced `v2-session-manager.js` using the old `v=20260802-profile-login-repair1` URL even though the session manager itself had been updated later. Browsers that already cached that August 2 URL kept executing the stale session manager. The new profile fetch shim therefore routed requests through old cached session logic instead of the current refresh and network-recovery logic.

## Fix v1

On 2026-08-23 the production profile fetch shim was changed so authenticated profile requests stay inside `v2-session-manager.js`.

The repaired path:

1. Uses the renewable production session fetch for authenticated profile calls.
2. Preserves automatic access-token refresh.
3. Preserves 401 refresh/retry behavior.
4. Preserves authenticated GET recovery that retries without `X-Cognito-Id-Token` after a network-level fetch failure.
5. Adds one short outer retry for GET requests that still return a network fetch exception.

Fix commits:

- `157b62f4` — Route production profile fetches through renewable session
- `526271f7` — Bust production profile session fetch cache

## Fix v2

After the desktop and mobile retest still showed `Failed to fetch`, the production profile bootstrap was cache-busted as one stack instead of only cache-busting the fetch shim.

Changes:

1. `radio/profile/index.html` now loads `v2-session-manager.js` with a new 2026-08-23 version URL.
2. `profile-fetch-repair.js` receives a new version URL.
3. `profile-session-loader.js` receives a new version URL.
4. `profile-session-loader.js` now loads `profile.js` with a new version URL.
5. The production profile build marker was incremented.

Fix v2 commits:

- `208040b0` — Force fresh production profile session stack
- `008797e9` — Bust cached production profile app loader

## Related files

- `radio/profile/index.html`
- `radio/profile/profile-session-loader.js`
- `radio/profile/profile.js`
- `radio/profile/profile-fetch-repair.js`
- `radio/v2-session-manager.js`
- `radio/v2-auth-sheet.js`
- `radio-api/video-factory/entry.mjs`
- `radio-api/auth.mjs`
- `.github/workflows/radio-diagnose-prod-profile-cors.yml`
- `.github/workflows/radio-diagnose-prod-profile-auth.yml`

## Verification

Retest production after the new static profile assets reach `stashbox.com`:

- Desktop Chrome while already logged in
- Mobile while already logged in
- Open PROFILE from the production player
- Confirm the profile loads instead of rendering `PROFILE COULD NOT LOAD`
