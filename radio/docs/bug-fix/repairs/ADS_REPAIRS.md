# Ads Repair Playbook

Use for ad upload, storage, targeting, playback, skip rules, mute behavior, scheduling, and CMS state.

## Fast checks

1. Confirm DEV or PROD and ad ID.
2. Check CMS record state, active/hidden flags, dates, and targeting.
3. Check upload purpose and presign response.
4. Confirm asset URL is reachable.
5. Check player selection rules and frequency.
6. Separate ad media playback issues from targeting/configuration issues.

## Common failure patterns

- Upload rejected because `purpose=ad_video` is not accepted.
- Ad record exists but asset is unavailable.
- Targeting excludes the current song/user unexpectedly.
- Skip/mute behavior conflicts with global player state.
- Date or active status prevents delivery.

## Regression checks

- Upload MP4.
- Active/hidden state.
- Genre, mood, artist, and song targeting.
- Skip-after and no-skipping behavior.
- Ad-only mute control.
- Master ads on/off.