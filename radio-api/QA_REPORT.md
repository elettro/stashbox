# Stashbox Radio API QA Report

Date: 2026-07-15
Canonical file: `radio-api/index.mjs`

## QA blockers fixed

1. Runtime identity is environment-variable driven via `getRuntimeEnv()` and no longer uses path `/dev/` checks for runtime behavior.
2. Ad settings now use `getAdSettingsId()`, which prefers `AD_SETTINGS_ID` and falls back to the runtime environment.
3. Route parsing no longer assumes `stashbox-radio-api-dev` and supports default-stage Lambda URLs with dev/prod function-name segments plus direct `/radio/*` and `/admin/*` routes.
4. Upload region resolution honors `UPLOAD_REGION`, `UPLOAD_BUCKET_REGION`, `S3_BUCKET_REGION`, `RADIO_UPLOAD_BUCKET_REGION`, `AWS_REGION`, and `AWS_DEFAULT_REGION`, with `us-east-1` only as the explicit fallback.
5. Upload object keys now include an ISO-like timestamp plus `crypto.randomUUID()` before the readable filename.
6. Track event `page` and `source_page` defaults are runtime/env driven while preserving posted body values.
7. `song_id` writes are restricted to valid UUIDs; non-UUID track identifiers remain in `song_key` and response `song_id` is `null` when invalid.
8. `play_start` events still return success after a successful event insert when the denormalized counter column is missing or counter update is skipped, with a warning field.

## Rejected pattern scan

Command run:

```sh
rg -n "(/dev/|stashbox-radio-api-dev|radio-assets/visual-experience/dev|/stashbox/radio/dev/|page:\\s*.*'dev'|Admin Dev|ad_video.*branding|song_id:\\s*songKey|song_id.*songIdentity|\\['dev'\\]|VALUES \\('dev'|id:\\s*'dev')" radio-api/index.mjs
```

Result: no matches.

Additional upload config scan found no hardcoded bucket names. The only literal `us-east-1` in `radio-api/index.mjs` is the required final fallback for upload region resolution.

## Syntax check

Command run:

```sh
node --check radio-api/index.mjs
```

Result: passed.

## Deployment status

No deployment was performed. No AWS, API Gateway, RDS, S3, or production front-end changes were made.

This is safe for later DEV deployment, subject to normal manual QA below.

## Manual QA checklist

- Confirm DEV Lambda environment variables set `APP_ENV=dev` or `STAGE=dev` and, if needed, `AD_SETTINGS_ID=dev`.
- Confirm upload bucket variables and one supported upload region alias are set in DEV.
- Test route parsing through Lambda URL paths:
  - `/default/stashbox-radio-api-dev/radio/songs`
  - `/default/stashbox-radio-api-prod/radio/songs`
  - `/radio/songs`
  - `/admin/songs`
- Submit uploads for audio, artwork, visual image, visual clip, ad video, visual folder image, and visual folder clip; confirm object keys include a UUID and readable filename.
- Submit track events with a valid UUID `song_id` and with a text-only `song_key`; confirm only UUID values enter `song_id` and `song_key` is preserved.
- Submit `play_start`, `like`, and `share`; confirm play counter warnings do not break successful event inserts and like/share counters still update.
- Confirm ad settings GET/PUT read and write the expected `radio.ad_settings.id` for DEV.
