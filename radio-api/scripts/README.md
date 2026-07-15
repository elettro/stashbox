# Stashbox Radio scripts

This directory is reserved for future operator-run helper scripts for the radio API.

For the True DEV Backend v2 preparation task, no executable AWS script is provided on purpose. The implementation must be performed manually from the runbook so that no Lambda, API Gateway, S3, or RDS resources are created accidentally from this repository.

Allowed future script categories:

- Local packaging helpers that only build an artifact from `radio-api/index.mjs`.
- Local validation helpers such as syntax checks or archive inspection.
- SQL template generators that print statements without connecting to RDS.

Disallowed in this preparation phase:

- Scripts that call `aws lambda create-function`, `aws apigatewayv2 create-api`, `aws s3api create-bucket`, or any RDS-changing command.
- Scripts that connect to production or DEV databases.
- Scripts that mutate front-end production files.

See `radio-api/docs/TRUE_DEV_IMPLEMENTATION_RUNBOOK.md` for the exact manual implementation sequence to run later.
