# SR-BUG-0025 — Mobile Download for Offline does not persist song to device

- **Status:** Fixed, user verification pending
- **Verification:** Pending on physical mobile device
- **Severity:** High
- **Area:** Mobile Player / Offline Audio
- **Environment:** PROD Mobile
- **Reported:** 2026-08-23

## Symptom

On mobile production, tapping **Download for Offline** does not result in a song being retained in the on-device offline library as it did previously.

Desktop offline-download actions remain intentionally hidden. Mobile is the active test surface for this feature.

## Root cause

The production mobile audio-stream preference runtime still targeted the DEV API host and DEV `/dev/radio/songs` route. As a result, PROD song-catalog responses were not being rewritten to prefer the browser/mobile MP3 derivative.

The offline player action then used the currently playing audio element source directly. In production this could be the large master audio asset rather than the intended mobile stream. That made an on-device fetch and IndexedDB save much heavier and less reliable on mobile.

## Fix

1. Corrected the production mobile stream preference runtime to target:
   - host: `je3zud66nb.execute-api.us-east-1.amazonaws.com`
   - route: `/prod-v2/radio/songs`
2. Strengthened the mobile offline-download hook so it resolves the active song against the live production song catalog before downloading.
3. The downloader now prefers `audio_stream_url`, `preferred_audio_url`, browser/MP3/stream fields, fast-start resolution, then the master only as a fallback.
4. After writing the audio Blob into IndexedDB, the downloader performs a fresh read-back and only reports success if the stored Blob exists and has bytes.
5. Desktop remains excluded from the download hook.
6. Production cache keys were advanced so mobile does not keep the stale runtime.

## Fix commits

- `76d77456` — Correct PROD mobile stream preference API target
- `eeef0def` — Resolve offline downloads from the PROD catalog and verify IndexedDB persistence
- `bad12698` — Publish/cache-bust the repaired mobile runtimes

## Verification target

On a physical mobile device:

1. Hard refresh Stashbox Radio production.
2. Start a song.
3. Open More Information.
4. Tap **Download for Offline**.
5. Confirm progress advances and ends with **Downloaded ✓**.
6. Open **Offline Downloads**.
7. Confirm the song appears there.
8. Turn off network access and confirm the downloaded song plays from the device.
