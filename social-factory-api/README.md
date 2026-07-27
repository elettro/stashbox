# Stashbox Social Factory API

This folder contains the isolated Social Factory backend. It does not extend or wrap `radio-api/index.mjs`.

## DEV service

- Lambda function: `stashbox-social-api-dev`
- Runtime: Node.js 22
- Infrastructure: AWS SAM
- AWS region: `us-east-1`
- Database migration target: `social_factory_dev`

## Routes

- `GET /social/health`
- `GET /social/youtube/oauth/start`
- `GET /social/youtube/oauth/callback`
- `GET /social/youtube/status`
- `POST /social/youtube/disconnect`

The OAuth start, status, and disconnect routes require the generated Social Factory `x-admin-token`. The Google callback is protected by a signed, expiring OAuth state value.

## Secrets

The stack creates two dedicated Secrets Manager secrets:

- `stashbox/social-factory/dev/youtube-oauth/config`
- `stashbox/social-factory/dev/youtube-oauth/tokens`

The configuration secret contains:

```json
{
  "client_id": "REPLACE_GOOGLE_CLIENT_ID",
  "client_secret": "REPLACE_GOOGLE_CLIENT_SECRET",
  "success_redirect_uri": "https://stashbox.com",
  "admin_token": "generated-by-aws"
}
```

Replace only `client_id`, `client_secret`, and optionally `success_redirect_uri`. Preserve the generated `admin_token`.

The token secret is written only by the isolated Social Factory Lambda after a successful Google authorization callback. Do not manually place access or refresh tokens in source code, GitHub, or Lambda environment variables.

## Execution-role boundary

The Lambda execution role allows only:

- CloudWatch log creation and writes
- `DescribeSecret` and `GetSecretValue` for the two YouTube OAuth secrets
- `PutSecretValue` for the YouTube token secret only

It has no database, VPC, S3, SQS, main-radio Lambda, player, Ads CMS, listener-account, notification, or VEC playback access.

## Local validation

```bash
cd social-factory-api
npm run check
npm test
```

## Deployment

The workflow `.github/workflows/deploy-social-factory-api-dev.yml` validates and deploys the isolated SAM stack. Merges to `main` affecting the Social Factory API or its workflow deploy automatically. Manual dispatch remains available.

The workflow verifies the exact IAM boundary, smoke-tests `GET /social/health`, and confirms that the protected YouTube status route reaches Secrets Manager and rejects a request without the Social Factory admin token.

The database migration is intentionally not applied by this deployment. Apply `migrations/20260727_social_factory_foundation_dev.sql` using a controlled database session with permission to create the `social_factory_dev` schema.
