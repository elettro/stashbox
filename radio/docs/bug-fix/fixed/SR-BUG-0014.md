# SR-BUG-0014 - Profile listening stats do not advance with desktop listening

Status: Fixed
Severity: High
Area: Profile / Analytics
Environment: DEV V2 Desktop + Profile
Date reported: 2026-08-19
Date fixed: 2026-08-19
Date verified:
Reported by: User

## Symptom

The listener Profile showed Songs Played stuck at 191 even after the logged-in user listened to additional songs on the clean desktop V2 player. This raised concern that Favorites, Songs Played, and Hours Listened were not true/accurate account statistics.

## Reproduction

1. Log in to Stashbox Radio DEV V2 on desktop.
2. Note the Profile Songs Played total.
3. Listen to one or more songs long enough to qualify as a play.
4. Switch songs and return to Profile.
5. Expected: authenticated profile listening history advances and Profile reflects the new totals.
6. Actual before repair: public song play tracking could advance while Profile Songs Played remained stuck at 191.

## Affected examples

- Clean desktop V2 logged-in listening.
- Profile Songs Played observed stuck at 191.
- Hours Listened potentially undercounted because it is derived from the same authenticated listening-history rows.

## Working comparison

- Favorites is a direct database count from `user_favorites` and was not found to share this failure mode.
- The public 10-second song play tracker could successfully qualify and persist public song plays.
- After the repair, the user observed Profile Songs Played advance from 191 to 195.

## Root cause

The clean desktop runtime and the listener Profile were using different persistence paths. `v2-play-tracker.js` successfully owned the 10-second public play qualification and wrote to `/radio/track`, while Profile Songs Played and Hours Listened were derived from authenticated rows in `user_listening_history` via `/radio/me/history`. The clean desktop runtime was not reliably feeding that authenticated history. An initial attempt to load the generic listening-history recorder remained fragile because it independently resolved the active song/audio session. The durable repair was to bridge authenticated profile history directly from the already-successful `stashbox:qualified-play` event so the profile history uses the same qualified song/session as the public play tracker.

A separate profile-side issue also kept an already-loaded `stats` object in memory and prevented automatic refetching, making newly persisted history appear stale until reload.

## Fix

- Updated Profile real stats to allow a fresh API fetch instead of permanently short-circuiting once `stats` existed.
- Added refreshes on page show, focus, and return to visible state.
- Added a desktop profile-history bridge driven by the canonical 10-second qualified-play event.
- The bridge records the authenticated song/session to `/radio/me/history` and finalizes on song switch, end, close, or page exit.
- Removed the independent desktop history-owner approach from the clean desktop entry and switched to the qualified-play bridge.
- Removed a global send lock in the bridge so rapidly finalized qualified sessions can persist independently.

## Files changed

- `radio/dev/v2/profile/profile-real-stats.js`
- `radio/dev/v2/profile/index.html`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/desktop/desktop-profile-history-bridge.js`

## Commits

- `ba7bf803318e9fdb2e02fe2fcff0576c085631ec`
- `48a9104e063fe08513ae6dbf32a727d829577f21`
- `98126660cdb24474a1bbba07f6d5db70ec1da0ac`
- `1c24971f85b1a7c2b097748c8e7687895934c83c`
- `d894f4b4d583f7ace63366f27fd36bdf7864504c`
- `1bba63cd21cbe68879562e43e6dbffeb7b1a4c23`
- `9a4250fe0cb4bd9acedf415385179c7a1681c1d6`

## Verification

User tested after the qualified-play bridge repair and reported that Songs Played advanced from 191 to 195. The user requested that this bug be considered resolved for now. Verification remains Pending because Hours Listened is still being watched over time and historical desktop listening may have been undercounted before this repair.

## Regression risk

- Do not add another independent desktop play/history owner that competes with `v2-play-tracker.js`.
- Profile history depends on authenticated tokens and the `/radio/me/history` route.
- Hours Listened is derived from accumulated `seconds_played`; historical gaps before this repair are not automatically reconstructed.
- Changes to player session IDs, qualified-play events, song switching, or auth/session storage can affect profile history.

## Related bugs

- SR-BUG-0006

## Repair playbook

- `radio/docs/bug-fix/repairs/PROFILE_ANALYTICS_REPAIRS.md`

## Future repair procedure

If Profile Songs Played or Hours Listened stops advancing, first confirm the public `stashbox:qualified-play` event fires after 10 seconds. Then verify `desktop-profile-history-bridge.js` receives that exact song/session, POSTs successfully to `/radio/me/history` with the logged-in token, and that `/radio/me/profile-stats` returns the new `qualified_plays` and `total_seconds_played`. Do not create a second play-threshold tracker.

## Notes

Favorites is calculated independently from `user_favorites` and is not dependent on listening-history persistence. Songs Played currently represents qualified listening-history sessions, not distinct unique song titles. The backend also computes `unique_songs_played` separately but the Profile currently displays `qualified_plays`.