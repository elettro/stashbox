# SR-BUG-0026 - Logged-in Likes do not populate Profile Favorites

Status: Fixed, verification pending
Severity: High
Area: Profile / Favorites / Like
Environment: PROD + DEV V2 Mobile + Desktop
Date reported: 2026-08-24
Date fixed: 2026-08-24
Date verified:
Reported by: User

## Symptom

A logged-in listener could Like a song in the Radio player and see the public Like behavior, but the Profile still showed Favorites = 0. Opening the Favorites stat displayed an empty Favorites sheet even after songs had been liked.

Expected behavior:

1. A logged-in user Likes a song from the player, including desktop F/L Like hotkeys.
2. The song is saved to that user's account Favorites.
3. The Profile Favorites stat reflects the saved account Favorites count.
4. Clicking Favorites opens the user's saved songs.
5. Clicking a favorite song launches that song in the main player. Play All and Shuffle All operate on the Favorites list.

## Root cause

The public Like counter and the authenticated Profile Favorites library were separate persistence paths.

The player Like controller wrote Like events to `/radio/track` and kept a local browser Like-state cache. The Profile does not read either source. It reads the authenticated `user_favorites` table through `/radio/me/favorites` and uses the account summary count from the same table.

The logged-in player had a separate Favorite rail action capable of writing `/radio/me/favorites`, but the normal Like heart and the PROD desktop F/L hotkey path did not reliably write the authenticated favorite row. As a result, public Like counts could rise while Profile Favorites remained empty.

After the initial persistence repair was committed, the active PROD and DEV runtime HTML still referenced older versioned `v2-like-state.js` URLs. Browsers/CDN caches therefore continued loading the pre-repair Like controller. This explained why the user still saw Favorites = 0 after the first deployment attempt.

## Fix

- Updated PROD `v2-like-state.js` so a logged-in Like also UPSERTs the song to `/radio/me/favorites`.
- Updated DEV `v2-like-state.js` with the same authenticated Favorite synchronization.
- Preserved the existing public `/radio/track` Like event and Like-count behavior.
- Added authenticated Favorite synchronization for desktop Like-hotkey events emitted through `stashbox:like-count-updated`.
- Kept the Favorite write idempotent. The backend already uses `(user_id, song_key)` as the Favorite primary key and UPSERTs repeated saves.
- Added safe retry/backfill behavior for a song already marked liked in the browser. Clicking that liked song again writes the account Favorite if it is missing.
- Did not bulk-import every browser-local historical Like because the old local cache is not user-scoped and automatically assigning it to the current account could attach another browser user's old Likes to the wrong account.
- Cache-busted the repaired Like controller across all four active runtimes with `20260824-profilefavorites1`:
  - PROD desktop
  - PROD mobile
  - DEV V2 desktop
  - DEV V2 mobile
- Added `profilefavorites1` to the four runtime build markers so the deployed build is identifiable.

## Existing Profile behavior retained

No new Profile list/player routing was required. The Profile already:

- Reads `/radio/me/favorites`.
- Uses that response for the Favorites stat and Favorites sheet.
- Renders each Favorite with its song key, title, artist, and artwork.
- Makes Favorite rows playable through `profile-player-handoff.js`.
- Supports Play All and Shuffle All from the Favorites sheet.

## Files changed

- `radio/v2-like-state.js`
- `radio/dev/v2/v2-like-state.js`
- `radio/desktop/index.html`
- `radio/index.html`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/index.html`

## Commits

- `cbf16b11a3d6a5d6101c72c51f924c5dcb707a59` - PROD logged-in Like to Profile Favorite synchronization
- `3aa815d78979a6516e33c0ca56659ee7bc5e43fa` - DEV logged-in Like to Profile Favorite synchronization
- `5fc1f1a169f6ba317364aba6d0c33d3eb1b22cbc` - PROD desktop cache bust
- `0a33f930b8736278dd509870fa094bdcaf20c3b7` - DEV desktop cache bust
- `66f7b14d6c0dc0781e27b51830341f07809ae67e` - PROD mobile cache bust
- `fdbee2564af1401b4648b1b00a1df06507812c75` - DEV mobile cache bust

## Verification

Pending user verification in production and DEV after the cache-bust repair.

Recommended verification:

1. Refresh Radio.
2. Confirm the user is logged in.
3. Open a song.
4. Click Like or press F/L on desktop.
5. Open Profile.
6. Confirm Favorites increases and the song appears in the Favorites sheet.
7. Click the song row and confirm the main player opens that exact song.
8. Repeat on mobile if needed.

For a song that was liked before this repair but is missing from Profile Favorites, click Like on that song again once while logged in to synchronize it to the account.

## Regression risk

- Public Likes and account Favorites must remain separate data concepts at the backend even though a logged-in Like now also creates a Favorite.
- Guest Likes must never create account Favorite rows.
- Auth token changes must preserve the Authorization and Cognito ID-token headers used by `/radio/me/favorites`.
- Runtime HTML must advance the Like-controller asset version whenever Favorite persistence logic changes.
- Do not bulk-associate the browser-local Like cache with an account unless the local cache becomes user-scoped.
- Profile playback depends on the existing `profile-player-handoff.js` and `v2-profile-queue.js` path.
