# Stashbox Radio Attempt #2: TRUE DEV Mirror

## Source of truth

`/radio/dev/v2/` and the TRUE DEV backend are authoritative for listener-facing content and behavior.

Production differences are limited to environment wiring and retained production engagement/user data.

## Safety rules

1. Do not modify the live `/radio/` runtime until the mirror candidate passes parity.
2. Keep `rollback/radio-attempt1-before-cleanup-20260822` as the pre-cleanup rollback point.
3. Build Attempt #2 only on `release/radio-dev-mirror-attempt2-20260822` until approved.
4. Never copy DEV users, likes, shares, play counts, playlists, listening history, auth sessions, or analytics into PROD.
5. Do mirror DEV songs, song metadata, canonical artwork/profile image sets, VEC folders/assets, direct assets, VEC recipes, and listener-facing frontend behavior.
6. PROD-only engagement values survive by stable `song_key`.
7. Songs removed from DEV are archived/hidden in PROD rather than hard-deleted unless explicitly approved.

## Release order

### Phase 0. Freeze

- Record the exact DEV commit SHA.
- Record DEV frontend build marker.
- Record DEV song count and song keys.
- Record DEV artwork completion by song and ratio.
- Record DEV VEC recipe/folder/asset counts.
- Record current PROD commit and data counts for rollback.

### Phase 1. Frontend mirror candidate

- Copy the exact `radio/dev/v2/` tree into the isolated production candidate.
- Rewrite only environment-specific values:
  - DEV API -> PROD API
  - DEV Cognito/local storage keys -> PROD keys
  - DEV session keys -> PROD keys
  - `/radio/dev/v2/` routes -> production candidate routes
  - canonical/robots metadata -> production values
- Do not hand-select scripts or reconstruct the desktop/mobile runtime.
- Generate a file manifest and hashes for DEV vs candidate after normalized environment rewrites.
- Unexpected frontend file differences must equal zero.

### Phase 2. Song catalog mirror

For every DEV `song_key`:

- Create missing PROD song.
- Update listener-facing song metadata to DEV values.
- Preserve PROD engagement/history fields.
- Verify DEV and PROD active song-key sets match.
- Archive/hide PROD-only songs instead of deleting them.

Gate: zero missing DEV song keys in PROD.

### Phase 3. Artwork/profile image mirror

For every DEV song:

- Mirror canonical 1x1 artwork.
- Mirror 9x16 artwork.
- Mirror 16x9 artwork.
- Mirror 3x4 artwork.
- Mirror 4x5 artwork.
- Mirror 21x9 artwork.
- Copy media into production storage where required so PROD does not depend on DEV storage.
- Verify each PROD ratio resolves successfully.

Gate: zero artwork assignment mismatches for ratios present in DEV.

### Phase 4. VEC mirror

Mirror from DEV to PROD:

- Visual folders and folder metadata.
- Folder assets.
- Direct-only song assets.
- Song VEC recipes.
- Visual modes and recipe settings.
- Folder/asset references remapped to valid PROD IDs.

Gate: every DEV song with a VEC recipe has an equivalent PROD recipe and resolvable assets.

### Phase 5. Data parity report

Generate a machine-readable parity report covering:

- DEV vs PROD song count.
- Missing/extra active song keys.
- Song metadata mismatches.
- Artwork ratio mismatches.
- VEC recipe mismatches.
- VEC folder/asset mismatches.
- Missing or unreachable production media.

No cutover if a required parity category has unresolved mismatches.

### Phase 6. Rendered frontend parity

Browser-check desktop and mobile candidate against DEV.

Desktop required controls/features:

- Like/heart.
- Shuffle All.
- Previous.
- Play/pause.
- Next.
- Share and retained share count.
- Play count/ranking UI.
- FIT/FULL control.
- Artist profile link/avatar.
- Follow behavior.
- Account/login/profile behavior.
- Notifications.
- VEC artwork and video behavior.
- W previous hotkey.
- E next hotkey.
- S shuffle hotkey.
- F like hotkey.
- L like hotkey.
- Spacebar play/pause.

Mobile required features:

- Current mobile navigation/gestures.
- Player header and controls.
- VEC behavior.
- Artwork/video transitions.
- Auth/account behavior.
- Likes/shares/play tracking.

Gate: required rendered parity checks pass.

### Phase 7. Atomic cutover

Only after all gates pass:

- Create a fresh pre-cutover rollback branch.
- Replace `/radio/` from the verified mirror candidate in one controlled commit.
- Do not layer Attempt #2 on top of Attempt #1 files selectively.
- Publish and verify the live build marker.

### Phase 8. Live verification

Verify the same parity checklist on `https://stashbox.com/radio/`.

Failure of a critical frontend, catalog, artwork, VEC, auth, playback, or tracking check triggers rollback.

## Definition of success

A listener moving from DEV V2 to PROD should see the same songs, the same song artwork/profile image assignments, the same VEC recipes/assets, and the same player behavior. Differences should be limited to production environment wiring, production account/session state, and production engagement/history totals.
