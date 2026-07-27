# Stashbox Social Factory DEV Deployment Policy

## Policy

The customer-managed policy is named:

`StashboxSocialFactoryDevDeploy`

Its source of truth is:

`aws-policies/StashboxSocialFactoryDevDeploy.json`

It must remain directly attached to:

`stashbox-github-actions-dev`

Keep the user's existing policies attached. This policy adds only the permissions required to deploy and verify the isolated Social Factory DEV stack.

## Updating the policy

When the source JSON changes:

1. Open AWS IAM.
2. Open **Policies**.
3. Open `StashboxSocialFactoryDevDeploy`.
4. Choose **Edit**.
5. Select the JSON editor.
6. Replace the complete policy with `StashboxSocialFactoryDevDeploy.json`.
7. Save the changes as the default policy version.

## Current scope

The policy is limited to:

- CloudFormation stack `stashbox-social-api-dev`
- Lambda `stashbox-social-api-dev`
- IAM role `stashbox-social-api-dev-role`
- Social Factory API Gateway resources in `us-east-1`
- Log group `/aws/lambda/stashbox-social-api-dev`
- Artifact bucket `stashbox-social-deploy-656260749296-us-east-1`
- Secret `stashbox/social-factory/dev/youtube-oauth/config`
- Secret `stashbox/social-factory/dev/youtube-oauth/tokens`
- Random-password generation used to create the isolated Social Factory admin token

The two secret permissions are restricted to the named YouTube OAuth secrets. The Lambda execution role receives a narrower policy than the deployment user: it may read both secrets and write only the token secret.

## Excluded resources

The deployment policy does not grant access to:

- `stashbox-radio-api-dev-v2`
- Production Lambda functions
- Existing player resources
- Song playback
- Ads CMS
- Listener accounts
- Notifications
- Existing VEC playback
- Radio media buckets
- Existing radio database resources

## Deployment verification

The deployment workflow verifies:

- The CloudFormation stack reaches a complete state
- The expected Social Factory Lambda is deployed
- No managed policies are attached to its execution role
- The logs policy contains only the approved CloudWatch actions
- The OAuth policy reads only the two YouTube secrets
- Only the token secret can be written by the Lambda
- `GET /social/health` returns the expected isolated-service state
- The protected YouTube status route reaches Secrets Manager and returns `401` without the Social Factory admin token
