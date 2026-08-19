# Profile / Analytics Repairs

Use this playbook for listener Profile totals, authenticated listening history, Favorites, Songs Played, Hours Listened, streaks, and related account analytics.

## Source-of-truth checks

- Favorites should come from `user_favorites`, not a local UI count.
- Profile Songs Played currently displays `qualified_plays` from `user_listening_history`; this is a count of qualified listening sessions, not unique songs.
- Hours Listened is derived from `SUM(seconds_played)` in `user_listening_history`.
- The backend separately exposes `unique_songs_played`; do not substitute it for Songs Played without an explicit product decision.

## Desktop listening-history rule

The 10-second qualification decision must have one canonical owner: `v2-play-tracker.js`. Do not add a second desktop threshold tracker or a second independent song-resolution system for Profile history.

For clean desktop, authenticated Profile history should bridge from the canonical `stashbox:qualified-play` event. Trace the same `songKey` and `sessionId` into `/radio/me/history`, then verify `/radio/me/profile-stats` reflects the resulting row.

## Fast diagnosis

1. Confirm the user is logged in and the session manager has a usable access token.
2. Confirm `stashbox:qualified-play` fires after 10 seconds of real listening.
3. Confirm `desktop-profile-history-bridge.js` receives the qualified event.
4. Switch songs or end/close the player so the session finalizes.
5. Confirm authenticated `POST /radio/me/history` succeeds.
6. Confirm `GET /radio/me/profile-stats` returns increased `qualified_plays` and `total_seconds_played`.
7. Confirm Profile refreshes on load/return/focus/visibility and renders the new values.

## Known historical limitation

Listening that was not persisted before the authenticated-history repair cannot be reconstructed automatically. A current counter can be correct going forward while lifetime Hours Listened remains lower than the user's true historical listening.

## Related bugs

- `SR-BUG-0006` — canonical 10-second public play qualification.
- `SR-BUG-0014` — Profile listening stats failed to advance with clean desktop listening.
