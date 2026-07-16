# True DEV Backend QA Checklist

Use this checklist for repeatable future QA of the Stashbox Radio true DEV backend. Do not deploy, modify AWS resources, modify RDS schemas, modify S3, or change production runtime behavior while running this checklist.

## Fixed DEV resources

- DEV API Gateway invoke URL: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`
- DEV Lambda: `stashbox-radio-api-dev-v2`
- DEV RDS schema: `radio_dev`
- Production RDS schema: `radio`
- DEV S3 bucket: `stashbox-radio-media-dev-us-east-1`

## Pre-flight checks

- [ ] Confirm the browser page under test is a DEV page.
- [ ] Confirm network calls use `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`.
- [ ] Confirm no production deploy is planned or running.
- [ ] Record current production counts before performing write tests.
- [ ] Record current DEV counts before performing write tests.

## Player test

1. Open `/radio/dev/`.
2. Start playback on a visible song.
3. Trigger a like.
4. Trigger a share.
5. Trigger a skip.
6. Let at least one play event complete enough to create a partial or full play event.
7. Confirm the browser network panel posts to the DEV API Gateway invoke URL.
8. Confirm new rows appear in `radio_dev.radio_events`.
9. Confirm production `radio.radio_events` did not receive the DEV test events.

Suggested SQL:

```sql
SELECT event_type, COUNT(*) AS count
FROM radio_dev.radio_events
GROUP BY event_type
ORDER BY event_type;

SELECT event_type, COUNT(*) AS count
FROM radio.radio_events
GROUP BY event_type
ORDER BY event_type;
```

## Song CMS edit test

1. Open `/radio-admin/dev/`.
2. Edit a safe DEV-only field such as `internal_notes` on a known song.
3. Save the edit.
4. Confirm the save request uses the DEV API Gateway invoke URL.
5. Confirm the note is present in `radio_dev.songs`.
6. Confirm the same DEV note is absent from `radio.songs`.

Suggested SQL:

```sql
SELECT id, title, internal_notes
FROM radio_dev.songs
WHERE internal_notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, title, internal_notes
FROM radio.songs
WHERE internal_notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

## Ads CMS notes save test

1. Open `/radio-admin/dev/ads/`.
2. Edit a safe DEV-only notes field on an ad.
3. Save the edit.
4. Confirm the save request uses the DEV API Gateway invoke URL.
5. Confirm the note is present in `radio_dev.ads`.
6. Confirm the same DEV note is absent from `radio.ads`.

Suggested SQL:

```sql
SELECT id, title, notes
FROM radio_dev.ads
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, title, notes
FROM radio.ads
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

## VEC folder note save test

1. Open `/radio/visual-experience/dev/`.
2. Edit a safe DEV-only folder notes field.
3. Save the edit.
4. Confirm the save request uses the DEV API Gateway invoke URL.
5. Confirm the note is present in `radio_dev.visuals_folders`.
6. Confirm the same DEV note is absent from `radio.visuals_folders`.

Suggested SQL:

```sql
SELECT id, name, notes
FROM radio_dev.visuals_folders
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, name, notes
FROM radio.visuals_folders
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

## Dashboard summary test

1. Open `/radio/dashboard/dev/`.
2. Confirm the page calls the DEV API Gateway invoke URL.
3. Confirm `GET /dashboard/summary` returns HTTP 200.
4. Confirm the dashboard shows DEV stats.
5. Confirm the status copy reports the DEV dashboard summary and tracked songs.
6. Confirm event type counts match `radio_dev.radio_events`.
7. Open `/radio/dashboard/`.
8. Confirm production dashboard still shows production-sized stats, not DEV stats.

Suggested SQL:

```sql
SELECT
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE event_type = 'play_start') AS play_start,
  COUNT(*) FILTER (WHERE event_type = 'like') AS like,
  COUNT(*) FILTER (WHERE event_type = 'share') AS share,
  COUNT(*) FILTER (WHERE event_type = 'skip') AS skip,
  COUNT(*) FILTER (WHERE event_type = 'play_full') AS play_full,
  COUNT(*) FILTER (WHERE event_type = 'play_partial') AS play_partial
FROM radio_dev.radio_events;
```

## Production safety checks

- [ ] Production `radio.songs` does not contain DEV Song CMS notes.
- [ ] Production `radio.ads` does not contain DEV Ads CMS notes.
- [ ] Production `radio.visuals_folders` does not contain DEV VEC notes.
- [ ] Production dashboard `/radio/dashboard/` does not show DEV-sized stats.
- [ ] Production event counts do not change unexpectedly during DEV browser tests.
- [ ] No production S3 bucket objects are created by DEV upload tests.

## API Gateway direct endpoint tests

Run direct read checks against the DEV invoke URL. These checks should not require production access.

```bash
curl -i https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/songs
curl -i https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/dashboard/summary
curl -i https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/dashboard/songs
```

Expected results:

- [ ] DEV endpoints return successful public-safe responses.
- [ ] `/dashboard/summary` returns summary, today, event type, top song, recent event, and product sections when data is available.
- [ ] Responses do not expose secrets, admin tokens, unsafe visitor identifiers, or raw private diagnostics.

## Lambda direct tests

Use direct Lambda invocation only against `stashbox-radio-api-dev-v2`.

```bash
aws lambda invoke \
  --function-name stashbox-radio-api-dev-v2 \
  --payload '{"requestContext":{"http":{"method":"GET","path":"/dashboard/summary"}},"rawPath":"/dashboard/summary"}' \
  /tmp/stashbox-radio-dev-dashboard-summary.json

cat /tmp/stashbox-radio-dev-dashboard-summary.json
```

Expected results:

- [ ] Invocation targets `stashbox-radio-api-dev-v2` only.
- [ ] Response is public-safe dashboard summary data.
- [ ] Data matches the DEV `radio_dev` schema.
- [ ] No production Lambda function is invoked.

## Song count explanation to verify

- [ ] `radio.songs` has 77 total songs.
- [ ] `radio_dev.songs` has 77 total songs.
- [ ] Both schemas have 71 visible songs.
- [ ] Both schemas have 2 hidden songs.
- [ ] Both schemas have 4 archived songs.
- [ ] Public dashboard counts exclude hidden and archived songs by design.
- [ ] DEV dashboard tracked songs can be lower than 71 when only some songs have recent DEV activity.
