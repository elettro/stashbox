# SR-BUG-0027 - Newly saved canonical VEC content does not reliably appear in active player sessions

Status: Open
Severity: High
Area: VEC / Player / Canonical Content
Environment: Both
Date reported: 2026-09-12
Date fixed:
Date verified:
Reported by: Dean Palermo

## Symptom

A newly created song and newly uploaded Video Library clips are saved through the singular backend CMS. The VEC Lab is then used to assign those canonical videos to the song. The song is available at the public deep link, but the assigned VEC clips do not begin playing as expected.

Affected example: `solarmeister-stashbox` at `/radio/?song=solarmeister-stashbox`.

## Reproduction

1. Add a song through the singular Songs CMS.
2. Add video clips through the singular Video Library.
3. Open the singular VEC Lab and save the song-level recipe/clip assignments.
4. Open or keep open `/radio/?song=<song_key>` and `/radio/dev/v2/?song=<song_key>`.
5. Expected: both builds resolve the same canonical song, video library, and VEC recipe immediately. Structural code remains environment-specific.
6. Actual: the song can play while the VEC layer remains on artwork/no selected clips.

## Affected examples

- Song key: `solarmeister-stashbox`
- PROD player: `/radio/?song=solarmeister-stashbox`
- DEV V2 player: `/radio/dev/v2/?song=solarmeister-stashbox`
- Canonical VEC authoring: `/radio-admin/dev/vec/`

## Working comparison

Existing songs whose VEC state was present before the current player session continue to resolve through the canonical visual endpoints.

## Root cause

Investigation confirms the August canonical-content sprint correctly moved Songs, Video Library, and VEC authoring to the canonical PROD content source. The remaining failure is in player-side refresh/state handling, not in the CMS environment target.

Both player builds contain long-lived VEC/catalog state. The mobile/all-sizes VEC path caches the song catalog for the life of the page and returns early whenever the resolved song key matches `state.currentKey`. This prevents the player from re-resolving a newly saved VEC recipe for the same song during an existing session. The desktop VEC path also maintains long-lived catalog/runtime state and is being checked for the same canonical-content freshness contract.

## Fix

In progress. Repair the player content-refresh contract so canonical content changes are re-resolved without conflating them with structural build promotion. The fix must preserve one canonical content source while keeping DEV and PROD code promotion separate.

## Files changed

- `radio/docs/bug-fix/fixed/SR-BUG-0027.md`

## Commits

- Pending

## Verification

Pending. Required checks:

- Confirm canonical PROD recipe for `solarmeister-stashbox` is present.
- Confirm every active clip ID resolves to a canonical Video Library asset.
- Confirm a newly saved/re-saved recipe is picked up in DEV V2 without a structural PROD promotion.
- After explicit PROD promotion, confirm the same canonical recipe resolves in `/radio/`.
- Confirm existing VEC songs still play and shuffle normally.

## Regression risk

VEC state refresh touches playback lifecycle. The repair must not create duplicate VEC owners, restart clips unnecessarily, interrupt audio, or reset shuffle state on every poll.

## Related bugs

- SR-BUG-0001
- SR-BUG-0008
- SR-BUG-0011

## Future repair procedure

1. Verify the VEC admin targets `StashboxCanonicalContent` and the PROD canonical API.
2. Query the canonical recipe and song-assets endpoints for the exact song key.
3. Resolve all selected clip IDs against the canonical Video Library.
4. Inspect player-side catalog/recipe caching before modifying backend data.
5. Keep content-source repairs separate from DEV-to-PROD structural promotion.

## Notes

The singular CMS contract is explicit: Songs, Video Library assets, and VEC recipes are canonical content consumed by both player builds. Structural player code remains DEV-first and requires explicit promotion to PROD.