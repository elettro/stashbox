#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${STACK_NAME:=stashbox-social-api-dev}"
: "${SERVICE_ROLE_NAME:=stashbox-social-cloudformation-dev-role}"
: "${SERVICE_POLICY_NAME:=StashboxSocialCloudFormationDev}"
: "${WORKER_LOG_GROUP:=/aws/lambda/stashbox-social-publish-worker-dev}"
: "${REPORT_PATH:=deployment-reports/social-factory-scheduled-infra-repair.json}"

mkdir -p "$(dirname "${REPORT_PATH}")"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

# Validate the source that will be deployed. The scheduled queue is FIFO and
# the worker intentionally has no reserved concurrency in this AWS account.
grep -q 'QueueName: stashbox-social-publish-dev.fifo' social-factory-api/infrastructure/template.yaml
grep -q 'QueueName: stashbox-social-publish-dev-dlq.fifo' social-factory-api/infrastructure/template.yaml
grep -q 'FifoQueue: true' social-factory-api/infrastructure/template.yaml
grep -q "SqsParameters: { MessageGroupId: 'scheduled-publish' }" social-factory-api/schedule-publish.mjs
if grep -q 'ReservedConcurrentExecutions:' social-factory-api/infrastructure/template.yaml; then
  echo 'Reserved concurrency must remain unset for the scheduled worker.' >&2
  exit 1
fi

(
  cd social-factory-api
  npm install --omit=dev --no-audit --no-fund
  npm run check
  npm test
  sam validate --template-file infrastructure/template.yaml --lint
)

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

# Remove only the retained log group that CloudFormation does not own and that
# CloudWatch reports as containing zero stored bytes. The deployment identity
# intentionally lacks log-stream enumeration permission, so no broader read is
# required for this one known DEV rollback orphan.
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
  aws logs delete-log-group --log-group-name "${WORKER_LOG_GROUP}"
  ORPHAN_REMOVED=true
fi

# Fix the live scoped CloudFormation role so tag reads work on both log-group
# ARN forms. No broad account or production resources are added.
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
sleep 10

ARTIFACT_BUCKET="stashbox-social-deploy-${ACCOUNT_ID}-${AWS_REGION}"
if ! aws s3api head-bucket --bucket "${ARTIFACT_BUCKET}" 2>/dev/null; then
  aws s3api create-bucket --bucket "${ARTIFACT_BUCKET}" --region "${AWS_REGION}"
fi
aws s3api put-public-access-block \
  --bucket "${ARTIFACT_BUCKET}" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption \
  --bucket "${ARTIFACT_BUCKET}" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

(
  cd social-factory-api
  sam build --template-file infrastructure/template.yaml
)

set +e
(
  cd social-factory-api
  sam deploy \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --role-arn "${STACK_ROLE}" \
    --s3-bucket "${ARTIFACT_BUCKET}" \
    --s3-prefix "social-factory-api/${GITHUB_SHA}" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    --parameter-overrides EnvironmentName=dev AllowedOrigin=https://stashbox.com
) 2>&1 | tee /tmp/social-sam-deploy.log
DEPLOY_EXIT=${PIPESTATUS[0]}
set -e

VERIFY_EXIT=1
HEALTH_HTTP_STATUS=''
SCHEDULE_ROUTE_HTTP_STATUS=''
QUEUE_URL=''
QUEUE_ARN=''
DLQ_ARN=''
SCHEDULE_GROUP=''
WORKER_FUNCTION=''
BASE_URL=''

stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text 2>/dev/null
}

