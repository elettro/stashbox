# SR-BUG-0013 - Desktop login disappears after boot and notifications do not work

Status: Fixed
Severity: High
Area: Desktop Shell / Auth / Notifications
Environment: DEV V2 Desktop
Date reported: 2026-08-18
Date originally fixed: 2026-08-19
Date reopened: 2026-08-21
Date repaired again: 2026-08-21
Verification: Pending
Reported by: User

## Current symptom

Desktop Radio loads and the logged-in Account state is present, but notifications stopped surfacing from the visible desktop bell.

## Verified root causes

Two independent client regressions combined on the clean desktop runtime:

1. `v2-notifications-sheet.js` still had the Cognito token helpers, but `requestNotifications()` no longer used them. Signed-in requests to `/radio/notifications` therefore behaved like anonymous requests and could only receive the public feed rather than the signed-in personalized feed.
2. `v2-notifications-desktop.js` intercepted the hidden V2 notification trigger in the capture phase and called `stopImmediatePropagation()`. That prevented `v2-notifications-sheet.js` from owning the normal open path, including the forced refresh performed when the notification sheet opens.

The visible desktop bell remains outside the recoverable `#v2App` shell. `desktop-persistent-controls.js` forwards that bell click to the hidden V2 notification trigger after recovery renders the app.

## Repair

The notification repair is isolated to the existing notification runtimes. No global `fetch` patch and no new MutationObserver were introduced.

- Restored authenticated notification GET requests directly inside `v2-notifications-sheet.js` using the existing Cognito access-token and ID-token helpers.
- Preserved the historical anonymous fallback when an authenticated request returns 401.
- Restored authenticated notification event writes for open/click/dismiss tracking.
- Added refresh on artist-follow changes.
- Changed the desktop notification controller so it only anchors the sheet to the visible persistent bell and handles close/toggle behavior. When the sheet is closed, it no longer blocks the notification-sheet listener, allowing `openSheet()` to own opening and feed refresh.
- Cache-busted the two notification runtimes with desktop build `notificationsrepair4`.

## Repair commits

- `208b50fa66d57cbc23791658ac8fd5511d79dcef` - Let V2 notification sheet own desktop open and refresh safely
- `af0ef6e4ca193fa5f3a80df1c8fa907e0534783a` - Restore authenticated V2 notification feed without global fetch patch
- `2d57ce460dd9dee6410b10e9b6d3bea9cf362743` - Publish isolated desktop notification repair

## Required verification

- Radio DEV V2 desktop loads normally before and after the notification change.
- Logged-in Account state remains visible after full boot.
- Notifications bell remains visible after full boot.
- Clicking the visible desktop bell opens the notification sheet beneath the visible bell.
- The logged-in user receives public plus account-eligible personalized notifications.
- Anonymous fallback behavior remains functional where intended.
- Opening or refreshing notifications does not freeze, spin, or block the player runtime.
- Closing and reopening the sheet refreshes cleanly without duplicate handlers or duplicate DOM.
- Unread count behavior on the persistent visible desktop bell must be rechecked after feed visibility is verified.

## Recent rollback context

An earlier 2026-08-21 attempt added a global notification fetch bridge and badge observer. That attempt caused the DEV V2 desktop runtime to spin during load and was fully rolled back before this isolated repair.

Relevant rollback commits:

- `75efade7c4df63e4db0e41f58d4a79823e8668d7` - Emergency rollback desktop notification repair runtime
- `527d26ad8d61bd76be986a5688b3700b87721d3f` - Restore stable desktop notification controller
- `cdf6e7fa73dd4e08c86fd33c05b794488b9b65e7` - Remove desktop notification repair bridge after load regression

## Related bugs

- SR-BUG-0012 - Desktop clean runtime removes login and account interface
- SR-BUG-0004 - Notification feed remains stale for more than a day

## Status note

Repair is pushed to `main` as `notificationsrepair4`. Keep this record open until live desktop verification confirms the player still boots normally and the logged-in notification feed opens and populates correctly.