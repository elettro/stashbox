# VEC Repair Playbook

## Video flashes or exposes artwork during playback

Related bugs: `SR-BUG-0001`

Symptom pattern:

- A desktop VEC clip briefly reveals song artwork while video should remain continuous.
- Some clips may fail while immediately following clips play smoothly.

Fast checks:

1. Compare one failing clip with one working clip in the same song.
2. Inspect `window.StashboxMainVecVideoWatchdog.state()`.
3. Inspect the active stage for `data-desktop-video-artwork-lock`.
4. Confirm the stage `background-image` remains suppressed while video owns the stage.
5. Check for scripts that mutate stage background, media opacity, or visibility during handoff.

Known root cause:

- Video ownership temporarily becomes ambiguous during startup, stall recovery, or clip handoff, allowing the artwork layer underneath to become visible.

Successful repair:

- Keep artwork locked behind video for the full period of video ownership, including recovery and handoff.
- Use a release grace period rather than restoring artwork on the first pause/transition event.
- Observe stage style mutations and reassert the lock if another routine tries to restore artwork prematurely.

Primary files:

- `radio/dev/v2/v2-media-transition-guard.js`
- `radio/dev/v2/v2-main-vec-video-watchdog.js`
- `radio/dev/v2/v2-desktop-official-artwork-16x9.js`

Regression checks:

- Artwork-only recipes still show artwork.
- Artwork returns after video playback truly ends.
- Switching songs refreshes the correct artwork.
- Native VEC playback and watchdog fallback do not fight for the same stage.

## Repeats or duplicate clips

Fast checks:

1. Inspect the recipe pool and folder sources for duplicate URLs/IDs.
2. Check canonical URL normalization.
3. Check shuffle-memory state and pool exhaustion logic.
4. Confirm failed assets are excluded without collapsing the pool into repeats.

Common files:

- `radio/dev/v2/v2-vec-shuffle-memory.js`
- `radio/dev/v2/v2-desktop-vec-repeat-guard.js`
- VEC recipe and asset API handlers.

## Wrong artwork or media ratio

Fast checks:

1. Confirm the media asset has the expected ratio metadata or dimensions.
2. Confirm desktop chooses 16x9 or 21x9 artwork rather than square artwork.
3. Check `object-fit`, stage dimensions, and ratio-specific selectors.
4. Compare mobile and desktop paths before changing shared code.

Common files:

- `radio/dev/v2/v2-desktop-official-artwork-16x9.js`
- `radio/dev/v2/v2-responsive-song-artwork.css`
- `radio/dev/v2/v2-media-transition-guard.js`