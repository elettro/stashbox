# Stashbox Radio True DEV Backend Plan

Date: 2026-07-15
Status: planning only
Canonical Lambda source: `radio-api/index.mjs`

## Non-goals and safety boundaries

This plan does not deploy anything and does not change AWS, API Gateway, Lambda, RDS, S3, or front-end files. It is a sequencing document for a later DEV-only backend buildout.

The current production system should remain untouched until DEV v2 is manually created, configured, tested, and explicitly promoted through a separate production plan.

## Recommended DEV architecture

Create a true DEV backend split with dedicated DEV compute and storage boundaries while keeping database operations practical for this stage:

1. **DEV Lambda**: create a new Lambda named `stashbox-radio-api-dev-v2` from `radio-api/index.mjs`.
2. **DEV API Gateway**: create a new DEV-only API Gateway named `stashbox-radio-api-dev-api-v2` that integrates only with the DEV Lambda.
3. **DEV database**: use the same RDS instance with a separate `radio_dev` schema for the initial DEV v2 phase.
4. **DEV S3 bucket**: create a new bucket in `us-east-1`, separate from production media and aligned with the current Lambda/RDS/API region.
5. **DEV front-end routing**: later, update only DEV front-end config for `/radio/dev/`, `/radio-admin/dev/`, `/radio-admin/dev/ads/`, `/radio/visual-experience/dev/`, and `/radio/dashboard/dev/` to call the DEV API Gateway.

### Naming recommendation

Use lowercase AWS resource names for consistency and to avoid mixed-case drift:

- Lambda: `stashbox-radio-api-dev-v2`
- API Gateway: `stashbox-radio-api-dev-api-v2`
- S3 bucket: `stashbox-radio-media-dev-v2-us-east-1`
- Database schema: `radio_dev`

The proposed Lambda name `stashbox-radio-api-dev-v2` is good. The proposed API name `stashbox-radio-api-dev-API-v2` should be normalized to `stashbox-radio-api-dev-api-v2`.

## AWS resources to create later

Create these later only after explicit approval for AWS work:

1. **Lambda function**
   - Name: `stashbox-radio-api-dev-v2`
   - Runtime: Node.js version matching the existing production Lambda runtime.
   - Source: package from `radio-api/index.mjs` and required dependencies.
   - Environment: DEV-only variables listed below.
   - Permissions: minimum permissions for DEV S3 bucket access and RDS connectivity.

2. **API Gateway**
   - Name: `stashbox-radio-api-dev-api-v2`
   - Integration target: `stashbox-radio-api-dev-v2` only.
   - Stage: `dev`.
   - Routes: mirror the routes needed by radio player, admin CMS, ads admin, visual experience, dashboard, uploads, and tracking events.
   - CORS: match current allowed headers and methods needed by DEV front ends.

3. **S3 bucket**
   - Name: `stashbox-radio-media-dev-v2-us-east-1`.
   - Region: `us-east-1`.
   - Purpose: DEV-only media uploads and public media reads.
   - Public access policy/CORS: configure only as needed for DEV public media URLs and upload flows.

4. **Database objects**
   - Same RDS instance initially.
   - New schema: `radio_dev`.
   - Tables: copy production `radio` schema structure into `radio_dev`.
   - Grants: DEV Lambda database user should access `radio_dev` only where practical.

## DEV database strategy

### Option A: same RDS instance with `radio_dev` schema

**Pros**

- Lowest operational overhead.
- Fastest path to a true DEV split.
- Avoids provisioning a new RDS instance before the Lambda/API/S3 split is proven.
- Allows controlled seed copies from production tables into DEV tables.

**Cons**

- Still shares RDS compute, storage, backups, and connection capacity with production.
- Requires the Lambda code or database session configuration to consistently target `radio_dev` instead of `radio`.
- A misconfigured query can still reach production schema if the application hardcodes `radio.` table references.

**Assessment**

This is the safest practical option for this stage only if schema routing is implemented deliberately. Because the canonical Lambda currently references `radio.` tables directly in SQL, this option requires a code/config follow-up before deployment: either add a validated `PGSCHEMA=radio_dev` substitution layer or set up DEV database objects/views so canonical queries are safely isolated. Do not deploy DEV v2 against the shared RDS until this is resolved.

