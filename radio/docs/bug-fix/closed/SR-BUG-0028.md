# SR-BUG-0028 - Artist Visual Radio twitches when VEC video starts

Status: Closed
Severity: High
Area: Artist Player / VEC
Environment: DEV V2 Artist Player / PROD Artist Player
Date reported: 2026-09-17
Date closed: 2026-09-18

## Symptom

On the Stashbox artist Visual Radio player, the visual stage visibly twitched when a VEC video began, including the artwork-to-first-video handoff and subsequent video-to-video transitions.

Affected routes:

- `/radio/dev/v2/artist/?artist=stashbox`
- `/radio/artist/?artist=stashbox`

## Root cause

The visible browser `<video>` rendering path was producing a compositor-level flash/twitch during media handoff. Earlier fixes that changed timing, pre-roll, first-frame detection, crossfades, and competing stage observers did not fully eliminate the symptom.

The stable repair was to remove the visible video element from the presentation path entirely.

## Final repair

DEV Build 9 introduced a canvas compositor for artist VEC clips:

- the actual `<video>` element decodes offscreen/hidden
- ready video frames are painted onto a visible canvas
- outgoing artwork/media remains visible until the incoming canvas has a rendered frame
- the browser's native video surface is never exposed directly during the handoff
- competing artist watchdog/stability/artwork repaint scripts were removed from the artist-player path so the core player owns the visual stage

DEV Build 9 was user-tested and reported clean, then promoted to PROD with the same simplified script stack.

Relevant implementation:

- `radio/dev/v2/artist/artist-realm-player.js`
- `radio/dev/v2/artist/index.html`
- `radio/artist/artist-realm-player.js`
- `radio/artist/index.html`

## Verification

User verified DEV Build 9 as looking good and requested promotion to PROD.

PROD was promoted using the same canvas-compositor approach. On 2026-09-18 the user requested that SR-BUG-0028 be considered closed.

## Resolution

Closed with canvas-composited VEC video rendering for the Artist Visual Radio player.
