# SR-BUG-0021 - Desktop F and L like hotkeys do not trigger Like in PROD

Status: Closed
Severity: High
Area: Player / Like / Hotkeys
Environment: PROD Desktop
Date reported: 2026-08-22
Date fixed: 2026-08-22
Date closed: 2026-08-22
Date verified: 2026-08-22
Reported by: User

## Symptom

While a song was open in the production desktop player, pressing `F` or `L` did not trigger the Like action or increment the Like count.

## Reproduction

1. Open a song in the PROD desktop player.
2. Press `F` or `L`.
3. Expected: the same Like action as clicking the heart, including +1 and persistence.
4. Actual before repair: no Like action.

## Root cause

PROD was initially loading an older transport hotkey controller and the dedicated like-hotkey path could be intercepted before it handled `F`/`L`. The dedicated PROD like-hotkey script also needed a fresh cache URL so the repaired listener was guaranteed to load.

## Fix

Promoted the current hotkey behavior into PROD and hardened the dedicated `desktop-like-hotkeys.js` listener at window capture level so `F` and `L` are handled before older document-level listeners can swallow them. Each keypress resolves the current song, increments the Like UI, animates the heart state, and persists the Like event to the PROD `/radio/track` endpoint.

Published the repaired script under the fresh `likehotkeys2` asset version.

## Files changed

- `radio/desktop/desktop-shuffle-all.js`
- `radio/desktop/desktop-like-hotkeys.js`
- `radio/desktop/index.html`

## Commits

- `d6e8b664` - Correct PROD desktop hotkey controller
- `76355d8a` - Fix dedicated PROD F/L like hotkey listener
- `4e245899` - Bump PROD like-hotkey asset to `likehotkeys2`

## Verification

Verified by explicit user confirmation in PROD on 2026-08-22 that the hotkeys are working and all is good.

## Regression risk

Keyboard listener order, player DOM replacement, active-song-key propagation, Like button selectors, or stale asset versions can regress the behavior.

## Future repair procedure

If F/L stop working, verify `desktop-like-hotkeys.js` is loaded by the production desktop page, confirm the current cache version, and check listener ordering before changing Like persistence logic. Test both `F` and `L` while a player is open and verify visible +1 plus a retained Like event.

## Notes

Opened and closed on 2026-08-22 after the user explicitly verified the repaired behavior in production.