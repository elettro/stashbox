# Stashbox Radio Bug Index

Last updated: 2026-08-24

| ID | Title | Area | Severity | Environment | Status | Reported | Fix commit |
|---|---|---|---|---|---|---|---|
| SR-BUG-0001 | Desktop VEC video flickers to song artwork during unstable clips | VEC Player | High | DEV V2 | Fixed, verification pending | 2026-08-09 | `3f7a43f9` |
| SR-BUG-0002 | Full song titles truncate with ellipses in media players | Player | High | Both | Fixed, verified | 2026-07-24 | - |
| SR-BUG-0003 | VEC badge duplicates and pushes controls down | VEC | Medium | DEV | Fixed, verified | 2026-07-25 | - |
| SR-BUG-0004 | Notification feed remains stale for more than a day | Notifications | High | Both | Fixed, verified | 2026-07-25 | - |
| SR-BUG-0005 | Share events do not increment retained share counts | Dashboard | High | Both | Fixed, verified | 2026-06 | - |
| SR-BUG-0006 | Plays do not persist and 10-second play events are not recorded | Dashboard / Analytics | High | DEV V2 Mobile + Desktop | Fixed, verified | 2026-06 | `0c2d7e76` |
| SR-BUG-0007 | Ad video uploads are rejected by presign purpose validation | Ads | High | DEV | Fixed, verified | 2026-07 | - |
| SR-BUG-0008 | VEC reuses a subset and repeats assets before the pool is exhausted | VEC | High | DEV | Closed, verified | 2026-07-18 | - |
| SR-BUG-0009 | Wide desktop player selects square artwork instead of wide assets | Player | High | DEV | Closed, verified | 2026-08-04 | - |
| SR-BUG-0010 | Mobile admin navigation remains visible before hamburger activation | Dashboard | Medium | DEV | Fixed, verified | 2026-07-30 | - |
| SR-BUG-0011 | VEC media flickers, video fails to trigger, and player can freeze | VEC Player | Critical | DEV V2 Mobile + Desktop | Fixed, mobile verification pending | 2026-08-11 | `ac16752d`, `7a2cd9a4`, `6d1cad31` |
| SR-BUG-0012 | Desktop clean runtime removes login and account interface | Auth | High | DEV V2 Desktop | Fixed, verified | 2026-08-18 | `8f46d70a` |
| SR-BUG-0013 | Desktop login disappears after boot and notifications do not work | Desktop Shell / Auth / Notifications | High | DEV V2 Desktop | Fixed, verified | 2026-08-18 | `208b50fa`, `af0ef6e4`, `2d57ce46` |
| SR-BUG-0014 | Profile listening stats do not advance with desktop listening | Profile / Analytics | High | DEV V2 Desktop + Profile | Fixed, monitoring | 2026-08-19 | `9a4250fe` |
| SR-BUG-0015 | Profile song clicks return home instead of opening the selected song | Profile / Player | High | DEV V2 Mobile + Desktop | Fixed, verified | 2026-08-19 | `545071ea` |
| SR-BUG-0016 | Fast login fails with missing USERNAME on mobile and desktop | Auth / Login | High | DEV V2 Mobile + Desktop | Fixed, verified | 2026-08-19 | `2510866f`, `586ccd90` |
| SR-BUG-0017 | First mobile login can stall on “Logging In…” while retry succeeds immediately | Auth / Login | High | DEV V2 Mobile | Fixed, verified | 2026-08-21 | `528fed47` |
| SR-BUG-0018 | Vertical ad creative is cropped instead of displayed with FIT | Ads / Player | High | DEV V2 Desktop | Fixed, verified | 2026-08-21 | `9c0d557d` |
| SR-BUG-0019 | Ads CMS break cadence is ignored and ads play every other song | Ads / Player | High | DEV V2 Desktop | Fixed, verified | 2026-08-21 | - |
| SR-BUG-0020 | Desktop C share hotkey and PROD Share click do not copy or retain share | Player / Share / Hotkeys | High | DEV V2 Desktop + PROD Desktop | Closed, verified | 2026-08-22 | `efe4383a`, `2adb1cd3`, `3d275050` |
| SR-BUG-0021 | Desktop F and L like hotkeys do not trigger Like in PROD | Player / Like / Hotkeys | High | PROD Desktop | Closed, verified | 2026-08-22 | `d6e8b664`, `76355d8a`, `4e245899` |
| SR-BUG-0022 | Logged-in production profile fails to load on desktop and mobile | Profile / Auth | High | PROD Desktop + Mobile | Backend auth repair deployed, verification pending | 2026-08-23 | `157b62f4`, `526271f7`, `208040b0`, `008797e9`, `654f73a1` |
| SR-BUG-0023 | Production artist profiles return not found after DEV to PROD promotion | Artist Profiles / PROD Data | High | PROD Desktop + Mobile | Fixed, user verification pending | 2026-08-23 | `d600cc08`, `c7448b38` |
| SR-BUG-0024 | Listener profile images load in DEV but fail in production | Listener Profile / Profile Media / PROD Data | High | PROD Desktop + Mobile | Closed, verified | 2026-08-23 | `54a39ea0`, `e53dfc33`, `e6fcf8ef`, `d0d93ebb`, `242cc306`, `d02c3a43` |
| SR-BUG-0025 | Mobile Download for Offline does not persist song to device | Mobile Player / Offline Audio | High | PROD Mobile | Fixed, user verification pending | 2026-08-23 | `76d77456`, `eeef0def`, `bad12698` |

