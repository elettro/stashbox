# SR-BUG-0011 - Desktop VEC media flickers, video fails to trigger, and player can freeze

Status: Open
Severity: Critical
Area: VEC Player
Environment: DEV V2
Date reported: 2026-08-11
Date updated: 2026-08-17
Date fixed:
Date verified:
Reported by: User

## Symptom

Desktop VEC playback is unstable. The media stage can flicker between song artwork, VEC graphics, and video states, intended VEC videos may fail to trigger or start, and the desktop player can become effectively frozen after selecting a song.

On Firefox desktop, the failure has been especially severe: song graphics may not appear, VEC videos may not appear/start, or the player screen may become nonresponsive after song selection.

## Reproduction

1. Open the DEV V2 desktop player.
2. Select a song.
3. Start or allow song playback to begin.
4. Allow the desktop VEC/artwork enhancement stack to react to the player opening and audio state.
5. Observe the visual stage and player controls.
6. Repeat in Firefox, Chrome, and Edge.
7. Expected: song starts, artwork displays for the CMS-defined intro duration, the first VEC media is already preloaded, media takes over without flicker, controls remain responsive, and subsequent assets hand off only when ready.
8. Actual: artwork/video may flicker, selected videos may not trigger, expected graphics may not render, and the desktop player can freeze or become nonresponsive after selecting a song.

## Affected examples

- Desktop media playback originally reported during the 2026-08-11 health-scan repair session.
- Renewed desktop VEC flicker reported on 2026-08-17.
- Firefox desktop reported on 2026-08-17 with missing song graphics and videos not appearing/triggering.
- Desktop player reported on 2026-08-17 as freezing after a song is selected.

## Working comparison

Mobile playback has remained substantially more reliable during the same period. The desktop renderer must be independently stabilized and verified across Chrome, Firefox, and Edge before this bug is considered fixed.

## Root cause / architecture finding

The base V2 song-selection path in `v2-recovery.js` is small and deterministic: it reveals the player, writes song metadata/artwork, sets `audio.src`, calls `audio.load()`, and requests playback. Source inspection did not reveal a self-feeding loop in that core path.

The desktop page had accumulated multiple independent post-song-start systems that could all observe and/or mutate the same player and visual stage. These included desktop VEC controller/runtime code, video rescue/start logic, watchdog behavior, artwork replacement logic, transition guards, and other enhancement observers.

A concrete high-risk feedback path was identified in `v2-portrait-artwork-reliability.js`: it installed a document-wide `MutationObserver` watching `hidden`, `class`, `src`, and `style` mutations inside the player/stage, while its own apply path changed player/stage styles, classes, image sources, and related state. This creates a credible self-triggering render/observer loop under desktop song changes.

Additional desktop enhancement scripts also used global observers or polling, increasing the number of independent owners reacting to the same state. The older desktop video runtime separately fetched VEC data, created rescue video elements, and attempted to take over the visual stage after audio began.

The exact historical freeze may involve more than one of these scripts, but the architecture itself is confirmed unsafe: too many independent systems were allowed to own or repair the same stage.

## Rebuild strategy

Do not continue repairing the old desktop VEC stack by layering additional watchdogs, MutationObservers, or rescue renderers.

Desktop DEV V2 is being split internally from the currently working mobile runtime:

- Mobile keeps its existing runtime while the desktop rebuild is proven.
- Desktop is routed before legacy scripts boot to a clean runtime under `radio/dev/v2/desktop/`.
- Browser history is rewritten back to `/radio/dev/v2/` so this remains an internal implementation split rather than a new user-facing product URL.
- The clean desktop page uses the existing core player plus one event-driven VEC engine.
- The new desktop VEC engine uses no `MutationObserver` and no polling interval.
- One song session/generation owns all timers, async work, media layers, and asset-pool state.
- Artwork stays visible for the exact CMS intro duration.
- The first VEC asset preloads during the artwork intro.
- Two permanent media layers provide A/B buffering.
- The current visual remains visible until the next visual is loaded/ready.
- Videos are promoted only after muted browser-safe `play()` succeeds.
- Failed assets are excluded for the current song session and skipped.
- No asset repeats until the eligible pool is exhausted.
- Same-folder back-to-back selection is avoided when alternatives exist.
- Song changes invalidate prior timers, preloads, and async responses through a generation ID.
- VEC media remains pointer-inert and below all controls.
- Diagnostics are event-driven and expose catalog/audio/VEC state without adding another polling loop.

