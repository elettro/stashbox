# SR-BUG-0004 - Notification feed remains stale for more than a day

Status: Fixed
Severity: High
Area: Notifications
Environment: Both
Date reported: 2026-07-25
Date fixed: 2026-08-17
Date verified: 2026-08-18
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

Not recorded during the original repair. Historical backfill awaited diagnosis of notification generation, persistence, API freshness, cache behavior, and client refresh logic.

## Fix

User confirmed on 2026-08-17 that the stale notification-feed issue is fixed.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Verified by explicit user confirmation on 2026-08-18.

## Regression risk

Notification refresh changes may affect read state, ordering, deduplication, and request volume.

## Related bugs

None recorded.

## Future repair procedure

If the issue returns, compare newest notification rows in storage with API output and rendered client state. Check timestamps, cache headers, polling/refresh logic, and generation jobs before changing UI rendering.

## Notes

Backfilled on 2026-08-17 from the 2026-07-25 stale-feed report. Marked fixed by user on 2026-08-17 and verified by the user on 2026-08-18.