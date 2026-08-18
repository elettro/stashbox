# SR-BUG-0012 - Desktop clean runtime removes login and account interface

Status: Open
Severity: High
Area: Auth
Environment: DEV V2 Desktop
Date reported: 2026-08-18
Date fixed:
Date verified:
Reported by: User

## Symptom

On desktop, the User ID / password login experience disappeared entirely. The desktop player no longer showed the Log In entry point or account/session UI.

## Reproduction

1. Open `/radio/dev/v2/` at a desktop viewport.
2. Allow the desktop router to send the session into `/radio/dev/v2/desktop/`.
3. Expected: the desktop header exposes Log In and the existing auth sheet supports email/password, account creation, password reset, and logged-in account/profile state.
4. Actual: the clean desktop runtime contains no account action slot and does not load the auth/session/profile scripts.

## Affected examples

- DEV V2 desktop clean runtime
- Desktop login/account entry point

## Working comparison

The standard V2 runtime still includes the auth CSS, session manager, auth sheet, login-direct, profile-entry, and related account wiring.

## Root cause

The desktop routing change moved desktop users into a separate clean runtime at `radio/dev/v2/desktop/index.html`. That runtime omitted the `.v2-header-actions` mount point and omitted the auth/session/profile script stack. Existing `v2-header-login.js` therefore had nowhere to mount the Log In control, and the auth UI was never initialized.

## Fix

Restore the `.v2-header-actions` container to the desktop header. Load the existing auth sheet CSS plus session manager, auth sheet, input-case repair, login-direct, header-login, and profile-entry scripts while preserving the newer desktop VEC and audio runtime.

## Files changed

- `radio/dev/v2/desktop/index.html`

## Commits

- `8f46d70a6e0eb67f2c759979d4780f3140fdc042`

## Verification

Pending user verification on desktop.

## Regression risk

Auth scripts must coexist with the clean desktop audio/VEC runtime without reintroducing legacy desktop media behavior. Verify guest playback, login sheet opening, login success, account/profile entry, and logged-out state.

## Related bugs

- SR-BUG-0011

## Future repair procedure

If desktop login disappears again, first verify desktop routing target, `.v2-header-actions`, `v2-header-login.js`, `v2-auth-sheet.js`, and `v2-session-manager.js` are all present before changing Cognito or backend auth.

## Notes

Root cause identified and initial restoration committed on 2026-08-18.