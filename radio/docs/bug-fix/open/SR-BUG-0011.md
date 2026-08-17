# SR-BUG-0011 - Desktop VEC media flickers and video does not trigger

Status: Open
Severity: High
Area: VEC Player
Environment: DEV V2
Date reported: 2026-08-11
Date updated: 2026-08-17
Date fixed:
Date verified:
Reported by: User

## Symptom

Desktop VEC playback is unstable. The media stage can flicker between song artwork, VEC graphics, and video states, and intended VEC videos may fail to trigger or start.

On Firefox desktop, the failure is currently more severe: song graphics may not appear at all and VEC videos may also fail to appear or start.

## Reproduction

1. Open the DEV V2 desktop player on a song with eligible VEC graphics and video clips.
2. Start song playback and allow VEC rotation/handoff to begin.
3. Observe transitions between song artwork, VEC graphics, and VEC video clips.
4. Repeat in Firefox desktop.
5. Expected: eligible VEC graphics display consistently, VEC videos trigger and play when selected, and media handoffs occur without artwork/video flicker.
6. Actual: the stage may flicker between artwork/visual states, selected videos may not trigger, and Firefox may display neither the expected song graphic nor video.

## Affected examples

- Desktop media playback originally reported during the 2026-08-11 health-scan repair session.
- Renewed desktop VEC flicker reported on 2026-08-17.
- Firefox desktop reported on 2026-08-17 with missing song graphics and videos not appearing/triggering.

## Working comparison

Other browser/device combinations have previously displayed VEC assets more successfully, but the current desktop renderer must be verified across Chrome, Firefox, and Edge before this bug is considered fixed.

## Root cause

Unknown. Current symptoms point to the desktop VEC renderer/media lifecycle, asset handoff state, video readiness/play triggering, browser autoplay/play() behavior, or competing artwork fallback/transition state. These are investigation targets, not confirmed causes.

The renewed flicker also represents a possible regression of SR-BUG-0001, where artwork exposure during unstable video ownership/handoff had previously been addressed.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded for this renewed report.

## Commits

None recorded for this renewed report.

## Verification

Pending.

Required verification before marking fixed:

- Firefox desktop: graphics render and videos trigger/play.
- Chrome desktop: graphics render and videos trigger/play.
- Edge desktop: graphics render and videos trigger/play.
- Mixed graphic/video VEC pool rotates without flicker.
- Song changes, next/back, shuffle, Focus Mode, and Cinema Mode do not break stage ownership.
- 30-60 minute unattended playback does not regress into missing visuals or artwork/video flicker.

## Regression risk

High. Desktop video changes overlap with VEC stage ownership, artwork fallback, video readiness, autoplay policy, source loading, transition guards, and browser-specific media behavior.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets

## Future repair procedure

Trace one selected VEC asset from eligibility through render and playback. Log asset selection, image load success/failure, video metadata/canplay state, play() promise success/failure, fallback activation, stage ownership, and browser. Inspect video source resolution, MIME/codec handling, VEC ownership state, transition guards, artwork fallback mutations, and media element lifecycle. Verify deterministic wide desktop fallback and all three desktop browsers before marking fixed.

## Notes

Backfilled on 2026-08-17 from the 2026-08-11 desktop playback report.

Updated on 2026-08-17 after renewed testing showed VEC flicker plus videos failing to trigger, with Firefox desktop also failing to display expected song graphics.