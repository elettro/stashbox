# VEC Repair Playbook

## Video flashes or exposes artwork during playback

Related bugs: `SR-BUG-0001`

Symptom pattern:

- A desktop VEC clip briefly reveals song artwork while video should remain continuous.
- Some clips may fail while immediately following clips play smoothly.

Fast checks:

1. Compare one failing clip with one working clip in the same song.
2. Inspect `window.StashboxMainVecVideoWatchdog.state()`.
3. Inspect the active stage for `data-desktop-video-artwork-lock`.
4. Confirm the stage `background-image` remains suppressed while video owns the stage.
5. Check for scripts that mutate stage background, media opacity, or visibility during handoff.

Known root cause:

- Video ownership temporarily becomes ambiguous during startup, stall recovery, or clip handoff, allowing the artwork layer underneath to become visible.

Successful repair:

- Keep artwork locked behind video for the full period of video ownership, including recovery and handoff.
- Use a release grace period rather than restoring artwork on the first pause/transition event.
- Observe stage style mutations and reassert the lock if another routine tries to restore artwork prematurely.

Primary files:

- `radio/dev/v2/v2-media-transition-guard.js`
- `radio/dev/v2/v2-main-vec-video-watchdog.js`
- `radio/dev/v2/v2-desktop-official-artwork-16x9.js`

Regression checks:

- Artwork-only recipes still show artwork.
- Artwork returns after video playback truly ends.
- Switching songs refreshes the correct artwork.
- Native VEC playback and watchdog fallback do not fight for the same stage.

## Repeats or duplicate clips

Fast checks:

1. Inspect the recipe pool and folder sources for duplicate URLs/IDs.
2. Check canonical URL normalization.
3. Check shuffle-memory state and pool exhaustion logic.
4. Confirm failed assets are excluded without collapsing the pool into repeats.

Common files:

- `radio/dev/v2/v2-vec-shuffle-memory.js`
- `radio/dev/v2/v2-desktop-vec-repeat-guard.js`
- VEC recipe and asset API handlers.

## Wrong artwork or media ratio

Fast checks:

1. Confirm the media asset has the expected ratio metadata or dimensions.
2. Confirm desktop chooses 16x9 or 21x9 artwork rather than square artwork.
3. Check `object-fit`, stage dimensions, and ratio-specific selectors.
4. Compare mobile and desktop paths before changing shared code.

Common files:

- `radio/dev/v2/v2-desktop-official-artwork-16x9.js`
- `radio/dev/v2/v2-responsive-song-artwork.css`
- `radio/dev/v2/v2-media-transition-guard.js`

## Desktop video freezes while audio continues

Related bugs: `SR-BUG-0011`

Symptom pattern:

- The visible desktop VEC video freezes on one frame while song audio continues smoothly.
- Player controls and the rest of the interface remain responsive.
- Multiple songs may fail in a similar elapsed-time range, suggesting a shared handoff or pool-state path rather than one damaged song record.

Fast checks:

1. Verify the exact desktop build marker before deciding whether a report occurred before or after a repair.
2. Inspect `window.StashboxDesktopVec2.state()` and `window.StashboxDesktopVec2.diagnostics()`.
3. Compare pool size, played count, failed count, current asset, next asset, recovery cycles, and recovery scheduling.
4. Inspect the current video `currentTime`, `duration`, `ended`, `paused`, `readyState`, `networkState`, and decoded/presented frame count.
5. Treat a user-visible frozen frame as a real stall even when `currentTime` or decoded-frame totals still advance; those counters do not prove that desktop pixels are repainting.
6. Inspect `window.StashboxDesktopVideoStallWatchdog.state()` and confirm `presentationWatch` is true in browsers with `requestVideoFrameCallback`.
7. Check `stashbox:desktop-video-stall`, `pool-reset`, `pool-recovery-scheduled`, `pool-recovery-start`, `pool-recovery-complete`, and `video-lease-start` events.
8. Confirm whether the last visible frame belongs to an ended/stalled video or an image whose audio-based deadline passed.

Known continuity rule:

- Normal pool exhaustion must clear played state and reuse the eligible pool.
- A missing next asset must never leave an ended, errored, or stalled video frame visible.
- Use artwork as the safe recovery visual, then retry the existing pool with bounded backoff until flowing VEC media resumes.
- An ended current video whose normal event handoff was missed must be advanced by the watchdog through the existing VEC engine.
- Audio `timeupdate` should reassert overdue image transitions and recovery when a song is playing without a current asset.
- Every desktop video needs an independent audio-clock lease. Use the media duration when reliable, add a short handoff grace period, and enforce a maximum ownership window so a clip cannot own the stage indefinitely.
- In the foreground, `requestVideoFrameCallback` is the authoritative presentation heartbeat. If no callback arrives during the stall window while audio plays, advance through the existing engine even when media time and decoded-frame totals still move.
- Reset presentation monitoring on every clip handoff and when the document returns to the foreground.
- Mobile and desktop playback paths must be compared before shared code changes; a healthy mobile run alongside a failing desktop run is evidence to keep the repair desktop-scoped.

Primary files:

- `radio/dev/v2/desktop/desktop-vec2.js`
- `radio/dev/v2/desktop/desktop-video-stall-watchdog.js`
- `radio/dev/v2/desktop/desktop-audio-master.js`
- `radio/dev/v2/desktop/index.html`

Regression checks:

- VEC remains visually valid for 100% of each song.
- Full-pool consumption still occurs before normal repeats.
- Ordinary pool exhaustion resets and continues.
- Simulated all-next-assets-failed state removes the frozen frame, shows artwork, retries, and resumes media.
- Pause/resume and seeking do not create duplicate recovery or lease timers.
- No desktop video owns the stage beyond the configured maximum audio-clock lease.
- A foreground clip with no presentation callback advances within the configured stall window.
- Background-tab throttling does not mark healthy clips failed; presentation monitoring re-arms on foreground return.
- Only one VEC stage owner exists.
- Test complete songs in Chrome, Firefox, and Edge before verification.
