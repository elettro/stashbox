# VE-10B Visual Source Controller

## Objective
Add a TRUE DEV-only song-level Visual Source Controller inside the existing DEV Song CMS edit form. The controller saves per-song Direct Only asset, Visuals Folder, asset exclusion, and visual order settings without changing production pages, production Lambda targets, or the `radio` schema.

## Current Architecture Used
- DEV Song CMS: `/radio-admin/dev/`, backed by `radio-admin/dev/app.js` and `radio-admin/dev/styles.css`.
- TRUE DEV Lambda: `radio-api/index.mjs`, using `PGSCHEMA=radio_dev` and `qname()` for schema-qualified SQL.
- Existing Visual Folder API: `GET /admin/visuals/folders` plus `/admin/visuals/folders/{folder_id}/assets`.
- Existing Direct Only song visual assets table/API: `song_visual_assets` and `/admin/vec/song-assets`.
- DEV player: `/radio/dev/`, backed by `radio/dev/app.js`.

## Files Changed
- `radio-api/index.mjs`
- `radio-admin/dev/app.js`
- `radio-admin/dev/styles.css`
- `radio/dev/app.js`
- `radio-api/db/migrations/001_ve10b_song_visual_source_controller.sql`
- `radio-api/docs/VE_10B_VISUAL_SOURCE_CONTROLLER.md`

## Database Tables Used
Existing TRUE DEV tables:
- `radio_dev.songs`
- `radio_dev.song_visual_assets`
- `radio_dev.visuals_folders`
- `radio_dev.visuals_folder_assets`
- `radio_dev.visuals_folder_artist_matches`
- `radio_dev.visuals_folder_genre_matches`
- `radio_dev.visuals_folder_mood_matches`
- `radio_dev.visuals_folder_song_matches`

## New Database Tables
Manual migration creates:
- `radio_dev.song_visual_settings`
- `radio_dev.song_visual_folder_mappings`
- `radio_dev.song_visual_asset_mappings`

## Migration Filename
`radio-api/db/migrations/001_ve10b_song_visual_source_controller.sql`

## Exact DBeaver Migration Instructions
1. Open DBeaver and connect to the RDS database used by TRUE DEV.
2. Confirm the SQL editor is connected to the expected database.
3. Open `radio-api/db/migrations/001_ve10b_song_visual_source_controller.sql`.
4. Confirm every table name is qualified with `radio_dev.`.
5. Execute the full script once.
6. Verify tables exist with:
   ```sql
   SELECT table_schema, table_name
   FROM information_schema.tables
   WHERE table_schema = 'radio_dev'
     AND table_name IN ('song_visual_settings', 'song_visual_folder_mappings', 'song_visual_asset_mappings')
   ORDER BY table_name;
   ```
7. Do not run this script against `radio` and do not run production migrations.

## API Routes
### Admin read
`GET /admin/songs/{song_key}/visual-settings`

Protected by `x-admin-token`.

### Admin save
`PUT /admin/songs/{song_key}/visual-settings`

Protected by `x-admin-token`.

### Player read
`GET /radio/songs/{song_key}/visual-settings`

Public read-only response for eligible player visuals. It omits admin mapping lists.

## Request Example
```json
{
  "order_mode": "random",
  "folder_mappings": [
    { "folder_id": "folder-uuid", "inclusion_state": "included" }
  ],
  "asset_mappings": [
    { "asset_id": "asset-uuid", "asset_scope": "folder", "inclusion_state": "excluded", "manual_order": null }
  ]
}
```

## Response Example
```json
{
  "success": true,
  "song_key": "my-song",
  "order_mode": "random",
  "direct_assets": [],
  "folders": [],
  "folder_mappings": [],
  "asset_mappings": [],
  "eligible_assets": [],
  "fallback": {
    "uses_artwork": true,
    "eligible_visual_count": 0
  }
}
```

## Song CMS Behavior
The existing edit form now includes a Visual Experience section. It loads settings for existing songs, shows Direct Only cards, Visuals Folder cards, folder assets when expanded, include/exclude controls, and a Visual Order selector. New songs show a message telling the admin to save the song first.

## DEV Player Behavior
The DEV player first attempts to load VE-10B public visual settings for the selected song. If eligible assets exist, it uses them. If no VE-10B assets exist or the request fails, it preserves VE-10A recipe and existing artwork fallback behavior.

## Artwork Fallback Logic
If a song has no active Direct Only assets, no included folders, or no eligible included folder assets after exclusions, the API reports `fallback.uses_artwork: true`, and the player keeps the normal artwork fallback path.

## Testing Checklist
- Open `https://stashbox.com/radio-admin/dev/`.
- Open an existing song.
- Confirm Visual Experience loads.
- Confirm Direct Only assets and Visuals Folders load.
- Include one folder and exclude one asset inside it.
- Select Random order and save.
- Reload, reopen the same song, and confirm persistence.
- Open another song and confirm independent settings.
- Open `https://stashbox.com/radio/dev/` and play the configured song.
- Confirm included visuals display, excluded assets do not, visuals rotate, audio continues, song switching works, and unconfigured songs fall back to artwork.
- Confirm writes are only in `radio_dev`.

## Known Limitations
- Manual order is stored as a numeric field and respected by the API/player, but no drag-and-drop UI was added in Phase 1.
- Safe direct-asset deletion was not expanded; this milestone does not add destructive S3 or database deletion.
- Migration is manual-only and must be executed before persistent mapping writes can succeed in deployed TRUE DEV.

## Rollback Approach
- Revert the frontend and Lambda deployment to the previous commit.
- Leave the new `radio_dev` tables in place if harmless, or after explicit approval only, drop the three VE-10B tables from `radio_dev`.
- Do not touch production schema `radio`.

## Deployment Steps
1. Merge the reviewed PR.
2. Run the GitHub Action named **Deploy TRUE DEV Lambda**.
3. Publish the DEV frontend files for `/radio-admin/dev/` and `/radio/dev/` through the repository’s normal static-site publishing path.
4. Confirm the GitHub Action TRUE DEV smoke test passes after deployment.
