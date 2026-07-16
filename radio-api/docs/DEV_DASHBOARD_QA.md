# DEV Dashboard QA

This checklist covers the public-safe DEV dashboard at `/radio/dashboard/dev/`.

## DEV API base

The DEV dashboard frontend uses:

```text
https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
```

The dashboard requests:

- `GET /radio/songs`
- `GET /dashboard/songs`
- `GET /dashboard/summary`

## Public-safe summary payload

`GET /dashboard/summary` is read-only and uses `PGSCHEMA`, so the DEV Lambda reads `radio_dev` when deployed with `PGSCHEMA=radio_dev`.

The summary endpoint returns public-safe data only:

- `summary`
- `today`
- `devices`
- `event_types`
- `top_songs_by_plays`
- `most_liked_songs`
- `most_shared_songs`
- `recent_events`
- `product_stats`
- `products`
- `recent_product_clicks`
- `product_clicks_message`
- `generated_at`

The endpoint does not expose IP addresses, admin tokens, raw visitor identifiers, backend secrets, or unsafe diagnostics.

If `product_click` events exist but product detail columns are not available, `recent_product_clicks` is returned as an empty array with a public-safe `product_clicks_message` instead of an error.

## Manual QA checklist

1. Open `/radio/dashboard/dev/`.
2. Confirm the page calls `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`.
3. Confirm `GET /dashboard/summary` returns HTTP 200.
4. Confirm there is no missing `/dashboard/summary` warning.
5. Confirm Overview has stats.
6. Confirm Today has recent DEV activity from `radio_dev.radio_events`.
7. Confirm Top Songs shows DEV songs by plays.
8. Confirm Most Liked shows DEV songs by likes.
9. Confirm Most Shared shows DEV songs by shares.
10. Confirm Events reflects `radio_dev.radio_events` public-safe counts and recent public-safe event rows.
11. Confirm Recent Product Clicks shows `product_click` events when public-safe product detail is present.
12. Confirm Recent Product Clicks shows a clean empty state and public-safe message when product detail is not stored.
13. Confirm `/radio/dashboard/` production dashboard files and production API config were not changed.

## DEV-only deploy note

Deploy the Lambda/API changes to the DEV API Gateway stage only. Do not run production dashboard deploys or production API config changes for this QA pass.
