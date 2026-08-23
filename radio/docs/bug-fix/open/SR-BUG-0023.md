# SR-BUG-0023 — Production artist profiles return not found after DEV to PROD promotion

- **Status:** Fixed, user verification pending
- **Verification:** Public PROD API verified for all promoted artists
- **Severity:** High
- **Area:** Artist Profiles / PROD Data Promotion
- **Environment:** PROD Desktop + Mobile
- **Reported:** 2026-08-23

## Symptom

Artist profile links in production do not open a usable artist profile.

The public artist page shell itself loads, but its production artist API request returns `404 Artist not found`.

## Findings

A live DEV vs PROD comparison showed the song catalog had already been promoted correctly:

- DEV songs: 83
- PROD songs: 83
- unique artist names in the DEV song catalog: 3

Every public DEV artist profile existed, while every corresponding PROD profile was missing:

| Artist | DEV | PROD before repair | DEV profile media |
|---|---:|---:|---|
| Stashbox | 200 | 404 | yes |
| Tahiti Cora | 200 | 404 | yes |
| The Ras Box | 200 | 404 | yes |

This isolated the failure to production artist/profile data rather than the static artist page or the song catalog.

The production promotion had the songs but did not contain the matching published records in the `artists` / `song_artists` artist-profile layer. The player therefore generated valid artist identifiers such as `stashbox`, but `/radio/artists/stashbox` had no published production record to resolve.

## Fix

A guarded DEV to PROD artist-profile repair mirrored the public DEV artist records into production through the production admin artist API. It also recreated each artist's song associations from the DEV public profile data.

Created in PROD:

- `stashbox`
  - profile create: 201
  - primary song associations: 67
  - public verification: 200
- `tahiti-cora`
  - profile create: 201
  - primary song associations: 3
  - public verification: 200
- `the-ras-box`
  - profile create: 201
  - primary song associations: 7
  - public verification: 200

Repair summary:

- DEV public artists: 3
- created in PROD: 3
- updated in PROD: 0
- PROD public profiles verified 200: 3
- failures: 0
- workflow result: PASS

The repair mirrored visible profile fields including profile/banner imagery, biography, location, external links, verification/featured flags, and published status.

## Fix commits

- `5910ceb8` — Add DEV vs PROD artist profile diagnostic
- `e95338e2` — Trigger DEV vs PROD artist profile diagnostic
- `fc0bea77` — Record missing PROD artist profiles
- `d600cc08` — Add safe DEV to PROD artist profile repair
- `f6749015` — Trigger PROD artist profile repair
- `c7448b38` — Record successful PROD artist profile repair

## Diagnostic records

- `radio/docs/diagnostics/DEV_PROD_ARTIST_COMPARE_LATEST.txt`
- `radio/docs/diagnostics/PROD_ARTIST_PROFILE_REPAIR_LATEST.txt`

## Verification

The production API now resolves all three promoted artist profiles with HTTP 200 immediately after the repair.

Final user verification remains:

1. Open production on desktop.
2. Click the artist name/icon from the player.
3. Confirm the artist profile renders instead of failing.
4. Repeat on mobile.
