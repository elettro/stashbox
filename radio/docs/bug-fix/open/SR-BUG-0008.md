# SR-BUG-0008 - VEC reuses a subset and repeats assets before the pool is exhausted

Status: Open
Severity: High
Area: VEC
Environment: DEV
Date reported: 2026-07-18
Date fixed:
Date verified:
Reported by: User

## Symptom

The DEV VEC controller repeatedly selects from a smaller subset of eligible media instead of consuming the full pool. Visuals can repeat before unused assets have played, and assets from the same folder can appear back to back.

## Reproduction

1. Play a song with multiple eligible VEC assets and folders.
2. Observe asset order across a long enough session.
3. Expected: use the full eligible pool, avoid immediate repeats, avoid consecutive assets from the same folder when alternatives exist, and do not replay an asset until the pool is exhausted.
4. Actual: the same subset repeats while other eligible assets remain unused.

## Affected examples

DEV VEC controller behavior reported during 2026-07-18 through 2026-07-25.

## Working comparison

Expected behavior is full-pool exhaustion before replay.

## Root cause

Unknown. Historical backfill awaiting current controller inspection.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Selection changes can affect weighting, manual order, newest-first mode, song-specific assets, and future placement rules.

## Related bugs

None recorded.

## Future repair procedure

Log the complete eligible pool and every selection decision. Verify pool construction, consumed-state lifetime, folder anti-repeat logic, and reset conditions across song changes.

## Notes

Backfilled on 2026-08-17 from VEC controller development reports.