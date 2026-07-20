#!/usr/bin/env bash
set -euo pipefail

API_ID="${API_ID:-d21fbe6u80}"
STAGE_NAME="${STAGE_NAME:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DEFAULT_RATE="${DEFAULT_RATE:-250}"
DEFAULT_BURST="${DEFAULT_BURST:-500}"

if [[ "${API_ID}" != "d21fbe6u80" ]]; then
  echo "Refusing to update unexpected API ID: ${API_ID}" >&2
  exit 1
fi

if [[ "${STAGE_NAME}" != "dev" ]]; then
  echo "Refusing to update non-DEV stage: ${STAGE_NAME}" >&2
  exit 1
fi

if [[ "${AWS_REGION}" != "us-east-1" ]]; then
  echo "Refusing to update unexpected AWS region: ${AWS_REGION}" >&2
  exit 1
fi

CURRENT_API_NAME="$(aws apigatewayv2 get-api \
  --api-id "${API_ID}" \
  --region "${AWS_REGION}" \
  --query 'Name' \
  --output text)"

CURRENT_STAGE="$(aws apigatewayv2 get-stage \
  --api-id "${API_ID}" \
  --stage-name "${STAGE_NAME}" \
  --region "${AWS_REGION}" \
  --query 'StageName' \
  --output text)"

if [[ "${CURRENT_STAGE}" != "dev" ]]; then
  echo "DEV stage validation failed." >&2
  exit 1
fi

echo "Applying general protection to ${CURRENT_API_NAME} (${API_ID}) stage ${CURRENT_STAGE}."
echo "Steady rate: ${DEFAULT_RATE} requests/second. Burst: ${DEFAULT_BURST}."

aws apigatewayv2 update-stage \
  --api-id "${API_ID}" \
  --stage-name "${STAGE_NAME}" \
  --region "${AWS_REGION}" \
  --default-route-settings "ThrottlingRateLimit=${DEFAULT_RATE},ThrottlingBurstLimit=${DEFAULT_BURST}" \
  >/dev/null

echo "DEV API Gateway throttling updated. Application-level account limits remain stricter."
