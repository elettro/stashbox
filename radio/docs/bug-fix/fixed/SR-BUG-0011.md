# SR-BUG-0011 - VEC media flickers, video fails to trigger, and player can freeze

Status: Fixed
Severity: Critical
Area: VEC Player
Environment: DEV V2 Mobile + Desktop
Date reported: 2026-08-11
First reopened: 2026-08-18
Prior date fixed: 2026-08-19
Prior date verified: 2026-08-19
Date reopened: 2026-08-19
Date fixed: 2026-08-19
Verification: Pending
Reported by: User

## Current mobile recurrence after closure

- On 2026-08-19 the user reopened SR-BUG-0011 after three solid full-song mobile passes.
- On the next mobile song, the artwork was initially missing. A video then started, and the following video froze during its handoff.
- A user-supplied iPhone Safari screenshot shows **Girls on Bikes** at approximately **0:32 / 5:10** with the visual held on a single frame while the player interface remained present.
- This invalidates the previous desktop-only scope. The current mobile transition failure is not yet proven to share the desktop `TRANSITIONING` lock root cause.

## Prior desktop recurrence

- After the continuity3 video-lease repair was live, the user reported that **She's My Guru** froze at approximately **0:48** on desktop.
- After the continuity2 repair was live, the user reported that **Dirty Bird** froze again at approximately **0:30** on desktop.
- After the continuity2 repair was live, the user reported that **Right Between the Eyes** froze again at approximately **0:28** on desktop.
- In the direct comparison, mobile playback remained visually flawless beyond **3:35**. The user explicitly narrowed the active failure to desktop.
- On 2026-08-19 the user reported that the **Mr. Top Mi Up** video froze at approximately **2:00**. This report arrived while the new continuity build was being rolled out, so it is evidence for the recurring bug but is not yet classified as a post-repair failure.
- On 2026-08-19 the user reported that **Where Next?** first froze at approximately **2:40**. A supplied desktop screenshot captured the same frozen visual frame at **3:00 / 3:59** while the song continued playing smoothly and the interface remained fully functional.
- On 2026-08-19 the user reported that the **Dirty Bird** video froze at approximately **2:45** while the song audio continued and the interface remained responsive.
- On 2026-08-18 the user reported a desktop freeze while playing **Right Between the Eyes**. The screenshot showed the player at approximately **0:53 / 6:26** with the song transport still in the playing state while the visible VEC video frame was frozen.

The recurrences confirm that this is not isolated to one song. The **0:28–0:48** desktop failures rule out simple pool exhaustion or a fixed late-song boundary. The She's My Guru recurrence also proves that a bounded video ownership lease alone does not guarantee fresh pixels reach the desktop screen. Because audio and controls remain healthy and mobile remains healthy, the remaining failure is isolated to the desktop visual video playback or handoff path rather than the audio engine, mobile player, or entire application. The bug remains Open.

## Investigation state

As of 2026-08-19, the user reports that the freeze is recurring across playback sessions but has not identified a reliable trigger. Keep this bug Open while additional examples are collected under the same ID. Do not close it based on one successful replay or a short playback test.

For each new recurrence, capture the song, approximate elapsed time, browser/device, whether the tab was foregrounded, whether audio and controls continued, whether playback recovered without intervention, and the active VEC asset when available.

## Current architecture finding

The user proposed that the VEC may be running out of clips in its plan around the recurring freeze point. Code inspection shows that normal pool exhaustion is already designed to clear the played set and reuse the eligible pool, so simply reaching the end of the pool should not stop playback.

The continuity2 repair closed the no-prepared-next-asset and missed-ended-handoff gaps. It passed a complete Where Next? run, but the later Dirty Bird and Right Between the Eyes failures show that those were not the entire cause.

