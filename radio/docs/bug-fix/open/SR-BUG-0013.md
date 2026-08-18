# SR-BUG-0013 - Desktop login disappears after boot and notifications do not work

Status: Open
Severity: High
Area: Desktop Shell / Auth / Notifications
Environment: DEV V2 Desktop
Date reported: 2026-08-18
Date fixed:
Date verified:
Reported by: User

## Symptom

On desktop, the Log In control briefly appears during initial paint and then disappears after the app finishes booting. The Notifications control is also nonfunctional.

## Current finding

The desktop clean runtime and `v2-recovery.js` both participate in rendering the header. Recovery replaces `#v2App` content after startup, which can discard controls initialized earlier. Notification behavior also depends on notification runtime scripts and trigger wiring that were missing or tied to controls inside the recoverable app container.

## Status

Open. Multiple repair attempts have not yet been user-verified and the reported symptom persists.

## Verification required

- Log In remains visible after full desktop boot.
- Log In opens the auth sheet.
- Logged-in state exposes Account/Profile correctly.
- Notifications bell remains visible after boot.
- Notifications bell opens the notification sheet and loads current notifications.

## Related bugs

- SR-BUG-0012 - Desktop clean runtime removes login and account interface
