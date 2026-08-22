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

The prior repair still depended on the next real V2 audio generation arriving at exactly the right point to claim a pending ad break. V2 can reuse or remount audio during the transition, so the owed break could survive into the following song and present as an every-other-song cadence.

## Fix

Repair candidate published on 2026-08-21. The cadence guard now claims an already-owed CMS break immediately at the natural song boundary using a dedicated hidden audio proxy inside the active player. The shared Ads runtime therefore begins the break without waiting on next-song DOM timing. While the ad is playing, any next song V2 tries to start is captured and paused. When the ad ends, the runtime's normal resume call is proxied to that real next song.

The controller still owns whether a break is due. The guard does not create an independent song counter. The desktop runtime now cache-busts this as `cadenceguard2`. Keep the bug Open until a live three-song sequence verifies Song -> Ad -> Song -> Ad -> Song -> Ad.

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
- `c4815d211d43d35916654945b291d4881f125aed`
- `fc5c7fb35ebaf38741e2e6d9f952102c7adb8c36`

## Verification

Previous repair failed user verification at approximately 22:55 ET on 2026-08-21. The deterministic boundary-claim repair is now deployed to desktop and awaits a new user test.

## Regression risk

Song-end handlers, reused audio elements, transition ownership, refresh timing, and multiple cadence listeners can double-count or miss completions. The cadence guard must remain a claimant of the runtime's pending break, not a second break counter.

## Related bugs

- SR-BUG-0018

## Future repair procedure

Inspect `window.StashboxV2Ads.state()` at each natural completion. With CMS `breakInterval: 1`, the runtime must set `breakPending: true`, the cadence guard must claim it immediately, and `adPlaying` must become true before the next song audibly advances. Verify at least three consecutive transitions before closure.

## Notes

Do not mark this bug fixed because the source says `break_interval === 1`. The acceptance test is the live CMS-driven sequence.