The remaining desktop-specific gap is that the stall watchdog uses media currentTime and decoded/presented-frame counters as health signals. A browser can continue advancing those counters while the composited frame visible to the user remains stuck. In that state, the watchdog considers the video healthy and does not force a handoff. Mobile uses a different playback path and is unaffected in the current comparison.

Continuity3 removed the watchdog as the sole timing owner by adding a bounded audio-clock lease. Frameheartbeat1 added requestVideoFrameCallback as the foreground presentation signal.

A live She's My Guru run on frameheartbeat1 then reproduced the deeper engine lock. At approximately 0:33 and again at 0:59, audio continued while VEC remained in TRANSITIONING with two assets played, zero failed assets, and the same ended 10-second video. This proves the visible freeze can occur after the video has ended and the presentation watchdog has already requested recovery.

The blocking path was advance() holding the serialized advancing lock while awaiting either the shared next-asset preload chain or the prepared video's play() promise. A slow preload could remain unresolved across sequential asset timeouts. A prepared video could also make play() return a promise that never settled. While advancing remained true, lease and watchdog recovery calls could not start another handoff, and the ended video stayed visible.

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
- The desktop watchdog now tracks actual presentation callbacks from requestVideoFrameCallback instead of treating decoded-frame totals as proof of visible motion.
- If no new frame reaches the foreground desktop presentation path for 3.2 seconds while audio continues, the current clip is failed and advanced through the existing VEC engine.
- Browsers without requestVideoFrameCallback retain the prior decoded-frame and currentTime fallback.
- Presentation monitoring resets cleanly on video handoff and foreground return.
- If no next asset is already prepared, the current ended or stalled layer is removed immediately before any preload wait.
- Artwork becomes visible during the wait, so an ended video frame never remains on screen.
- Transition preload waiting is capped at 2.6 seconds. A slow attempt is invalidated with a preload epoch, disposed, and excluded from the next pick.
- One preload chain is limited to four failed candidates before bounded pool recovery takes over.
- Late results from abandoned preloads cannot reinsert stale video nodes into the active layer.
- Every advance now removes the old current layer before starting a prepared replacement, not only when preloading is required.
- A prepared video's play() promise has a 1.6-second start timeout.
- Timed-out video starts enter the same bounded failed-asset and pool-recovery path instead of holding TRANSITIONING.

Repair commits:

- ff54fa309804383312e90a2bbb3946d481059c6b - full-song fallback and pool recovery
- 8cceb1930ba6a6c073ce314d9d9899bca5e13d94 - serialized recovery
- a13ae746a19f45ecbc7285c861a7502e281701d9 - watchdog-to-engine handoff and missed-ended recovery
- e4c8be5f58f7ae6b17b18a7e3f84db4b0f421e42 - desktop cache bust for the continuity build
- db68e14aca3b7bfc75d9535a1780e46ae851dd46 - failed-promotion recovery completion
- d85020c0a76f4b51e2ffab1892b6af4e4063fbb6 - continuity2 desktop build publication
- 748e7f9b9713cbb9beaa38875cfb086f61bf061c - independent desktop video audio-clock lease
- a680a6e243cd244b60843991a3deb603063fd971 - continuity3-videolease1 desktop build publication
- e3b5fde73bc729f4501471f9b92fe48ef265e7ef - desktop presentation-frame heartbeat watchdog
- 8b63a1ef1ec9d1715a33f42cd1d97a980efb7b5b - frameheartbeat1 desktop build publication
- 12f6c18296794c9747624f12d0e80c92055d3218 - immediate fallback and bounded transition preload
- 1798f3b6a98ebf9365f8d88d08bb59cfd571dfdd - continuity4-transitionlock1 desktop build publication
- 7319b397ae724bb872de070afe6ea1dfaaf6c832 - release every old frame and bound video start
- 806b5818aeb78ee2dedc449262f0fd8475779295 - continuity5-playtimeout1 desktop build publication

## Partial live verification

