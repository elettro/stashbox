# SR-BUG-0027 - VEC CMS reports saved but canonical recipe is not updated

Status: Repair deployed to DEV CMS, user verification pending
Severity: High
Area: Radio Admin / VEC / Canonical Content
Environment: Singular backend CMS feeding PROD + DEV V2
Date reported: 2026-09-12

## Expected contract

The singular CMS is the canonical content authoring layer for songs, Video Library assets, and VEC recipes. Content authored there must be immediately available to both:

- `/radio/`
- `/radio/dev/v2/`

Structural player changes remain DEV-first and require explicit promotion to PROD.

## Reproduction

1. Add video clips to the shared Video Library.
2. Select `solarmeister-stashbox` in VEC.
3. Select clips/folders and save the recipe.
4. Refresh the live PROD player.
5. PROD continues displaying prepared artwork and does not play the selected clips.

## Confirmed backend state

After the reported save, canonical PROD returned the SolarMeister recipe with only `prepared_artwork_images` and `prepared_artwork_updated_at`. It contained no VEC `folders`, no `active_clip_ids`, and no song assets. The DEV VEC API also had no SolarMeister recipe. A known-good recipe such as `riding-waves-014b-jv1-stashbox` contains populated VEC folders and active clip IDs.

## Root delivery gap

The current `/radio-admin/dev/vec/vec-controller.js` is already wired to the canonical PROD content API via `window.StashboxCanonicalContent`, but `/radio-admin/dev/vec/index.html` loaded `vec-controller.js` without a versioned URL. Browsers could therefore continue executing an older cached controller after the singular-CMS migration.

That creates exactly the observed split: the page UI can appear normal while a stale controller does not perform the current canonical save behavior.

## Repair

DEV CMS now cache-busts both the canonical content configuration and VEC controller:

- `/radio-admin/canonical-content-config.js?v=20260912-vecfix1`
- `./vec-controller.js?v=20260912-vecfix1`

This forces the VEC CMS to execute the current controller whose API root is canonical PROD.

## Verification requirement

Re-open the VEC CMS after deployment, rebuild/save SolarMeister once, then query canonical PROD `/radio/vec/recipe?song_key=solarmeister-stashbox`.

Pass criteria:

- recipe contains VEC `folders`
- selected `active_clip_ids` are present
- recipe `updated_at` changes at the save time
- `/radio/` plays selected clips
- `/radio/dev/v2/` reads the same canonical recipe

Do not mark Fixed until those checks pass.