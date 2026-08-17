# SR-BUG-0010 - Mobile admin navigation remains visible before hamburger activation

Status: Open
Severity: Medium
Area: Dashboard
Environment: DEV
Date reported: 2026-07-30
Date fixed:
Date verified:
Reported by: User

## Symptom

On the affected mobile admin/dashboard page, navigation items appear without first opening the hamburger menu. The intended mobile behavior is to hide admin navigation until the three-line control is tapped.

## Reproduction

1. Open the affected Stashbox Radio admin/dashboard page on a narrow mobile viewport.
2. Observe the global/admin navigation before interacting with the hamburger control.
3. Expected: navigation items remain hidden until the hamburger is opened.
4. Actual: items remain visible or leak into the mobile layout.

## Affected examples

Dashboard/admin mobile navigation report from 2026-07-30. The report was later clarified as being specific to the dashboard page.

## Working comparison

Admin pages where the collapsed navigation behaves correctly.

## Root cause

Unknown. Historical backfill awaiting responsive CSS and menu-state inspection on the dashboard page.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Global navigation changes could affect desktop visibility or other admin pages whose mobile menu already works.

## Related bugs

None recorded.

## Future repair procedure

Compare dashboard navigation markup and mobile styles with a working admin page. Verify default collapsed state, breakpoint rules, hamburger state class, and resize behavior.

## Notes

Backfilled on 2026-08-17 from the 2026-07-30 mobile dashboard clarification.