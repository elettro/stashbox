# TRUE DEV Lambda deployment automation

This runbook explains the manual GitHub Actions workflow that deploys code only to the TRUE DEV Lambda and then runs the TRUE DEV smoke test.

## Workflow

- Workflow name: `Deploy TRUE DEV Lambda`
- Workflow file: `.github/workflows/deploy-true-dev-lambda.yml`
- Trigger: manual `workflow_dispatch` only
- API smoke-test base URL: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev`
- Lambda target: `stashbox-radio-api-dev-v2`

The workflow replaces the previous manual ZIP upload process for the TRUE DEV Lambda. Use this workflow instead of building and uploading a ZIP by hand.

## Add the required GitHub secrets

In GitHub:

1. Open the repository.
2. Go to **Settings**.
3. Go to **Secrets and variables**.
4. Select **Actions**.
5. Add or update these repository secrets:

| Secret | Expected value or purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Access key for an IAM principal allowed to update only the TRUE DEV Lambda code. |
| `AWS_SECRET_ACCESS_KEY` | Secret access key for the same IAM principal. |
| `AWS_REGION` | Must be `us-east-1`. |
| `TRUE_DEV_LAMBDA_FUNCTION_NAME` | Must be `stashbox-radio-api-dev-v2`. |
| `STASHBOX_DEV_ADMIN_TOKEN` | DEV-only admin token used by the smoke test. |

Do not commit secret values to the repository. Keep all credentials and tokens in GitHub Secrets.

## How to run Deploy TRUE DEV Lambda

1. Open the repository in GitHub.
2. Select the **Actions** tab.
3. Choose **Deploy TRUE DEV Lambda**.
4. Select **Run workflow**.
5. Confirm the branch you want to deploy from.
6. Start the workflow and watch every step complete.

The run should validate the target function name, syntax-check the Lambda, install runtime dependencies, build a ZIP from `radio-api`, update the Lambda code, wait for the update to finish, and then run the TRUE DEV smoke test.

## What the workflow deploys

The workflow deploys only the packaged contents of `radio-api` to this exact Lambda function:

```text
stashbox-radio-api-dev-v2
```

It uses `aws lambda update-function-code`, so it updates Lambda code only. It does not update Lambda configuration.

## What the workflow refuses to deploy

The workflow fails immediately unless `TRUE_DEV_LAMBDA_FUNCTION_NAME` exactly equals:

```text
stashbox-radio-api-dev-v2
```

It is manual-only and has no push, pull request, schedule, or release trigger. It does not modify RDS schemas. It does not modify S3 buckets or objects. It does not update Lambda environment variables, memory, timeout, IAM roles, networking, or other configuration.

## Smoke test after deploy

After the Lambda code update completes, the workflow runs:

```sh
node radio-api/scripts/smoke-test-true-dev.mjs
```

with this environment:

```text
TRUE_DEV_API_BASE=https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
ADMIN_TOKEN=${{ secrets.STASHBOX_DEV_ADMIN_TOKEN }}
```

The smoke test must pass for the workflow to pass. It validates the TRUE DEV API paths used by the current TRUE DEV stack, including songs, dashboard summary, ads admin, and visual folders checks.

## If the smoke test fails

1. Treat the deployment as failed.
2. Do not promote or reuse the ZIP anywhere else.
3. Review the failed smoke-test output in the GitHub Actions log.
4. Check whether the failure is caused by code, missing dependencies, an invalid DEV admin token, or a TRUE DEV service outage.
5. Fix the issue on a branch and rerun **Deploy TRUE DEV Lambda** manually.
6. If needed, redeploy the last known-good commit to `stashbox-radio-api-dev-v2` with the same workflow.

Do not change RDS schema, S3 resources, or Lambda configuration as part of this workflow recovery unless a separate reviewed operations task explicitly approves that work.
