# SR-BUG-0004 - Notification feed remains stale for more than a day

Status: Open
Severity: High
Area: Notifications
Environment: Both
Date reported: 2026-07-25
Date fixed:
Date verified:
Reported by: User

## Symptom

The notification feed continues showing the same notifications for more than a day instead of reflecting newer activity.

## Reproduction

1. Open the Stashbox Radio notification feed.
2. Revisit after new activity or a substantial time interval.
3. Expected: the feed refreshes with current notifications.
4. Actual: the same notification set remains visible.

## Affected examples

Notification feed observed on 2026-07-25.

## Working comparison

No working comparison recorded.

## Root cause

Unknown. Historical backfill awaiting diagnosis of notification generation, persistence, API freshness, cache behavior, and client refresh logic.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Notification refresh changes may affect read state, ordering, deduplication, and request volume.

## Related bugs

None recorded.

## Future repair procedure

Compare newest notification rows in storage with API output and rendered client state. Check timestamps, cache headers, polling/refresh logic, and generation jobs before changing UI rendering.

## Notes

Backfilled on 2026-08-17 from the 2026-07-25 stale-feed report.