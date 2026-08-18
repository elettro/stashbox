# SR-BUG-0011 - Desktop VEC media flickers, video fails to trigger, and player can freeze

Status: Open
Severity: Critical
Area: VEC Player
Environment: DEV V2
Date reported: 2026-08-11
Date reopened: 2026-08-18
Verification: Pending
Reported by: User

## Current recurrence

On 2026-08-18 the user reported a new desktop freeze while playing **Right Between the Eyes**. The screenshot shows the player at approximately **0:53 / 6:26** with the song transport still in the playing state while the visible VEC video frame is frozen.

This reopens the bug after it had previously been marked Fixed/verified for the clean desktop runtime.

## New architecture finding

The clean desktop runtime already has `desktop-audio-master.js`, which freezes/resumes VEC video when the **audio** enters waiting, seeking, or stalled states. However, the active VEC **video element itself** did not have a corresponding stall-recovery path. A visual clip could therefore stop making progress while the song audio continued to advance, leaving a frozen video frame indefinitely.

## Current repair

A desktop-only recovery module has been added:

- `radio/dev/v2/desktop/desktop-video-stall-watchdog.js`
- commit `3462fdb92bd75c10b97c2f4908ec9715aa54ccf0`

The watchdog observes the single current VEC video only. If audio is actively playing but the current video makes no meaningful time progress for several seconds, it first attempts to resume the clip. If the clip still does not advance after the recovery grace period, it dispatches the existing VEC video error path so `desktop-vec2.js` marks that asset failed and advances to the next prepared visual rather than leaving a frozen frame.

The clean desktop shell was updated to load the watchdog and cache-bust the build:

- commit `d9d49fe5672521e12f4ca397c1df1c93d47cf5db`
- build marker `desktop-clean-20260818-sharelite3-likestate2-vecstall1`

## Important constraint

This repair does **not** add another VEC stage owner or a MutationObserver-based renderer. It is a recovery guard around the existing single `desktop-vec2` stage and uses the engine's existing error/advance path.

## Verification required

Keep this bug Open until the updated build is confirmed live and the recurrence is tested in desktop browsers. Verification should include:

1. Right Between the Eyes playback beyond the previously observed ~0:53 freeze point.
2. VEC video continues advancing while audio remains healthy.
3. A deliberately or naturally stalled visual clip advances to the next VEC asset instead of freezing indefinitely.
4. No duplicate VEC stage owner is created.
5. Chrome, Firefox, and Edge checks before closing.
6. Longer unattended soak before marking the critical bug fully verified.

## Prior repair history

SR-BUG-0011 previously drove the clean desktop VEC architecture: one stage owner, A/B media layers, full-pool consumption, generation cancellation, audio-master timing, cache-busted builds, and exact deployment/browser verification. That history remains valid; this recurrence specifically adds missing **video-side stall recovery**.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets
