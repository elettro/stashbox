# Stashbox Radio VEC 2.0

VEC 2.0 is the replacement playback/rendering engine for Stashbox Radio's Visual Experience Controller.

## Goal

One controller. One permanent stage. One source of truth.

Target sequence:

1. Song starts.
2. Song artwork owns the stage for the exact CMS-configured artwork intro duration.
3. First eligible VEC asset preloads during the artwork intro.
4. When the intro expires, the prepared VEC asset takes ownership immediately.
5. The next asset preloads while the current asset remains visible.
6. The current asset is never removed until the next asset is ready.
7. Failed media is skipped without exposing artwork/blank frames between healthy VEC assets.
8. Song change cancels the old session completely and starts a fresh one.

## Initial states

- IDLE
- ARTWORK_INTRO
- PRELOADING
- PLAYING_IMAGE
- PLAYING_VIDEO
- TRANSITIONING
- FALLBACK
- STOPPED

## Architecture

- `vec2-controller.js`: single playback state machine and song-session owner.
- `vec2-stage.css`: permanent two-layer display stage.
- Existing CMS/data remain authoritative. VEC 2.0 replaces the playback layer only.

## Migration rule

VEC 2.0 must not import or depend on the legacy desktop watchdog, video start repair, transition guard, rescue visibility repair, or desktop video runtime.

The engine will first run behind an explicit DEV feature flag. Legacy playback remains available until VEC 2.0 completes browser verification.

## Stable Core acceptance criteria

- CMS artwork intro duration is honored.
- First VEC video/image is preloaded during artwork intro.
- Artwork -> VEC transition has no blank frame or artwork flicker.
- Current asset stays visible until next asset is ready.
- No repeat before eligible pool exhaustion.
- Failed media skips cleanly.
- Song change invalidates all old timers/media/promises.
- Chrome desktop, Firefox desktop, Edge desktop, mobile Safari, and mobile Chrome verified.
