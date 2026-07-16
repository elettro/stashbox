# API Gateway Stage Path Normalization

## Purpose

API Gateway invoke URLs can include the deployed stage as the first path segment. For example, the DEV invoke URL:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
```

forwards browser requests such as `/dev/dashboard/summary` to the Lambda. Direct Lambda tests usually send the non-stage path `/dashboard/summary`. The router must treat both forms as the same application route.

## Normalization behavior

`radio-api/index.mjs` normalizes the route before dispatch by:

1. Reading the request path from `event.rawPath` or `event.path`.
2. Splitting the path into segments and removing any trailing slash.
3. Checking only the first segment for an API Gateway stage prefix.
4. Preferring `event.requestContext.stage` as the stage name when API Gateway provides it.
5. Falling back to known stage names `dev`, `prod`, and `default` when `requestContext.stage` is unavailable.
6. Stripping the stage segment only when the next segment is a known route root.

This preserves direct Lambda tests that already use non-stage paths and avoids removing unrelated leading path segments.

## Supported equivalent route forms

The following pairs normalize to the same route before dispatch:

| Incoming path | Normalized route |
| --- | --- |
| `/dashboard/summary` | `dashboard/summary` |
| `/dev/dashboard/summary` | `dashboard/summary` |
| `/radio/songs` | `radio/songs` |
| `/dev/radio/songs` | `radio/songs` |
| `/admin/ads` | `admin/ads` |
| `/dev/admin/ads` | `admin/ads` |
| `/admin/uploads/presign` | `admin/uploads/presign` |
| `/dev/admin/uploads/presign` | `admin/uploads/presign` |

## DEV retest URL

After uploading a DEV Lambda ZIP with this change, retest:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/dashboard/summary
```

## Safety notes

- This is a Lambda router-only change.
- It does not change RDS schema, S3, API Gateway, or frontend configuration.
- It does not deploy anything.
- Existing response shapes are preserved because only route matching input is normalized before dispatch.
