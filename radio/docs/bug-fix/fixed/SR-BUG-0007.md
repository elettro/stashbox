# SR-BUG-0007 - Ad video uploads are rejected by presign purpose validation

Status: Fixed
Severity: High
Area: Ads
Environment: DEV
Date reported: 2026-07 (historical)
Date fixed: 2026-08-18
Date verified:
Reported by: User

## Symptom

The Ads CMS could not complete ad video uploads because `/admin/uploads/presign` rejected `purpose=ad_video` as unsupported.

## Root cause

The upload-purpose allowlist did not include the Ads CMS `ad_video` purpose.

## Fix

User confirmed on 2026-08-18 that this issue should be considered fixed. No additional technical implementation details are being inferred beyond that confirmation.

## Verification

Pending.

## Regression risk

Upload-purpose changes must preserve MIME, extension, bucket path, authorization, and size validation for all existing upload types.

## Future repair procedure

If this returns, test MP4 presign, upload, persisted URL, and playback from the Ads CMS before changing unrelated upload paths.
