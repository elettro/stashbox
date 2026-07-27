# Stashbox Social Factory DEV Deployment Policy

## Current blocker

The GitHub Actions IAM user `stashbox-github-actions-dev` authenticated and reached CloudFormation, but the Social Factory stack failed because the user lacks:

- `lambda:CreateFunction`
- `lambda:DeleteFunction`

The failed stack is currently `stashbox-social-api-dev` in `ROLLBACK_FAILED`.

## Policy to add

Create a customer-managed AWS IAM policy named:

`StashboxSocialFactoryDevDeploy`

Use the JSON in:

`aws-policies/StashboxSocialFactoryDevDeploy.json`

Attach the policy to this IAM user:

`stashbox-github-actions-dev`

Keep the user's existing policies attached. This policy adds only the permissions required to deploy and verify the isolated Social Factory DEV foundation.

## AWS Console steps

1. Open IAM.
2. Open Policies.
3. Choose Create policy.
4. Select JSON.
5. Paste the complete contents of `StashboxSocialFactoryDevDeploy.json`.
6. Name it `StashboxSocialFactoryDevDeploy`.
7. Create the policy.
8. Open IAM user `stashbox-github-actions-dev`.
9. Choose Add permissions.
10. Attach `StashboxSocialFactoryDevDeploy`.

## Scope

The policy is limited to:

- CloudFormation stack `stashbox-social-api-dev`
- Lambda `stashbox-social-api-dev`
- IAM role `stashbox-social-api-dev-role`
- The Social Factory HTTP API resources in `us-east-1`
- Log group `/aws/lambda/stashbox-social-api-dev`
- Artifact bucket `stashbox-social-deploy-656260749296-us-east-1`

It does not grant access to:

- `stashbox-radio-api-dev-v2`
- Production Lambda functions
- Existing player resources
- Song playback
- Ads CMS
- Listener accounts
- Notifications
- Existing VEC playback
- Radio media buckets

## After attachment

The next deployment must delete the failed `stashbox-social-api-dev` stack, wait for deletion, recreate the isolated stack, verify the execution-role boundary, and smoke-test `GET /social/health`.
