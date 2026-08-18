# Desktop VEC 2 Clean Runtime

## Purpose

This is the repair contract for Stashbox Radio DEV V2 desktop playback after SR-BUG-0011. Desktop stability takes priority over restoring every historical enhancement at once.

## Runtime split

- Normal public DEV URL remains `/radio/dev/v2/`.
- At desktop width (`min-width: 900px`) the main page routes before legacy scripts boot to `/radio/dev/v2/desktop/`.
- The clean desktop page rewrites browser history back to `/radio/dev/v2/`.
- Mobile/tablet remain on the existing runtime while desktop is proven.
- `?desktopruntime=legacy` is an emergency comparison escape hatch only. Do not use it as the normal repair target.

## Clean desktop dependency rule

The first stable desktop runtime intentionally loads only:

1. `v2-boot-guard.js`
2. `v2-recovery.js` (base player/catalog/song selection)
3. `desktop/desktop-vec2.js`
4. `desktop/desktop-health.js`
5. `v2-spacebar-transport.js`

Do not add historical VEC rescue/watchdog/artwork/transition scripts back into this page.

## Stage ownership rule

Exactly one renderer owns desktop VEC.

Forbidden repair patterns:

- document-wide `MutationObserver` repair loops
- polling watchdogs that select/replace media
- a second rescue `<video>` owner
- separate artwork controllers mutating the VEC stage
- scripts that hide/pause another renderer's media
- transient artwork fallback between VEC assets

The VEC stage is pointer-inert and below controls.

DOM stack:

`base artwork backdrop -> desktop-vec2-stage -> shade -> header/content controls`

## Playback contract

Audio is the master clock.

Required sequence:

`song/audio starts -> base/wide artwork -> CMS intro duration -> prepared VEC media -> buffered handoffs`

Rules:

- CMS artwork intro duration is measured against `audio.currentTime`, not wall-clock/network time.
- First eligible VEC media begins preloading while artwork is showing.
- If incoming media is not ready at the intro boundary, artwork stays visible until it is ready.
- The outgoing VEC asset stays visible until the incoming asset is ready.
- Main pause pauses audio and active VEC video.
- Still-image deadlines are measured against the audio clock; pause/buffer cannot make image rotation run ahead of the song.
- Resume continues the same visual session.
- Song changes invalidate old timers, preloads, and async results using the generation ID.

## Asset-pool contract

A song session builds one normalized client-side pool from:

- direct song assets
- enabled/selected VEC folders
- enabled borrowed-song sources

Selection rules:

- hidden/deleted/inactive/disabled assets are excluded
- recipe active/excluded IDs are respected
- duplicate assets are removed
- no replay until the usable pool is exhausted
- avoid the current folder on the next pick when alternatives exist
- failed assets are excluded for the current session

## Media readiness contract

Images:

- load fully before promotion
- remain on the audio-clock duration

Videos:

- muted
- `playsinline`
- preload before promotion
- call `play()` before promotion
- if `play()` or loading fails, mark failed and prepare another asset

Never remove the outgoing visual merely because the next asset was selected.

## Observability

Browser runtime:

- `window.StashboxDesktopVec2.state()`
- `window.StashboxDesktopVec2.diagnostics()`
- `window.STASHBOX_DESKTOP_HEALTH.snapshot()`

Optional on-screen state:

- add `?vecdebug=1`

Diagnostics must remain event-driven. Do not turn diagnostics into another polling/watchdog system.

## Automated guards

Structural smoke test:

`node radio/dev/v2/desktop/smoke-test.mjs`

GitHub workflow:

`.github/workflows/desktop-v2-clean-smoke.yml`

It compiles the clean browser JS, rejects forbidden legacy scripts, rejects VEC polling/MutationObserver ownership, and checks the critical runtime invariants.

Remote deployed-browser smoke:

`radio-api/scripts/smoke-test-v2-desktop-clean-live.mjs`

GitHub workflow:

`.github/workflows/desktop-v2-clean-live-health.yml`

The live job tests the normal DEV URL in Chromium and Firefox after a deployment-settle period. It checks:

- clean desktop build actually deployed
- legacy runtime scripts absent
- song opens and audio advances
- VEC session resolves and promotes media
- play button is not covered by a visual layer
- exactly one VEC stage exists
- at most one promoted VEC layer exists
- pause freezes audio and VEC video/image clock behavior
- resume works
- repeated next-song changes create fresh VEC sessions
- page errors

On success it writes:

`radio/docs/ci/desktop-v2-clean-live-health.json`

On failure it opens/updates:

`[Desktop V2 Health] Clean runtime failure`

## Promotion gate

Do not call SR-BUG-0011 fixed until all of these are true:

- remote Chromium live health passes
- remote Firefox live health passes
- repeated song changes remain responsive
- artwork intro timing is correct
- VEC media starts without artwork flicker
- pause/resume stays synchronized
- full eligible pool behaves correctly
- long unattended playback is stable

After the stable core passes, reintroduce non-core features one at a time. Each feature must pass the same live health checks before the next feature is added.
