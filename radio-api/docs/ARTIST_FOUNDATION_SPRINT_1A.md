# Artist Foundation + Follow System — Sprint 1A

Status: In progress
Scope: DEV only
Production changes: None

## Goals

- Canonical artist records and stable artist keys/slugs.
- Song-to-artist relationships without breaking existing song `artist` text.
- Public artist listing/profile APIs with follower counts.
- Authenticated Follow/Following APIs using Cognito-backed accounts.
- Backend-enforced artist, manager, label, and administrator permissions.
- DEV Artist CMS for profile editing, song assignment, access grants, and follower analytics.
- Native DEV player Follow/Following control and follower count.
- Notification targeting compatibility with `audience_type = artist_followers`.

## Security rules

- Browser-supplied roles and user IDs are never trusted.
- Artist-scoped writes require an approved administrator role or approved `user_artist_access` assignment.
- Label access applies only to artists explicitly linked to that label.
- Follower counts are calculated server-side.
- Duplicate follows are blocked by a database uniqueness constraint.
- All artist/profile/access changes are written to the account audit log.

## Deployment gates

- Migration must be applied only to `radio_dev`.
- Lambda syntax and tests must pass before DEV deployment.
- Browser end-to-end validation remains required before any production promotion.
