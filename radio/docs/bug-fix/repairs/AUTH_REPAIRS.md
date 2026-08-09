# Auth Repair Playbook

Use for login, signup, password entry, sessions, account state, and role access.

## Fast checks

1. Confirm environment and exact auth screen.
2. Test keyboard input before checking backend authentication.
3. Inspect CSS text-transform separately from actual input value transformation.
4. Confirm request payload preserves password case.
5. Check session/token creation and storage.
6. Check role/permission response after login.
7. Compare guest and logged-in routes.

## Common failure patterns

- Password field visually or functionally forces uppercase.
- Session exists but player/admin does not recognize it.
- Account state or role blocks expected access.
- Login succeeds but redirect/state sync fails.

## Regression checks

- Uppercase and lowercase passwords.
- Mobile and desktop input behavior.
- Session persistence.
- Logout.
- Protected admin routes.
- Guest player remains usable.