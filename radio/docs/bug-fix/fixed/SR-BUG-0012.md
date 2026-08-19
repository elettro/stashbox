# SR-BUG-0012 - Desktop clean runtime loses login/account and notifications controls

Status: Fixed
Severity: High
Area: Auth / Notifications
Environment: DEV V2 Desktop
Date reported: 2026-08-18
Date fixed: 2026-08-19
Date verified: 2026-08-19
Verification: Verified
Reported by: User

## Symptom

On desktop, the User ID / password login experience disappeared. After initial repairs, the Log In button could flash briefly and then disappear again. The notifications control was also nonfunctional on the clean desktop runtime.

## Reproduction

1. Open `/radio/dev/v2/` at a desktop viewport.
2. Allow the desktop router to send the session into `/radio/dev/v2/desktop/`.
3. Allow the catalog/recovery render to complete.
4. Expected: Log In / Account remains visible, opens the auth experience, and Notifications opens the notification sheet.
5. Actual before the latest repair: recovery could replace the header and remove the restored login control; the clean desktop page also did not load the notification sheet/desktop notification runtime.

## Root cause

The desktop routing change moved desktop users into the separate clean runtime at `radio/dev/v2/desktop/index.html`.

Two shell-level regressions were identified:

1. The clean runtime initially omitted the auth/session/profile stack and the login mount point.
2. `v2-recovery.js` later replaces the direct children of `#v2App`, including the entire header. Its recovery header did not preserve the restored login control. Separately, the clean desktop shell did not load the notification sheet CSS/JS and desktop notification behavior, so a rendered bell had no working notification UI behind it.

## Repair history

### Initial auth restoration

Restored the header action slot and auth/session/profile stack while preserving the clean VEC/audio runtime.

Commit:

- `8f46d70a6e0eb67f2c759979d4780f3140fdc042`

### Login render-race repairs

Additional repairs made the login control part of the desktop HTML and removed competing login installers. These reduced startup races but did not address the later full-app recovery replacement.

### Persistent desktop shell repair

A dedicated `desktop-shell-controls.js` now observes only direct-child replacement of `#v2App`. When recovery replaces the app shell, it restores Log In / Account and Notifications immediately without observing the VEC/media subtree and without creating a media MutationObserver feedback loop.

The clean desktop page now also loads:

- `v2-notifications-sheet.css`
- `v2-notifications-desktop.css`
- `v2-notifications-desktop.js`
- `v2-notifications-sheet.js`
- `v2-notifications-seen-on-open.js`

Commits:

- `38affbd8624ccd41eadf175fd617cb2fc24874eb` - add persistent desktop shell controls
- `ce4e0e2c991f3e8471990a9f1a3e801a028b88a5` - load shell controls and restore desktop notification runtime

## Files changed

- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/desktop/desktop-shell-controls.js`

## Verification

Verified by user and closed on 2026-08-19.

Retained regression checks:

- Log In remains visible after initial page paint and after the catalog/recovery render.
- Clicking Log In opens the email/password auth sheet.
- Logged-in state shows Account and opens the profile.
- Notifications remains visible after recovery.
- Clicking Notifications opens the notification sheet and loads current notifications.
- The clean desktop VEC/audio runtime remains stable.

## Regression risk

Shell controls must coexist with recovery rendering without reintroducing legacy desktop VEC observers/watchdogs. The shell observer intentionally watches only direct children of `#v2App`, not the media subtree.

## Related bugs

- SR-BUG-0011

## Future repair procedure

If either control disappears again, inspect the clean desktop shell and recovery boundary first. Do not add a document-wide or VEC-subtree MutationObserver. Keep account/notification controls owned by the desktop shell layer and verify recovery cannot permanently remove them.

## Notes

On 2026-08-19 the user directed that SR-BUG-0012 be considered Fixed and Verified and closed. Reopen this record if desktop login/account or notifications disappear again.
