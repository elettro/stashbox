# SR-BUG-0022 — Logged-in production profile fails to load on desktop and mobile

- **Status:** Backend auth repair deployed, user verification pending
- **Verification:** Pending fresh login plus PROFILE retest on desktop and mobile
- **Severity:** High
- **Area:** Profile / Auth
- **Environment:** PROD Desktop + Mobile
- **Reported:** 2026-08-23

## Symptom

A listener is visibly logged in on production Stashbox Radio, but opening the profile page fails. The observed production behaviors included:

- `PROFILE COULD NOT LOAD`
- `Failed to fetch` or `Load failed`
- after a later hard-refresh retest, PROFILE waits and then returns the listener to the login popup

The failure reproduced on both desktop Chrome and mobile.

## Findings

The production profile loads `/radio/me` as its required authenticated account request. If that request ultimately returns `401`, `profile.js` removes the stored production Cognito token set and redirects the listener back to login. That explains the later symptom where PROFILE waits and then reopens the login UI.

### CORS was not the root cause

A live production CORS diagnostic passed:

- `/radio/auth/config` returned `200` with the expected CORS headers.
- Unauthenticated `/radio/me` returned `401` with CORS.
- Invalid-token `/radio/me` returned `401` with CORS.
- `OPTIONS /radio/me` with `authorization` returned `204`.
- `OPTIONS /radio/me` with `authorization,x-cognito-id-token` returned `204`.

### Frontend session routing and cache were repaired first

The original production profile still used an August 4 fetch shim that bypassed the renewable V2 session manager. Fix v1 routed authenticated profile calls back through `v2-session-manager.js` so refresh, 401 retry, and authenticated network recovery stayed active.

A later retest still failed because the profile page referenced the session manager with an old August 2 cache URL. Fix v2 cache-busted the session manager, profile fetch shim, session loader, and profile application together.

Those changes repaired real frontend defects, but the next desktop and mobile retest still waited and then returned to login.

### Production JWT verifier gap found

A live production runtime diagnostic then inspected the deployed Lambda itself.

Before the backend repair:

- Lambda: `stashbox-radio-api-prod-v2`
- Runtime: Node.js 22
- Lambda attached to 6 VPC subnets and 1 security group
- Production Cognito pool and app client were configured
- `COGNITO_JWKS_JSON` was not configured
- bundled JWKS opt-in was not enabled
- the current production Cognito public JWKS endpoint returned `200` with 2 RSA signing keys

`radio-api/auth.mjs` intentionally refuses to use the bundled DEV signing keys in production. Without `COGNITO_JWKS_JSON`, production JWT verification therefore depended on retrieving Cognito signing keys during the authenticated request path from the VPC-attached Lambda.

That production-only verifier dependency matched the remaining failure path. The public auth configuration itself was healthy, while the problem only surfaced when the profile crossed the authenticated `/radio/me` route.

## Fix v1

Authenticated profile requests were moved back into the renewable production session manager.

Fix commits:

- `157b62f4` — Route production profile fetches through renewable session
- `526271f7` — Bust production profile session fetch cache

## Fix v2

The complete profile session stack was cache-busted so browsers no longer retained the old August session manager.

Fix commits:

- `208040b0` — Force fresh production profile session stack
- `008797e9` — Bust cached production profile app loader

## Fix v3 — production Cognito verifier repair

On 2026-08-23 the current production Cognito JWKS was installed directly into the production Lambda environment as `COGNITO_JWKS_JSON`.

Safety and deployment verification passed:

- JWKS fetched from the exact currently configured production user pool
- 2 RSA signing keys validated
- resulting Lambda environment payload: 1611 bytes
- Lambda state after update: `Active`
- Lambda last update status: `Successful`
- `COGNITO_JWKS_JSON` present after update
- stored JWKS key count: 2
- repair workflow result: `PASS`

This removes the authenticated JWT verifier's dependency on an outbound JWKS fetch during PROFILE requests.

Repair commits:

- `19fb129e` — Add safe PROD Cognito JWKS repair workflow
- `b9b3bd12` — Trigger PROD Cognito JWKS repair
- `654f73a1` — Record successful PROD Cognito JWKS repair

Diagnostic records:

- `radio/docs/diagnostics/PROD_PROFILE_RUNTIME_LATEST.txt`
- `radio/docs/diagnostics/PROD_AUTH_JWKS_REPAIR_LATEST.txt`

## Important retest note

A previous failed `/radio/me` attempt removed the browser's stored production token set before redirecting to login. A listener whose session was cleared by that failure must log in one time after Fix v3 before testing PROFILE again.

The verification sequence is therefore:

1. Refresh production.
2. Log in once.
3. Confirm the player shows the logged-in account state.
4. Open PROFILE.
5. Confirm the profile loads and remains logged in.
6. Repeat on desktop and mobile.

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
- `.github/workflows/radio-diagnose-prod-profile-runtime.yml`
- `.github/workflows/repair-radio-prod-auth-jwks.yml`

## Verification

Backend repair is deployed and verified at the Lambda configuration level. Final end-to-end verification requires a real listener session on desktop and mobile.
