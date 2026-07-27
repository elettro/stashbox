# Stashbox Social Factory API

This folder contains the isolated Social Factory backend. It does not extend or wrap `radio-api/index.mjs`.

## DEV service

- Lambda function: `stashbox-social-api-dev`
- Runtime: Node.js 22
- Infrastructure: AWS SAM
- AWS region: `us-east-1`
- Database migration target: `social_factory_dev`
- Connected YouTube channel: configured through OAuth, not source code

## Routes

- `GET /social/health`
- `GET /social/youtube/oauth/start`
- `GET /social/youtube/oauth/callback`
- `GET /social/youtube/status`
- `POST /social/youtube/disconnect`
- `POST /social/uploads/presign`
- `POST /social/youtube/publish`

The OAuth start, status, disconnect, upload-presign, and publish routes require the Social Factory `x-admin-token`. The Google callback is protected by a signed, expiring OAuth state value.

## YouTube publishing flow

1. Call `POST /social/uploads/presign` with the file name, MIME type, and byte size.
2. Upload the video directly to the returned private S3 URL using `PUT` and the returned required headers.
3. Call `POST /social/youtube/publish` without `confirm_upload` to validate the staged video, metadata, connection, and channel.
4. For a deliberately approved small test clip, call the publish route again with `confirm_upload: true`.

All direct test uploads are forced to YouTube privacy status `unlisted`. A caller cannot override this with `public` or `private` input.

The synchronous direct-upload path is intentionally capped at 25 MB. Larger videos can be staged and validated, but require the later asynchronous queue worker before they can be published safely.

## Private staging bucket

The stack creates:

`stashbox-social-publish-656260749296-us-east-1`

The bucket:

- Blocks all public access
- Uses AES-256 server-side encryption
- Uses bucket-owner-enforced object ownership
- Allows browser `PUT` uploads only from `https://stashbox.com`
- Expires `incoming/` staging objects after seven days
- Aborts incomplete multipart uploads after one day

The Lambda can read and write only `incoming/*` in this dedicated Social Factory bucket. It has no access to existing Radio media buckets.

## Secrets

The stack maintains two dedicated Secrets Manager secrets:

- `stashbox/social-factory/dev/youtube-oauth/config`
- `stashbox/social-factory/dev/youtube-oauth/tokens`

The configuration secret contains:

```json
{
  "client_id": "GOOGLE_CLIENT_ID",
  "client_secret": "GOOGLE_CLIENT_SECRET",
  "success_redirect_uri": "https://stashbox.com",
  "admin_token": "private-generated-value"
}
```

The token secret is written only by the isolated Social Factory Lambda after Google authorization and token refresh. Do not place OAuth credentials, access tokens, refresh tokens, or the admin token in source code, GitHub, screenshots, or Lambda environment variables.

## Execution-role boundary

The Lambda execution role allows only:

- CloudWatch log creation and writes
- `DescribeSecret` and `GetSecretValue` for the two YouTube OAuth secrets
- `PutSecretValue` for the YouTube token secret only
- `GetObject` and `PutObject` for the dedicated publish bucket's `incoming/*` prefix only

It has no database, VPC, SQS, main-radio Lambda, player, Ads CMS, listener-account, notification, VEC playback, or Radio media-bucket access.

## Local validation

```bash
cd social-factory-api
npm run check
npm test
```

The test suite covers authorization, upload validation, private staging URLs, OAuth token refresh, validation-only behavior, the 25 MB direct-test limit, and forced unlisted publishing.

## Deployment

The workflow `.github/workflows/deploy-social-factory-api-dev.yml` validates and deploys the isolated SAM stack. Merges to `main` affecting the Social Factory API or its workflow deploy automatically. Manual dispatch remains available.

The workflow verifies the exact Lambda IAM policies, secret boundaries, bucket encryption, public-access block, ownership controls, lifecycle policy, browser CORS rule, health response, and protected publishing routes. It does not perform a real YouTube upload during deployment.

The database migration is intentionally not applied by this deployment. Apply `migrations/20260727_social_factory_foundation_dev.sql` using a controlled database session with permission to create the `social_factory_dev` schema.
