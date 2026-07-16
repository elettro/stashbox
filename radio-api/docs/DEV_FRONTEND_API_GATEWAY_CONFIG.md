# DEV Frontend API Gateway Config

This note records the frontend-only DEV API Gateway switch for Stashbox Radio DEV pages.

## DEV API base

DEV frontend pages must call this API Gateway base:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
```

The DEV base applies only to these DEV routes and their DEV-only frontend assets/config:

- `/radio/dev/`
- `/radio-admin/dev/`
- `/radio-admin/dev/ads/`
- `/radio/visual-experience/dev/`
- `/radio/dashboard/dev/`

Production routes and production API config must remain unchanged, including:

- `/radio/`
- `/radio-admin/`
- production dashboard pages
- production ads pages
- production visual pages

## Manual QA checklist

After merge/deploy, validate:

- `/radio/dev/` loads songs from the new DEV API.
- `like`, `share`, and `play_start` events write only to `radio_dev`.
- Admin DEV song list loads.
- Ads DEV page loads.
- Visual Experience DEV page loads.
- Dashboard DEV page loads or reports only known missing dashboard endpoint issues.
- No production URL changed.
