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

- On 2026-08-19 the user reported that the **Mr Top Mi Up** video froze at approximately **2:00**. This report arrived while the new continuity build was being rolled out, so it is evidence for the recurring bug but is not yet classified as a post-repair failure.
- On 2026-08-19 the user reported that **Where Next?** first froze at approximately **2:40**. A supplied desktop screenshot captured the same frozen visual frame at **3:00 / 3:59** while the song continued playing smoothly and the interface remained fully functional.
- On 2026-08-19 the user reported that the **Dirty Bird** video froze at approximately **2:45** while the song audio continued and the interface remained responsive.
- On 2026-08-18 the user reported a desktop freeze while playing **Right Between the Eyes**. The screenshot showed the player at approximately **0:53 / 6:26** with the song transport still in the playing state while the visible VEC video frame was frozen.

The recurrences confirm that this is not isolated to one song. Three reports now cluster around **2:00 to 2:45** of song playback. Because audio and controls remain healthy, the failure is isolated to the active visual video playback or recovery path rather than the audio engine or the entire application. The bug remains Open.

## Investigation state

As of 2026-08-19, the user reports that the freeze is recurring across playback sessions but has not identified a reliable trigger. Keep this bug Open while additional examples are collected under the same ID. Do not close it based on one successful replay or a short playback test.

For each new recurrence, capture the song, approximate elapsed time, browser/device, whether the tab was foregrounded, whether audio and controls continued, whether playback recovered without intervention, and the active VEC asset when available.

## Current architecture finding

The user proposed that the VEC may be running out of clips in its plan around the recurring freeze point. Code inspection shows that normal pool exhaustion is already designed to clear the played set and reuse the eligible pool, so simply reaching the end of the pool should not stop playback.

The uncovered continuity gap occurs when the engine reaches a handoff with no prepared next asset, including when all remaining candidates have entered the failed set. The prior advance path left the current ended, errored, or stalled video layer visible and returned. That creates the exact symptom of a frozen frame while audio and the interface continue normally. A second gap allowed an ended current video to remain ignored if its normal ended handoff was missed.

This code path is the leading root-cause candidate for the repeated full-song failures. Live verification is still required.

## Current repair

The desktop VEC engine now enforces full-song visual continuity:

- desktop-vec2.js removes an ended or frozen current layer when no next asset is ready instead of leaving the final frame visible.
- The artwork layer becomes the safe visual fallback during recovery.
- The engine clears transient failed/played state and retries the existing pool with bounded backoff until a playable asset is available.
- Recovery is serialized so duplicate timers cannot start competing handoffs.
- Audio timeupdate reasserts overdue image advances and restarts recovery if the song is playing without a current VEC asset.
- A single public recoverCurrent() handoff lets the watchdog advance the existing VEC engine without creating another stage owner.
- desktop-video-stall-watchdog.js now recovers a current video that has ended without completing its normal handoff.

Repair commits:

- ff54fa309804383312e90a2bbb3946d481059c6b - full-song fallback and pool recovery
- 8cceb1930ba6a6c073ce314d9d9899bca5e13d94 - serialized recovery
- a13ae746a19f45ecbc7285c861a7502e281701d9 - watchdog-to-engine handoff and missed-ended recovery
- e4c8be5f58f7ae6b17b18a7e3f84db4b0f421e42 - desktop cache bust for the continuity build

## Important constraint

This repair does **not** add another VEC stage owner or a MutationObserver-based renderer. It is a recovery guard around the existing single `desktop-vec2` stage and uses the engine's existing error/advance path.

## Verification required

Keep this bug Open until the updated build is confirmed live and the recurrence is tested in desktop browsers. Verification should include:

1. Mr Top Mi Up playback through the full song and beyond the observed ~2:00 freeze point.
2. Where Next? playback through the full song and beyond the observed ~2:40 freeze point.
3. Dirty Bird playback through the full song and beyond the observed ~2:45 freeze point.
4. Right Between the Eyes playback beyond the previously observed ~0:53 freeze point.
5. VEC remains visually valid for 100% of the song and automatically resumes flowing media after any temporary artwork fallback.
6. Normal pool exhaustion resets and continues instead of freezing.
7. A deliberately exhausted/failed next-asset set removes the last frozen frame, shows artwork, retries the pool, and resumes VEC.
8. A stalled or ended-without-handoff video advances through the existing single VEC engine.
9. No duplicate VEC stage owner is created.
10. Chrome, Firefox, and Edge checks before closing.
11. Longer unattended soak before marking the critical bug fully verified.

## Prior repair history

SR-BUG-0011 previously drove the clean desktop VEC architecture: one stage owner, A/B media layers, full-pool consumption, generation cancellation, audio-master timing, cache-busted builds, and exact deployment/browser verification. That history remains valid; this recurrence specifically adds missing **video-side stall recovery**.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets
