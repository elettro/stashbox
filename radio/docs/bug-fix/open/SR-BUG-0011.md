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

- After the continuity2 repair was live, the user reported that **Dirty Bird** froze again at approximately **0:30** on desktop.
- After the continuity2 repair was live, the user reported that **Right Between the Eyes** froze again at approximately **0:28** on desktop.
- In the direct comparison, mobile playback remained visually flawless beyond **3:35**. The user explicitly narrowed the active failure to desktop.
- On 2026-08-19 the user reported that the **Mr. Top Mi Up** video froze at approximately **2:00**. This report arrived while the new continuity build was being rolled out, so it is evidence for the recurring bug but is not yet classified as a post-repair failure.
- On 2026-08-19 the user reported that **Where Next?** first froze at approximately **2:40**. A supplied desktop screenshot captured the same frozen visual frame at **3:00 / 3:59** while the song continued playing smoothly and the interface remained fully functional.
- On 2026-08-19 the user reported that the **Dirty Bird** video froze at approximately **2:45** while the song audio continued and the interface remained responsive.
- On 2026-08-18 the user reported a desktop freeze while playing **Right Between the Eyes**. The screenshot showed the player at approximately **0:53 / 6:26** with the song transport still in the playing state while the visible VEC video frame was frozen.

The recurrences confirm that this is not isolated to one song. The new **0:28–0:30** desktop failures rule out simple pool exhaustion or a fixed late-song boundary. Because audio and controls remain healthy and mobile remains healthy, the remaining failure is isolated to the desktop visual video playback or handoff path rather than the audio engine, mobile player, or entire application. The bug remains Open.

## Investigation state

As of 2026-08-19, the user reports that the freeze is recurring across playback sessions but has not identified a reliable trigger. Keep this bug Open while additional examples are collected under the same ID. Do not close it based on one successful replay or a short playback test.

For each new recurrence, capture the song, approximate elapsed time, browser/device, whether the tab was foregrounded, whether audio and controls continued, whether playback recovered without intervention, and the active VEC asset when available.

## Current architecture finding

The user proposed that the VEC may be running out of clips in its plan around the recurring freeze point. Code inspection shows that normal pool exhaustion is already designed to clear the played set and reuse the eligible pool, so simply reaching the end of the pool should not stop playback.

The continuity2 repair closed the no-prepared-next-asset and missed-ended-handoff gaps. It passed a complete Where Next? run, but the later Dirty Bird and Right Between the Eyes failures show that those were not the entire cause.

The remaining desktop-specific gap is that the stall watchdog uses media currentTime and decoded/presented-frame counters as health signals. A browser can continue advancing those counters while the composited frame visible to the user remains stuck. In that state, the watchdog considers the video healthy and does not force a handoff. Mobile uses a different playback path and is unaffected in the current comparison.

This is the current root-cause model. The new repair removes the watchdog as the sole owner of video continuity by adding a bounded lease driven by the song audio clock.

## Current repair

The desktop VEC engine now enforces full-song visual continuity:

- desktop-vec2.js removes an ended or frozen current layer when no next asset is ready instead of leaving the final frame visible.
- The artwork layer becomes the safe visual fallback during recovery.
- The engine clears transient failed/played state and retries the existing pool with bounded backoff until a playable asset is available.
- Recovery is serialized so duplicate timers cannot start competing handoffs.
- Audio timeupdate reasserts overdue image advances and restarts recovery if the song is playing without a current VEC asset.
- A single public recoverCurrent() handoff lets the watchdog advance the existing VEC engine without creating another stage owner.
- If a prepared asset fails during promotion and every replacement also fails, the engine now enters the same artwork-and-retry recovery path instead of retaining the prior frame.
- desktop-video-stall-watchdog.js now recovers a current video that has ended without completing its normal handoff.
- Every active desktop video now receives an independent audio-clock lease.
- The lease uses the clip's media duration when available, adds a short handoff grace period, and caps ownership at 12 seconds.
- When the lease expires, the existing VEC engine advances even if the browser still reports video progress.
- Pause/resume and audio timeupdate re-arm the same lease without introducing a second VEC owner.
- The mobile runtime is unchanged.

Repair commits:

- ff54fa309804383312e90a2bbb3946d481059c6b - full-song fallback and pool recovery
- 8cceb1930ba6a6c073ce314d9d9899bca5e13d94 - serialized recovery
- a13ae746a19f45ecbc7285c861a7502e281701d9 - watchdog-to-engine handoff and missed-ended recovery
- e4c8be5f58f7ae6b17b18a7e3f84db4b0f421e42 - desktop cache bust for the continuity build
- db68e14aca3b7bfc75d9535a1780e46ae851dd46 - failed-promotion recovery completion
- d85020c0a76f4b51e2ffab1892b6af4e4063fbb6 - continuity2 desktop build publication
- 748e7f9b9713cbb9beaa38875cfb086f61bf061c - independent desktop video audio-clock lease
- a680a6e243cd244b60843991a3deb603063fd971 - continuity3-videolease1 desktop build publication

## Partial live verification

On 2026-08-19 the exact live desktop build marker `desktop-clean-20260819-profilequeue1-profilebridge2-playstats7-ranktooltip1-centeredtransport1-sharecopy2-likestate2-vecstall1-veccontinuity2` was confirmed on stashbox.com.

A full-duration **Where Next?** run passed the previously reported ~2:40 freeze point. The test included one pause/resume near 0:20, then continuous playback through the failure window and the end of the 3:59 song. At 3:54, the VEC remained in PLAYING_VIDEO with 16 assets played and 0 failed assets. The player then auto-advanced to **Hawaiian Peace Chant** with VEC still active.

This was a strong partial pass, but it did not verify the fix. The user's later post-continuity2 desktop recurrences on Dirty Bird at ~0:30 and Right Between the Eyes at ~0:28 supersede that single successful run.

## Continuity3 targeted live verification

On 2026-08-19 the exact live desktop build marker `desktop-clean-20260819-profilequeue1-profilebridge2-playstats7-ranktooltip1-centeredtransport1-sharecopy2-likestate2-vecstall1-veccontinuity3-videolease1` was confirmed on stashbox.com.

Targeted live desktop checks passed both newly reported early failure points:

- **Dirty Bird** continued beyond 0:30 and reached approximately 1:08 with seven assets played, zero failed assets, and repeated `video-audio-lease` handoffs.
- **Right Between the Eyes** continued beyond 0:28 and reached approximately 0:31 with three assets played and zero failed assets. A 20.67-second source clip was handed off by the 12-second maximum lease before it could retain the desktop stage indefinitely.

These checks confirm the new build and lease path are active. They do not replace verification on the user's desktop or the required full-song soak. Keep SR-BUG-0011 Open.

## Important constraint

This repair does **not** add another VEC stage owner or a MutationObserver-based renderer. It is a recovery guard around the existing single `desktop-vec2` stage and uses the engine's existing error/advance path.

## Verification required

Keep this bug Open until the updated build is confirmed live and the recurrence is tested in desktop browsers. Verification should include:

1. Mr. Top Mi Up playback through the full song and beyond the observed ~2:00 freeze point.
2. Where Next? playback through the full song and beyond the observed ~2:40 freeze point.
3. Dirty Bird playback beyond the new ~0:30 recurrence, then through the full song.
4. Right Between the Eyes playback beyond the new ~0:28 recurrence, then through the full song.
5. VEC remains visually valid for 100% of the song and automatically resumes flowing media after any temporary artwork fallback.
6. Normal pool exhaustion resets and continues instead of freezing.
7. A deliberately exhausted/failed next-asset set removes the last frozen frame, shows artwork, retries the pool, and resumes VEC.
8. A stalled or ended-without-handoff video advances through the existing single VEC engine.
9. No duplicate VEC stage owner is created.
10. Chrome, Firefox, and Edge checks before closing.
11. Longer unattended soak before marking the critical bug fully verified.

## Prior repair history

SR-BUG-0011 previously drove the clean desktop VEC architecture: one stage owner, A/B media layers, full-pool consumption, generation cancellation, audio-master timing, cache-busted builds, and exact deployment/browser verification. That history remains valid; this recurrence adds an independent **audio-clock video lease** because media progress counters alone do not prove that desktop pixels are still changing.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets
