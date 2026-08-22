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

The previous repair still depended on `object-fit: contain` while competing runtime code repeatedly rewrote the physical video element dimensions. The rendered box itself therefore remained vulnerable to viewport-fill geometry even when `object-fit` reported contain.

## Fix

Repair candidate published on 2026-08-21. The final Ads FIT guard now reads the real `videoWidth` and `videoHeight`, calculates the largest source-ratio rectangle that fits inside the live ad stage, and writes explicit pixel width and height to the video element. It also removes absolute viewport-fill positioning and transforms. This makes the physical video box match the source aspect ratio instead of relying on `object-fit` to correct a mismatched box.

The desktop runtime now cache-busts this as `fitguard2`. Keep the bug Open until the user verifies the Clementine vertical creative live.

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
- `f53b5962a61cae7bf67968e819404d894c61ef48`
- `fc5c7fb35ebaf38741e2e6d9f952102c7adb8c36`

## Verification

Previous repair failed user verification at approximately 22:55 ET on 2026-08-21. A stronger physical-dimension repair is now deployed to desktop and awaits a new user test.

## Regression risk

Changes to generic V2 video sizing, full-screen player rules, ad overlay media sizing, and desktop FIT/FULL controls can override each other. Keep ad creative sizing isolated from normal song/VEC video sizing.

## Related bugs

- SR-BUG-0019

## Future repair procedure

Inspect the live `videoWidth/videoHeight`, the ad-stage dimensions, and the final explicit rendered width/height on `.v2-ad-break-player`. A correct 9:16 creative on a wide desktop viewport must have a narrow centered physical video rectangle with black space on both sides. Do not close from CSS inspection alone.

## Notes

The screenshot supplied by the user shows the source creative cut within a wide desktop viewer. Live user verification is required before closure.