## Clean desktop files

- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/desktop/desktop-stable.css`
- `radio/dev/v2/desktop/desktop-vec2.js`
- `radio/dev/v2/desktop/desktop-health.js`
- `radio/dev/v2/desktop/smoke-test.mjs`
- `.github/workflows/desktop-v2-clean-smoke.yml`
- `radio/dev/v2/index.html` desktop router

## Rebuild commits

Key clean-runtime commits include:

- `1db4fb5fde9a6c121834eb43addc95f761da4a17` - clean desktop shell
- `0d004934b3d2fb45e1e82a7d7ba7910b72a7b46e` - stable desktop VEC stage CSS
- `e504f797f6134c1123381312004bf666270d3861` - first event-driven desktop VEC engine
- `e5e63e09b821fe768a6e131fcb5fc13712c90cd0` - session identity/preload race hardening
- `3cb6edb5e52efaa1133aecef8497735a49f52fbb` - route desktop before legacy scripts boot
- `2884b6bbc720270bdbfc52fe0a606e512d41bb9f` - event-driven desktop diagnostics
- `41293279ead5ed7f34d9975edf02b9cacd7f20de` - reduce clean desktop runtime to essential scripts
- `ebcaf0e2a182c4dd05929fa8845f624ce0590a0c` - structural smoke test
- `41649bc933ee40eb2740c353ad66dbfe3c4e32e3` - CI guard workflow

## Current verification state

Pending. Do not mark fixed yet.

The execution environment used for this repair can inspect/write GitHub but cannot open the deployed `stashbox.com` player in its local Chromium runtime because outbound browser access is blocked. Repository/source-level verification is therefore possible, but real browser media verification must remain a separate requirement.

Required verification before marking fixed:

- Desktop page loads and remains responsive after repeated song selections.
- Audio plays and remains controllable for repeated next/back operations.
- CMS-defined artwork intro duration is honored exactly.
- First video/image is preloaded during the intro.
- Artwork -> video/image handoff contains no blank/artwork flicker.
- Video -> video and video -> image handoffs keep the outgoing visual until incoming media is ready.
- Firefox desktop: graphics render and videos trigger/play.
- Chrome desktop: graphics render and videos trigger/play.
- Edge desktop: graphics render and videos trigger/play.
- Full eligible VEC pool is consumed without repeats before exhaustion.
- Song changes cleanly cancel the prior VEC session.
- 30-60 minute unattended playback remains responsive and stable.
- Only after the stable core passes should authentication UI, Media Session integration, Focus Mode, Cinema Mode, clip-linked commerce, and other enhancements be reintroduced one at a time.

## Regression risk

High until browser verification is complete. The new architecture deliberately lowers this risk by reducing desktop stage ownership to one renderer and eliminating persistent DOM observers from the VEC runtime.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets

## Future repair procedure

Start from the clean desktop runtime, not the legacy patch stack.

For each regression:

1. Read `window.STASHBOX_DESKTOP_HEALTH.snapshot()` and `window.StashboxDesktopVec2.state()`.
2. Determine whether the failure is catalog, audio, recipe, asset eligibility, preload, browser `play()`, handoff, or song-session cancellation.
3. Fix that single layer without introducing a second stage owner, MutationObserver-based repair loop, or polling watchdog.
4. Run the desktop structural smoke test.
5. Cache-bust changed desktop JS/CSS.
6. Verify repeated song changes and long playback across Firefox, Chrome, and Edge before closing the bug.

## Notes

Backfilled on 2026-08-17 from the 2026-08-11 desktop playback report.

Updated on 2026-08-17 after renewed testing showed VEC flicker plus videos failing to trigger, Firefox failing to display expected graphics, and the desktop interface freezing after song selection.

The repair direction is now a clean desktop playback/VEC runtime rather than continued patching of the legacy desktop observer/watchdog stack.
