# TRUE DEV Smoke Tests

`radio-api/scripts/smoke-test-true-dev.mjs` is a read-only smoke test for the validated Stashbox Radio TRUE DEV backend. It verifies the DEV API Gateway can read the DEV Lambda-backed endpoints before any production workflow is touched.

## Run the read-only smoke test

From the repository root:

```bash
node radio-api/scripts/smoke-test-true-dev.mjs
```

The script reads `TRUE_DEV_API_BASE` from the environment and defaults to:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
```

Because `radio-api/package.json` includes an npm helper, you can also run:

```bash
cd radio-api
npm run smoke:true-dev
```

## Run with admin route checks

Admin checks are optional and only run when `ADMIN_TOKEN` is present. Never hardcode the token.

```bash
ADMIN_TOKEN="your-token" node radio-api/scripts/smoke-test-true-dev.mjs
```

You can combine both environment variables when testing a different DEV API base:

```bash
TRUE_DEV_API_BASE="https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev" ADMIN_TOKEN="your-token" node radio-api/scripts/smoke-test-true-dev.mjs
```

## What each check proves

| Check | What it proves |
| --- | --- |
| `GET /radio/songs` returns HTTP 200 | The public DEV song catalog endpoint is reachable. |
| `/radio/songs` returns `success: true` | The Lambda produced the expected successful JSON response. |
| `/radio/songs` has visible songs count greater than 0 | The DEV schema has readable visible song data for the radio client. |
| `GET /dashboard/summary` returns HTTP 200 | The DEV dashboard summary endpoint is reachable. |
| `/dashboard/summary` returns `success: true` | The dashboard stats response completed successfully. |
| `/dashboard/summary` includes `summary.total_events` | The response includes the expected DEV event summary field. |
| `/dashboard/summary` includes `event_types` | The response includes event type breakdown data. |
| `/dashboard/summary` includes `top_songs_by_plays` | The response includes playable song stats for the DEV dashboard. |
| `GET /admin/ads` returns HTTP 200 with `ADMIN_TOKEN` | The DEV admin ads read route accepts the provided admin token. |
| `GET /admin/visuals/folders` returns HTTP 200 with `ADMIN_TOKEN` | The DEV admin visuals folder read route accepts the provided admin token. |

If `ADMIN_TOKEN` is missing, `/admin/ads` and `/admin/visuals/folders` are reported as skipped and do not fail the read-only smoke test.

## Why production is not touched

The default API base is the DEV API Gateway stage:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
```

The smoke test only issues `GET` requests in default mode. It does not deploy code, modify AWS resources, change RDS schema, write to S3, or call production URLs. The optional `--write` mode is intentionally a safe placeholder that prints `Write smoke tests are not implemented yet.` and exits without making write requests.

## If `/dashboard/summary` fails

1. Confirm `TRUE_DEV_API_BASE` points at the DEV API Gateway `/dev` stage.
2. Check the Lambda logs for `stashbox-radio-api-dev-v2`.
3. Verify the DEV Lambda environment is configured for the `radio_dev` schema.
4. Confirm the `radio_dev.radio_events` table is readable and has the columns expected by the dashboard summary code.
5. Re-run the smoke test after the DEV backend issue is corrected.

## If admin routes fail

1. Confirm `ADMIN_TOKEN` is set in your shell and matches the DEV Lambda admin token.
2. Confirm the smoke test is still targeting the DEV API base, not production.
3. Check the response status in the smoke test checklist: `401` usually means the token was missing or incorrect, while `5xx` points to a backend error.
4. Check the Lambda logs for `stashbox-radio-api-dev-v2` and inspect the DEV tables behind ads or visuals folders.

## Deployment reminder

This smoke test does not deploy anything. Lambda ZIP upload is still manual unless deployment automation is added later.
