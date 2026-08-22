# SR-BUG-0020 - Desktop C share hotkey and PROD Share click do not copy or retain share

Status: Closed
Severity: High
Area: Player / Share / Hotkeys
Environment: DEV V2 Desktop + PROD Desktop
Date reported: 2026-08-22
Date fixed: 2026-08-22
Date closed: 2026-08-22
Date verified: 2026-08-22
Reported by: User

## Symptom

Pressing `C` on the desktop player did nothing in DEV or PROD. In PROD, clicking the Share control also failed to copy the current-song URL and did not increment the retained share count.

## Reproduction

1. Open a song in the desktop player.
2. Press `C`.
3. Expected: current-song URL is copied, the share count increments by exactly +1, and a `URL copied` status appears.
4. Actual before repair: no action.
5. In PROD, clicking Share showed the same failure.

## Root cause

The desktop Share controller could fail to resolve the active song because it primarily looked for `data-song-key`, while the live player exposes the active key through `data-current-song-key`. When resolution failed, the share path returned without copying or tracking. The earlier C implementation also depended on synthetic button clicking rather than owning the share action directly.

## Fix

Replaced the desktop Share controller with a direct capture handler that resolves the current song from the live player state, handles physical Share clicks and the `C` hotkey through the same function, increments the visible count optimistically, persists the `share` event, copies the deep-link URL, and displays `URL copied` on success.

A fresh asset version was published so PROD and DEV do not reuse the broken cached controller.

## Files changed

- `radio/dev/v2/desktop/desktop-share-isolation.js`
- `radio/desktop/desktop-share-isolation.js`
- `radio/attempt2/desktop/desktop-share-isolation.js`
- `radio/dev/v2/desktop/index.html`
- `radio/desktop/index.html`
- `radio/attempt2/desktop/index.html`

## Commits

- `efe4383a` - Fix DEV desktop share click and C hotkey
- `2adb1cd3` - Fix PROD desktop share click and C hotkey
- `3d275050` - Fix Attempt 2 desktop share click and C hotkey

## Verification

Verified by explicit user confirmation in PROD on 2026-08-22: `C works !! :)`.

## Regression risk

Changes to active-song key propagation, player DOM replacement, Share button selectors, clipboard permissions, or `/radio/track` event handling can regress this path.

## Future repair procedure

If the issue returns, first confirm the active player exposes `data-current-song-key`, then verify the loaded share-controller cache version. Test physical Share click and `C` separately and verify all three outcomes: visible +1, persisted share event, and clipboard copy/status.

## Notes

Opened and closed on 2026-08-22 after the user explicitly verified the repaired behavior in production.