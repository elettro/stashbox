# SR-BUG-0003 - VEC badge duplicates and pushes controls down

Status: Open
Severity: Medium
Area: VEC
Environment: DEV
Date reported: 2026-07-25
Date fixed:
Date verified:
Reported by: User

## Symptom

The VEC label in the upper-left viewer area duplicates repeatedly. The growing stack pushes adjacent controls on the right downward.

## Reproduction

1. Open the VEC viewer.
2. Use the viewer long enough for the label refresh/render path to run repeatedly.
3. Expected: one VEC badge remains mounted.
4. Actual: multiple VEC badges accumulate.

## Affected examples

VEC viewer upper-left badge/control region.

## Working comparison

Initial render before duplication begins.

## Root cause

Unknown. Historical backfill suggests a render/update path appends a new badge instead of reusing or replacing the existing node.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Changing viewer initialization or badge mounting could affect other persistent VEC controls.

## Related bugs

None recorded.

## Future repair procedure

Search for every VEC badge creation path. Ensure initialization is idempotent, mount to one stable node, and test repeated song and visual changes without DOM growth.

## Notes

Backfilled on 2026-08-17 from the 2026-07-25 viewer report.