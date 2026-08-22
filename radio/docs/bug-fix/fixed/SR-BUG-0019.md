# SR-BUG-0019 - Ads CMS break cadence is ignored and ads play every other song

Status: Fixed
Severity: High
Area: Ads / Player
Environment: DEV V2 Desktop, shared V2 Ads runtime
Date reported: 2026-08-21
Date fixed: 2026-08-22
Date verified: 2026-08-22
Reported by: User

## Symptom

The player appeared to ignore the Ads CMS and play commercials every other song when the expected test cadence was an ad after every song.

## Root cause

The final live check showed the Ads CMS controller itself was still set to every other song. The player behavior matched the saved controller value. Earlier runtime work also strengthened the cadence handoff so CMS break settings are read and claimed at song boundaries.

## Fix

No further cadence override is required. The Ads runtime remains driven by the CMS `break_interval` value. When the controller is set to every song, the expected sequence is Song -> Ad -> Song -> Ad. When it is set to every other song, the player follows that instruction.

## Verification

Verified by the user on 2026-08-22 after discovering the controller had been set to every other song during the prior test. The user confirmed this bug should be marked fixed and verified.

## Files involved

- `radio/dev/v2/v2-ads-cms-runtime.js`
- `radio/dev/v2/v2-ads-cms-live-refresh.js`
- `radio/dev/v2/v2-ads-cms-cadence-guard.js`
- `radio-admin/dev/ads/index.html`

## Related bugs

- SR-BUG-0018

## Future repair

Before treating a cadence mismatch as a player defect, compare the live public `break_interval` with the saved Ads CMS selection. The CMS remains the source of truth.