### Option B: same RDS instance with separate DEV database

**Pros**

- Stronger isolation than a separate schema.
- Reduces risk from hardcoded schema references if the DEV database has its own `radio` schema inside the DEV database.
- Keeps cost and operations lower than a separate RDS instance.

**Cons**

- Requires creating and managing a separate database on the same RDS instance.
- Still shares instance compute, storage, and connection capacity with production.
- May require new users, grants, migrations, backups, and connection-string changes.

**Assessment**

This is a strong practical alternative if creating a separate database is easy in the current RDS setup. It may be safer than `radio_dev` schema because the canonical Lambda can continue to query `radio.*` inside a DEV database without dynamic schema rewriting.

### Option C: separate RDS instance

**Pros**

- Best isolation.
- DEV load, failed migrations, bad data, and connection storms cannot directly affect production RDS.
- Cleanest long-term architecture.

**Cons**

- Highest cost and setup overhead.
- Requires networking, security groups, credentials, backups, maintenance windows, monitoring, and migration workflow.
- Slower to create and validate for the immediate DEV v2 goal.

**Assessment**

This is the best long-term target but likely too heavy for the immediate next step.

### Recommendation

For this stage, prefer **Option B: same RDS instance with a separate DEV database** if the RDS engine and permissions allow creating a DEV database easily. It gives better safety than a sibling schema while avoiding a new RDS instance.

If a separate database is not practical right now, use **Option A: same RDS with `radio_dev` schema**, but only after the canonical Lambda is made schema-configurable and verified not to write to production `radio.*` tables. Do not treat `PGSCHEMA=radio_dev` as effective until `radio-api/index.mjs` actually uses it or the database layer safely maps DEV connections into DEV tables.

Reserve **Option C: separate RDS instance** for the later mature DEV/staging environment.

## DEV S3 plan

Create a new DEV media bucket in `us-east-1`:

- Bucket: `stashbox-radio-media-dev-v2-us-east-1`
- Region: `us-east-1`
- Lambda upload region: `UPLOAD_REGION=us-east-1`
- Public base URL: `https://stashbox-radio-media-dev-v2-us-east-1.s3.us-east-1.amazonaws.com`

Recommended folder structure:

```text
audio/
artwork/
ads/video/
visuals/images/
visuals/clips/
visual-folders/images/
visual-folders/clips/
vec/recipes/
exports/
tmp/
```

Notes:

- Keep DEV media physically separate from production media.
- Do not reuse the current production media bucket in `us-east-2` for DEV v2.
- Keep bucket lifecycle rules conservative until manual QA confirms upload behavior.
- If public media URLs are required, configure public reads or CloudFront later through a separate reviewed change.

## DEV Lambda environment variables

Required or recommended environment variables for `stashbox-radio-api-dev-v2`:

| Variable | DEV value | Required | Notes |
| --- | --- | --- | --- |
| `APP_ENV` | `dev` | Yes | Primary runtime identity. |
| `AD_SETTINGS_ID` | `dev` | Yes | Ensures DEV ad settings row is separate. |
| `PGHOST` | existing RDS endpoint | Yes | Use DEV database/schema target strategy. |
| `PGPORT` | `5432` | Yes | Or existing RDS port. |
| `PGDATABASE` | DEV database name if using Option B; existing DB if using Option A | Yes | Prefer separate DEV database if practical. |
| `PGSCHEMA` | `radio_dev` if using Option A | Conditional | Requires code/database support before it is relied on. |
| `PGUSER` | DEV-scoped DB user | Yes | Prefer a user restricted to DEV database/schema. |
| `PGPASSWORD` | DEV DB password | Yes | Store securely in Lambda env or Secrets Manager later. |
| `ADMIN_TOKEN` | DEV-only admin token | Yes | Must not reuse production admin token. |
| `UPLOAD_BUCKET` | `stashbox-radio-media-dev-v2-us-east-1` | Yes | DEV-only bucket. |
| `UPLOAD_REGION` | `us-east-1` | Yes | Match DEV bucket region. |
| `UPLOAD_PUBLIC_BASE_URL` | `https://stashbox-radio-media-dev-v2-us-east-1.s3.us-east-1.amazonaws.com` | Yes | Used for public upload URLs. |
| `PUBLIC_PLAYER_PATH` | `/radio/dev/` | Yes | DEV tracking source-page default. |

