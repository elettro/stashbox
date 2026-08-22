# SR-BUG-0018 - Vertical ad creative is cropped instead of displayed with FIT

Status: Fixed
Severity: High
Area: Ads / Player
Environment: DEV V2 Desktop, shared V2 Ads runtime
Date reported: 2026-08-21
Date fixed: 2026-08-22
Date verified: 2026-08-22
Reported by: User

## Symptom

Vertical and horizontal sponsored video creatives were rendered in the wrong position and earlier attempts either cropped the source or anchored the fitted media toward the left or upper-left of the desktop ad viewer.

## Root cause

The ad media sizing and positioning were being influenced by nested layout geometry. One centering pass also set `left` and `top` before `inset:auto`, which erased the centering coordinates.

## Fix

The dedicated Ads FIT guard now sizes the physical video box from its intrinsic `videoWidth` and `videoHeight`, fits that box inside the browser viewport, and centers it against the viewport itself. The positioning order now applies `inset:auto` before `left:50vw` and `top:50vh`, preserving the final `translate(-50%, -50%)` centering coordinates.

## Verification

Verified by the user on 2026-08-22 after live desktop testing. Ad video placement and FIT behavior were accepted as correct.

## Files changed

- `radio/dev/v2/v2-ads-fit-guard.js`
- `radio/dev/v2/desktop/index.html`

## Key commits

- `9c0d557dee16ec39fdbaa2c82d87ad3723d12587`

## Related bugs

- SR-BUG-0019

## Future repair

Keep ad creative geometry isolated from normal VEC/player video geometry. For 9:16 creatives, verify the complete frame remains visible and centered with balanced pillarbox space. For 16:9 creatives, verify the largest non-cropped fit remains centered.