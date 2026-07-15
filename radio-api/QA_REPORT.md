# Stashbox Radio Lambda QA Report — Task 2

Canonical file reviewed: `radio-api/index.mjs`

Date: 2026-07-15

## Overall status

**FAIL / DO NOT DEPLOY YET**

`radio-api/index.mjs` passes Node syntax validation, but QA must stop because rejected DEV patterns were found and one upload environment variable required by the checklist is not honored by the presign code.

## Checks run

- `node --check radio-api/index.mjs` — **PASS**
- Rejected-pattern search with `rg` — **FAIL**
- Route-handler inspection — **PASS with caveats**
- Base-route comparison against `radio-admin/ads/admin-ads-lambda.js` — **PASS for dispatch routes; changed upload behavior noted**
- `trackSongEvent` inspection — **PASS with response caveat**
- Upload presign inspection — **FAIL for required env alias; otherwise mostly PASS**

## Stop-condition findings

### 1. Rejected DEV patterns found

The file contains the fixed string `/dev/` inside `isDevRequest`:

- `path.includes('/dev/')`

The file also contains several hardcoded `dev` identifiers:

- default ad settings id: `id: 'dev'`
- ad settings DDL/default/upsert/select rows using `'dev'`
- default Lambda function name: `'stashbox-radio-api-dev'`

These may be intentional compatibility behavior, but they match the QA stop criteria and must be reviewed before deployment.

### 2. Required `UPLOAD_REGION` env var is not used

The checklist requires upload config to remain environment-driven through:

- `UPLOAD_BUCKET`
- `S3_BUCKET`
- `RADIO_UPLOAD_BUCKET`
- `UPLOAD_REGION`
- `UPLOAD_PUBLIC_BASE_URL`

The canonical presign code reads bucket aliases and `UPLOAD_PUBLIC_BASE_URL`, but it does **not** read `UPLOAD_REGION`. It reads:

- `UPLOAD_BUCKET_REGION`
- `S3_BUCKET_REGION`
- `RADIO_UPLOAD_BUCKET_REGION`
- `AWS_REGION`
- `AWS_DEFAULT_REGION`

This is a deployment-risk mismatch if DEV configuration provides `UPLOAD_REGION` rather than the longer `*_BUCKET_REGION` names.

## Rejected-pattern results

| Pattern | Result | Notes |
| --- | --- | --- |
| hardcoded `/dev/` | **FOUND** | `path.includes('/dev/')` |
| hardcoded S3 bucket | Not found in canonical file | Old base had hardcoded media bucket; canonical removed it. |
| hardcoded S3 region | Not found in canonical file | Canonical uses env-derived region aliases, but omits `UPLOAD_REGION`. |
| `radio-assets/visual-experience/dev` | Not found | No exact match. |
| `source_page` hardcoded to `/stashbox/radio/dev/` | Not found | Canonical defaults to `/stashbox/radio/`. |
| `page` hardcoded to dev | Not found for tracking payload | Canonical defaults `page` to `production`. |
| Admin Dev log labels | Not found | Log labels use Stashbox Radio API/Admin. |
| `ad_video` forced into branding | Not found | `ad_video` routes to `radio-assets/ads/video/<adSlug>`. |
| `song_key` written into `song_id` | No DB-write occurrence found | `song_id` payload uses a UUID-only safe value. Response echoes `song_id: songId || songIdentity`, which can return a song key as `song_id` in JSON but is not a DB write. |

## Route-handler confirmation

The following route families are still present in `dispatch` or matching helper functions:

- `GET /radio/songs` — present.
- `POST /radio/track` — present.
- `GET /radio/ads` — present through public ads route.
- `GET /radio/ad-settings` — present.
- Admin songs — present for `GET`, `POST`, and `PUT` under `/admin/songs`.
- Admin ads — present under `/admin/ads`.
- Admin ad settings — present under `/admin/ad-settings`.
- Admin uploads presign — present for `POST /admin/uploads/presign`.
- Admin stats — present for summary, songs, devices, referrers, products, and events.
- Admin visuals folders — present under `/admin/visuals/folders` and compatibility `/radio/admin/visuals/folders`.
- Admin vec recipe — present under `/admin/vec/recipe`.
- Public vec recipe — present under `/radio/vec/recipe`.
- Song visual assets — present under public/admin vec song-assets handlers.
- Visual folder assets — present through public radio visuals folder assets and admin visuals folder nested assets.

## Route comparison against old base

Compared with `radio-admin/ads/admin-ads-lambda.js`:

