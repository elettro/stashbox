# SR-BUG-0011 - Desktop media video does not play

Status: Open
Severity: High
Area: Player
Environment: DEV
Date reported: 2026-08-11
Date fixed:
Date verified:
Reported by: User

## Symptom

Desktop playback fails to start or display the intended video while the media player otherwise loads.

## Reproduction

1. Open the DEV desktop player on an affected song with video media.
2. Start playback.
3. Expected: the video plays normally in the desktop media stage.
4. Actual: the video does not play.

## Affected examples

Desktop issue reported during the 2026-08-11 health-scan repair session.

## Working comparison

Mobile and/or songs without the affected desktop playback condition were not reported as failing in the same way.

## Root cause

Unknown. Historical backfill awaiting current-code and browser-console diagnosis.

## Fix

No verified fix is recorded in the bug system yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Desktop video changes overlap with VEC stage ownership, artwork fallback, autoplay policy, source loading, and transition guards.

## Related bugs

- SR-BUG-0001
- SR-BUG-0009

## Future repair procedure

Inspect video source resolution, play promise errors, media readiness, VEC ownership state, transition guards, and browser console output. Verify on desktop with several known video songs before marking fixed.

## Notes

Backfilled on 2026-08-17 from the 2026-08-11 desktop playback report.