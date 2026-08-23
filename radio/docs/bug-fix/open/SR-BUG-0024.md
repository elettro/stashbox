# SR-BUG-0024 — Listener profile images load in DEV but fail in production

- **Status:** Open, investigating
- **Verification:** Pending
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

## Initial findings

Production and DEV use separate media buckets and separate account schemas.

- DEV Lambda: `stashbox-radio-api-dev-v2`
- DEV schema: `radio_dev`
- DEV media bucket: `stashbox-radio-media-dev-us-east-1`
- PROD Lambda: `stashbox-radio-api-prod-v2`
- PROD schema: `radio`

Listener media URLs are stored inside `user_preferences.settings` and are read as `avatar_url` / `profile_image_url`, `banner_url` / `horizontal_banner_image_url`, and `vertical_banner_url` / `vertical_banner_image_url`.

The production profile frontend renders the saved URL directly. The profile-media upload route creates objects in the environment-specific upload bucket and returns the environment-specific public URL.

This means a DEV-to-PROD profile-data promotion must preserve both sides of the contract:

1. copy the listener profile media objects into PROD storage, and
2. rewrite the saved PROD profile-media URLs so they reference PROD media instead of DEV media.

A diagnostic is being added to verify the active DEV/PROD bucket configuration, the `user-profiles/` object inventory, and whether the production profile-media URLs point to objects that exist and are publicly readable.

## Related files

- `radio/profile/profile.js`
- `radio/profile/profile-media-stable.js`
- `radio-api/profile-media-routes.mjs`
- `radio-api/account-routes.mjs`

## Verification target

After repair:

1. Production profile loads the saved listener avatar.
2. Production profile loads the saved desktop horizontal banner.
3. Production mobile loads the saved vertical banner when present.
4. No production listener profile-media URL points at the DEV media bucket/domain.
5. The corresponding production S3 objects exist and return successfully through the configured public media URL.