On 2026-08-19 the exact live desktop build marker `desktop-clean-20260819-profilequeue1-profilebridge2-playstats7-ranktooltip1-centeredtransport1-sharecopy2-likestate2-vecstall1-veccontinuity2` was confirmed on stashbox.com.

A full-duration **Where Next?** run passed the previously reported ~2:40 freeze point. The test included one pause/resume near 0:20, then continuous playback through the failure window and the end of the 3:59 song. At 3:54, the VEC remained in PLAYING_VIDEO with 16 assets played and 0 failed assets. The player then auto-advanced to **Hawaiian Peace Chant** with VEC still active.

This was a strong partial pass, but it did not verify the fix. The user's later post-continuity2 desktop recurrences on Dirty Bird at ~0:30 and Right Between the Eyes at ~0:28 supersede that single successful run.

## Continuity3 targeted live verification

On 2026-08-19 the exact live desktop build marker `desktop-clean-20260819-profilequeue1-profilebridge2-playstats7-ranktooltip1-centeredtransport1-sharecopy2-likestate2-vecstall1-veccontinuity3-videolease1` was confirmed on stashbox.com.

Targeted live desktop checks passed both newly reported early failure points:

- **Dirty Bird** continued beyond 0:30 and reached approximately 1:08 with seven assets played, zero failed assets, and repeated `video-audio-lease` handoffs.
- **Right Between the Eyes** continued beyond 0:28 and reached approximately 0:31 with three assets played and zero failed assets. A 20.67-second source clip was handed off by the 12-second maximum lease before it could retain the desktop stage indefinitely.

These checks confirmed the build and lease path were active, but the user's later She's My Guru freeze at ~0:48 is a post-continuity3 failure.

## Frameheartbeat1 live reproduction

The exact frameheartbeat1 desktop build was confirmed live. A live She's My Guru run reproduced the engine in TRANSITIONING at approximately 0:33 and 0:59 while audio continued. The state remained at two played assets and zero failed assets with the same ended 10-second video. This changed the leading cause from a pure compositor heartbeat gap to a serialized transition preload lock.

Continuity4-transitionlock1 removed the current frame before preload waits, but its first live run exposed the prepared-video branch: the old ended layer could remain while promote() waited on an unsettled play() promise.

## Continuity5 targeted live verification

The exact `continuity5-playtimeout1` desktop build was confirmed live. A new She's My Guru run passed both the user's ~0:48 failure point and the reproduced ~0:59 transition-lock point. At approximately 1:13, VEC remained in PLAYING_VIDEO with six assets played, zero failed assets, and no stuck TRANSITIONING state.

This is a targeted live pass.

## User continuity5 verification

On 2026-08-19 the user reported the first complete desktop song pass on continuity5: a newly played song completed 100% with flowing VEC video. The song title was not captured in the report.

The user then completed the older catalog song **Do You Love Me?** 100% with smooth desktop video. It passed the prior recurring **2:00 to 2:45** failure zone and remained healthy through the end.

Continuity5 now has two complete user-observed desktop song passes, and the user reported that multiple desktop songs were playing successfully. On 2026-08-19 the user directed that SR-BUG-0011 be called Verified and closed for now.

## Mobilecontinuity1 repair after reopening

### Mobile root cause

Two mobile-only gaps matched the reported sequence.

1. The mobile artwork authority intentionally cleared the stage background while it fetched and validated the exact 9:16 image. This produced the missing-artwork interval before video startup.
2. The mobile motion runtime reused one iPhone video element across sequential clip URLs and treated `timeupdate` progress as proof that the picture was moving. iPhone Safari can continue advancing the media clock while the compositor stops presenting new frames, so the existing 9-second media-time stall check did not detect the visible freeze.

### Mobile fix

The `mobilecontinuity1` repair:

