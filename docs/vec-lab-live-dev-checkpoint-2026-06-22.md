# VEC Lab and Live-Dev Playback Checkpoint — 2026-06-22

## Scope

This checkpoint records the current working VEC Lab and `/radio/dev/` playback milestone. It does not add new VEC features, does not embed VEC into the Songs CMS, and does not change production `/radio/`.

## Reviewed areas

- `/radio-admin/dev/vec/`
- `/radio/dev/`
- `radio-admin/ads/admin-ads-lambda.js`

## Confirmed source behavior

- VEC Lab is mounted at `/radio-admin/dev/vec/` and initializes `window.StashboxVecController` in lab mode.
- The VEC Lab uses protected admin endpoints for editor operations:
  - `/admin/vec/recipe`
  - `/admin/vec/song-assets`
  - `/admin/uploads/presign`
  - `/admin/visuals/folders`
- `/radio/dev/` consumes public read-only VEC endpoints:
  - `/radio/vec/recipe`
  - `/radio/vec/song-assets`
- `/radio/dev/` does not call `/admin/vec/recipe`.
- Lambda source includes both public read-only VEC recipe/song-assets route handlers and protected admin VEC recipe/song-assets route handlers.
- Song-only asset deletion is implemented as a hide/update against `radio.song_visual_assets` only and is documented in source as not touching Visual Library folder assets or borrowed source-song assets.
- S3 upload presign source targets `us-east-2`.

## Confirmed recipe fields supported

- `visual_mode`, including `custom` and `artwork_only`.
- `artwork_rules`.
- `shuffle_rules`.
- `folders` with per-folder enabled state and selected asset IDs.
- `song_assets` with per-song selected asset IDs.
- `borrowed_song_assets` with multiple source songs, per-source enabled state, and selected asset IDs.
- `sequence`.

## Manual QA status

No browser-hosted runtime QA was executed in this non-interactive checkpoint environment. Source review confirms the code paths for the requested milestone behaviors, and syntax/check commands passed.

## Recent VEC-related commits before this checkpoint

- `b13b9b7` Add dev VEC borrowed song group controls
- `ecf7165` Fix dev upload presign S3 region
- `43f6389` Fix public visual folder asset route
- `258ed5d` Fix public VEC song assets route
- `1cecb3f` Fix public VEC recipe Lambda route
- `8672d5e` Add public dev VEC recipe playback routes
- `1473ab1` Connect dev radio player to VEC recipes
- `ca83a73` Add VEC song artwork only mode
- `ae06eec` Support multiple borrowed VEC song sources

## Later TODOs

- Browser QA with real dev credentials and known test songs/assets.
- Playback polish for transitions and timing.
- Randomizer and visualizer work.
- Future Songs CMS bridge, kept separate from this checkpoint.
