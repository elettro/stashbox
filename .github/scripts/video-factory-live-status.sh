#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${LAMBDA_NAME:=stashbox-radio-api-dev-v2}"
: "${API_BASE:=https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN is required}"

CONFIG=$(aws lambda get-function-configuration --function-name "${LAMBDA_NAME}" --output json)
TIMEOUT=$(jq -r '.Timeout' <<<"${CONFIG}")
VPC_ID=$(jq -r '.VpcConfig.VpcId // empty' <<<"${CONFIG}")
LAMBDA_SG=$(jq -r '.VpcConfig.SecurityGroupIds | join(",")' <<<"${CONFIG}")
VF_CLUSTER=$(jq -r '.Environment.Variables.VIDEO_FACTORY_ECS_CLUSTER // empty' <<<"${CONFIG}")
VF_BUCKET=$(jq -r '.Environment.Variables.VIDEO_FACTORY_RENDER_BUCKET // empty' <<<"${CONFIG}")

echo "LAMBDA timeout=${TIMEOUT}s vpc=${VPC_ID} sg=${LAMBDA_SG}"
echo "VIDEO_FACTORY cluster=${VF_CLUSTER} bucket=${VF_BUCKET}"

while IFS= read -r SUBNET_ID; do
  [ -n "${SUBNET_ID}" ] || continue
  ROUTE_TABLE=$(aws ec2 describe-route-tables \
    --filters "Name=association.subnet-id,Values=${SUBNET_ID}" \
    --query 'RouteTables[0].RouteTableId' --output text)
  if [ -z "${ROUTE_TABLE}" ] || [ "${ROUTE_TABLE}" = "None" ]; then
    ROUTE_TABLE=$(aws ec2 describe-route-tables \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=association.main,Values=true" \
      --query 'RouteTables[0].RouteTableId' --output text)
  fi
  DEFAULT_ROUTE=$(aws ec2 describe-route-tables \
    --route-table-ids "${ROUTE_TABLE}" \
    --query 'RouteTables[0].Routes[?DestinationCidrBlock==`0.0.0.0/0`][0].{GatewayId:GatewayId,NatGatewayId:NatGatewayId,State:State}' \
    --output json)
  echo "SUBNET ${SUBNET_ID} route_table=${ROUTE_TABLE} default_route=${DEFAULT_ROUTE}"
done < <(jq -r '.VpcConfig.SubnetIds[]?' <<<"${CONFIG}")

echo "RECENT_LAMBDA_TIMEOUTS"
START_MS=$(( $(date +%s) * 1000 - 1200000 ))
aws logs filter-log-events \
  --log-group-name "/aws/lambda/${LAMBDA_NAME}" \
  --start-time "${START_MS}" \
  --filter-pattern '"Task timed out"' \
  --query 'events[].message' --output text 2>/dev/null | tail -n 12 || true

call_api() {
  local PATHNAME="$1"
  local BODY_FILE
  BODY_FILE=$(mktemp)
  local START END STATUS
  START=$(date +%s%3N)
  STATUS=$(curl --max-time 30 --silent --show-error \
    -H 'accept: application/json' \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    -o "${BODY_FILE}" -w '%{http_code}' \
    "${API_BASE}${PATHNAME}" || printf '000')
  END=$(date +%s%3N)
  echo "API ${PATHNAME} status=${STATUS} elapsed_ms=$((END-START)) body=$(tr '\n' ' ' < "${BODY_FILE}" | head -c 600)"
  rm -f "${BODY_FILE}"
}

call_api '/admin/video-factory/infrastructure'
call_api '/admin/video-factory/jobs?limit=250'
