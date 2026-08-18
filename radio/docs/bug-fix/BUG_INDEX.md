# Stashbox Radio Bug Index

Last updated: 2026-08-17

| ID | Title | Area | Severity | Environment | Status | Reported | Fix commit |
|---|---|---|---|---|---|---|---|
| SR-BUG-0001 | Desktop VEC video flickers to song artwork during unstable clips | VEC Player | High | DEV V2 | Fixed, verification pending | 2026-08-09 | `3f7a43f9` |
| SR-BUG-0002 | Full song titles truncate with ellipses in media players | Player | High | Both | Fixed, verification pending | 2026-07-24 | - |
| SR-BUG-0003 | VEC badge duplicates and pushes controls down | VEC | Medium | DEV | Fixed, verification pending | 2026-07-25 | - |
| SR-BUG-0004 | Notification feed remains stale for more than a day | Notifications | High | Both | Fixed, verification pending | 2026-07-25 | - |
| SR-BUG-0005 | Share events do not increment retained share counts | Dashboard | High | Both | Open | 2026-06 | - |
| SR-BUG-0006 | Plays do not persist and 10-second play events are not recorded | Dashboard | High | Both | Open | 2026-06 | - |
| SR-BUG-0007 | Ad video uploads are rejected by presign purpose validation | Ads | High | DEV | Open | 2026-07 | - |
| SR-BUG-0008 | VEC reuses a subset and repeats assets before the pool is exhausted | VEC | High | DEV | Closed | 2026-07-18 | - |
| SR-BUG-0009 | Wide desktop player selects square artwork instead of wide assets | Player | High | DEV | Closed, fixed 2026-08-17 | 2026-08-04 | - |
| SR-BUG-0010 | Mobile admin navigation remains visible before hamburger activation | Dashboard | Medium | DEV | Open | 2026-07-30 | - |
| SR-BUG-0011 | Desktop VEC media flickers and video does not trigger | VEC Player | High | DEV V2 | Open | 2026-08-11 | - |

## Open / investigating

- `SR-BUG-0005` - Share events do not increment retained share counts.
- `SR-BUG-0006` - Plays do not persist and 10-second play events are not recorded.
- `SR-BUG-0007` - Ad video uploads are rejected by presign purpose validation.
- `SR-BUG-0010` - Mobile admin navigation remains visible before hamburger activation.
- `SR-BUG-0011` - Desktop VEC media flickers and video does not trigger.

## Fixed, awaiting verification

- `SR-BUG-0001` - Desktop VEC video flickers to song artwork during unstable clips.
- `SR-BUG-0002` - Full song titles truncate with ellipses in media players.
- `SR-BUG-0003` - VEC badge duplicates and pushes controls down.
- `SR-BUG-0004` - Notification feed remains stale for more than a day.

## Closed

- `SR-BUG-0008` - Closed for now without a verified technical fix.
- `SR-BUG-0009` - Previously marked fixed, then closed by user.

## Verified

None yet.

## Usage

Search this index first, then open the matching bug record and the related repair playbook before changing code. Every material Stashbox Radio repair should receive an SR-BUG ID and be added to the registry as part of the same repair workflow.