- Keeps the current provisional artwork visible while exact 9:16 artwork loads.
- Removes the completed video source and element before each clip handoff.
- Creates a fresh muted inline video element for every clip.
- Uses `requestVideoFrameCallback` as the presentation heartbeat where supported.
- Advances to another clip when no new frame is presented for 3.2 seconds.
- Retains media-time stall recovery for browsers without a presentation-frame callback.
- Publishes cache-busted mobile scripts through `20260819-mobilecontinuity1`.

Files changed:

- `radio/dev/v2/v2-mobile-vec-motion-override.js`
- `radio/dev/v2/v2-mobile-vec-flicker-guard.js`
- `radio/dev/v2/index.html`

Commits:

- `ac16752daddc752804d7b929aff8f22dd9727134`
- `7a2cd9a4a1ae3afdfa5e4136589e8ab36420b280`
- `6d1cad31d23cce7247a65aa574df8bc96910135c`

### Verification state

Source validation passed. Both updated JavaScript files parse successfully. GitHub main contains the cache-busted mobile build. User verification on iPhone Safari remains pending.

## Prior verification and closure

On 2026-08-19 the user confirmed multiple complete desktop songs played with smooth VEC video on `continuity5-playtimeout1`.

Confirmed full-song passes:

- One newly played song completed 100%.
- **Do You Love Me?** completed 100%, including the prior 2:00 to 2:45 failure zone.

The user directed that SR-BUG-0011 be considered Fixed and Verified and closed for desktop at that time. The later mobile Girls on Bikes recurrence reopened this record on 2026-08-19.

## Important constraint

This repair does **not** add another VEC stage owner or a MutationObserver-based renderer. It is a recovery guard around the existing single `desktop-vec2` stage and uses the engine's existing error/advance path.

## Active verification checklist

The prior desktop passes remain valid evidence for continuity5. The reopened bug now requires mobile transition testing first, followed by desktop regression checks:

1. Reproduce Girls on Bikes on iPhone Safari through the full song, including the missing-artwork to first-video and first-video to next-video handoffs.
2. Confirm whether audio and controls continue when the mobile frame freezes, and capture the active VEC state and asset URL.
3. Run at least four consecutive mobile songs to cross the observed three-song healthy window.
4. Verify missing artwork never leaves an empty stage and never blocks the next video handoff.
5. Mr. Top Mi Up playback through the full song and beyond the observed ~2:00 freeze point.
6. Where Next? playback through the full song and beyond the observed ~2:40 freeze point.
7. Dirty Bird playback beyond the new ~0:30 recurrence, then through the full song.
8. Right Between the Eyes playback beyond the new ~0:28 recurrence, then through the full song.
9. She's My Guru playback beyond the new ~0:48 recurrence, then through the full song.
10. VEC remains visually valid for 100% of the song and automatically resumes flowing media after any temporary artwork fallback.
11. Normal pool exhaustion resets and continues instead of freezing.
12. A deliberately exhausted/failed next-asset set removes the last frozen frame, shows artwork, retries the pool, and resumes VEC.
13. A stalled or ended-without-handoff video advances through the existing single VEC engine.
14. A foreground video with no presentation-frame heartbeat advances within the 3.2-second stall window.
15. Every advance removes the ended current layer before preload or prepared-video startup.
16. A missing prepared asset never holds TRANSITIONING beyond the 2.6-second preload wait.
17. A prepared video whose play() promise does not settle is rejected within 1.6 seconds.
18. An abandoned preload cannot reinsert a stale video after its epoch is invalidated.
19. No duplicate VEC stage owner is created.
20. Chrome, Firefox, and Edge checks before closing.
21. Longer unattended soak before marking the critical bug fully verified.

## Prior repair history

SR-BUG-0011 previously drove the clean desktop VEC architecture: one stage owner, A/B media layers, full-pool consumption, generation cancellation, audio-master timing, cache-busted builds, and exact deployment/browser verification. That history remains valid. The current repair bounds both **transition preload** and **prepared-video startup** because timing and presentation guards cannot recover while the serialized advance path itself remains locked.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets
