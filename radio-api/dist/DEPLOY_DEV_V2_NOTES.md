# DEV v2 Lambda package notes

Do not commit the generated zip file. `radio-api/dist/*.zip` is ignored and should remain a local or CI-only artifact.

Build `dist/stashbox-radio-api-dev-v2.zip` locally or in an approved CI environment where npm registry access works.

Codex could not install `pg` because npm registry access was blocked in its environment with HTTP 403, so any zip produced there is not reliable.

The DEV Lambda must not be deployed until `pg` exists inside `node_modules` in the zip.

No AWS resources should be changed by the packaging process. Do not deploy from this repository task, and do not change Lambda, API Gateway, RDS, or S3 as part of packaging.
