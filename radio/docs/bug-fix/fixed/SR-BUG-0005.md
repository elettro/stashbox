# SR-BUG-0005 - Share events do not increment retained share counts

Status: Fixed
Severity: High
Area: Dashboard
Environment: Both
Date reported: 2026-06 (historical)
Date fixed: 2026-08-19
Date verified: 2026-08-19
Verification: Verified
Reported by: User

## Symptom

Sharing a song does not reliably increase the song's retained share statistics.

## Reproduction

1. Record the current share count for a song.
2. Use a Stashbox Radio share action.
3. Reload the stats/dashboard after the event should persist.
4. Expected: the share count increases.
5. Actual: the share is not reflected in retained stats.

## Affected examples

Song share tracking during the June 2026 stats work.

## Working comparison

No working comparison recorded.

## Root cause

Unknown. Historical backfill awaiting inspection of client event emission, API handling, persistence, and aggregation.

## Fix

No discrete fixing commit is documented for this historical backfill. The user directed closure on 2026-08-19 after the current share behavior was accepted.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Verified and closed by user direction on 2026-08-19.

## Regression risk

Stats repairs can create duplicate counting if both client retries and server processing are not idempotent.

## Related bugs

- SR-BUG-0006

## Future repair procedure

Trace one share end to end using a unique song/session. Confirm browser event, API request, response, database write, aggregation, and dashboard readback before changing counters.

## Notes

Backfilled on 2026-08-17 from June 2026 stats requirements and failure reports.

Closed as Fixed and Verified by user direction on 2026-08-19. If retained share counts fail again, reopen SR-BUG-0005 and run the end-to-end trace above.