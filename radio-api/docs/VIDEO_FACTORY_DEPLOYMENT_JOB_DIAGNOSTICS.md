# Video Factory Deployment Job Diagnostics

Job ID: 88198005005

Relevant failure lines:
```text
2026-07-19T13:27:14.6634692Z ##[group]GITHUB_TOKEN Permissions
2026-07-19T13:30:15.5641837Z aws: [ERROR]: Failed to create/update the stack. Run the following command
```

Final log lines:
```text
2026-07-19T13:27:37.8520369Z   ...
2026-07-19T13:27:37.8684852Z 1..11
2026-07-19T13:27:37.8685426Z # tests 11
2026-07-19T13:27:37.8685825Z # suites 0
2026-07-19T13:27:37.8686271Z # pass 11
2026-07-19T13:27:37.8686757Z # fail 0
2026-07-19T13:27:37.8687176Z # cancelled 0
2026-07-19T13:27:37.8687683Z # skipped 0
2026-07-19T13:27:37.8688130Z # todo 0
2026-07-19T13:27:37.8689183Z # duration_ms 223.863831
2026-07-19T13:27:37.9732053Z 
2026-07-19T13:27:37.9733080Z > stashbox-video-factory-render-worker@0.1.0 test
2026-07-19T13:27:37.9733867Z > node --test tests/*.test.mjs
2026-07-19T13:27:37.9734208Z 
2026-07-19T13:27:38.0217357Z TAP version 13
2026-07-19T13:27:38.0579781Z # Subtest: drawtext escaping protects filter separators
2026-07-19T13:27:38.0585896Z ok 1 - drawtext escaping protects filter separators
2026-07-19T13:27:38.0587656Z   ---
2026-07-19T13:27:38.0588093Z   duration_ms: 0.903051
2026-07-19T13:27:38.0588874Z   type: 'test'
2026-07-19T13:27:38.0589267Z   ...
2026-07-19T13:27:38.0591645Z # Subtest: overlay filter contains valid drawtext syntax, intro, outro, and branding
2026-07-19T13:27:38.0594144Z ok 2 - overlay filter contains valid drawtext syntax, intro, outro, and branding
2026-07-19T13:27:38.0609415Z   ---
2026-07-19T13:27:38.0609936Z   duration_ms: 0.641951
2026-07-19T13:27:38.0610529Z   type: 'test'
2026-07-19T13:27:38.0617214Z   ...
2026-07-19T13:27:38.0618162Z # Subtest: overlay filter respects disabled identity blocks
2026-07-19T13:27:38.0619500Z ok 3 - overlay filter respects disabled identity blocks
2026-07-19T13:27:38.0620406Z   ---
2026-07-19T13:27:38.0620992Z   duration_ms: 1.0627
2026-07-19T13:27:38.0621652Z   type: 'test'
2026-07-19T13:27:38.0622249Z   ...
2026-07-19T13:27:38.0683087Z # Subtest: seeded shuffle is deterministic and preserves the source pool
2026-07-19T13:27:38.0684503Z ok 4 - seeded shuffle is deterministic and preserves the source pool
2026-07-19T13:27:38.0685844Z   ---
2026-07-19T13:27:38.0686503Z   duration_ms: 3.042717
2026-07-19T13:27:38.0687180Z   type: 'test'
2026-07-19T13:27:38.0688051Z   ...
2026-07-19T13:27:38.0689430Z # Subtest: timeline covers the requested duration and exhausts the pool before repeating
2026-07-19T13:27:38.0690961Z ok 5 - timeline covers the requested duration and exhausts the pool before repeating
2026-07-19T13:27:38.0692007Z   ---
2026-07-19T13:27:38.0692615Z   duration_ms: 0.879446
2026-07-19T13:27:38.0693260Z   type: 'test'
2026-07-19T13:27:38.0693849Z   ...
2026-07-19T13:27:38.0694828Z # Subtest: artwork becomes the fallback when no VEC assets are available
2026-07-19T13:27:38.0696089Z ok 6 - artwork becomes the fallback when no VEC assets are available
2026-07-19T13:27:38.0697015Z   ---
2026-07-19T13:27:38.0697640Z   duration_ms: 0.208411
2026-07-19T13:27:38.0698292Z   type: 'test'
2026-07-19T13:27:38.0699203Z   ...
2026-07-19T13:27:38.0700228Z # Subtest: black branded fallback is available when artwork is also missing
2026-07-19T13:27:38.0701376Z ok 7 - black branded fallback is available when artwork is also missing
2026-07-19T13:27:38.0701896Z   ---
2026-07-19T13:27:38.0702259Z   duration_ms: 0.314719
2026-07-19T13:27:38.0702617Z   type: 'test'
2026-07-19T13:27:38.0702938Z   ...
2026-07-19T13:27:38.0755750Z 1..7
2026-07-19T13:27:38.0756106Z # tests 7
2026-07-19T13:27:38.0756636Z # suites 0
2026-07-19T13:27:38.0757093Z # pass 7
2026-07-19T13:27:38.0757588Z # fail 0
2026-07-19T13:27:38.0758122Z # cancelled 0
2026-07-19T13:27:38.0758899Z # skipped 0
2026-07-19T13:27:38.0759469Z # todo 0
2026-07-19T13:27:38.0760118Z # duration_ms 70.312137
2026-07-19T13:27:38.0897292Z ##[group]Run set -euo pipefail
2026-07-19T13:27:38.0897666Z [36;1mset -euo pipefail[0m
2026-07-19T13:27:38.0898130Z [36;1mif aws cloudformation describe-stacks --stack-name "${STACK_NAME}" >/dev/null 2>&1; then[0m
2026-07-19T13:27:38.0899015Z [36;1m  echo "Stack already exists. Skipping bootstrap image."[0m
2026-07-19T13:27:38.0899393Z [36;1melse[0m
2026-07-19T13:27:38.0899640Z [36;1m  aws cloudformation deploy \[0m
2026-07-19T13:27:38.0899962Z [36;1m    --stack-name "${STACK_NAME}" \[0m
2026-07-19T13:27:38.0900343Z [36;1m    --template-file infra/video-factory/dev-stack.yml \[0m
2026-07-19T13:27:38.0900754Z [36;1m    --capabilities CAPABILITY_NAMED_IAM \[0m
2026-07-19T13:27:38.0901098Z [36;1m    --no-fail-on-empty-changeset \[0m
2026-07-19T13:27:38.0901416Z [36;1m    --parameter-overrides \[0m
2026-07-19T13:27:38.0901819Z [36;1m      ImageUri=public.ecr.aws/docker/library/node:22-bookworm-slim \[0m
2026-07-19T13:27:38.0902305Z [36;1m      ApiLambdaRoleName="${API_LAMBDA_ROLE_NAME}" \[0m
2026-07-19T13:27:38.0902668Z [36;1m      ApiBase="${TRUE_DEV_API_BASE}"[0m
2026-07-19T13:27:38.0902957Z [36;1mfi[0m
2026-07-19T13:27:38.0961308Z shell: /usr/bin/bash -e {0}
2026-07-19T13:27:38.0961745Z env:
2026-07-19T13:27:38.0961978Z   AWS_REGION: us-east-1
2026-07-19T13:27:38.0962263Z   STACK_NAME: stashbox-video-factory-dev
2026-07-19T13:27:38.0962642Z   TRUE_DEV_LAMBDA_FUNCTION_NAME: stashbox-radio-api-dev-v2
2026-07-19T13:27:38.0963159Z   TRUE_DEV_API_BASE: https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev
2026-07-19T13:27:38.0963716Z   ADMIN_TOKEN: ***
2026-07-19T13:27:38.0963973Z   AWS_DEFAULT_REGION: us-east-1
2026-07-19T13:27:38.0964293Z   AWS_ACCESS_KEY_ID: ***
2026-07-19T13:27:38.0964654Z   AWS_SECRET_ACCESS_KEY: ***
2026-07-19T13:27:38.0964979Z   API_LAMBDA_ROLE_NAME: stashbox-radio-api-dev-v2-role
2026-07-19T13:27:38.0965319Z ##[endgroup]
2026-07-19T13:27:39.7196768Z 
2026-07-19T13:27:39.7197512Z Waiting for changeset to be created..
2026-07-19T13:27:45.1321696Z Waiting for stack create/update to complete
2026-07-19T13:30:15.5640786Z 
2026-07-19T13:30:15.5641837Z aws: [ERROR]: Failed to create/update the stack. Run the following command
2026-07-19T13:30:15.5642671Z to fetch the list of events leading up to the failure
2026-07-19T13:30:15.5643574Z aws cloudformation describe-stack-events --stack-name stashbox-video-factory-dev
2026-07-19T13:30:15.6672331Z ##[error]Process completed with exit code 255.
2026-07-19T13:30:15.6813688Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-19T13:30:15.6814974Z Post job cleanup.
2026-07-19T13:30:15.8024517Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-19T13:30:15.8026666Z Post job cleanup.
2026-07-19T13:30:15.8880936Z [command]/usr/bin/git version
2026-07-19T13:30:15.8924698Z git version 2.54.0
2026-07-19T13:30:15.8967084Z Temporarily overriding HOME='/home/runner/work/_temp/bc91a526-e741-44ec-b633-9f7830a69ec7' before making global git config changes
2026-07-19T13:30:15.8968898Z Adding repository directory to the temporary git global config as a safe directory
2026-07-19T13:30:15.8972948Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/stashbox/stashbox
2026-07-19T13:30:15.9021050Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-19T13:30:15.9068805Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-19T13:30:15.9383050Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-19T13:30:15.9419198Z http.https://github.com/.extraheader
2026-07-19T13:30:15.9429572Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-07-19T13:30:15.9472610Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-19T13:30:15.9752568Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-19T13:30:15.9806178Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-19T13:30:16.0224429Z Cleaning up orphan processes
2026-07-19T13:30:16.0619232Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4, aws-actions/configure-aws-credentials@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
```