if [ "${DEPLOY_EXIT}" = '0' ]; then
  set +e
  (
    set -euo pipefail
    test "$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query 'Stacks[0].StackStatus' --output text)" = 'UPDATE_COMPLETE'

    WORKER_FUNCTION=$(stack_output SocialScheduledPublishWorkerFunctionName)
    QUEUE_URL=$(stack_output SocialPublishScheduleQueueUrl)
    QUEUE_ARN=$(stack_output SocialPublishScheduleQueueArn)
    DLQ_ARN=$(stack_output SocialPublishScheduleDeadLetterQueueArn)
    SCHEDULE_GROUP=$(stack_output SocialPublishScheduleGroupName)
    BASE_URL=$(stack_output SocialApiDevBaseUrl)

    test "${WORKER_FUNCTION}" = 'stashbox-social-publish-worker-dev'
    test "${QUEUE_ARN##*:}" = 'stashbox-social-publish-dev.fifo'
    test "${DLQ_ARN##*:}" = 'stashbox-social-publish-dev-dlq.fifo'
    test "${SCHEDULE_GROUP}" = 'stashbox-social-publish-dev'

    aws lambda get-function --function-name "${WORKER_FUNCTION}" >/tmp/social-worker.json
    QUEUE_ATTRIBUTES=$(aws sqs get-queue-attributes \
      --queue-url "${QUEUE_URL}" \
      --attribute-names QueueArn VisibilityTimeout RedrivePolicy SqsManagedSseEnabled FifoQueue ContentBasedDeduplication)
    echo "${QUEUE_ATTRIBUTES}" | jq -e --arg arn "${QUEUE_ARN}" --arg dlq "${DLQ_ARN}" '
      .Attributes.QueueArn == $arn and
      .Attributes.VisibilityTimeout == "960" and
      .Attributes.SqsManagedSseEnabled == "true" and
      .Attributes.FifoQueue == "true" and
      .Attributes.ContentBasedDeduplication == "true" and
      ((.Attributes.RedrivePolicy | fromjson).deadLetterTargetArn == $dlq) and
      ((.Attributes.RedrivePolicy | fromjson).maxReceiveCount == "5")
    ' >/dev/null

    MAPPING=$(aws lambda list-event-source-mappings \
      --function-name "${WORKER_FUNCTION}" \
      --event-source-arn "${QUEUE_ARN}" \
      --query 'EventSourceMappings[0]' \
      --output json)
    echo "${MAPPING}" | jq -e '
      .State == "Enabled" and
      .BatchSize == 1 and
      (.FunctionResponseTypes | index("ReportBatchItemFailures")) != null
    ' >/dev/null

    HEALTH_HTTP_STATUS=$(curl --silent --show-error --max-time 60 \
      -o /tmp/social-health.json -w '%{http_code}' "${BASE_URL}/social/health")
    test "${HEALTH_HTTP_STATUS}" = '200'
    jq -e '
      .ok == true and
      .environment == "dev" and
      .isolation.queueConfigured == true and
      .isolation.scheduledPublishingConfigured == true and
      .isolation.contentReviewSupported == true
    ' /tmp/social-health.json >/dev/null

    SCHEDULE_ROUTE_HTTP_STATUS=$(curl --silent --show-error --max-time 60 \
      -X POST -H 'Content-Type: application/json' -d '{}' \
      -o /tmp/social-schedule-unauthorized.json -w '%{http_code}' \
      "${BASE_URL}/social/review-items/render-test-12345678/schedule")
    test "${SCHEDULE_ROUTE_HTTP_STATUS}" = '401'
    jq -e '.ok == false and .error == "unauthorized"' /tmp/social-schedule-unauthorized.json >/dev/null

    printf '%s' "${WORKER_FUNCTION}" > /tmp/worker-function
    printf '%s' "${QUEUE_URL}" > /tmp/queue-url
    printf '%s' "${QUEUE_ARN}" > /tmp/queue-arn
    printf '%s' "${DLQ_ARN}" > /tmp/dlq-arn
    printf '%s' "${SCHEDULE_GROUP}" > /tmp/schedule-group
    printf '%s' "${BASE_URL}" > /tmp/base-url
    printf '%s' "${HEALTH_HTTP_STATUS}" > /tmp/health-status
    printf '%s' "${SCHEDULE_ROUTE_HTTP_STATUS}" > /tmp/schedule-route-status
  ) 2>&1 | tee /tmp/social-verify.log
  VERIFY_EXIT=${PIPESTATUS[0]}
  set -e
fi

STACK_STATUS_AFTER=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || true)
WORKER_FUNCTION=$(cat /tmp/worker-function 2>/dev/null || true)
QUEUE_URL=$(cat /tmp/queue-url 2>/dev/null || true)
QUEUE_ARN=$(cat /tmp/queue-arn 2>/dev/null || true)
DLQ_ARN=$(cat /tmp/dlq-arn 2>/dev/null || true)
SCHEDULE_GROUP=$(cat /tmp/schedule-group 2>/dev/null || true)
BASE_URL=$(cat /tmp/base-url 2>/dev/null || true)
HEALTH_HTTP_STATUS=$(cat /tmp/health-status 2>/dev/null || true)
SCHEDULE_ROUTE_HTTP_STATUS=$(cat /tmp/schedule-route-status 2>/dev/null || true)
DEPLOY_SUMMARY=$(tail -n 100 /tmp/social-sam-deploy.log | tail -c 12000 || true)
VERIFY_SUMMARY=$(tail -n 100 /tmp/social-verify.log 2>/dev/null | tail -c 12000 || true)
STATUS=failure
if [ "${DEPLOY_EXIT}" = '0' ] && [ "${VERIFY_EXIT}" = '0' ]; then
  STATUS=success
fi

jq -n \
  --arg status "${STATUS}" \
  --arg recorded_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --arg stack_status_before "${STACK_STATUS_BEFORE}" \
  --arg stack_status_after "${STACK_STATUS_AFTER}" \
  --arg stack_role "${STACK_ROLE}" \
  --arg deploy_exit "${DEPLOY_EXIT}" \
  --arg verify_exit "${VERIFY_EXIT}" \
  --arg worker_function "${WORKER_FUNCTION}" \
  --arg queue_url "${QUEUE_URL}" \
  --arg queue_arn "${QUEUE_ARN}" \
  --arg dlq_arn "${DLQ_ARN}" \
  --arg schedule_group "${SCHEDULE_GROUP}" \
  --arg base_url "${BASE_URL}" \
  --arg health_http_status "${HEALTH_HTTP_STATUS}" \
  --arg schedule_route_http_status "${SCHEDULE_ROUTE_HTTP_STATUS}" \
  --arg deploy_summary "${DEPLOY_SUMMARY}" \
  --arg verify_summary "${VERIFY_SUMMARY}" \
  --argjson orphan_removed "${ORPHAN_REMOVED}" '
  {
    status:$status,
    recorded_at:$recorded_at,
    repair:{
      stack_status_before:$stack_status_before,
      stack_status_after:$stack_status_after,
      stack_role:$stack_role,
      orphan_log_group_removed:$orphan_removed,
      service_role_log_arns_fixed:true
    },
    deployment:{exit_code:$deploy_exit,summary:$deploy_summary},
    verification:{
      exit_code:$verify_exit,
      worker_function:$worker_function,
      queue_url:$queue_url,
      queue_arn:$queue_arn,
      dead_letter_queue_arn:$dlq_arn,
      schedule_group:$schedule_group,
      base_url:$base_url,
      health_http_status:$health_http_status,
      protected_schedule_route_http_status:$schedule_route_http_status,
      summary:$verify_summary
    },
    publishing_triggered:false,
    production_changed:false
  }' > "${REPORT_PATH}"

git pull --rebase origin main
git add "${REPORT_PATH}"
git commit -m 'Record Social Factory scheduled infrastructure repair [skip ci]'
git push origin HEAD:main

test "${STATUS}" = 'success'
