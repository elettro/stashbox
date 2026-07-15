# DEV v2 Lambda package notes

Use GitHub Actions to build the DEV Lambda deployment zip from the cloud GitHub repository.

Run the manual **Build Radio API DEV v2** workflow in GitHub Actions, then download the `stashbox-radio-api-dev-v2` artifact from that Actions run.

Do not commit the generated zip file. `radio-api/dist/*.zip` is ignored and should remain a local or CI-only artifact.

Upload the downloaded `stashbox-radio-api-dev-v2.zip` file manually to the AWS Lambda DEV function only after confirming it contains `node_modules/pg`.

No AWS resources should be changed by the packaging process. Do not deploy from this repository task, and do not change Lambda, API Gateway, RDS, or S3 as part of packaging.
