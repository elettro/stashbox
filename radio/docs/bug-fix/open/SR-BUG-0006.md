# SR-BUG-0006 - Plays do not persist and 10-second play events are not recorded

Status: Open
Severity: High
Area: Dashboard
Environment: Both
Date reported: 2026-06 (historical)
Date fixed:
Date verified:
Reported by: User

## Symptom

Song plays are not reliably retained in stats, including the intended play event after 10 seconds of listening.

## Reproduction

1. Start a song and continue playback beyond 10 seconds.
2. Inspect the stats event path and persisted song metrics.
3. Expected: a qualifying play event is recorded once and retained.
4. Actual: the event or resulting play count is missing.

## Affected examples

Song play tracking during the June 2026 stats work.

## Working comparison

No working comparison recorded.

## Root cause

Unknown. Historical backfill awaiting inspection of the playback timer, event emission, API endpoint, persistence, and stats aggregation.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Play tracking changes can overcount when playback restarts, seeks, resumes, or multiple event listeners are active.

## Related bugs

- SR-BUG-0005

## Future repair procedure

Trace one play from media start through the 10-second threshold. Confirm only one event fires, the API receives it, the database persists it, and the dashboard returns the increment after reload.

## Notes

Backfilled on 2026-08-17 from June 2026 stats failure reports.