Optional aliases supported by the canonical Lambda may remain unset if the primary variables above are set.

## DEV front-end config files to update later

Do not update these files in this planning task. Later, update only DEV front-end configs/routes that power:

1. `/radio/dev/` player
   - Point player API calls and tracking events to `stashbox-radio-api-dev-api-v2`.
   - Confirm `PUBLIC_PLAYER_PATH=/radio/dev/` in the DEV Lambda.

2. `/radio-admin/dev/`
   - Point Song CMS, album CMS, upload, and admin endpoints to the DEV API.
   - Use DEV `ADMIN_TOKEN` only.

3. `/radio-admin/dev/ads/`
   - Point ad settings, ad CMS, ad upload, and ad event test calls to DEV API.

4. `/radio/visual-experience/dev/`
   - Point visual folder asset metadata, asset uploads, and recipe reads to DEV API.

5. `/radio/dashboard/dev/`
   - Point metrics/dashboard endpoints to DEV API and DEV event tables.

Before making these updates, search the repo for current API constants and hardcoded Lambda/API URLs, then patch only DEV paths. Production front-end paths must remain unchanged.

## Data copy and seed plan

Seed DEV from safe copies of production-like data. Run these steps only after the DEV database target exists and is confirmed isolated.

1. **Schema creation**
   - Copy table structures, indexes, constraints, and required extensions from production `radio` into the DEV target.
   - If using Option B, create a `radio` schema inside the DEV database so canonical SQL can remain stable.
   - If using Option A, create `radio_dev` and ensure the Lambda cannot write to production `radio` tables.

2. **Songs**
   - Copy active song rows and required lookup fields.
   - Preserve IDs only if needed for recipes/events references.
   - Rewrite media URLs to DEV S3 only when corresponding media is copied.

3. **Albums**
   - Copy album metadata needed by song create/edit forms.
   - Preserve album IDs if songs reference them.

4. **Ads**
   - Copy ad metadata without copying production-only campaign secrets or external tracking credentials.
   - Rewrite ad media URLs to DEV S3 after DEV media copy.

5. **Ad settings**
   - Seed a single DEV row with `id='dev'`.
   - Start with conservative ad settings suitable for manual QA.

6. **Visual folders**
   - Copy folder metadata and relationships.
   - Do not point DEV metadata at production-only assets unless intentionally read-only for QA.

7. **Visual assets metadata**
   - Copy enough visual image/clip metadata to test folder browse, upload, and assignment flows.
   - Rewrite URLs to DEV S3 for copied assets.

8. **Song visual recipes**
   - Copy recipes for a small representative song set.
   - Validate every referenced asset exists in DEV metadata and DEV S3.

9. **Product mappings**
   - Copy representative product mapping rows needed for `product_click` QA.
   - Remove or anonymize sensitive commercial fields if present.

10. **Radio events**
    - Prefer empty event tables for DEV.
    - Optionally copy a very limited anonymized sample for dashboard testing.
    - Never copy sensitive listener identifiers if any exist.

11. **Validation queries**
    - Count rows per DEV table.
    - Confirm DEV ad settings id is `dev`.
    - Confirm DEV media URLs point to `stashbox-radio-media-dev-v2-us-east-1` or intentionally approved fixtures.
    - Confirm no DEV tables are writing into production event tables.

## Order of operations

1. Confirm `radio-api/index.mjs` remains the canonical Lambda source and passes syntax check.
2. Choose database strategy: prefer same RDS with separate DEV database; otherwise prepare schema-safe `radio_dev` approach.
3. Patch or verify schema isolation support before any deployment if using `PGSCHEMA=radio_dev`.
4. Create DEV database target and DEV-scoped DB user later.
5. Create DEV S3 bucket in `us-east-1` later.
6. Seed DEV database and optional DEV media fixtures later.
7. Create DEV Lambda from `radio-api/index.mjs` later.
8. Configure DEV Lambda environment variables later.
9. Create DEV API Gateway pointing only to DEV Lambda later.
10. Smoke-test DEV API directly before any front-end changes.
11. Update only DEV front-end config paths later.
12. Run the full manual QA checklist.
13. Keep production unchanged until a separate production promotion plan is approved.

## Manual QA checklist

