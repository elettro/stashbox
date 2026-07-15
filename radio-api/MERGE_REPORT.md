# Stashbox Radio Lambda Merge Report

## Files compared

- Current working base: `radio-admin/ads/admin-ads-lambda.js`
- Abandoned merge candidate: `radio-admin/dev/ads/admin-ads-lambda.js`
- New canonical source: `radio-api/index.mjs`

## Functions only in base

- `isDevRequest`
- `safeDatabaseError`
- `normalizeDbValue`
- `valuePlaceholder`
- `getTableColumnMeta`
- `getVisualsFolderAssetsRouteMatch`
- `matchesPublicVisualsFolderAssetsRoute`

## Functions only in abandoned file

- `ensureSongExperienceColumns`
- `trimToRouteRoot`
- `normalizeBoolean`
- `getTableColumnMetadata`
- `isBooleanColumn`
- `isNumericColumn`
- `isUuidColumn`
- `isTimestampColumn`
- `normalizeSongInsertValue`
- `getSongInsertPlaceholder`
- `isDevRuntime`
- `safeDbError`
- `encodeRfc3986QueryComponent`
- `ensureVisualsFolderAssetsTable`
- `normalizeFolderAssetPayload`
- `createVisualsFolderAsset`
- `updateVisualsFolderAsset`
- `hideVisualsFolderAsset`

## Functions changed

- `normalizeDbValue` now includes safe boolean, numeric, UUID, timestamp, and array-to-string handling inspired by the abandoned file while keeping the base function name and call sites.
- `isTextColumn`, `isJsonColumn`, and `isArrayColumn` now compare normalized type names more defensively.
- `buildSongPayload` keeps the base output behavior and continues existing alias handling for `still_image_duration_seconds`.
- `trackSongEvent` keeps the base safe `song_id` UUID handling and adds a safe denormalized play-counter update for `play_start`.
- `validateUploadRequest` now accepts `visual_folder_image` and `visual_folder_clip` upload purposes.
- `handleAdminVisualsFoldersRoute` now supports folder asset CRUD routes using the existing `radio.visuals_folder_assets` table shape.

## Items merged

- Numeric, boolean, UUID, and timestamp column handling for song payload normalization.
- More defensive information-schema type comparisons for text, JSON, and array columns.
- Improved array handling for scalar song fields.
- `still_image_duration_seconds` alias support was retained in the canonical source.
- `visual_folder_image` upload purpose support.
- `visual_folder_clip` upload purpose support.
- Visual folder asset CRUD was added only for an existing compatible `radio.visuals_folder_assets` schema; the canonical source does not create or alter the table for this feature.
- `play_start` denormalized play counter update logic, preserving the base safe UUID handling and `song_key` fallback.

## Items rejected

- Hardcoded `/dev/` route values.
- Hardcoded abandoned-file S3 bucket values.
- Hardcoded abandoned-file S3 region values.
- Hardcoded `radio-assets/visual-experience/dev` paths.
- Abandoned `ad_video` upload naming behavior that risked overwriting files or forced ad videos into branding.
- Logic that writes a song key into `song_id`.
- DEV-labeled log messages.
- Upload naming that omits timestamped object names.
- Any broad wholesale merge of the abandoned Lambda.
- `ensureSongExperienceColumns` runtime DDL, because this task must not change RDS.

## Risk areas

- `play_start` now attempts to increment a denormalized counter if `play_count`, `total_plays`, or `plays` exists on `radio.songs`; manual QA should confirm the expected column in the deployed schema.
- Visual folder asset CRUD depends on the existing `radio.visuals_folder_assets` schema. It intentionally fails as not implemented if required columns are missing.
- Upload presign behavior remains environment-variable driven from the working base; deployments should verify bucket and region environment variables before using the canonical file.
- Public player output should be manually compared against current production responses before deployment.
