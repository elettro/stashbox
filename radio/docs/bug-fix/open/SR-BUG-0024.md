# SR-BUG-0024 — Listener profile images load in DEV but fail in production

- **Status:** Fixed, user verification pending
- **Verification:** PROD media objects present and public-read verified; PROD upload CORS repaired; production profile media frontend republished; desktop/mobile UI retest pending
- **Severity:** High
- **Area:** Listener Profile / Profile Media / PROD Data Promotion
- **Environment:** PROD Desktop + Mobile
- **Reported:** 2026-08-23
- **Reproduced again:** 2026-08-24

## Symptom

The listener profile works in production, but the Account Information profile-image editor does not show the saved profile photo, horizontal banner, or vertical banner. A new profile-photo upload reports `Failed to fetch`.

The surrounding profile page still loads. In the 2026-08-24 reproduction, the production profile hero itself retained the saved horizontal banner while the editor incorrectly displayed `No horizontal banner uploaded`, proving that the profile had saved legacy media state even though the unified media editor was not presenting it.

## Root causes

### 1. Initial DEV-to-PROD media promotion gap

DEV and production correctly use separate media stores:

- DEV Lambda: `stashbox-radio-api-dev-v2`
- DEV schema: `radio_dev`
- DEV media bucket: `stashbox-radio-media-dev-us-east-1`
- DEV public media host: `d1ufj7xan6uxy0.cloudfront.net`
- PROD Lambda: `stashbox-radio-api-prod-v2`
- PROD schema: `radio`
- PROD media bucket: `stashbox-radio-media-prod-us-east-1`
- PROD public media host: `d34ez960394y8w.cloudfront.net`

The first production repair found the three listener profile-media objects only in DEV and copied them into the production media bucket using the same object keys.

### 2. Production media bucket had no browser upload CORS rule

The 2026-08-24 upload failure was independently reproduced against AWS configuration. Before repair, the production media bucket returned an empty CORS configuration:

```json
{"CORSRules":[]}
```

That blocked the browser's cross-origin `PUT` to the S3 presigned upload URL. The profile UI surfaced the browser network failure as `Failed to fetch`.

The bucket now explicitly accepts profile-media browser uploads from:

- `https://stashbox.com`
- `https://www.stashbox.com`

for `GET`, `HEAD`, `PUT`, and `POST`, with all request headers accepted.

Diagnostic receipt:

- `radio/docs/diagnostics/PROD_PROFILE_UPLOAD_CORS_REPAIR_LATEST.txt`

Result:

- `repair_applied=true`
- `prod_put_rule_before=false`
- `prod_put_rule_after=true`

### 3. The unified editor discarded legacy saved form URLs when its media payload was empty

`radio/profile/profile-media-stable.js` rendered each card only from the unified `/radio/me/media` payload. During enhancement it then overwrote the existing `avatar_url` and `banner_url` form values with the unified value, even when that unified value was empty.

This produced the contradictory production state visible in the screenshot:

- the profile hero still showed the saved banner
- the image editor said `No horizontal banner uploaded`

The production editor now preserves the existing account-form media URL as a fallback instead of replacing it with an empty value.

The repair also normalizes legacy DEV CloudFront profile-media URLs to the production CloudFront host when the object path is a listener profile-media path. Those same legacy objects were previously copied into the production bucket and independently verified public through the production CloudFront distribution.

## Production object verification

The 2026-08-24 object diagnostic confirms three listener profile-media files exist in the production bucket:

- one `profile_image`
- one `horizontal_banner`
- one `vertical_banner`

All three retain their media-purpose metadata.

Diagnostic receipt:

- `radio/docs/diagnostics/PROD_PROFILE_MEDIA_OBJECTS_LATEST.txt`

## Production API route verification

The production profile-media API route and API Gateway CORS layer are active:

- unauthenticated `GET /radio/me/media` returns `401 AUTH_REQUIRED`, proving the route exists
- the response includes `Access-Control-Allow-Origin: *`
- preflight to `/radio/me/media/presign` returns HTTP `204`
- preflight allows `GET,POST,PUT,PATCH,DELETE,OPTIONS`
- preflight allows `Authorization`, `X-Cognito-Id-Token`, and `Content-Type`

Diagnostic receipt:

- `radio/docs/diagnostics/PROD_PROFILE_MEDIA_ROUTE_LATEST.txt`

This isolates the reported `Failed to fetch` upload error to the production S3 browser-upload CORS gap rather than the API Gateway route.

## Fixes

### Storage repair

A guarded one-time repair copied the complete DEV listener profile-media set into the production media bucket using the exact same object keys.

Repair result:

- DEV profile-media objects: 3
- PROD profile-media objects before: 0
- copied: 3
- size matches verified: 3
- PROD public HTTP 200 checks: 3
- PROD profile-media objects after: 3
- failures: 0
- result: PASS

### Browser upload repair

Production S3 CORS was repaired on 2026-08-24. The production bucket now accepts the browser `PUT` required by the presigned upload flow from the Stashbox production origin.

### Frontend preview repair

`radio/profile/profile-media-stable.js` now:

1. keeps a saved account-form avatar or banner when the unified media response is empty
2. rewrites copied legacy DEV profile-media URLs to the PROD CloudFront host
3. stops claiming `Loaded from your saved profile` when the resolved URL is actually empty
4. preserves existing profile media while the editor initializes
5. gives a clearer storage connection error if a future browser upload network failure occurs

`radio/profile/index.html` now cache-busts the repaired profile-media runtime with build `20260824-profilemedia2`.

## Fix / diagnostic commits

Initial production media promotion:

- `ea715122` — Add PROD listener profile media diagnostic
- `32818345` — Correct listener profile media object prefix diagnostic
- `0dfd38e4` — Record corrected DEV/PROD listener profile media diagnostic
- `54a39ea0` — Add guarded PROD listener profile media repair
- `ac6132ab` — Trigger PROD listener profile media repair
- `e53dfc33` — Record successful PROD listener profile media repair

2026-08-24 repair:

- `e6fcf8ef` — Repair PROD listener profile upload CORS
- `00fa8e34` — Record PROD profile upload CORS repair
- `d0a32b3c` — Inspect PROD listener profile media object keys
- `3a678206` — Record PROD profile media object diagnostic
- `24faf86b` — Diagnose PROD profile media API route
- `d0d93ebb` — Repair PROD profile media previews and legacy URL fallback
- `15e6463e` — Publish PROD profile media repair

## Verification target

User retest remains:

1. Hard-refresh `https://stashbox.com/radio/profile/` while logged in.
2. Open Edit Profile / Account Information.
3. Confirm the saved profile photo preview appears when a saved avatar exists.
4. Confirm the saved horizontal banner preview appears.
5. Confirm the saved vertical banner preview appears on the media editor when present.
6. Upload or replace one image and confirm the flow progresses beyond `Uploading image to Stashbox storage…` and ends with `uploaded, saved, and verified`.
7. Repeat on mobile.
