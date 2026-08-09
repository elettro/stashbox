# SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips

Status: Fixed, verification pending
Severity: High
Area: VEC Player
Environment: DEV V2
Date reported: 2026-08-09
Date fixed: 2026-08-09
Date verified:
Reported by: Dean Palermo

## Symptom

On desktop, some VEC video clips visibly flickered between the playing video and the song artwork underneath. The flashing made affected playback look broken.

## Reproduction

1. Open Stashbox Radio DEV V2 on desktop.
2. Start the affected song and allow the VEC video sequence to run.
3. Observe specific unstable clips or clip transitions.
4. Expected: the video surface remains continuous while video playback owns the media stage.
5. Actual before the fix: the song artwork became visible for brief frames during recovery or handoff.

## Affected examples

- Song: Space Jam.
- Clip/example described as: `Me on a bed`.
- Space Jam was observed flickering while other tested songs were not.

## Working comparison

- Clip/example described as: `Handy Dandy Sandy` played smoothly immediately after the failing clip.
- Two other tested songs also played without the same flicker.

This comparison showed the desktop player was capable of stable video playback and narrowed the issue to recovery/handoff behavior triggered by certain clips.

## Root cause

The desktop video watchdog and artwork surface used overlapping ownership rules. During an unstable clip, stall, or recovery handoff, a video could temporarily stop qualifying as active before the replacement video reached a stable playing state. During that gap, the desktop artwork background was still eligible to render and became visible underneath the video layer.

## Fix

Updated the desktop media transition guard so the official artwork background stays suppressed while the video system owns the desktop stage. The lock persists through video startup, stalls, recovery attempts, and clip handoffs, with a grace period before artwork is restored.

The guard also watches stage style mutations so another artwork routine cannot reassert the background image while the video lock is active.

## Files changed

- `radio/dev/v2/v2-media-transition-guard.js`

## Commits

- `3f7a43f9ee7f3056e2a35c185afe8ae34ccec885` - desktop video/artwork flicker guard.

## Verification

Pending user verification on desktop DEV V2 with Space Jam, especially the `Me on a bed` clip and transition into `Handy Dandy Sandy`.

## Regression risk

- Official desktop artwork restoration after video playback ends.
- VEC artwork-only recipes.
- Native-to-watchdog video ownership switching.
- Desktop stage background updates when changing songs.

## Related bugs

None recorded yet.

## Future repair procedure

If desktop video starts flashing artwork again:

1. Reproduce with one failing clip and one working comparison clip.
2. Inspect `radio/dev/v2/v2-media-transition-guard.js` first.
3. Check `desktopVideoArtworkLock` on the active stage while the failure occurs.
4. Inspect `StashboxMainVecVideoWatchdog.state()` for owner, status, and reason.
5. Confirm the artwork background remains `none` while native or fallback video owns the stage.
6. Check whether a new script is mutating `background-image`, `opacity`, or `visibility` during handoff.
7. Compare current code with commit `3f7a43f9` before applying a new repair.

## Notes

The visible symptom was clip-specific, but the repair was intentionally implemented at the shared desktop transition layer rather than special-casing Space Jam or a named VEC asset.