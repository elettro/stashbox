# SR-BUG-0016 — Fast login fails with missing USERNAME on mobile and desktop

- **Status:** Fixed
- **Verification:** Verified
- **Severity:** High
- **Area:** Auth / Login
- **Environment:** DEV V2 Mobile + Desktop
- **Reported:** 2026-08-19
- **Fixed:** 2026-08-19
- **Verified:** 2026-08-19

## Symptom

After adding the V2 fast-login path, both desktop and mobile login sheets returned the same Cognito-style error even with the email and password fields filled in:

`Missing required parameter USERNAME`

The failure occurred before a normal credential result could be returned.

## Root cause

The first fast-login implementation prewarmed `/radio/auth/guard` as soon as the login UI opened, before an email/username was available. That anonymous guard request changed the login flow and could fail with a missing `USERNAME` requirement. The direct Cognito `InitiateAuth` payload itself already used the correct `AuthParameters: { USERNAME, PASSWORD }` structure.

## Fix

The fast-login path now:

- preloads only the harmless auth/Cognito configuration while the user is typing;
- does not call the login guard anonymously;
- calls the guard at submit time with the actual login email included as both `username` and `email`;
- validates that email and password are present before making AWS requests;
- sends Cognito `InitiateAuth` with the exact `AuthParameters: { USERNAME, PASSWORD }` payload;
- keeps bounded request timeouts and the immediate successful-login close behavior.

## Files changed

- `radio/dev/v2/v2-login-fast-path.js`
- `radio/dev/v2/v2-login-direct.js`

## Fix commits

- `2510866f6feae18f64cd134f94090bc8d4bf7522`
- `586ccd900a89b9b965c3d127cee6d0e34e8e3f38`

The original fast-path feature was introduced in `66f1248539e83453afe38c87d1ac645f6cbb72d6` and wired into the login controller in `bbfc0f2b92740381104180a18f200645e3ac8565`.

## Verification

User explicitly verified on 2026-08-19 that the repaired login works on **both desktop and mobile**.

## Future repair guidance

If the `USERNAME` error returns, inspect the request order before changing Cognito configuration. The guard must never be called for login without the actual email/username. Preserve config prewarming, but keep credential-dependent guard/Cognito calls on submit with the real email and password.
