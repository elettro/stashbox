# SR-BUG-0022 — Logged-in production profile fails to load on iPhone Safari

- **Status:** Fixed, verification pending
- **Verification:** Pending iPhone Safari retest
- **Severity:** High
- **Area:** Profile / Auth
- **Environment:** PROD Mobile Safari
- **Reported:** 2026-08-23

## Symptom

A listener is visibly logged in on production Stashbox Radio, but opening the profile page at `/radio/profile/` fails with:

- `PROFILE COULD NOT LOAD`
- `Load failed`

The failure was reproduced by the user on iPhone Safari on 2026-08-23.

## Findings

The production profile boot restores the V2 listener session before loading the profile application. The profile then loads `/radio/me` plus preferences, favorites, playlists, history, follows, and the public song catalog.

A live production CORS diagnostic passed:

- `/radio/auth/config` returned `200` with the expected CORS headers.
- Unauthenticated `/radio/me` returned `401` with CORS.
- Invalid-token `/radio/me` returned `401` with CORS.
- `OPTIONS /radio/me` with `authorization` returned `204`.
- `OPTIONS /radio/me` with `authorization,x-cognito-id-token` returned `204`.

This ruled out API Gateway browser preflight as the primary cause.

The profile still loaded the August 4 `profile-fetch-repair.js` shim. For authenticated profile requests that shim deliberately bypassed `v2-session-manager.js` and sent the request through a captured native `fetch`. That bypass removed the newer production session manager's access-token refresh, 401 recovery, and Safari authenticated-request recovery from the profile data path.

The attempted disposable authenticated backend smoke could not create a temporary Cognito listener because the existing GitHub Actions IAM user does not have `cognito-idp:AdminCreateUser` permission. No production IAM permissions were broadened for this diagnosis.

## Fix

On 2026-08-23 the production profile fetch shim was changed so authenticated profile requests stay inside `v2-session-manager.js`.

The repaired path now:

1. Uses the renewable production session fetch for authenticated profile calls.
2. Preserves automatic access-token refresh.
3. Preserves 401 refresh/retry behavior.
4. Preserves Safari recovery that retries without `X-Cognito-Id-Token` when Safari reports a network-level fetch failure.
5. Adds one short outer retry for GET requests that still return a Safari-style network fetch exception.
6. Bumps the profile fetch script URL to `v=20260823-profilefetch2` so iPhone Safari does not keep the August 4 shim from cache.

Fix commits:

- `157b62f4` — Route production profile fetches through renewable session
- `526271f7` — Bust production profile session fetch cache

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

Pending the user's iPhone Safari production retest after the new static profile assets reach `stashbox.com`.