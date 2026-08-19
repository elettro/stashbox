# SR-BUG-0015 - Profile song clicks return home instead of opening the selected song

Status: Fixed
Severity: High
Area: Profile / Player
Environment: DEV V2 Mobile + Desktop
Date reported: 2026-08-19
Date fixed: 2026-08-19
Date verified:
Reported by: User

## Symptom

Clicking songs from the listener Profile, including songs inside playlists, navigated back to the Radio homepage instead of opening the selected song in the main player. Playlist playback also did not preserve the saved playlist order for Next/Previous or song-end advance.

## Reproduction

1. Open the authenticated listener Profile.
2. Open Favorites, Listening History, or a saved playlist.
3. Click a song.
4. Expected: Radio opens the full player on that exact song and starts playback. If launched from a playlist, the player queue follows that playlist's saved order.
5. Actual before repair: navigation returned to the homepage and the selected song/playlist queue was not reliably handed to the player.

## Root cause

The Profile's existing `playSong()` path only wrote the legacy single-song handoff and navigated to `/radio/dev/v2/`. The project already contained `v2-profile-queue.js`, which can consume an ordered profile queue and drive Next/Previous/song-end playback, but Profile was not writing its queue payload and the clean desktop runtime did not load the queue consumer.

## Fix

- Added `profile-player-handoff.js` to intercept Profile song selections before the legacy homepage-only handler.
- The handoff writes `stashbox_v2_profile_queue_handoff` with the selected song, ordered song keys, selected index, autoplay intent, and playlist context when available.
- Playlist order is read from the visible playlist sheet so playback begins at the clicked item and continues in saved order.
- Profile list rows are clickable for playback while destructive/editing actions remain separate.
- The legacy artist/song handoff key is cleared for Profile launches to prevent two controllers from opening the same song.
- Clean desktop now loads the existing `v2-profile-queue.js` consumer. Mobile already loaded it.

## Files changed

- `radio/dev/v2/profile/profile-player-handoff.js`
- `radio/dev/v2/profile/index.html`
- `radio/dev/v2/desktop/index.html`

## Commits

- `70e6f66591a7875dafac018d62d214559bd7cf0d`
- `b9f23fe4d8a7c3e445603cee853bd6f6fcc6f2e6`
- `545071ea64c68dd3cb4d4f02692bec97335473e8`

## Verification

Pending user verification. Test a standalone Profile song and a multi-song playlist. Confirm the selected song opens and begins playback, then verify Next, Previous, and natural song-end advance follow the playlist order.

## Regression risk

- Profile click interception must not swallow Remove Favorite, Remove Playlist Item, Rename, Delete Playlist, form controls, or overlay-close actions.
- `v2-profile-queue.js` must remain loaded on both active mobile and clean desktop runtimes.
- Changes to Profile list markup or playlist action data attributes could affect playlist-context detection.

## Related bugs

- SR-BUG-0014

## Future repair procedure

If Profile song launches stop working, inspect `profile-player-handoff.js` first and verify `stashbox_v2_profile_queue_handoff` is written with the clicked song and ordered song keys. Then verify the active Radio runtime loads `v2-profile-queue.js` and that the matching `[data-song]` card exists after catalog render.