## Open / investigating

- `SR-BUG-0005` - Historical retained-share-count issue. User marked it verified and closed it on 2026-08-19. Reopen and trace one share end to end if it returns.
- `SR-BUG-0011` - Mobilecontinuity1 preserves provisional artwork during exact 9:16 lookup, creates a fresh iPhone video element for every clip, and advances within 3.2 seconds when presented frames stop. Published on 2026-08-19. iPhone Safari verification remains pending.
- `SR-BUG-0012` - Desktop login/account and notifications were restored in the clean runtime. User marked the login/account repair verified and closed it on 2026-08-19.

## Fixed, awaiting verification

- `SR-BUG-0001` - Desktop VEC video flickers to song artwork during unstable clips.
- `SR-BUG-0014` - Profile Songs Played now advances after desktop listening; user observed 191 → 195. Hours Listened remains under observation, so the repair is resolved/fixed for now rather than fully verified.
- `SR-BUG-0022` - Production profile frontend session routing and cache defects were repaired first. A later live runtime diagnostic exposed that the VPC-attached PROD Lambda had no local production Cognito JWKS source. The current 2-key production JWKS is now installed in `COGNITO_JWKS_JSON`; Lambda state and update status passed. A listener whose failed profile request cleared local tokens must log in once before the final desktop/mobile PROFILE retest.
- `SR-BUG-0023` - DEV and PROD both have 83 songs, but PROD initially had 0 of the 3 public artist profiles. Stashbox, Tahiti Cora, and The Ras Box were mirrored from DEV with their public media and song associations. Post-repair comparison returns HTTP 200 for all 3 in both DEV and PROD.
- `SR-BUG-0025` - PROD mobile audio-stream preference still targeted the DEV song API, so the offline action could attempt to fetch the large current master asset. PROD now targets `/prod-v2/radio/songs`; the downloader resolves the active song against the PROD catalog, prefers mobile/MP3 stream fields, writes the Blob to IndexedDB, then performs a read-back before reporting success. Physical mobile verification remains pending.

## Closed

- `SR-BUG-0008` - Closed and explicitly verified by the user on 2026-08-18; no technical fix details were invented.
- `SR-BUG-0009` - Closed and explicitly verified by the user on 2026-08-18.
- `SR-BUG-0020` - C share hotkey and the PROD Share click path were repaired and explicitly verified working in PROD by the user on 2026-08-22.
- `SR-BUG-0021` - F and L Like hotkeys were repaired and explicitly verified working in PROD by the user on 2026-08-22.
- `SR-BUG-0024` - Listener profile image upload and profile-media behavior verified working in production on both desktop and mobile on 2026-08-24.

## Verified

- `SR-BUG-0002` - Full song titles truncate with ellipses in media players.
- `SR-BUG-0003` - VEC badge duplicates and pushes controls down.
- `SR-BUG-0004` - Notification feed remains stale for more than a day.
- `SR-BUG-0006` - 10-second qualified play tracking. Live mobile and desktop gates each persisted exactly one `play_start`, each changed `total_plays` by exactly +1, and the stronger pause/resume plus forward-seek protection gate passed on workflow run `32187950914` from source commit `049c75aa`.
- `SR-BUG-0007` - Ad video uploads are rejected by presign purpose validation.
- `SR-BUG-0008` - VEC reuses a subset and repeats assets before the pool is exhausted.
- `SR-BUG-0009` - Wide desktop player selects square artwork instead of wide assets.
- `SR-BUG-0010` - Mobile admin navigation remains visible before hamburger activation.
- `SR-BUG-0013` - User verified on 2026-08-21 that desktop notifications are visible again while logged in. The authenticated feed and desktop bell opening path are restored.
- `SR-BUG-0015` - Profile song clicks open the selected song in the main player, and playlist playback follows the playlist queue. User verified the behavior on 2026-08-19.
- `SR-BUG-0016` - Fast login no longer fails with `Missing required parameter USERNAME`; user verified successful login on both desktop and mobile on 2026-08-19.
- `SR-BUG-0017` - User verified on 2026-08-21 that the repaired first mobile login completes very fast instead of hanging on `Logging In…` while waiting on legacy account hydration.
- `SR-BUG-0018` - User verified on 2026-08-22 that the sponsored ad video now renders in the correct centered viewport position with FIT behavior.
- `SR-BUG-0019` - User verified on 2026-08-22 that the apparent cadence mismatch came from the Ads CMS being set to every other song. The player was following the controller.
- `SR-BUG-0020` - User explicitly verified the repaired `C` hotkey and Share path working in production on 2026-08-22.
- `SR-BUG-0021` - User explicitly verified the repaired `F` and `L` Like hotkeys working in production on 2026-08-22.
- `SR-BUG-0024` - User verified production profile-image uploads and profile media behavior on both desktop and mobile on 2026-08-24.

## Usage

Search this index first, then open the matching bug record and the related repair playbook before changing code. Every material Stashbox Radio repair should receive an SR-BUG ID and be added to the registry as part of the same repair workflow.
