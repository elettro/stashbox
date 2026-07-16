# TRUE DEV Lambda Deployment Automation Plan

## 1. Purpose

Replace the current manual Lambda ZIP download/upload process with a safe, manual GitHub Actions deployment for the TRUE DEV radio API Lambda.

This plan is documentation-only. It does not add a deploy workflow, change infrastructure, modify database schema, or change S3 resources.

## 2. Target

The only deployment target for this automation is the TRUE DEV Lambda function:

```text
stashbox-radio-api-dev-v2
```

Validated TRUE DEV stack context:

- DEV API Gateway: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`
- DEV Lambda: `stashbox-radio-api-dev-v2`
- DEV DB schema: `radio_dev`
- DEV S3 bucket: `stashbox-radio-media-dev-us-east-1`
- TRUE DEV Smoke Test workflow currently validates:
  - `/radio/songs`
  - `/dashboard/summary`
  - `/admin/ads`
  - `/admin/visuals/folders`

## 3. Required GitHub Secrets

The manual deploy workflow must use GitHub Actions secrets only. No AWS secret values may be committed to the repository.

Required repository secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
TRUE_DEV_LAMBDA_FUNCTION_NAME
```

## 4. Recommended Secret Values

Recommended non-sensitive values:

```text
AWS_REGION=us-east-1
TRUE_DEV_LAMBDA_FUNCTION_NAME=stashbox-radio-api-dev-v2
```

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must come from an IAM principal scoped to the minimum permissions needed for this DEV-only deployment.

## 5. Required IAM Permissions

The AWS principal used by GitHub Actions needs only the Lambda permissions required to inspect and update the TRUE DEV Lambda package.

Required for the initial deployment workflow:

```text
lambda:UpdateFunctionCode
lambda:GetFunction
lambda:GetFunctionConfiguration
```

Optional only if the workflow later needs to modify Lambda settings such as environment variables, runtime, handler, timeout, or memory:

```text
lambda:UpdateFunctionConfiguration
```

Optional only if a future workflow step needs to create or write CloudWatch Logs directly:

```text
logs:CreateLogGroup
logs:CreateLogStream
logs:PutLogEvents
```

Recommended IAM resource scope:

```text
arn:aws:lambda:us-east-1:<AWS_ACCOUNT_ID>:function:stashbox-radio-api-dev-v2
```

Replace `<AWS_ACCOUNT_ID>` with the AWS account ID that owns the TRUE DEV Lambda. The workflow should verify the target function name before any deployment command runs.

## 6. Safety Rules

Any future workflow must follow these safety rules:

- The workflow must use `workflow_dispatch` only.
- The workflow must not run automatically on push, pull request, schedule, or tag events.
- The workflow must print the target Lambda function name before deployment.
- The workflow must fail if `TRUE_DEV_LAMBDA_FUNCTION_NAME` is not exactly `stashbox-radio-api-dev-v2`.
- The workflow must run `node --check radio-api/index.mjs` before deployment.
- The workflow must build the Lambda ZIP from `radio-api` only.
- The workflow must run the TRUE DEV Smoke Test after deployment.
- The workflow must never reference any non-DEV Lambda function.
- The workflow must never reference the `radio` schema directly.
- The workflow must not hardcode AWS credentials or secrets.
- The workflow must not modify RDS schema.
- The workflow must not modify S3 buckets or S3 objects.

## 7. Proposed Workflow File

Proposed future workflow path:

```text
.github/workflows/deploy-true-dev-lambda.yml
```

This file should not be created until this plan is reviewed and the required GitHub secrets and IAM permissions are confirmed.

## 8. Proposed Workflow Steps

A future manual deployment workflow should perform these steps in order:

1. Check out the repository.
2. Set up Node.js 22.
3. Install production dependencies inside `radio-api` if `radio-api/package.json` requires packaged runtime dependencies.
4. Run syntax validation:

   ```bash
   node --check radio-api/index.mjs
   ```

5. Create the Lambda ZIP from the `radio-api` directory only.
6. Validate the function target name before configuring AWS credentials or deploying:

   ```bash
   test "$TRUE_DEV_LAMBDA_FUNCTION_NAME" = "stashbox-radio-api-dev-v2"
   ```

7. Configure AWS credentials from GitHub Secrets.
8. Run `aws lambda get-function` or `aws lambda get-function-configuration` against `stashbox-radio-api-dev-v2` to confirm the function exists in the selected account and region.
9. Run `aws lambda update-function-code` for `stashbox-radio-api-dev-v2`.
10. Wait for the function update to complete.
11. Run the TRUE DEV Smoke Test workflow or equivalent smoke test commands against the TRUE DEV API Gateway.

## 9. Manual GitHub UI Steps

After review and before creating the workflow, configure repository secrets:

1. Open the GitHub repository.
2. Go to **Settings**.
3. Go to **Secrets and variables**.
4. Go to **Actions**.
5. Add the required AWS secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `TRUE_DEV_LAMBDA_FUNCTION_NAME`
6. After the workflow is created in a later change, go to **Actions**.
7. Select **Deploy TRUE DEV Lambda**.
8. Select **Run workflow**.

## 10. Risk Notes

- Wrong Lambda function name is the biggest risk.
- Wrong AWS account is the second biggest risk.
- Missing `pg` or other production dependencies in the ZIP can break runtime execution.
- A post-deploy TRUE DEV Smoke Test helps catch API failures after deployment.
- A manual-only workflow avoids accidental deployment from normal code pushes.
- IAM permissions should be scoped to the single TRUE DEV Lambda function ARN whenever possible.

## Proposed Next Codex Step

After this plan is reviewed and the GitHub secrets/IAM permissions are confirmed, create `.github/workflows/deploy-true-dev-lambda.yml` as a manual-only workflow that implements the safety checks above before running `aws lambda update-function-code`.
