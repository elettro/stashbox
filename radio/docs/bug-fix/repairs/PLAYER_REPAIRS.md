# Player Repair Playbook

Use for playback, artwork, titles, transport, gestures, media state, and desktop/mobile player behavior.

## Fast diagnostic checklist

1. Confirm DEV or PROD and exact player URL.
2. Record the song key, title, browser, device, and viewport.
3. Compare one failing song with one working song.
4. Inspect active audio/video elements and player data attributes.
5. Check whether multiple scripts are writing the same UI state.
6. Check build/cache query strings before assuming code is not deployed.
7. Search prior bug records for every file you plan to modify.

## Common failure patterns

### Wrong media layer wins

Symptoms include artwork flashing over video, hidden video, duplicated overlays, or conflicting player modes.

Check ownership rules first. One media mode should have explicit priority at a time.

### Song title truncates

Check fixed widths, `text-overflow`, line clamping, and containers inheriting `overflow:hidden`. Preserve the full title as the requirement.

### Desktop receives mobile artwork

Check ratio selection, responsive artwork API fields, and desktop-specific runtime loaders before changing the underlying song artwork.

### Gestures trigger unintended player changes

Check desktop guards, pointer/touch event scope, and duplicate gesture listeners.

## Regression checks

- Play/pause and auto-advance.
- Next/back/shuffle.
- Full title visibility.
- Desktop and mobile artwork ratios.
- Focus/Cinema modes.
- Video-only tracks.
- Guest and logged-in player paths.