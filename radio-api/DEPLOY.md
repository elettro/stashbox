# Stashbox Radio API Lambda Deployment Notes

## Canonical Lambda source path

- `radio-api/index.mjs` is the canonical Lambda source for the consolidated Stashbox Radio API Lambda.

## Old legacy Lambda paths

- `radio-admin/ads/admin-ads-lambda.js` is a legacy source path. Do not edit or deploy it.
- `radio-admin/dev/ads/admin-ads-lambda.js` is an abandoned merge candidate and legacy source path. Do not edit or deploy it.

## Current deploy target

- Current deploy target remains the already-configured live Lambda/API Gateway integration that previously used `radio-admin/ads/admin-ads-lambda.js`.
- This task did not deploy, update AWS, change API Gateway, change RDS, or change S3.

## Future DEV Lambda target

- Future DEV should use `radio-api/index.mjs` as the Lambda source.
- DEV environment variables should provide the intended database and upload configuration; do not hardcode `/dev/` route behavior, bucket names, regions, or S3 prefixes into the source.

## Future PROD Lambda target

- Future PROD should use `radio-api/index.mjs` as the Lambda source.
- PROD environment variables should provide the intended database and upload configuration; do not hardcode production infrastructure into the source.

## Manual test checklist

1. Confirm `OPTIONS /radio/songs` returns the expected CORS response.
2. Confirm `GET /radio/songs` returns the existing public player song payload shape.
3. Confirm public song rows keep safe UUID handling and do not write song keys into `song_id`.
4. Confirm `POST /radio/track` with `event_type=play_start` records the event and increments an existing denormalized play counter when the matching counter column exists.
5. Confirm `POST /radio/track` with `event_type=like` records the event and increments likes for matching songs.
6. Confirm `POST /radio/track` with `event_type=share` records the event and increments shares for matching songs.
7. Confirm public ad settings and public ad list routes match current live behavior.
8. Confirm admin ad create/update/delete behavior matches current live behavior.
9. Confirm admin upload presign for `audio`, `artwork`, `visual_image`, `visual_clip`, and `ad_video` preserves timestamped object naming.
10. Confirm admin upload presign accepts `visual_folder_image` for JPG/JPEG/PNG/WEBP images.
11. Confirm admin upload presign accepts `visual_folder_clip` for supported visual clip uploads.
12. Confirm admin song create/update accepts `still_image_duration_seconds` as an alias for visual still duration.
13. Confirm admin visuals folder asset GET/POST/PUT/DELETE works only against the existing `radio.visuals_folder_assets` schema.
14. Confirm no route output for the live public player changed unexpectedly.
