# Stashbox Radio Bug Index

Last updated: 2026-08-19

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
| SR-BUG-0011 | Desktop VEC media flickers, video fails to trigger, and player can freeze | VEC Player | Critical | DEV V2 Desktop | Fixed, verified | 2026-08-11 | `7319b397`, `806b5818` |
| SR-BUG-0012 | Desktop clean runtime removes login and account interface | Auth | High | DEV V2 Desktop | Fixed, verified | 2026-08-18 | `8f46d70a` |
| SR-BUG-0013 | Desktop login disappears after boot and notifications do not work | Desktop Shell / Auth / Notifications | High | DEV V2 Desktop | Fixed, verified | 2026-08-18 | `38affbd8`, `ce4e0e2c` |
| SR-BUG-0014 | Profile listening stats do not advance with desktop listening | Profile / Analytics | High | DEV V2 Desktop + Profile | Fixed, monitoring | 2026-08-19 | `9a4250fe` |
| SR-BUG-0015 | Profile song clicks return home instead of opening the selected song | Profile / Player | High | DEV V2 Mobile + Desktop | Fixed, verified | 2026-08-19 | `545071ea` |
| SR-BUG-0016 | Fast login fails with missing USERNAME on mobile and desktop | Auth / Login | High | DEV V2 Mobile + Desktop | Fixed, verified | 2026-08-19 | `2510866f`, `586ccd90` |

## Open / investigating

- `SR-BUG-0005` - Historical retained-share-count issue. User marked it verified and closed it on 2026-08-19. Reopen and trace one share end to end if it returns.
- `SR-BUG-0011` - Continuity5 removes the old layer before every start and rejects an unsettled play() promise after 1.6 seconds. Multiple complete desktop songs passed, including Do You Love Me? through the prior 2:00 to 2:45 failure zone. User marked the repair verified and closed it on 2026-08-19. Mobile remains unchanged.
- `SR-BUG-0012` - Desktop login/account and notifications were restored in the clean runtime. User marked the repair verified and closed it on 2026-08-19.
- `SR-BUG-0013` - The persistent desktop shell repair restored login/account and notifications after recovery rendering. User marked this duplicate symptom record verified and closed it on 2026-08-19.

## Fixed, awaiting verification

- `SR-BUG-0001` - Desktop VEC video flickers to song artwork during unstable clips.
- `SR-BUG-0014` - Profile Songs Played now advances after desktop listening; user observed 191 → 195. Hours Listened remains under observation, so the repair is resolved/fixed for now rather than fully verified.

## Closed

- `SR-BUG-0008` - Closed and explicitly verified by the user on 2026-08-18; no technical fix details were invented.
- `SR-BUG-0009` - Closed and explicitly verified by the user on 2026-08-18.

## Verified

- `SR-BUG-0002` - Full song titles truncate with ellipses in media players.
- `SR-BUG-0003` - VEC badge duplicates and pushes controls down.
- `SR-BUG-0004` - Notification feed remains stale for more than a day.
- `SR-BUG-0006` - 10-second qualified play tracking. Live mobile and desktop gates each persisted exactly one `play_start`, each changed `total_plays` by exactly +1, and the stronger pause/resume plus forward-seek protection gate passed on workflow run `32187950914` from source commit `049c75aa`.
- `SR-BUG-0007` - Ad video uploads are rejected by presign purpose validation.
- `SR-BUG-0008` - VEC reuses a subset and repeats assets before the pool is exhausted.
- `SR-BUG-0009` - Wide desktop player selects square artwork instead of wide assets.
- `SR-BUG-0010` - Mobile admin navigation remains visible before hamburger activation.
- `SR-BUG-0015` - Profile song clicks open the selected song in the main player, and playlist playback follows the playlist queue. User verified the behavior on 2026-08-19.
- `SR-BUG-0016` - Fast login no longer fails with `Missing required parameter USERNAME`; user verified successful login on both desktop and mobile on 2026-08-19.

## Usage

Search this index first, then open the matching bug record and the related repair playbook before changing code. Every material Stashbox Radio repair should receive an SR-BUG ID and be added to the registry as part of the same repair workflow.
