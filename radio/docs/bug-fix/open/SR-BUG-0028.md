# SR-BUG-0028 - Artist Visual Radio twitches when VEC video starts

Status: DEV repair deployed, user verification pending
Severity: High
Area: Artist Player / VEC
Environment: DEV V2 Artist Player
Date reported: 2026-09-17

## Symptom

On the Stashbox artist Visual Radio player, the visual stage visibly twitches when a VEC video begins, especially during the handoff from artwork or the previous visual into the next video.

Affected DEV route:

- `/radio/dev/v2/artist/?artist=stashbox`

## Root cause

The artist-specific `renderAsset()` path removes the current active media before the replacement media is confirmed ready and playing. The outgoing visual is therefore no longer covering the stage during startup of the incoming clip, which exposes the stage/background and produces the visible twitch.

This issue is isolated to the artist Visual Radio player. The main Stashbox Radio desktop player is not part of this repair.

## DEV repair

Added a DEV-only artist transition guard:

- `radio/dev/v2/artist/artist-realm-transition-guard.js`

The guard watches artist-player media handoffs and:

- preserves the outgoing visual during the replacement startup
- keeps incoming video hidden until it has playable frame data / begins playback
- keeps incoming images hidden until loaded
- reveals the incoming media only after it is ready
- then removes the outgoing media after the transition overlap

The DEV artist page now loads the guard with a cache-busted URL and build marker:

- `artist-realm-transition-guard.js?v=20260917-transitionguard1`
- `artist-vec-transitionguard1-20260917`

## Verification requirement

Hard-refresh the DEV artist route and start Visual Radio. Observe the initial artwork-to-video handoff and several subsequent video handoffs.

Pass criteria:

- no visible black/stage flash when the first VEC video starts
- no artwork/background twitch between subsequent visual assets
- video still starts normally
- no regression to artist controls, audio playback, watchdog recovery, or navigation

Do not promote to PROD or mark fixed until the user verifies the DEV behavior.
