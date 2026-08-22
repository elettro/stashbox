# SR-BUG-0018 - Vertical ad creative is cropped instead of displayed with FIT

Status: Open
Severity: High
Area: Ads / Player
Environment: DEV V2 Desktop, shared V2 Ads runtime
Date reported: 2026-08-21
Date fixed:
Date verified:
Reported by: User

## Symptom

Vertical video ads are visibly cropped in the full-screen sponsored viewer. The creative behaves like COVER/fill instead of FIT/contain, cutting off portions of the ad frame.

## Reproduction

1. Open Stashbox Radio DEV V2 on desktop.
2. Allow an active vertical video ad to play from the Ads CMS.
3. Expected: the entire vertical creative remains visible, centered, with black space around it when the viewport is wider than the source aspect ratio.
4. Actual: the video is enlarged/cropped as if a fill/COVER rule still owns the rendered media box.

## Affected examples

- Clementine - Album sponsored video shown in the user report on 2026-08-21.
- DEV V2 desktop sponsored overlay.

## Working comparison

- Expected FIT behavior: complete vertical frame visible without cropping.

## Root cause

Not established yet. Multiple FIT enforcement changes were published earlier on 2026-08-21, but the user reproduced the crop after those changes. Treat the current presentation as unresolved rather than fixed.

## Fix

No verified fix is recorded. Prior FIT guards and cache-bust changes are considered attempted repairs only until the user confirms the live viewer renders the full vertical frame.

## Files changed

- `radio/dev/v2/v2-ads-cms-runtime.css`
- `radio/dev/v2/v2-ads-cms-runtime.js`
- `radio/dev/v2/v2-ads-cms-live-refresh.js`
- `radio/dev/v2/v2-ads-fit-guard.js`
- `radio/dev/v2/desktop/index.html`
- `radio/dev/v2/index.html`

## Commits

- `44c961503d7c6013e68b02f089b94af5598a2a3a`
- `474ffafef9558e8c671fd5f93d88252670b812cb`
- `e48dcf2e320c2c4b0e736d94dd1fa2c8343d796d`
- `8f219096ea0ca9ee42c132763cef2918237cc562`

## Verification

Failed. User reported at approximately 22:55 ET on 2026-08-21 that the vertical ads still were not displaying correctly after the latest repair pass.

## Regression risk

Changes to generic V2 video sizing, full-screen player rules, ad overlay media sizing, and desktop FIT/FULL controls can override each other. Keep ad creative sizing isolated from normal song/VEC video sizing.

## Related bugs

- SR-BUG-0019

## Future repair procedure

Inspect the live computed styles and actual rendered dimensions of `.v2-ad-break-player` while the failing ad is playing. Identify the final rule or script mutation setting the video box to a viewport-filling geometry. Verify source `videoWidth/videoHeight`, rendered `getBoundingClientRect()`, and `object-fit` together. Repair the true owner, then test one 9:16 ad on both desktop and mobile before marking fixed.

## Notes

The screenshot supplied by the user shows the source creative cut within a wide desktop viewer. Do not close this bug based on CSS source inspection alone. Live user verification is required.