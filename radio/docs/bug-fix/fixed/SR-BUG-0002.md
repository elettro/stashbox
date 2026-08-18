# SR-BUG-0002 - Full song titles truncate with ellipses in media players

Status: Fixed
Severity: High
Area: Player
Environment: Both
Date reported: 2026-07-24
Date fixed: 2026-08-17
Date verified: 2026-08-18
Reported by: User

## Symptom

Long song titles were shortened with ellipses in the media player. The product requirement is for the complete title to remain visible on screen.

## Reproduction

1. Open a song with a long display title in a Stashbox Radio media player.
2. Observe the title region.
3. Expected: the complete title remains readable.
4. Actual: the title was cut off and replaced with ellipses.

## Affected examples

Media player layouts with long song titles.

## Working comparison

Short song titles fit without truncation.

## Root cause

Not recorded during the original repair. This issue was backfilled from historical development work.

## Fix

The user confirmed on 2026-08-17 that the song-title truncation issue is fixed. Technical implementation details from the original repair were not captured in the historical record.

## Files changed

Not recorded.

## Commits

Not recorded.

## Verification

Verified by explicit user confirmation on 2026-08-18.

## Regression risk

Title wrapping or responsive sizing changes could affect artwork, controls, or compact mobile layouts.

## Related bugs

None recorded.

## Future repair procedure

If truncation returns, inspect title container width, overflow, white-space, line-clamp, font sizing, and responsive breakpoints. Verify with the longest known titles on desktop and mobile.

## Notes

Backfilled on 2026-08-17 from Stashbox Radio development history. Marked fixed at the user's direction on 2026-08-17 and verified by the user on 2026-08-18.