# SR-BUG-0006 - Plays do not persist and 10-second play events are not recorded

Status: Fixed
Severity: High
Area: Dashboard / Analytics
Environment: DEV V2 Mobile + Desktop
Date reported: 2026-06 (historical)
Date updated: 2026-08-18
Date fixed: 2026-08-18
Date verified: 2026-08-18
Reported by: User

## Symptom

Song plays were not reliably retained in stats, including the intended qualifying play event after 10 seconds of listening.

## Required behavior

A song earns exactly one play after 10 seconds of accumulated actual listening in one playback session.

Pause, buffering, and seeking do not count as listening time. Seeking forward past 10 seconds must not immediately qualify. A qualified session must not write a second play because of repeated media events or duplicate script mounting.

## Backend contract

`radio-api/index.mjs` supports the analytics contract used by the repaired V2 player:

- `play_start` is an allowed song event type.
- `POST /radio/track` persists the event.
- A persisted `play_start` increments the song play counter.
- Song API responses expose `total_plays`.
- The track response returns the updated play aggregate when the denormalized song counter update succeeds.

## Frontend repair

`radio/dev/v2/v2-play-tracker.js` is the single V2 owner for qualified play counting.

Rules:

- Qualification threshold is 10 seconds.
- Listening time uses bounded wall-clock deltas while audio is actively playing.
- Pause, `waiting`, and `seeking` stop the active timing tick without erasing accumulated listening time.
- Seeking forward cannot manufacture elapsed listening time.
- One song/source playback session receives one generated `session_id`.
- Once the API accepts the qualified event, the session latches `qualified = true` and refuses further writes.
- Song/source changes, `ended`, and `emptied` create a fresh playback session.
- The persisted event is `event_type: play_start` with `song_key`, `session_id`, `seconds_played: 10`, and tracker source metadata.
- The tracker uses returned `total_plays` when present and updates visible play-count nodes.
- Diagnostics expose `persistAttempts`, `persistSuccesses`, and `lastPersistedTotal` through `window.StashboxV2PlayTracker.state()`.
- A `stashbox:qualified-play` event fires only after successful persistence.

## Single-owner loading architecture

The tracker loads directly from both active V2 entry points:

- Mobile: `radio/dev/v2/index.html`
- Clean desktop: `radio/dev/v2/desktop/index.html`

Redundant dynamic tracker loaders were removed from:

- `v2-mobile-audio-stream-preference.js`
- `desktop-video-stall-watchdog.js`
- `v2-spacebar-transport.js`

The global `window.StashboxV2PlayTracker` guard remains as a second line of duplicate protection.

## Live end-to-end verification

The dedicated live gate is `radio-api/scripts/smoke-test-v2-qualified-plays-live.mjs`, run by `.github/workflows/v2-qualified-plays-live.yml`.

Latest successful verification:

- Workflow run: `32187950914`
- Source commit: `049c75aaf68f3ef6f7c987760e731e8bef56f2b5`
- Test song: `Freedom Street (live)` / `freedom-street-002b-stashbox`
- Receipt: `radio/docs/ci/v2-qualified-plays-live.json`

### Mobile

- Exact live build: `mobile-play10-2-20260818-twomodes1`
- `total_plays`: 3 -> 4
- Qualifying `/radio/track` requests: 1
- Successful qualifying responses: 1
- Tracker persist attempts: 1
- Tracker persist successes: 1

### Desktop

- Exact live build: `desktop-clean-20260818-play10-2-sharecopy1-likestate2-vecstall1`
- `total_plays`: 4 -> 5
- Qualifying `/radio/track` requests: 1
- Successful qualifying responses: 1
- Tracker persist attempts: 1
- Tracker persist successes: 1

### Pause and seek protection

The successful run used the hardened gate introduced by `049c75aaf68f3ef6f7c987760e731e8bef56f2b5`.

It verifies on both mobile and desktop:

- listening time does not materially advance while paused
- no play qualifies during the pre-threshold pause
- playback resumes and accumulated listening continues
- a forward seek does not immediately qualify the session
- the seek jump is not counted as listening time
- exactly one qualifying `play_start` is emitted
- playback continuing beyond qualification does not emit a second qualifying event
- a fresh catalog readback increases `total_plays` by exactly +1

Workflow run `32187950914` completed successfully against the exact hardened source commit.

## Files changed

- `radio/dev/v2/v2-play-tracker.js`
- `radio/dev/v2/index.html`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/v2-mobile-audio-stream-preference.js`
- `radio/dev/v2/desktop/desktop-video-stall-watchdog.js`
- `radio/dev/v2/v2-spacebar-transport.js`
- `radio-api/scripts/smoke-test-v2-qualified-plays-live.mjs`
- `.github/workflows/v2-qualified-plays-live.yml`
- `radio/docs/ci/v2-qualified-plays-live.json`

## Key commits

- `859e7e578128746061e2e1665b1a46742e776775` - add reliable V2 10-second qualified play tracker
- `0c2d7e76a1c93886ea4acf5ebe19aa5840bce907` - harden tracker response parsing, visible count sync, and diagnostics
- `990542a0bb37ecde460c464263583d452d22eca6` - load tracker directly on mobile V2
- `403b8c913904e981066464dcbc76ed70b56b415a` - load tracker directly on clean desktop V2
- `573ac94f0fc0f4f19c832a2a8f88be7dd2a97e9a` - remove redundant mobile dynamic loader
- `01237875126c00de65ad3faf3e1e701a52c6ef00` - remove redundant desktop dynamic loader
- `80a9f3a04e63fe9ec73e0518d26fd17d0db847f4` - add live mobile/desktop qualified-play probe
- `4ad3afb0d00e04037f40b6c2bb97422ab474e703` - add live persistence workflow
- `049c75aaf68f3ef6f7c987760e731e8bef56f2b5` - extend gate with pause and seek protection
- `e23ac3959137f1e8b14e54d40c38162821cd6f7c` - record successful hardened live receipt
- `4a47aad0a35851d6d0948215cb8fd73e2b1ddc68` - remove final redundant tracker loader from spacebar transport

## Verification disposition

Fixed and verified on 2026-08-18 with live database/API readback on both active V2 runtimes.

The tested contract is exactly one persisted qualified play per normal playback session after 10 seconds of actual listening. Pause/resume and forward-seek protection also passed live. Server-side idempotency for an ambiguous network retry remains a future hardening item, but the verified browser path does not issue overlapping or duplicate qualified writes.

## Related bugs

- SR-BUG-0005

## Future hardening

If network-retry testing later proves a committed request can be repeated after a lost response, add server-side idempotency keyed by qualified play `session_id`. Do not add a second frontend play writer.
