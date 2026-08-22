# SR-BUG-0019 - Ads CMS break cadence is ignored and ads play every other song

Status: Open
Severity: High
Area: Ads / Player
Environment: DEV V2 Desktop, shared V2 Ads runtime
Date reported: 2026-08-21
Date fixed:
Date verified:
Reported by: User

## Symptom

The Ads CMS is configured for an ad break after every song/video, but the DEV V2 player is still inserting commercials every other song/video.

## Reproduction

1. In the DEV Ads CMS, set Ad Break Timing to `After every song/video`.
2. Save the controller settings.
3. Play several songs/videos through the normal DEV V2 sequence.
4. Expected: Song -> Ad -> Song -> Ad -> Song -> Ad.
5. Actual: the player skips an owed break and behaves like an every-two-song cadence.

## Affected examples

- DEV V2 desktop player during the user test on 2026-08-21.
- Shared `v2-ads-cms-runtime.js` cadence/controller path.

## Working comparison

- CMS controller selection itself displays `After every song/video`.
- Expected cadence is one ad break after each naturally completed song/video.

## Root cause

Not established yet. The runtime has received several transition/cadence guards, but the user reproduced the every-other-song behavior after those changes. The existing fix attempts did not prove end-to-end adherence to the authoritative CMS value.

## Fix

No verified fix is recorded. Prior transition-proof cadence work and the additional cadence guard remain attempted repairs only until a live sequence proves that every CMS-selected break is honored.

## Files changed

- `radio/dev/v2/v2-ads-cms-runtime.js`
- `radio/dev/v2/v2-ads-cms-live-refresh.js`
- `radio/dev/v2/v2-ads-cms-cadence-guard.js`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/index.html`
- `radio-admin/dev/ads/index.html`

## Commits

- `a876052c1b72b69dcf8ca5be8c25f1487caaa633`
- `7f93027a70e88bcf9d32e190f42777453ddf45ba`
- `b9d2ddfbd2ec47bb8fd5c0a29fcb810df772edf7`
- `0d266ab34322dd8dd2c8a5802e10ba6ce8194f02`

## Verification

Failed. User reported at approximately 22:55 ET on 2026-08-21 that commercials were still not following the Ads CMS controller and continued to appear every other video/song.

## Regression risk

Song-end handlers, reused audio elements, transition ownership, refresh timing, and multiple cadence listeners can double-count or miss completions. Avoid adding another independent counter unless the existing owner is removed or explicitly delegated.

## Related bugs

- SR-BUG-0018

## Future repair procedure

Trace one full three-song session with logging at four points: CMS settings fetch, natural song completion, break-due state, and ad-break start. Record the song generation/token so reused audio nodes cannot be counted ambiguously. Compare the live API `break_interval` with `window.StashboxV2Ads.state()` before every completion. Fix the first point where the authoritative value or owed-break state diverges. Verify at least three consecutive Song -> Ad transitions before marking fixed.

## Notes

Do not mark this bug fixed because the source says `break_interval === 1`. The acceptance test is the live CMS-driven sequence.