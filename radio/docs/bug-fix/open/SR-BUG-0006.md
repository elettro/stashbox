# SR-BUG-0006 - Plays do not persist and 10-second play events are not recorded

Status: Open, repair implemented pending end-to-end verification
Severity: High
Area: Dashboard / Analytics
Environment: DEV V2 Mobile + Desktop
Date reported: 2026-06 (historical)
Date updated: 2026-08-18
Date fixed:
Date verified:
Reported by: User

## Symptom

Song plays were not reliably retained in stats, including the intended qualifying play event after 10 seconds of listening.

## Required behavior

A song earns exactly one play after 10 seconds of accumulated actual listening in one playback session.

Pause, buffering, and seeking do not count as listening time. Seeking forward past 10 seconds must not immediately qualify. A qualified session must not write a second play because of repeated media events or duplicate script mounting.

## Backend contract verified in source

`radio-api/index.mjs` already supports the required analytics contract:

- `play_start` is an allowed song event type.
- `POST /radio/track` routes song events through the song event persistence path.
- A persisted `play_start` increments the song play counter.
- Song API responses expose `total_plays`.
- The track response can return the updated `total_plays` aggregate.

The backend does not currently provide proven session-level idempotency for `session_id`. The frontend therefore prevents duplicate writes within one mounted playback session, but a true exactly-once guarantee across an uncertain network retry still requires server-side idempotency or equivalent database uniqueness. This remains part of the open verification/hardening work.

## Frontend repair

`radio/dev/v2/v2-play-tracker.js` is the single V2 owner for qualified play counting.

Current rules:

- Qualification threshold is 10 seconds.
- Listening time uses bounded wall-clock deltas while audio is actively playing.
- Pause, `waiting`, and `seeking` reset the active timing tick without erasing accumulated listening time.
- Seeking forward cannot manufacture elapsed listening time.
- One song/source playback session receives one generated `session_id`.
- Once the API accepts the qualified event, the session latches `qualified = true` and refuses further writes.
- Song/source changes, `ended`, and `emptied` create a fresh playback session.
- The persisted event is `event_type: play_start` with `song_key`, `session_id`, `seconds_played: 10`, and tracker source metadata.
- The tracker parses the successful `/radio/track` response and uses returned `total_plays` when present.
- It updates visible nodes matching `[data-plays]`, `[data-play-count]`, or `[data-total-plays]` and stores the value on the player as `data-total-plays`.
- Diagnostics expose `persistAttempts`, `persistSuccesses`, and `lastPersistedTotal` through `window.StashboxV2PlayTracker.state()`.
- A `stashbox:qualified-play` event fires only after successful persistence.

## Single-owner loading architecture

The tracker now loads directly from both active V2 HTML entry points instead of depending on unrelated runtime modules:

- Mobile: `radio/dev/v2/index.html`
- Clean desktop: `radio/dev/v2/desktop/index.html`

The former dynamic play-tracker loaders were removed from:

- `v2-mobile-audio-stream-preference.js`
- `desktop-video-stall-watchdog.js`

The global `window.StashboxV2PlayTracker` guard remains as a second line of duplicate protection. A legacy secondary loader remains in `v2-spacebar-transport.js`, but the global guard prevents a second tracker instance. Future cleanup should remove that loader after confirming every supported V2 shell directly loads the tracker.

## Files changed in current repair

- `radio/dev/v2/v2-play-tracker.js`
- `radio/dev/v2/index.html`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/v2-mobile-audio-stream-preference.js`
- `radio/dev/v2/desktop/desktop-video-stall-watchdog.js`
- `radio/dev/v2/v2-spacebar-transport.js` from the initial repair pass

## Current hardening commits

- `403b8c913904e981066464dcbc76ed70b56b415a` - harden tracker response parsing, visible count sync, and diagnostics
- `d096dc03d3f39b6f90864fe4841f1ff39dd611e8` - load tracker directly on mobile V2
- `990de95f84b6b5da4c5d2832a58f05a97f8c436d` - load tracker directly on clean desktop V2
- `20a02eaec40fb6a66c7f5659ad54aec46b6ebcd9` - remove redundant mobile dynamic loader
- `147e2b71d32a274e290742c0d2957b5c379ace01` - remove redundant desktop dynamic loader

Earlier implementation commits remain part of the repair history.

## Verification status

Pending true end-to-end verification. Do not mark Fixed or Verified from source inspection alone.

Code-level evidence now establishes the intended path from the 10-second client threshold through the existing `/radio/track` `play_start` contract and back to `total_plays`.

Still required before closure:

1. Confirm the exact cache-busted mobile and desktop builds are live on stashbox.com.
2. Capture the starting `total_plays` for a known song.
3. Play the song for less than 10 seconds and confirm the total does not change.
4. Continue through 10 seconds of actual listening and confirm exactly one `POST /radio/track` request.
5. Confirm the track response and fresh song readback both show exactly +1.
6. Continue playing past 10 seconds and confirm no second write occurs.
7. Verify pause/resume accumulates listening time correctly without duplicate writes.
8. Verify seeking forward past 10 seconds does not immediately qualify.
9. Repeat the exact suite on mobile and clean desktop V2.
10. Add server-side session idempotency if testing exposes retry ambiguity or duplicate writes beyond the client owner guard.

## Related bugs

- SR-BUG-0005

## Future repair procedure

Start from `v2-play-tracker.js` and the `/radio/track` song event handler. Do not add another independent play-count writer. Trace one playback session from browser timing through the API write, database persistence, response aggregate, fresh song readback, and visible count update.

## Notes

Backfilled on 2026-08-17 from June 2026 stats failure reports. Active V2 repair began on 2026-08-18 after the user identified reliable play totals as a vital system statistic.