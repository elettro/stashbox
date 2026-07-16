# True DEV Backend Validation Report

## Final validated status

This report records the completed true DEV backend validation for Stashbox Radio. The DEV backend is isolated from production by API Gateway stage, Lambda function, PostgreSQL schema, and S3 media bucket.

## Architecture summary

The true DEV setup uses a DEV-only browser surface that calls the DEV API Gateway invoke URL. The DEV API Gateway routes requests to the DEV Lambda function, and the Lambda selects the DEV PostgreSQL schema through `PGSCHEMA=radio_dev`. DEV media upload behavior uses the DEV S3 bucket. Production pages continue to use the production API/runtime and the production `radio` schema.

The validated request path is:

1. DEV frontend page under `/radio/dev/`, `/radio-admin/dev/`, `/radio-admin/dev/ads/`, `/radio/visual-experience/dev/`, or `/radio/dashboard/dev/`.
2. DEV API Gateway invoke URL: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`.
3. DEV Lambda: `stashbox-radio-api-dev-v2`.
4. DEV database schema: `radio_dev`.
5. DEV upload/media bucket: `stashbox-radio-media-dev-us-east-1`.

## AWS resources used

| Resource | DEV value | Validation note |
| --- | --- | --- |
| API Gateway invoke URL | `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev` | Used by DEV player, DEV CMS pages, DEV VEC, and DEV dashboard. |
| Lambda function | `stashbox-radio-api-dev-v2` | DEV-only Lambda for API requests. |
| RDS schema | `radio_dev` | Receives DEV events, CMS edits, ad notes, and VEC folder notes. |
| S3 bucket | `stashbox-radio-media-dev-us-east-1` | DEV media bucket for isolated upload/media behavior. |
| Production RDS schema | `radio` | Remained clean during DEV browser QA. |

## DEV Lambda environment variables

The DEV Lambda is validated as a true DEV runtime by environment variables rather than by route path. The critical variables for this setup are:

| Variable | DEV value / expected purpose |
| --- | --- |
| `APP_ENV` / `STAGE` / `NODE_ENV` / `ENVIRONMENT` | Identifies the runtime as DEV when configured for the DEV Lambda. Runtime identity is selected from these variables only. |
| `PGSCHEMA` | `radio_dev`; directs database reads and writes to the DEV schema. |
| `UPLOAD_BUCKET` / `S3_BUCKET` / `RADIO_UPLOAD_BUCKET` | `stashbox-radio-media-dev-us-east-1`; provides the DEV upload bucket. |
| `UPLOAD_REGION` / `UPLOAD_BUCKET_REGION` / `S3_BUCKET_REGION` / `RADIO_UPLOAD_BUCKET_REGION` / `AWS_REGION` / `AWS_DEFAULT_REGION` | `us-east-1`; resolves the DEV upload bucket region. |
| `AD_SETTINGS_ID` | Optional explicit row id for DEV ad settings; if unset, runtime identity is used. |

## RDS schema isolation summary

- DEV browser activity writes to `radio_dev`.
- Production browser/runtime behavior remains on `radio`.
- `PGSCHEMA=radio_dev` is the key isolation control for DEV Lambda database access.
- Production schema checks confirmed `radio` did not move during DEV player, Song CMS, Ads CMS, VEC, or dashboard QA.
- DEV and production currently both contain the same song visibility totals: 77 total songs, 71 visible songs, 2 hidden songs, and 4 archived songs.

## S3 DEV bucket summary

The DEV media bucket is `stashbox-radio-media-dev-us-east-1`. DEV upload/media behavior should use this bucket through the Lambda upload bucket environment variable aliases. No production S3 bucket changes were made or required for this validation pass.

## Pages validated

| Page | Result |
| --- | --- |
| `/radio/dev/` | DEV player works and writes player events into `radio_dev`. |
| `/radio-admin/dev/` | DEV Song CMS works and saves song edits into `radio_dev.songs`. |
| `/radio-admin/dev/ads/` | DEV Ads CMS works and saves ad notes into `radio_dev.ads`. |
| `/radio/visual-experience/dev/` | DEV VEC works and saves folder notes into `radio_dev.visuals_folders`. |
| `/radio/dashboard/dev/` | DEV dashboard works, uses `/dashboard/summary`, and shows DEV stats. |
| `/radio/dashboard/` | Production dashboard remains clean and shows production-sized stats, not DEV stats. |

## DBeaver SQL checks used

Use these checks in DBeaver or another SQL client connected to the same RDS database.

### Confirm DEV event totals

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

Expected validated counts:

| Metric | Count |
| --- | ---: |
| `total_events` | 29 |
| `play_start` | 6 |
| `like` | 6 |
| `share` | 6 |
| `skip` | 2 |
| `play_full` | 2 |
| `play_partial` | 7 |

### Confirm song visibility totals in both schemas

```sql
SELECT
  'radio' AS schema_name,
  COUNT(*) FILTER (WHERE archived IS TRUE) AS archived,
  COUNT(*) FILTER (WHERE hidden IS TRUE AND archived IS NOT TRUE) AS hidden,
  COUNT(*) FILTER (WHERE COALESCE(hidden, false) IS FALSE AND COALESCE(archived, false) IS FALSE) AS visible,
  COUNT(*) AS total
