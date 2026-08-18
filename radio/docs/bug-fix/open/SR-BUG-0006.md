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

## Reproduction

1. Start a song in DEV V2.
2. Listen continuously beyond 10 seconds.
3. Inspect the browser event path, `POST /radio/track`, persisted song metrics, and dashboard/API readback.
4. Expected: exactly one qualifying play is recorded for that playback session after 10 seconds of actual listening.
5. Previous behavior: V2 had no dedicated 10-second qualifying tracker, so the event or resulting play count could be missing.

## Root cause / architecture finding

The backend contract already supports `event_type: play_start`, and song responses expose `total_plays`. The missing link was the current V2 frontend runtime. Mobile and clean desktop had no single owner responsible for waiting until 10 seconds of real playback and then emitting exactly one persisted `play_start` event.

This is separate from Share. The repair deliberately does not modify Share handlers.

## Repair implemented on 2026-08-18

Added `radio/dev/v2/v2-play-tracker.js` as the single V2 owner for qualified play counting.

Rules implemented:

- A play qualifies only after 10 seconds of accumulated actual listening.
- Pause, waiting/buffering, and seeking stop the listening clock.
- Seeking forward does not satisfy the threshold because the tracker uses bounded wall-clock playback deltas instead of trusting `audio.currentTime` jumps.
- One playback session receives one generated `session_id`.
- Once a session qualifies, the tracker refuses further writes for that session.
- Song/source changes reset the session.
- Ended/emptied media resets the session.
- The persisted event uses `POST /radio/track` with `event_type: play_start`, `song_key`, and the playback `session_id`.
- The tracker dispatches `stashbox:qualified-play` after a successful API response so visible counters or diagnostics can refresh without adding another analytics writer.

The tracker is loaded in both active V2 paths:

- Mobile through `v2-mobile-audio-stream-preference.js`.
- Clean desktop through `desktop-video-stall-watchdog.js`.
- `v2-spacebar-transport.js` also contains an idempotent shared loader as a secondary shell path. The loader guard prevents duplicate tracker instances.

## Files changed

- `radio/dev/v2/v2-play-tracker.js`
- `radio/dev/v2/v2-mobile-audio-stream-preference.js`
- `radio/dev/v2/desktop/desktop-video-stall-watchdog.js`
- `radio/dev/v2/v2-spacebar-transport.js`

## Commits

- `859e7e578128746061e2e1665b1a46742e776775` - add qualified V2 play tracker
- `3e802bcb445e6522020b623fa3d5542fdefe4986` - load tracker from shared V2 transport path
- `a528cd5c21c6c0d301e54f4108b38e36da1cd8c4` - load tracker on mobile runtime
- `d1f24dc580f3c1b8fe8e7ef93c8d730de95ed907` - load tracker on clean desktop runtime

## Verification status

Pending end-to-end verification.

Code-level evidence now confirms:

- `radio-api/index.mjs` includes `play_start` in `SONG_EVENT_TYPES`.
- Song API responses expose `total_plays` as a response-only analytics field.
- Both active V2 runtimes now load one guarded tracker implementation.
- The frontend emits only after 10 accumulated seconds and blocks repeat emission once qualified.

Still required before marking Fixed/Verified:

1. Confirm the changed files are live on stashbox.com rather than cached older assets.
2. Observe one real song before and after the 10-second threshold.
3. Confirm exactly one `POST /radio/track` request occurs.
4. Confirm the API/database `total_plays` value increases by exactly one.
5. Confirm pause/resume still reaches 10 seconds cumulatively without duplicate writes.
6. Confirm seeking past 10 seconds does not create an immediate play.
7. Repeat on mobile and desktop V2.

## Regression risk

Play tracking changes can overcount when playback restarts, seeks, resumes, multiple scripts mount, or a browser re-emits media events. The current repair uses one guarded global tracker, session identity, a qualified latch, and bounded real-listening deltas to reduce those risks.

## Related bugs

- SR-BUG-0005

## Future repair procedure

Start from `v2-play-tracker.js`. Do not add another independent play-count writer. Trace one qualifying playback through browser state, `/radio/track`, persistence, API readback, and dashboard totals before changing aggregation logic.

## Notes

Backfilled on 2026-08-17 from June 2026 stats failure reports. Active V2 repair began on 2026-08-18 after user identified play totals as a vital system statistic.