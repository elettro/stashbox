# SR-BUG-0007 - Ad video uploads are rejected by presign purpose validation

Status: Open
Severity: High
Area: Ads
Environment: DEV
Date reported: 2026-07 (historical)
Date fixed:
Date verified:
Reported by: User

## Symptom

The Ads CMS cannot complete ad video uploads because `/admin/uploads/presign` rejects `purpose=ad_video` as unsupported.

## Reproduction

1. Open the Ads CMS.
2. Attempt to upload an MP4 ad video.
3. Expected: the presign endpoint accepts `purpose=ad_video` and returns an upload target.
4. Actual: validation accepts only the existing audio/artwork/visual purposes and rejects the ad video purpose.

## Affected examples

Ads CMS Phase III MP4 upload flow.

## Working comparison

Presign purposes such as audio, artwork, visual_image, and visual_clip are accepted.

## Root cause

The upload-purpose allowlist does not include the Ads CMS `ad_video` purpose.

## Fix

No verified fix is recorded yet.

## Files changed

None recorded.

## Commits

None recorded.

## Verification

Pending.

## Regression risk

Upload-purpose changes must preserve MIME, extension, bucket path, authorization, and size validation for all existing upload types.

## Related bugs

None recorded.

## Future repair procedure

Locate presign purpose validation, add the intended ad-video policy deliberately, then test MP4 presign, upload, persisted URL, and playback from the Ads CMS.

## Notes

Backfilled on 2026-08-17 from the Ads CMS Phase III failure record.