FROM radio.songs
UNION ALL
SELECT
  'radio_dev' AS schema_name,
  COUNT(*) FILTER (WHERE archived IS TRUE) AS archived,
  COUNT(*) FILTER (WHERE hidden IS TRUE AND archived IS NOT TRUE) AS hidden,
  COUNT(*) FILTER (WHERE COALESCE(hidden, false) IS FALSE AND COALESCE(archived, false) IS FALSE) AS visible,
  COUNT(*) AS total
FROM radio_dev.songs;
```

Expected validated result for both `radio.songs` and `radio_dev.songs`:

| archived | hidden | visible | total |
| ---: | ---: | ---: | ---: |
| 4 | 2 | 71 | 77 |

### Confirm DEV Song CMS edit isolation

```sql
SELECT id, title, internal_notes
FROM radio_dev.songs
WHERE internal_notes ILIKE '%Space Jam%'
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, title, internal_notes
FROM radio.songs
WHERE internal_notes ILIKE '%Space Jam%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

Expected result: the DEV schema contains the Space Jam internal note and production does not contain the DEV internal note.

### Confirm DEV Ads CMS note isolation

```sql
SELECT id, title, notes
FROM radio_dev.ads
WHERE notes IS NOT NULL AND btrim(notes) <> ''
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, title, notes
FROM radio.ads
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

Expected result: the DEV schema contains the DEV ad note and production does not contain the DEV ad note.

### Confirm DEV VEC folder note isolation

```sql
SELECT id, name, notes
FROM radio_dev.visuals_folders
WHERE notes IS NOT NULL AND btrim(notes) <> ''
ORDER BY updated_at DESC NULLS LAST, id DESC;

SELECT id, name, notes
FROM radio.visuals_folders
WHERE notes ILIKE '%DEV%'
ORDER BY updated_at DESC NULLS LAST, id DESC;
```

Expected result: the DEV schema contains the DEV VEC note and production does not contain the DEV VEC note.

## Production safety checks used

- Confirmed `/radio/dev/` writes likes, shares, plays, and skips into `radio_dev.radio_events`.
- Confirmed production `radio` schema did not move during DEV browser tests.
- Confirmed `/radio-admin/dev/` saved the Space Jam internal note into `radio_dev.songs` only.
- Confirmed `radio.songs` did not receive the DEV internal note.
- Confirmed `/radio-admin/dev/ads/` saved notes into `radio_dev.ads` only.
- Confirmed `radio.ads` did not receive the DEV ad note.
- Confirmed `/radio/visual-experience/dev/` saved folder notes into `radio_dev.visuals_folders` only.
- Confirmed `radio.visuals_folders` did not receive the DEV VEC note.
- Confirmed `/radio/dashboard/dev/` uses `/dashboard/summary` and shows DEV stats.
- Confirmed `/radio/dashboard/` shows production-sized stats, not DEV stats.

## Known counts from QA

### Event counts in `radio_dev.radio_events`

| Event type | Count |
| --- | ---: |
| All events | 29 |
| `play_start` | 6 |
| `like` | 6 |
| `share` | 6 |
| `skip` | 2 |
| `play_full` | 2 |
| `play_partial` | 7 |

### Song visibility counts

| Schema | Archived | Hidden | Visible | Total |
| --- | ---: | ---: | ---: | ---: |
| `radio.songs` | 4 | 2 | 71 | 77 |
| `radio_dev.songs` | 4 | 2 | 71 | 77 |

## Public dashboard count explanation

There are 77 total songs in both `radio.songs` and `radio_dev.songs`. The public dashboard song count of 71 is expected because public dashboard counts use visible songs only. Hidden and archived songs are intentionally excluded from public dashboard counts. Dashboard tracked song counts can be lower than the visible song count when only some songs have recent DEV activity; the validated DEV tracked song count is 5.

## Known safe behavior

- DEV pages call the DEV API Gateway invoke URL.
- DEV Lambda uses the DEV schema through `PGSCHEMA=radio_dev`.
- DEV player and CMS writes land in `radio_dev`.
- Production schema content remains untouched by DEV browser validation.
- Production dashboard remains on production-sized stats.
- `/dashboard/summary` is read-only and public-safe.
- Hidden and archived songs remain excluded from public dashboard counts by design.

## Remaining later-phase ideas

- Add automated smoke tests for DEV API Gateway endpoints.
- Add a small scripted SQL verification suite for schema isolation checks.
- Add CI checks that prevent DEV frontends from accidentally pointing at production API roots.
- Add recurring dashboard summary snapshots for easier QA comparison.
- Add a formal rollback/runbook section for DEV Lambda environment variable drift.
- Add monitoring alarms for unexpected production writes during DEV validation windows.
