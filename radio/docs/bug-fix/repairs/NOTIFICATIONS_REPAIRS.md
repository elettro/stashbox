# Notifications Repair Playbook

Use for notification freshness, delivery, seen state, personalization, and feed rendering.

## Fast checks

1. Capture user/account state and environment.
2. Compare API notification timestamps with what the UI displays.
3. Check cache, polling, refresh triggers, and stale response handling.
4. Confirm seen/unseen updates do not overwrite newer records.
5. Check guest versus logged-in notification paths.

## Common failure patterns

- Same notifications remain visible for an extended period.
- Feed fetch succeeds but UI does not replace stale items.
- Seen state changes but feed freshness does not.
- Personalized notifications fail because account/session identity is missing.

## Regression checks

- Fresh items appear without a hard reload.
- Seen state persists.
- Older items remain accessible when expected.
- Mobile and desktop notification surfaces stay consistent.