# SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets

Status: Open
Severity: High
Area: Player
Environment: DEV
Date reported: 2026-08-04
Date fixed:
Date verified:
Reported by: User

## Symptom

On wide desktop layouts, the player shows a 1:1 image that becomes heavily cropped instead of selecting an available 16:9 or 21:9 asset.

## Reproduction

1. Open the desktop player at a wide viewport.
2. Load a song with square and wide artwork variants.
3. Expected: desktop selects 16:9 or 21:9 artwork appropriate to the available stage.
4. Actual: the 1:1 image is selected and cropped into the wide frame.

## Affected examples

Desktop player reports from 2026-08-04.

## Working comparison

Square artwork is appropriate for square or narrow placements, not the wide desktop stage.

## Root cause

Unknown. Historical backfill awaiting inspection of ratio selection, asset metadata, fallback order, and responsive breakpoints.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Asset-priority changes may affect mobile, portrait layouts, missing-ratio fallback behavior, and song artwork compatibility.

## Related bugs

- SR-BUG-0001

## Future repair procedure

Inspect the desktop ratio-selection path and verify asset metadata. Test songs with full six-ratio sets and songs with partial sets. Confirm a deterministic wide-first fallback order.

## Notes

Backfilled on 2026-08-17 from the 2026-08-04 desktop artwork report.