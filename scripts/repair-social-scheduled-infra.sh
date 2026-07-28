#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${STACK_NAME:=stashbox-social-api-dev}"
: "${SERVICE_ROLE_NAME:=stashbox-social-cloudformation-dev-role}"
: "${SERVICE_POLICY_NAME:=StashboxSocialCloudFormationDev}"
: "${WORKER_LOG_GROUP:=/aws/lambda/stashbox-social-publish-worker-dev}"
: "${DEPLOY_WORKFLOW:=deploy-social-factory-api-dev.yml}"
: "${REPORT_PATH:=deployment-reports/social-factory-scheduled-infra-repair.json}"
: "${REPOSITORY:?REPOSITORY is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

mkdir -p "$(dirname "${REPORT_PATH}")"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

python -m py_compile scripts/apply-social-scheduled-fixes.py
python scripts/apply-social-scheduled-fixes.py

git add \
  .github/workflows/deploy-social-factory-api-dev.yml \
  .github/workflows/bootstrap-social-factory-cloudformation-role.yml
if ! git diff --cached --quiet; then
  git commit -m 'Fix Social Factory scheduled deployment contract [skip ci]'
  git pull --rebase origin main
  git push origin HEAD:main
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_STATUS_BEFORE=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].StackStatus' \
  --output text)
STACK_ROLE=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].RoleARN' \
  --output text)
EXPECTED_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/${SERVICE_ROLE_NAME}"
test "${STACK_ROLE}" = "${EXPECTED_ROLE}"

STACK_OWNS_LOG_GROUP=$(aws cloudformation list-stack-resources \
  --stack-name "${STACK_NAME}" \
  --query "length(StackResourceSummaries[?PhysicalResourceId=='${WORKER_LOG_GROUP}'])" \
  --output text)
test "${STACK_OWNS_LOG_GROUP}" = '0'

ORPHAN_REMOVED=false
LOG_GROUP=$(aws logs describe-log-groups \
  --log-group-name-prefix "${WORKER_LOG_GROUP}" \
  --query "logGroups[?logGroupName=='${WORKER_LOG_GROUP}'] | [0]" \
  --output json)
if [ "${LOG_GROUP}" != 'null' ] && [ -n "${LOG_GROUP}" ]; then
  test "$(printf '%s' "${LOG_GROUP}" | jq -r '.storedBytes // 0')" = '0'
  test "$(aws logs describe-log-streams \
    --log-group-name "${WORKER_LOG_GROUP}" \
    --max-items 1 \
    --query 'length(logStreams)' \
    --output text)" = '0'
  aws logs delete-log-group --log-group-name "${WORKER_LOG_GROUP}"
  ORPHAN_REMOVED=true
fi

aws iam get-role-policy \
  --role-name "${SERVICE_ROLE_NAME}" \
  --policy-name "${SERVICE_POLICY_NAME}" \
  --query PolicyDocument \
  --output json > /tmp/social-cfn-policy.json
BASE_LOG_ARN="arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/stashbox-social-*"
STREAM_LOG_ARN="${BASE_LOG_ARN}:*"
jq --arg base "${BASE_LOG_ARN}" --arg streams "${STREAM_LOG_ARN}" '
  (.Statement[] | select(.Sid == "ManageSocialFactoryLogs").Resource) = [$base, $streams]
' /tmp/social-cfn-policy.json > /tmp/social-cfn-policy-fixed.json
aws iam put-role-policy \
  --role-name "${SERVICE_ROLE_NAME}" \
  --policy-name "${SERVICE_POLICY_NAME}" \
  --policy-document file:///tmp/social-cfn-policy-fixed.json

LIVE_POLICY=$(aws iam get-role-policy \
  --role-name "${SERVICE_ROLE_NAME}" \
  --policy-name "${SERVICE_POLICY_NAME}" \
  --query PolicyDocument \
  --output json)
echo "${LIVE_POLICY}" | jq -e --arg base "${BASE_LOG_ARN}" --arg streams "${STREAM_LOG_ARN}" '
  ([.Statement[] | select(.Sid == "ManageSocialFactoryLogs")][0]) as $logs |
  $logs.Effect == "Allow" and
  (($logs.Action | if type == "array" then . else [.] end) | index("logs:*")) != null and
  (($logs.Resource | if type == "array" then . else [.] end) | sort) == ([$base, $streams] | sort)
' >/dev/null
sleep 10

DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run "${DEPLOY_WORKFLOW}" --repo "${REPOSITORY}" --ref main
RUN_ID=''
for attempt in $(seq 1 60); do
  RUN_ID=$(gh run list \
    --repo "${REPOSITORY}" \
    --workflow "${DEPLOY_WORKFLOW}" \
    --event workflow_dispatch \
    --limit 10 \
    --json databaseId,createdAt \
    --jq "map(select(.createdAt >= \"${DISPATCHED_AT}\"))[0].databaseId // empty")
  [ -n "${RUN_ID}" ] && break
  sleep 5
done

CONCLUSION='dispatch_failed'
printf '%s\n' '{}' > /tmp/social-deploy-run.json
: > /tmp/social-deploy-failed.log
if [ -n "${RUN_ID}" ]; then
  for attempt in $(seq 1 480); do
    STATUS=$(gh run view "${RUN_ID}" --repo "${REPOSITORY}" --json status --jq '.status')
    [ "${STATUS}" = 'completed' ] && break
    sleep 10
  done
  gh run view "${RUN_ID}" --repo "${REPOSITORY}" \
    --json databaseId,status,conclusion,createdAt,updatedAt,url,jobs > /tmp/social-deploy-run.json
  CONCLUSION=$(jq -r '.conclusion // "unknown"' /tmp/social-deploy-run.json)
  if [ "${CONCLUSION}" != 'success' ]; then
    gh run view "${RUN_ID}" --repo "${REPOSITORY}" --log-failed > /tmp/social-deploy-failed.log 2>/dev/null || true
  fi
fi

STACK_STATUS_AFTER=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || true)
FAILURE_SUMMARY=$(tail -n 120 /tmp/social-deploy-failed.log | tail -c 12000 || true)
RECORDED_AT=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

jq -n \
  --arg recorded_at "${RECORDED_AT}" \
  --arg conclusion "${CONCLUSION}" \
  --arg stack_status_before "${STACK_STATUS_BEFORE}" \
  --arg stack_status_after "${STACK_STATUS_AFTER}" \
  --arg stack_role "${STACK_ROLE}" \
  --arg failure_summary "${FAILURE_SUMMARY}" \
  --argjson orphan_removed "${ORPHAN_REMOVED}" \
  --slurpfile run /tmp/social-deploy-run.json '
  {
    status:(if $conclusion == "success" then "success" else "failure" end),
    recorded_at:$recorded_at,
    source_contract_fixed:true,
    repair:{
      stack_status_before:$stack_status_before,
      stack_role:$stack_role,
      orphan_log_group_removed:$orphan_removed,
      service_role_log_arns_fixed:true
    },
    deployment:{
      conclusion:$conclusion,
      run_id:($run[0].databaseId // null),
      url:($run[0].url // null),
      stack_status_after:$stack_status_after,
      steps:([$run[0].jobs[]?.steps[]? | {name,conclusion,status}]),
      failure_summary:$failure_summary
    },
    production_changed:false,
    publishing_triggered:false
  }' > "${REPORT_PATH}"

git pull --rebase origin main
git add "${REPORT_PATH}"
git commit -m 'Record Social Factory scheduled infrastructure repair [skip ci]'
git push origin HEAD:main

test "${CONCLUSION}" = 'success'
