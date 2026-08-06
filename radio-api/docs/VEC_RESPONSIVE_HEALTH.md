# VEC Responsive Health Guard

This health guard tests the live DEV V2 player without adding another playback controller.
It is intentionally separate from the listener experience and never calls `play()`, `pause()`, `load()`, changes a recipe, or modifies a VEC asset.

## Coverage

The browser test runs the same song through three presentation classes:

- Mobile: 390 x 844, touch, 3x device scale
- Tablet: 820 x 1180, touch, 2x device scale
- Desktop: 1440 x 900

For each class it verifies:

- The page and song catalog load
- A song opens in the player
- Audio advances
- The saved artwork intro expires
- A visible video begins advancing
- Exactly one video owns the presentation surface
- Playback continues through a five-second sample
- The video does not remain paused or frozen
- Decoded dimensions are valid
- The VEC stage has visible dimensions
- Dropped-frame ratio stays within the health threshold
- The runtime reports at least one eligible VEC video
- No uncaught page error occurs

## Thresholds

The test fails when:

- No moving video is detected before the timeout
- Startup after the artwork deadline exceeds 10 seconds
- More or fewer than one video is visible
- The video is paused while audio is playing
- Less than 2.5 seconds of motion occurs during the five-second sample
- A frozen interval exceeds 3.5 seconds
- Dropped frames exceed 15 percent of sampled frames
- Video or stage dimensions are invalid
- The runtime reports zero eligible videos for the test song
- An uncaught page error is raised

It reports a warning, without failing, when:

- Startup exceeds 4 seconds
- A frozen interval exceeds 1.8 seconds
- Dropped frames exceed 6 percent
- The source video is enlarged substantially above its decoded dimensions

## Automation

The GitHub Actions workflow runs:

- On every pull request that changes the V2 player or this health guard
- On every push to `main` that changes the V2 player or this health guard
- Once per hour against the live DEV page
- On demand through `workflow_dispatch`

Screenshots and JSON evidence are retained for 14 days.
A single GitHub issue is opened or updated when the live test fails. The issue is automatically closed after a later passing run.

## Configuration

Environment variables:

- `V2_URL`: page under test
- `VEC_HEALTH_SONG_TITLE`: preferred known song with greenlit VEC video
- `VEC_HEALTH_TIMEOUT_MS`: browser timeout, default 45000
- `VEC_HEALTH_OUTPUT_DIR`: evidence directory
- `V2_COGNITO_TOKENS_JSON`: optional repository secret containing a valid DEV token object for authenticated playback

The default health song is `Freedom Street`.

## Principle

Monitoring must remain asynchronous and read-only. Playback recovery belongs inside the single active VEC runtime. The health guard detects regressions and provides evidence but never competes for the video element.
