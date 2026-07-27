# Stashbox Social Factory API

This folder contains the isolated Social Factory backend. It does not extend or wrap `radio-api/index.mjs`.

## Current foundation

- Lambda function: `stashbox-social-api-dev`
- API route: `GET /social/health`
- Runtime: Node.js 22
- Infrastructure: AWS SAM
- AWS region: `us-east-1`
- Database migration target: `social_factory_dev`
- Execution role: CloudWatch Logs only

The initial Lambda has no database variables, VPC attachment, S3 policy, SQS policy, Secrets Manager policy, or access to the existing Stashbox Radio Lambda.

## Local validation

```bash
cd social-factory-api
npm run check
npm test
```

## Deployment

The GitHub workflow `.github/workflows/deploy-social-factory-api-dev.yml` validates and deploys the isolated SAM stack. Merges to `main` affecting the Social Factory API or its workflow deploy automatically. Manual dispatch remains available.

The workflow verifies the CloudWatch-only IAM boundary and smoke-tests the live `GET /social/health` endpoint.

The migration is intentionally not applied by the health deployment. Apply `migrations/20260727_social_factory_foundation_dev.sql` using a controlled database session with permission to create the `social_factory_dev` schema.

## Next build step

After the health endpoint passes in AWS, add the YouTube OAuth connection routes and a narrowly scoped Secrets Manager policy. Do not add those permissions to the current health-only role until the OAuth implementation is ready.
