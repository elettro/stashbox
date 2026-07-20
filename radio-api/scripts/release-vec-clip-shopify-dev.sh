#!/usr/bin/env bash
set -euo pipefail

: "${TRUE_DEV_EXPECTED_LAMBDA_FUNCTION_NAME:=stashbox-radio-api-dev-v2}"
: "${TRUE_DEV_API_BASE:=https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev}"

npm --prefix radio-api install --omit=dev --no-audit --no-fund
python radio-api/scripts/finalize-clip-shopify-dev.py

git diff --check
node --check radio-api/index.mjs
node --check radio-api/scripts/smoke-test-true-dev.mjs
node --check radio-api/video-factory/entry.mjs
node --check radio-api/video-factory/routes.mjs
node --check radio-api/video-factory/recipe.mjs
node --check radio/dev/app.js
node --test \
  radio-api/tests/clip-commerce-state.test.mjs \
  radio-api/tests/clip-shopify-integration-source.test.mjs \
  radio-api/tests/visual-folder-assets-routing.test.mjs \
  radio-api/tests/video-factory-foundation.test.mjs

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add \
  radio-api/index.mjs \
  radio-api/scripts/smoke-test-true-dev.mjs \
  radio-api/tests/clip-shopify-integration-source.test.mjs

git rm -f \
  .github/workflows/deploy-vec-clip-shopify-dev-once.yml \
  .github/workflows/finalize-vec-clip-shopify-dev.yml \
  .github/workflows/trigger-finalize-vec-clip-shopify-dev.yml \
  .github/workflows/pr-trigger-finalize-vec-clip-shopify-dev.yml \
  .github/workflows/monitor-vec-clip-shopify-dev.yml \
  .github/workflows/release-vec-clip-shopify-dev-pr.yml \
  .github/triggers/run-finalize-vec-clip-shopify-dev.txt \
  .github/triggers/monitor-vec-clip-shopify-dev.txt \
  radio-api/scripts/finalize-clip-shopify-dev.py \
  radio-api/scripts/release-vec-clip-shopify-dev.sh

git commit -m "Finalize DEV clip Shopify source [skip ci]"
git push origin HEAD:main
FINAL_SHA=$(git rev-parse HEAD)

if [[ "${TRUE_DEV_LAMBDA_FUNCTION_NAME:-}" != "${TRUE_DEV_EXPECTED_LAMBDA_FUNCTION_NAME}" ]]; then
  echo "Refusing to deploy unexpected Lambda target: ${TRUE_DEV_LAMBDA_FUNCTION_NAME:-missing}" >&2
  exit 1
fi
if [[ "${AWS_REGION:-}" != "us-east-1" ]]; then
  echo "Refusing to deploy unexpected AWS region: ${AWS_REGION:-missing}" >&2
  exit 1
fi
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "STASHBOX_DEV_ADMIN_TOKEN is missing." >&2
  exit 1
fi

rm -rf radio-api/dist
mkdir -p radio-api/dist
cp radio-api/index.mjs radio-api/radio-main.mjs
cp radio-api/video-factory/entry.mjs radio-api/index.mjs
node --check radio-api/index.mjs
node --check radio-api/radio-main.mjs
(
  cd radio-api
  zip -r dist/true-dev-lambda.zip . \
    -x "dist/*" \
    -x ".git/*" \
    -x "*.zip"
)

aws lambda update-function-code \
  --function-name "${TRUE_DEV_LAMBDA_FUNCTION_NAME}" \
  --zip-file fileb://radio-api/dist/true-dev-lambda.zip >/dev/null
aws lambda wait function-updated \
  --function-name "${TRUE_DEV_LAMBDA_FUNCTION_NAME}"

node radio-api/scripts/smoke-test-true-dev.mjs

cat > docs/vec-clip-shopify-dev-release-2026-07-20.md <<EOF
# VEC clip Shopify DEV release

- Source commit: ${FINAL_SHA}
- Target Lambda: stashbox-radio-api-dev-v2
- API base: ${TRUE_DEV_API_BASE}
- Result: successful
- Database: radio_dev clip-product column verified through the DEV folder-assets API
- Production player files: unchanged
EOF

git add docs/vec-clip-shopify-dev-release-2026-07-20.md
git commit -m "Record successful DEV clip Shopify release [skip ci]"
git push origin HEAD:main
