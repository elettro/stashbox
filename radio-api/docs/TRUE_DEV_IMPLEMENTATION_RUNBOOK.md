# Stashbox Radio True DEV Backend v2 Implementation Runbook

Date: 2026-07-15
Status: implementation preparation only
Canonical plan: `radio-api/docs/TRUE_DEV_BACKEND_PLAN.md`
Canonical Lambda source: `radio-api/index.mjs`

## Safety boundaries for this repository change

This runbook is documentation for a later AWS implementation. The preparation task that created this file must not deploy anything and must not create or mutate Lambda, API Gateway, S3, RDS, or production front-end resources.

Do not run any command in this document until an explicit later AWS implementation window is approved.

## Recommended AWS resources

| Resource | Recommended value | Notes |
| --- | --- | --- |
| DEV Lambda | `stashbox-radio-api-dev-v2` | New DEV-only function built from `radio-api/index.mjs`. |
| DEV API Gateway | `stashbox-radio-api-dev-api-v2` | New DEV-only API integrated only with the DEV Lambda. |
| DEV database/schema | Same RDS instance with separate schema first: `radio_dev` | Lowest operational overhead for initial DEV v2. Verify schema isolation before deploy. |
| DEV S3 bucket | `stashbox-radio-media-dev-us-east-1` | New DEV-only bucket in `us-east-1`. |
| API stage | `dev` | Use a DEV-only invoke URL for front-end DEV routes. |

## Assumptions

1. The existing production Lambda source remains `radio-api/index.mjs`.
2. The production Lambda runtime, memory, timeout, VPC, subnets, and security groups are known from the AWS Console and can be mirrored safely for DEV.
3. The initial DEV data target will be the same RDS instance with a separate `radio_dev` schema, not a new RDS instance.
4. A DEV-scoped database user can be created or granted access only to the DEV schema where practical.
5. Real credentials, tokens, endpoints, and AWS account IDs will be supplied manually outside git.
6. Production front-end files will not be changed during backend resource creation.

## Blockers to resolve before deploying

1. Confirm the current `radio-api/docs/PGSCHEMA_MIGRATION_REPORT.md` still shows no hardcoded SQL `radio.` table references before connecting DEV Lambda to shared RDS.
2. Confirm the production Lambda runtime and packaging dependency set.
3. Confirm the AWS region for Lambda and API Gateway. The DEV S3 bucket is explicitly `us-east-1`.
4. Confirm whether public S3 reads are acceptable or whether CloudFront/signed URLs are required for DEV media.
5. Confirm CORS origins and methods required by every DEV front-end route.

## DEV Lambda environment variables

Use `radio-api/env/dev.example.env` as the template. Required DEV values:

```dotenv
APP_ENV=dev
AD_SETTINGS_ID=dev
PGHOST=<existing-rds-endpoint>
PGPORT=5432
PGDATABASE=<existing-database-name>
PGSCHEMA=radio_dev
PGUSER=<dev-scoped-db-user>
PGPASSWORD=<dev-db-password>
ADMIN_TOKEN=<dev-admin-token>
UPLOAD_BUCKET=stashbox-radio-media-dev-us-east-1
UPLOAD_REGION=us-east-1
UPLOAD_PUBLIC_BASE_URL=https://stashbox-radio-media-dev-us-east-1.s3.us-east-1.amazonaws.com
PUBLIC_PLAYER_PATH=/radio/dev/
```

Never reuse production `ADMIN_TOKEN`, broad production DB users, or production S3 buckets for DEV v2.

## Exact order of operations

### Phase 0: local preparation only

1. Review this runbook and `radio-api/docs/TRUE_DEV_BACKEND_PLAN.md`.
2. Confirm `radio-api/index.mjs` is the canonical source.
3. Confirm `PGSCHEMA=radio_dev` is present in the DEV Lambda environment plan and `PGSCHEMA` is unset or `radio` in production.
4. Run only local checks, for example:

```bash
node --check radio-api/index.mjs
rg "radio\." radio-api/index.mjs
```

The `rg` command should not show hardcoded SQL table references. A match in the required helper comment is acceptable.

5. Package the Lambda artifact locally only after dependency requirements are confirmed. Example only:

```bash
cd radio-api
zip -r ../stashbox-radio-api-dev-v2.zip index.mjs package.json node_modules
```

### Phase 1: create DEV database/schema later

Recommended initial target: same RDS instance with schema `radio_dev`.

AWS Console steps:

1. Open the RDS console.
2. Select the existing production RDS instance.
3. Confirm endpoint, port, database name, engine, and security group rules.
4. Use the approved SQL client or query tool to connect with an administrative account.
5. Create schema `radio_dev`.
6. Copy the production `radio` schema structure into `radio_dev`.
7. Create or grant a DEV-scoped user with access to `radio_dev` only where practical.
8. Seed limited DEV data and keep event tables empty unless anonymized dashboard fixtures are needed.
9. Validate no DEV object writes to production `radio` tables.

SQL examples to adapt, not execute blindly:

```sql
CREATE SCHEMA IF NOT EXISTS radio_dev;

-- Example grant pattern; adapt role names and privileges to actual tables.
GRANT USAGE ON SCHEMA radio_dev TO radio_dev_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA radio_dev TO radio_dev_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA radio_dev TO radio_dev_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA radio_dev
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO radio_dev_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA radio_dev
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO radio_dev_app;
```

Validation examples:

```sql
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'radio_dev';
SELECT current_database();
SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('radio', 'radio_dev') ORDER BY 1, 2;
```

### Phase 2: create DEV S3 bucket later

AWS Console steps:

1. Open S3 in `us-east-1`.
2. Create bucket `stashbox-radio-media-dev-us-east-1`.
3. Keep versioning, encryption, object ownership, public access, lifecycle, and CORS settings aligned with the approved DEV media access model.
4. Add CORS rules for the DEV front-end origins and upload methods only.
5. If public media reads are required, configure the minimal public-read or CloudFront approach approved for DEV.

AWS CLI examples for later use only:

```bash
aws s3api create-bucket \
  --bucket stashbox-radio-media-dev-us-east-1 \
  --region us-east-1

aws s3api put-bucket-cors \
  --bucket stashbox-radio-media-dev-us-east-1 \
  --cors-configuration file://dev-bucket-cors.json
```

Suggested DEV bucket prefixes:

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

### Phase 3: create DEV Lambda later

AWS Console steps:

1. Open Lambda in the same region as the current radio API Lambda unless architecture review chooses otherwise.
2. Create a new function named `stashbox-radio-api-dev-v2`.
3. Choose the Node.js runtime that matches the existing production Lambda runtime.
4. Configure timeout, memory, ephemeral storage, VPC, subnets, and security groups to match DEV connectivity requirements.
5. Upload the reviewed package built from `radio-api/index.mjs`.
6. Configure environment variables from `radio-api/env/dev.example.env` with real DEV values.
7. Attach an IAM role with minimum permissions for CloudWatch Logs, DEV S3 bucket access, and required RDS/network access.
8. Do not attach production-only S3 policies or broad admin policies.

AWS CLI example for later use only:

```bash
aws lambda create-function \
  --function-name stashbox-radio-api-dev-v2 \
  --runtime nodejs20.x \
  --role arn:aws:iam::<account-id>:role/<dev-lambda-role> \
  --handler index.handler \
  --zip-file fileb://stashbox-radio-api-dev-v2.zip \
  --environment file://dev-lambda-env.json \
  --timeout 30 \
  --memory-size 512 \
  --region <lambda-region>
```

### Phase 4: create DEV API Gateway later

AWS Console steps:

1. Open API Gateway.
2. Create a new API named `stashbox-radio-api-dev-api-v2`.
3. Use the API type that matches the existing production integration unless architecture review changes it.
4. Create stage `dev`.
5. Integrate all radio API routes with `stashbox-radio-api-dev-v2` only.
6. Configure CORS for DEV front-end origins, methods, and headers.
7. Add Lambda invoke permission only for the DEV API Gateway.
8. Save the DEV invoke URL for later front-end DEV config updates.

AWS CLI examples for later use only:

```bash
aws apigatewayv2 create-api \
  --name stashbox-radio-api-dev-api-v2 \
  --protocol-type HTTP \
  --cors-configuration AllowMethods='[GET,POST,PUT,PATCH,DELETE,OPTIONS]',AllowHeaders='[content-type,authorization,x-admin-token]',AllowOrigins='[https://<dev-frontend-origin>]'

aws lambda add-permission \
  --function-name stashbox-radio-api-dev-v2 \
  --statement-id allow-dev-api-gateway \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn arn:aws:execute-api:<region>:<account-id>:<api-id>/*/*/*
```

### Phase 5: update DEV front-end API config later

Do not update production front-end files. Later, update only DEV front-end configuration used by these paths:

- `/radio/dev/`
- `/radio-admin/dev/`
- `/radio-admin/dev/ads/`
- `/radio/visual-experience/dev/`
- `/radio/dashboard/dev/`

Before editing, search for existing API constants and hardcoded API URLs. Confirm each DEV route calls only the DEV API Gateway invoke URL and that production routes remain unchanged.

### Phase 6: smoke test DEV API later

Use the DEV API Gateway invoke URL only:

```bash
DEV_API_BASE=https://<api-id>.execute-api.<region>.amazonaws.com/dev
curl -i "$DEV_API_BASE/radio/songs"
curl -i -X POST "$DEV_API_BASE/radio/track" \
  -H 'content-type: application/json' \
  -d '{"event":"play_start","song_key":"dev-smoke","source_page":"/radio/dev/"}'
```

## QA checklist

Run the full checklist only after DEV v2 exists and DEV front-end config points to the DEV API.

### API and tracking

- `GET /radio/songs` returns DEV song data.
- `POST /radio/track` with `play_start` writes only to DEV tables.
- `POST /radio/track` with `like` writes only to DEV tables.
- `POST /radio/track` with `share` writes only to DEV tables.
- `POST /radio/track` with `skip` writes only to DEV tables.
- `POST /radio/track` with `product_click` writes only to DEV tables.
- `GET /radio/ads` returns DEV ad data/settings.
- `POST /radio/track` or the relevant ad event endpoint records `ad_start` only in DEV.
- `POST /radio/track` or the relevant ad event endpoint records `ad_click` only in DEV.
- `POST /radio/track` or the relevant ad event endpoint records `ad_skip` only in DEV.

### Admin CMS and uploads

- Song CMS save from `/radio-admin/dev/` persists only to DEV.
- Audio upload presign/upload returns `stashbox-radio-media-dev-us-east-1` URL.
- Artwork upload presign/upload returns `stashbox-radio-media-dev-us-east-1` URL.
- `ad_video` upload returns `stashbox-radio-media-dev-us-east-1` URL.
- `visual_image` upload returns `stashbox-radio-media-dev-us-east-1` URL.
- `visual_clip` upload returns `stashbox-radio-media-dev-us-east-1` URL.
- `visual_folder_image` upload returns `stashbox-radio-media-dev-us-east-1` URL.
- `visual_folder_clip` upload returns `stashbox-radio-media-dev-us-east-1` URL.

### Visual experience and dashboard

- VEC recipe load reads DEV data only.
- VEC recipe save writes DEV data only.
- `/radio/dashboard/dev/` routes load without production API calls.
- Dashboard metrics reflect DEV events only.

## Rollback / abandon DEV v2 without touching live production

Because every resource is DEV-only, abandoning DEV v2 should not require production rollback.

1. Stop using the DEV API Gateway URL in DEV front-end config.
2. Disable or delete API Gateway `stashbox-radio-api-dev-api-v2`.
3. Disable or delete Lambda `stashbox-radio-api-dev-v2`.
4. Retain S3 bucket `stashbox-radio-media-dev-us-east-1` temporarily for inspection, then empty and delete it after approval.
5. Drop schema `radio_dev` only after confirming no DEV Lambda, local script, or front-end config still references it.
6. Revoke and remove DEV-only database credentials, admin token, and IAM policies.
7. Revert any later DEV front-end config commits if the DEV routes are no longer wanted.
8. Verify production API Gateway, production Lambda, production RDS schema/database, production S3 bucket, and production front-end routes were not modified.

## Final safety confirmation

This runbook contains manual steps and examples only. Creating this preparation file makes no AWS changes, runs no AWS commands, creates no Lambda, creates no API Gateway, creates no S3 bucket, changes no RDS resource, and modifies no production front-end file.
