# Stashbox Radio Notification Foundation

## Goal

Build one notification system that works for public visitors now and expands into account-based artist-follow notifications later without replacing the CMS, API, or notification records.

## Phase 1 included in this branch

- Notification CMS at `/radio-admin/notifications/dev/`
- Public notification drawer on `/radio/dev/`
- Public read and dismissed state stored in the visitor browser
- Anonymous visitor ID for aggregate notification events
- Draft, scheduled, published, and archived notification states
- Categories, priority, pinning, expiration, artwork, CTA labels, and CTA URLs
- Public notification API
- Admin notification API protected by the existing `x-admin-token`
- Views, opens, clicks, and dismissals

## Account-ready fields included now

Every notification record already supports:

- `audience_type`
- `artist_keys`
- `target_user_ids`
- `delivery_channels`

Supported audience values:

- `public`
- `all_registered_users`
- `artist_followers`
- `specific_users`
- `premium_members`

Supported delivery channels:

- `in_app`
- `browser_push`
- `email`

Phase 1 only returns `public` notifications through the public endpoint. The other values are stored for the user-management phase.

## Reserved user tables

The foundation creates these tables before user registration is added:

- `user_notification_state`
  - Cross-device delivered, read, clicked, and dismissed timestamps
- `notification_preferences`
  - In-app, browser push, email, category, and followed-artist preferences

The `user_id` fields intentionally remain text values without a foreign key until the final user identity table and authentication provider are selected. This prevents an early authentication decision from forcing a notification rebuild.

## API routes

Public:

- `GET /radio/notifications`
- `POST /radio/notifications/{notification_id}/events`

Admin:

- `GET /admin/notifications`
- `GET /admin/notifications/{notification_id}`
- `POST /admin/notifications`
- `PUT /admin/notifications/{notification_id}`
- `DELETE /admin/notifications/{notification_id}`

Admin DELETE archives the notification. It does not erase the record or analytics.

## Public read-state behavior

Phase 1 stores read and dismissed notification IDs in browser `localStorage`.

This means:

- No account is required.
- Read state survives repeat visits on the same browser.
- Clearing browser data resets read state.
- Another device starts with a new read state.

When user accounts arrive, logged-in read state will move to `user_notification_state`. Anonymous local state can be merged into the account after registration or login.

## Future user-management connection

The next account phase should add:

1. `users`
2. `artists`
3. `artist_follows`
4. Authentication sessions and password reset
5. Email verification
6. A delivery query that selects notifications by audience and artist follows
7. A login migration that copies browser read IDs into `user_notification_state`

No Phase 1 notification records need to be recreated.

## Database setup

The API creates the notification tables on first use inside the active `PGSCHEMA`.

An explicit migration is also available:

`radio-api/migrations/20260720_notifications_foundation.sql`

Run it with the correct schema search path:

```sql
SET search_path TO radio_dev;
\i radio-api/migrations/20260720_notifications_foundation.sql
```

Production should use `radio` only after DEV approval.
