# SR-BUG-0024 — Listener profile images load in DEV but fail in production

- **Status:** Fixed, user verification pending
- **Verification:** PROD media objects copied and public-read verified; desktop/mobile UI retest pending
- **Severity:** High
- **Area:** Listener Profile / Profile Media / PROD Data Promotion
- **Environment:** PROD Desktop + Mobile
- **Reported:** 2026-08-23

## Symptom

The listener profile renders with its saved avatar and banner imagery in `/radio/dev/v2/`, but the corresponding production listener profile fails to render those saved profile images.

The surrounding profile data and interface load, isolating the visible failure to profile media rather than the entire account/profile runtime.

## DEV reference

The reported DEV profile shows the expected saved listener media, including:

- profile/avatar image
- horizontal profile banner
- the rest of the listener profile data and activity

## Root cause

DEV and production correctly use separate media stores:

- DEV Lambda: `stashbox-radio-api-dev-v2`
- DEV schema: `radio_dev`
- DEV media bucket: `stashbox-radio-media-dev-us-east-1`
- DEV public media host: `d1ufj7xan6uxy0.cloudfront.net`
- PROD Lambda: `stashbox-radio-api-prod-v2`
- PROD schema: `radio`
- PROD media bucket: `stashbox-radio-media-prod-us-east-1`
- PROD public media host: `d34ez960394y8w.cloudfront.net`

The DEV-to-PROD promotion had not copied listener profile-media objects into the production media bucket.

A live storage comparison found:

- DEV listener profile media: 3 objects
- DEV listener profile media size: 4,345,750 bytes
- DEV first profile-media object through DEV CloudFront: HTTP 200
- PROD listener profile media before repair: 0 objects

This was a production data/media promotion gap. The production profile UI and production media host were present, but the underlying listener avatar/banner files were absent from PROD storage.

### Profile-media key detail

The current profile upload route stores listener media under keys beginning with `user-profiles-<subject-hash>/...`.

The initial diagnostic looked for `user-profiles/` and therefore showed zero objects even in DEV. The corrected prefix inspection exposed the three real DEV objects and confirmed PROD had none.

## Fix

A guarded one-time repair copied the complete DEV listener profile-media set into the production media bucket using the exact same object keys.

Safety gates required:

1. DEV schema must be `radio_dev`.
2. PROD schema must be `radio`.
3. DEV and PROD buckets must be different.
4. DEV bucket must carry the DEV marker.
5. PROD bucket must not carry the DEV marker.
6. PROD must contain zero listener profile-media objects before the copy so no existing production profile media is overwritten.
7. The DEV media set must remain below the repair's object-count and total-size safety caps.

Repair result:

- DEV profile-media objects: 3
- PROD profile-media objects before: 0
- copied: 3
- size matches verified: 3
- PROD public HTTP 200 checks: 3
- PROD profile-media objects after: 3
- failures: 0
- result: PASS

The repair also invalidates the production CloudFront profile-media path when necessary so previously cached missing-object responses do not remain visible after the files arrive.

## Fix / diagnostic commits

- `ea715122` — Add PROD listener profile media diagnostic
- `32818345` — Correct listener profile media object prefix diagnostic
- `0dfd38e4` — Record corrected DEV/PROD listener profile media diagnostic
- `54a39ea0` — Add guarded PROD listener profile media repair
- `ac6132ab` — Trigger PROD listener profile media repair
- `e53dfc33` — Record successful PROD listener profile media repair

## Diagnostic records

- `radio/docs/diagnostics/PROD_LISTENER_PROFILE_MEDIA_LATEST.txt`
- `radio/docs/diagnostics/PROD_LISTENER_PROFILE_MEDIA_REPAIR_LATEST.txt`

## Related files

- `radio/profile/profile.js`
- `radio/profile/profile-media-stable.js`
- `radio-api/profile-media-routes.mjs`
- `radio-api/account-routes.mjs`
- `.github/workflows/radio-diagnose-prod-listener-profile-media.yml`
- `.github/workflows/repair-radio-prod-listener-profile-media.yml`

## Verification target

User retest remains:

1. Hard-refresh production while logged in.
2. Open PROFILE on desktop.
3. Confirm the saved avatar loads.
4. Confirm the saved horizontal banner loads.
5. Repeat on mobile and confirm the saved vertical banner when present.

The storage-side production repair is complete and independently verified. UI verification remains pending.