- No dispatch route was removed or renamed unexpectedly.
- The canonical dispatch block matches the old base for public songs, track, ads, ad settings, admin ad settings, admin ads, vec recipe, song-assets, public visual folder assets, admin visual folders, admin stats, admin events, admin songs, and uploads presign.
- Behavior changed in upload presign configuration:
  - Old base had hardcoded fallback bucket/region constants.
  - Canonical removed hardcoded S3 fallback values, which is positive for environment-driven deployment.
  - Canonical does not include the required `UPLOAD_REGION` alias, which is a QA failure.
- Behavior changed in upload purpose validation:
  - Canonical adds `visual_folder_image` and `visual_folder_clip` aliases to existing visual image/clip purpose sets.
  - This appears isolated to upload validation and uses the same visual image/clip MIME and extension checks.

## `trackSongEvent` inspection

Status: **PASS with caveat**

- `song_key` remains text and is inserted through the `song_key` payload field.
- `song_id` DB payload is only populated when `body.song_id`, `body.songId`, or `body.id` is a valid UUID.
- `play_start` inserts the event before attempting the denormalized play counter update.
- The play counter update runs after insert and uses `safeSongId` or `songKey` in the `WHERE` clause.
- `like` still calls `ensureSongsLikesColumn` and increments `songs.likes`.
- `share` still calls `ensureSongsSharesColumn` and increments `songs.shares`.
- Caveat: the generic success response returns `song_id: songId || songIdentity`; if no UUID `song_id` was supplied, the API response can echo the song key in the `song_id` JSON field. This is not a DB-write bug, but it may confuse clients or tests that expect `song_id` to be UUID-only everywhere.

## Upload presign inspection

Status: **FAIL because `UPLOAD_REGION` is not read**

Purpose validation:

- `audio` — accepted for known audio MIME types or octet-stream with audio extensions.
- `artwork` — accepted for jpg/jpeg/png/webp image MIME types or octet-stream with matching extension.
- `visual_image` — accepted for image MIME types and jpg/jpeg/png/webp.
- `visual_clip` — accepted for video MIME types and mp4/webm/mov.
- `ad_video` — accepted for mp4/webm/quicktime or octet-stream with visual clip extension.
- `visual_folder_image` — accepted through the visual image purpose set; this is a safe-looking merge because it uses the same image validation path.
- `visual_folder_clip` — accepted through the visual clip purpose set; this is a safe-looking merge because it uses the same clip validation path.

Object names:

- Object keys are timestamped with `Date.now()` and sanitized original filename.
- Object keys are not collision-proof under same-millisecond duplicate filename uploads. Consider adding `crypto.randomUUID()` or a short random suffix for stronger uniqueness.

Environment config:

- Bucket comes from `UPLOAD_BUCKET || S3_BUCKET || RADIO_UPLOAD_BUCKET`.
- Public base URL comes from `UPLOAD_PUBLIC_BASE_URL` or S3 host fallback.
- Region does not honor checklist-required `UPLOAD_REGION`.

## Risky code paths

1. DEV detection / compatibility paths still include hardcoded `dev` strings.
2. Upload presign can fail in environments that provide only `UPLOAD_REGION`.
3. Upload keys use millisecond timestamp plus filename, which is usually unique but not guaranteed under concurrent duplicate uploads.
4. The `play_start` denormalized counter update occurs after the event insert. This preserves event insert, but a DB error during the counter update would still make the Lambda return an error after inserting the event.
5. Generic track success response can echo non-UUID `song_key` as `song_id` in the response body.

## Bugs found

1. **Rejected hardcoded `/dev/` pattern exists** in `isDevRequest`.
2. **Rejected hardcoded `dev` identifiers exist** in ad settings defaults and fallback Lambda name.
3. **`UPLOAD_REGION` is not supported**, despite being listed as required upload config.
4. **Upload key uniqueness is timestamp-only plus filename**, not fully collision-safe.

## Manual browser tests needed before any DEV deployment

After the rejected patterns and `UPLOAD_REGION` issue are fixed, manually verify in DEV:

1. Public radio loads songs from `/radio/songs`.
2. Starting playback posts `/radio/track` and increments play counters without breaking playback.
3. Like and share buttons update UI and persist counts.
4. Public ad list and ad settings load correctly.
5. Admin songs list, detail lookup, create, and update work.
6. Admin ad list/create/update/delete and ad event tracking work.
7. Admin upload presign works for audio, artwork, visual image, visual clip, and ad video.
8. Visual Experience Controller recipe load/save works for public/admin routes.
9. Song visual asset upload/list/delete works.
10. Visual folder list/create/update/delete and folder asset upload/list/update/delete work.
11. Admin stats pages load summary, songs, devices, referrers, products, and events.

## Safe to deploy to DEV later?

**No, not yet.**

Do not deploy until the rejected DEV patterns are intentionally removed or explicitly waived, and until `UPLOAD_REGION` is either supported or the deployment checklist is corrected to the actual region env var names.
