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

### Core and YouTube

- `GET /social/health`
- `GET /social/youtube/oauth/start`
- `GET /social/youtube/oauth/callback`
- `GET /social/youtube/status`
- `POST /social/youtube/disconnect`
- `POST /social/uploads/presign`
- `POST /social/youtube/publish`

### Video Factory orchestration, Phase 1

- `GET /social/orchestration/candidates`
- `GET /social/orchestration/render-jobs`
- `POST /social/orchestration/render-jobs`
- `GET /social/orchestration/render-jobs/{jobId}`
- `POST /social/orchestration/render-jobs/{jobId}/launch`

All routes except the Google OAuth callback and public health route require the Social Factory `x-admin-token`. The Google callback is protected by a signed, expiring OAuth state value.

## YouTube publishing flow

1. Call `POST /social/uploads/presign` with the file name, MIME type, and byte size.
2. Upload the video directly to the returned private S3 URL using `PUT` and only the returned `required_headers`.
3. Call `POST /social/youtube/publish` without `confirm_upload` to validate the staged video, metadata, connection, and channel.
4. For a deliberately approved small test clip, call the publish route again with `confirm_upload: true`.

The public presign response intentionally returns only the headers the client must send. S3 metadata already included in the signed URL must not be duplicated by browser or PowerShell clients.

All direct test uploads are forced to YouTube privacy status `unlisted`. A caller cannot override this with `public` or `private` input.

The synchronous direct-upload path is intentionally capped at 25 MB. Larger videos can be staged and validated, but require the later asynchronous queue worker before they can be published safely.

## Video Factory orchestration, Phase 1

The orchestration client reaches the existing TRUE DEV Radio API through a strict HTTPS host and path allowlist. It has no direct database, Radio media-bucket, VEC bucket, or ECS permissions.

Phase 1 can:

- Read Song CMS records and rank eligible render candidates
- Create a Video Factory draft with safe social defaults
- List and inspect Video Factory jobs
- Validate a render launch without launching it
- Launch a render only when `confirm_render: true` is supplied
- Normalize completed jobs so later staging can identify output-ready renders

Default social render settings are 30 seconds, `9:16`, 30 fps, title overlays enabled, and approval required before launch.

Phase 1 does not yet transfer a completed render into the Social Factory staging bucket, generate final publishing copy, or publish automatically. Those remain explicit later phases.

### Protected Radio API bridge configuration

The existing configuration secret must preserve its current OAuth and Social Factory fields and add these two fields manually:

```json
{
  "radio_api_base_url": "https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev",
  "radio_api_admin_token": "EXISTING_PRIVATE_RADIO_DEV_ADMIN_TOKEN"
}
```

Do not replace the existing JSON object. Add the two fields to the current object. Do not place either admin token in source code, GitHub, screenshots, logs, or chat.

The bridge refuses any API host other than the exact TRUE DEV API Gateway host. It also refuses to run while `radio_api_admin_token` is absent or still set to a placeholder.

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

The configuration secret contains the Google OAuth client settings, the Social Factory admin token, and the manually added protected Radio API bridge fields.

The token secret is written only by the isolated Social Factory Lambda after Google authorization and token refresh. Do not place OAuth credentials, access tokens, refresh tokens, or either admin token in source code, GitHub, screenshots, or Lambda environment variables.

## Execution-role boundary

The Lambda execution role allows only:

- CloudWatch log creation and writes
- `DescribeSecret` and `GetSecretValue` for the two YouTube OAuth secrets
- `PutSecretValue` for the YouTube token secret only
- `GetObject` and `PutObject` for the dedicated publish bucket's `incoming/*` prefix only

The Video Factory bridge is an authenticated HTTPS request to the existing TRUE DEV API. The Social Factory Lambda still has no direct database, VPC, ECS, main-radio Lambda, player, Ads CMS, listener-account, notification, VEC playback, or Radio media-bucket permissions.

## Local validation

```bash
cd social-factory-api
npm run check
npm test
```

The test suite covers authorization, upload validation, the corrected S3 client contract, private staging URLs, OAuth token refresh, validation-only behavior, the 25 MB direct-test limit, forced unlisted publishing, song-candidate ranking, bridge allowlisting, render-draft defaults, and explicit render confirmation.

## Deployment

The workflow `.github/workflows/deploy-social-factory-api-dev.yml` validates and deploys the isolated SAM stack. Merges to `main` affecting the Social Factory API or its workflow deploy automatically. Manual dispatch remains available.

The workflow verifies the exact Lambda IAM policies, secret boundaries, bucket encryption, public-access block, ownership controls, lifecycle policy, browser CORS rule, health response, and protected publishing routes. It does not perform a real YouTube upload or launch a Video Factory render during deployment.

The database migration is intentionally not applied by this deployment. Apply `migrations/20260727_social_factory_foundation_dev.sql` using a controlled database session with permission to create the `social_factory_dev` schema.
