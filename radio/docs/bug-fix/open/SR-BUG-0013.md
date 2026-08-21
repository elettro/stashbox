# SR-BUG-0013 - Desktop login disappears after boot and notifications do not work

Status: Open
Severity: High
Area: Desktop Shell / Auth / Notifications
Environment: DEV V2 Desktop
Date reported: 2026-08-18
Date originally fixed: 2026-08-19
Date reopened: 2026-08-21
Verification: Pending
Reported by: User

## Current symptom

Desktop Radio is loading again and the logged-in Account state is present, but the user does not see any notifications. The desktop notification bell remains part of the shell, yet current notifications are not visibly surfacing for the logged-in user.

## Reopen reason

This record was previously closed after the persistent desktop shell repair restored the login/account and notification controls. The notification portion has regressed independently of the login/account portion, so SR-BUG-0013 is reopened rather than creating a duplicate bug.

On 2026-08-21 an attempted notification repair introduced a desktop load regression. That repair was rolled back to restore Radio availability. The player is live again, but notification delivery/display remains unresolved.

## Current finding

The shell control itself is no longer the primary failure. The remaining fault is somewhere between logged-in notification retrieval, notification state, trigger/sheet wiring, and rendering. The exact root cause is not yet verified.

Do not reintroduce a document-wide or VEC-subtree MutationObserver. Do not globally monkey-patch fetch as part of another notification repair unless an isolated test proves it is required and does not affect Radio boot.

## Required regression checks

- Radio DEV V2 desktop loads normally before and after any notification change.
- Logged-in Account state remains visible after full boot.
- Notifications bell remains visible after full boot.
- Clicking the visible desktop bell opens the notification sheet in the correct position.
- The logged-in user receives the current notification feed expected for the account.
- Anonymous fallback behavior remains functional where intended.
- Unread notification count appears on the visible desktop bell when unread items exist.
- Opening or refreshing notifications does not freeze, spin, or block the player runtime.
- Closing and reopening the sheet refreshes cleanly without duplicate handlers or duplicate DOM.

## Recent rollback context

The 2026-08-21 notification repair was removed after causing the DEV V2 desktop runtime to spin during load. The emergency rollback restored the prior stable desktop runtime and notification controller, then removed the added desktop notification auth bridge.

Relevant rollback commits:

- `75efade7c4df63e4db0e41f58d4a79823e8668d7` - Emergency rollback desktop notification repair runtime
- `527d26ad8d61bd76be986a5688b3700b87721d3f` - Restore stable desktop notification controller
- `cdf6e7fa73dd4e08c86fd33c05b794488b9b65e7` - Remove desktop notification repair bridge after load regression

## Related bugs

- SR-BUG-0012 - Desktop clean runtime removes login and account interface
- SR-BUG-0004 - Notification feed remains stale for more than a day

## Status note

Reopened by user direction on 2026-08-21. Login/account is currently working. Desktop notifications are not showing and remain an active High-priority bug pending isolated diagnosis and verification.