# API Repair Playbook

Use for Lambda, API Gateway, PostgreSQL, S3, CORS, request validation, and environment routing.

## Fast checks

1. Confirm DEV versus PROD endpoint and function.
2. Capture HTTP status and full response body.
3. Confirm request method, route, query/body fields, and auth headers.
4. Check Lambda logs/runtime errors when available.
5. Confirm `PGSCHEMA`, S3 bucket/region, and environment variables.
6. Verify database row identity and expected record count.
7. Check CORS only after confirming the backend route itself works.

## Common failure patterns

- Frontend points at the wrong environment.
- Route exists but validation rejects a new field or upload purpose.
- Lambda reads the wrong schema.
- S3 bucket/region mismatch.
- API succeeds but frontend unwraps the response incorrectly.
- Protected route fails because admin token/header is missing.

## Regression checks

- Direct API request.
- Browser request.
- DEV/PROD isolation.
- Database write then read-back.
- S3 asset accessibility.
- Error responses remain descriptive enough for diagnosis.