Run this checklist only after DEV v2 AWS resources exist and DEV front-end config points to the DEV API.

### Player route: `/radio/dev/`

- Load `/radio/dev/` and confirm it calls the DEV API Gateway host only.
- Confirm no network request is sent to the production API.
- Confirm the player loads DEV song metadata.
- Confirm audio URLs are from the DEV S3 bucket or approved DEV fixtures.

### Tracking events

For each event, confirm API response success, expected counter behavior, and DEV database write only:

- `play_start`
- `like`
- `share`
- `skip`
- `product_click`
- `ad_start`
- `ad_click`
- `ad_skip`

For event validation:

- Confirm `song_key` works for non-UUID identifiers.
- Confirm `song_id` is written only for valid UUIDs.
- Confirm `source_page` defaults to `/radio/dev/` when omitted.
- Confirm dashboard/event tables read from DEV data only.

### Song CMS: `/radio-admin/dev/`

- Load Song CMS from `/radio-admin/dev/`.
- Confirm it calls the DEV API Gateway host only.
- Create or edit a song and save it.
- Confirm the saved row appears only in the DEV database target.
- Confirm album lookup and song metadata lookup work against DEV data.

### Uploads

For each upload, confirm presign succeeds, upload succeeds, returned URL uses the DEV S3 bucket, and database metadata writes only to DEV:

- Audio upload.
- Artwork upload.
- Ad video upload.
- Visual image upload.
- Visual clip upload.
- Visual folder image upload.
- Visual folder clip upload.

### Ads admin: `/radio-admin/dev/ads/`

- Load ads admin from `/radio-admin/dev/ads/`.
- Confirm it calls the DEV API Gateway host only.
- Read and save ad settings with `id='dev'`.
- Create/edit an ad.
- Upload an ad video to the DEV S3 bucket.
- Trigger ad event QA for `ad_start`, `ad_click`, and `ad_skip`.

### Visual Experience: `/radio/visual-experience/dev/`

- Load the Visual Experience DEV route.
- Confirm visual folder metadata is read from DEV.
- Upload visual folder image and clip assets to DEV S3.
- Confirm asset metadata writes only to DEV.
- Load and save a song visual recipe.
- Confirm recipe references DEV asset metadata and DEV media URLs.

### Dashboard: `/radio/dashboard/dev/`

- Load dashboard DEV route.
- Confirm it calls DEV API only.
- Confirm dashboard totals reflect DEV events only.
- Generate test events and confirm dashboard changes without production data movement.

## Risks

1. **Hardcoded schema names**: the canonical Lambda currently uses `radio.` SQL references, so `PGSCHEMA=radio_dev` is not automatically sufficient unless code or database mapping is updated.
2. **Shared RDS blast radius**: same-instance DEV still shares capacity with production even with separate schema/database isolation.
3. **Credential reuse**: production `ADMIN_TOKEN`, DB users, or S3 permissions must not be reused for DEV.
4. **S3 region mismatch**: using the old `us-east-2` media bucket would undermine DEV isolation and can cause presign/region confusion.
5. **Front-end drift**: only DEV front-end routes should be updated later; production route constants must not change.
6. **Data leakage**: event tables and product mappings may contain sensitive or production-only data and should be copied minimally or anonymized.
7. **Partial isolation**: DEV API Gateway must point only to DEV Lambda, and DEV Lambda must point only to DEV database/storage targets.

## Rollback and abandonment plan

DEV v2 can be abandoned without touching live production if each resource is kept isolated:

1. Stop using the DEV API Gateway URL in DEV front-end config.
2. Disable or delete `stashbox-radio-api-dev-api-v2`.
3. Disable or delete `stashbox-radio-api-dev-v2`.
4. Retain the DEV S3 bucket temporarily for inspection, then empty and delete it when no longer needed.
5. Drop the DEV database or `radio_dev` schema only after confirming no production code references it.
6. Remove DEV-only credentials and tokens.
7. Revert any later DEV front-end config commits if they are no longer wanted.

Production rollback is unnecessary because this plan keeps production untouched.

## Final safety statement

No AWS changes were made by this plan. No Lambda, API Gateway, RDS, S3, or front-end changes were made. This document is safe to merge as a planning artifact and is safe to use only for a later DEV backend implementation.
