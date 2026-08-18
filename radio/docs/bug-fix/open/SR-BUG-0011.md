# SR-BUG-0011 - Desktop VEC media flickers, video fails to trigger, and player can freeze

Status: Open
Severity: Critical
Area: VEC Player
Environment: DEV V2
Date reported: 2026-08-11
Date updated: 2026-08-18
Date fixed:
Date verified:
Reported by: User

## Symptom

Desktop VEC playback became unstable. The stage could flicker between artwork and VEC media, videos could fail to trigger, and the desktop player could become effectively frozen after selecting a song. Firefox showed especially severe failures in the legacy desktop stack.

## Root cause / architecture finding

The core V2 song-selection path is small and deterministic. The unsafe behavior came from the accumulated desktop enhancement stack around it.

Multiple independent systems were observing and mutating the same player/stage. These included VEC controllers, rescue video logic, watchdogs, artwork replacement code, transition guards, and document-wide MutationObservers. `v2-portrait-artwork-reliability.js` was a concrete high-risk feedback path because it observed `hidden`, `class`, `src`, and `style` while its own apply path changed the same state.

The repair direction is therefore architectural. Do not restore the legacy desktop observer/watchdog/rescue stack.

## Clean desktop architecture

Desktop DEV V2 now routes internally to `radio/dev/v2/desktop/` before legacy desktop scripts boot. Browser history is rewritten back to `/radio/dev/v2/` so the implementation split does not create a separate public route.

The clean runtime uses:

- one VEC renderer and one stage owner
- no VEC MutationObserver
- no VEC polling watchdog
- CMS-defined artwork intro timing measured against `audio.currentTime`
- first VEC asset preloaded during the artwork intro
- permanent A/B media layers for buffered handoff
- outgoing media retained until incoming media is ready
- muted browser-safe video playback before promotion
- generation-based cancellation for song changes
- failed-asset exclusion for the current song session
- full-pool consumption before reset
- URL-first asset identity so duplicate media URLs do not masquerade as separate assets
- same-folder back-to-back avoidance when alternatives exist
- current-asset exclusion when a pool cycle resets, while still allowing a true one-asset pool to replay
- pointer-inert VEC layers below all controls
- event-driven diagnostics only

## Audio master clock hardening

`desktop-audio-master.js` now freezes the active VEC video when audio enters `waiting`, `seeking`, or a low-ready-state `stalled` condition. It resumes VEC only after audio transport is healthy again. It also mirrors audio playback-rate changes to the active VEC video.

Image rotation and artwork-intro timing already use the audio clock, so pause and buffering do not advance those timers ahead of the song.

## Key rebuild commits

- `1db4fb5fde9a6c121834eb43addc95f761da4a17` - clean desktop shell
- `0d004934b3d2fb45e1e82a7d7ba7910b72a7b46e` - stable desktop stage CSS
- `e504f797f6134c1123381312004bf666270d3861` - event-driven VEC engine
- `e5e63e09b821fe768a6e131fcb5fc13712c90cd0` - session identity/preload race hardening
- `3cb6edb5e52efaa1133aecef8497735a49f52fbb` - desktop routing before legacy boot
- `2884b6bbc720270bdbfc52fe0a606e512d41bb9f` - event-driven diagnostics
- `ebcaf0e2a182c4dd05929fa8845f624ce0590a0c` - structural smoke test
- `41649bc933ee40eb2740c353ad66dbfe3c4e32e3` - CI structural guard
- `3bc2eb81fef5229240769cae86437415c0b3fa60` - keep inactive A/B buffer decode-active
- `4ebc8228cb707098d5d72d8c4ae5f39f62397e2d` - freeze VEC video on audio transport stalls
- `42539a0377dd458c528f5d63a6bd517e0fc42d94` - load audio-master transport guard
- `6d9e34cde94e3cdebf3cbc85e3c7c88f51aca145` - structural guard for master-clock transport
- `b0a05b1e9927b5c3029270c9d6e57131fe69c3b9` - fix pool exhaustion and URL-first dedupe
- `4486cd48b2954cc73503be98f44cd8332b8baac9` - generic live health uses Chromium interaction gate
- `ebf6b96c9f74f664c8d2d63805e641b4d486e26c` - align live-health workflow with native browser gates

## Verification completed on 2026-08-18

### Structural smoke

The clean runtime structural guard passed after the audio-master changes. Receipt:

- source commit `d4d66370b59f0790e3f2f846f8d3f31b59edeaf5`
- passed at `2026-08-18T04:56:41Z`

### Google Chrome

System Chrome playback has promoted Freedom Street VEC video successfully with audio moving, a 27-asset eligible pool, failed count 0, and the next VEC video preloaded. Chrome media responses returned successful byte ranges for the active and buffered MP4 files.

### Official Firefox

Issue `#995`, run `32101065385`, returned `ok: true` using official system Firefox plus system media codecs.

Verified:

- Freedom Street audio moving
- active H.264 VEC video moving
- active video readyState 4 with no video error
- CMS intro target 2000 ms completed on the audio clock
- 27 eligible assets
- failed count 0
- next video preloaded
- zero legacy desktop VEC scripts loaded

Firefox exposes a stale WAV `MediaError` object in this headless environment while audio remains unpaused, currentTime advances, and readyState remains 4. It is recorded as diagnostic noise unless transport behavior fails.

### Microsoft Edge

Issue `#996`, run `32101080392`, returned `ok: true` using Microsoft Edge installed from the official Linux package repository.

Verified:

- Freedom Street audio moving with no media error
- active H.264 VEC video moving with no media error
- CMS intro target 2000 ms completed on the audio clock
- 27 eligible assets
- failed count 0
- next video preloaded
- zero legacy desktop VEC scripts loaded

## Verification still required before closing

Do not mark fixed yet.

Remaining gates:

- rerun structural and native browser checks against the pool-exhaustion build or later
- generic Chromium live-health pass after removing the bundled Playwright Firefox false-negative gate
- 30-minute unattended Chrome soak
- confirm repeated automatic song transitions remain responsive during soak
- confirm no duplicate VEC stage owners appear during soak
- confirm VEC media continues advancing across long playback

A dedicated 30-minute Chrome soak workflow now checks the deployed DEV player at 15-second intervals for audio-clock stalls, unexpected pauses, duplicate stages/current layers, lost VEC session identity, legacy script loading, and VEC asset progression.

## Regression rules

For future desktop VEC repairs:

1. Start from the clean desktop runtime.
2. Read `window.STASHBOX_DESKTOP_HEALTH.snapshot()`, `window.StashboxDesktopVec2.state()`, and `window.StashboxDesktopAudioMaster.state()`.
3. Fix one layer only.
4. Do not add a second stage owner.
5. Do not add MutationObserver-based VEC repair.
6. Do not add polling watchdogs.
7. Run structural smoke.
8. Cache-bust changed desktop assets.
9. Verify Chrome, official Firefox, and Edge before closing.
10. Require a 30-minute unattended soak before marking this critical bug fixed.

## Related bugs

- SR-BUG-0001 - Desktop VEC video flickers to song artwork during unstable clips
- SR-BUG-0009 - Wide desktop player selects square artwork instead of wide assets
