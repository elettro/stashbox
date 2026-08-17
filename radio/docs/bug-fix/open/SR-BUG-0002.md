# SR-BUG-0002 - Full song titles truncate with ellipses in media players

Status: Open
Severity: High
Area: Player
Environment: Both
Date reported: 2026-07-24
Date fixed:
Date verified:
Reported by: User

## Symptom

Long song titles are shortened with ellipses in the media player. The product requirement is for the complete title to remain visible on screen.

## Reproduction

1. Open a song with a long display title in a Stashbox Radio media player.
2. Observe the title region.
3. Expected: the complete title remains readable.
4. Actual: the title is cut off and replaced with ellipses.

## Affected examples

Media player layouts with long song titles.

## Working comparison

Short song titles fit without truncation.

## Root cause

Unknown. Historical backfill awaiting current-code diagnosis.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Title wrapping or responsive sizing changes could affect artwork, controls, or compact mobile layouts.

## Related bugs

None recorded.

## Future repair procedure

Inspect title container width, overflow, white-space, line-clamp, font sizing, and responsive breakpoints. Verify with the longest known titles on desktop and mobile.

## Notes

Backfilled on 2026-08-17 from Stashbox Radio development history.