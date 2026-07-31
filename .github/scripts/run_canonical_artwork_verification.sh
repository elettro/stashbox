#!/usr/bin/env bash
set -euo pipefail

: "${RADIO_API_BASE:=https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev}"
: "${SOCIAL_API_BASE:=https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev}"
: "${SOCIAL_CONFIG_SECRET:=stashbox/social-factory/dev/youtube-oauth/config}"
: "${REPORT_PATH:=deployment-reports/dirty-bird-canonical-artwork-verification.json}"

umask 077
mkdir -p "$(dirname "${REPORT_PATH}")"

python .github/scripts/canonicalize_song_artwork.py

npm --prefix radio-api install --omit=dev --no-audit --no-fund
node --check radio-api/song-artwork-routes.mjs
node --check radio-admin/songs/dev/song-images-compat-bridge.js
node --check radio-admin/dev/app.js
node --test radio-api/tests/song-artwork-canonical.test.mjs
npm --prefix video-render-worker install --omit=dev --no-audit --no-fund
npm --prefix video-render-worker test

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add radio-api/song-artwork-routes.mjs \
        radio-api/tests/song-artwork-canonical.test.mjs \
        radio-admin/songs/dev/song-images-compat-bridge.js \
        radio-admin/dev/app.js
if ! git diff --cached --quiet; then
  git commit -m 'Canonicalize song artwork for Social Factory and GPT [skip ci]'
  git pull --rebase origin main
  git push origin HEAD:main
fi

: "${GH_TOKEN:?GH_TOKEN is required}"
gh workflow run deploy-song-artwork-dev.yml --ref main
sleep 10
DEPLOY_RUN_ID=$(gh run list \
  --workflow=deploy-song-artwork-dev.yml \
  --event=workflow_dispatch \
  --limit=10 \
  --json databaseId,createdAt \
  --jq 'sort_by(.createdAt) | reverse | .[0].databaseId // empty')
test -n "${DEPLOY_RUN_ID}"
echo "Waiting for Song Artwork deployment run ${DEPLOY_RUN_ID}."
gh run watch "${DEPLOY_RUN_ID}" --exit-status

: "${RADIO_ADMIN_TOKEN:?RADIO_ADMIN_TOKEN is required}"
curl --fail --silent --show-error --max-time 90 \
  -H "x-admin-token: ${RADIO_ADMIN_TOKEN}" \
  "${RADIO_API_BASE}/admin/songs" > /tmp/songs.json
SONG_KEY=$(jq -r '[.songs[] | select(((.song_name // "") + " " + (.display_title // "")) | ascii_downcase | contains("dirty bird"))][0].song_key // empty' /tmp/songs.json)
test -n "${SONG_KEY}" || { echo 'Dirty Bird was not found in DEV songs.' >&2; exit 1; }
ENCODED_KEY=$(jq -rn --arg value "${SONG_KEY}" '$value|@uri')

curl --fail --silent --show-error --max-time 90 \
  -H "x-admin-token: ${RADIO_ADMIN_TOKEN}" \
  "${RADIO_API_BASE}/radio/admin/songs/${ENCODED_KEY}/artwork-images" > /tmp/artwork.json
EXPECTED_9X16=$(jq -r '.media.artwork_images["9x16"] // empty' /tmp/artwork.json)
test -n "${EXPECTED_9X16}" || {
  echo 'Dirty Bird still has no canonical 9x16 artwork after migration.' >&2
  cat /tmp/artwork.json >&2
  exit 1
}

SOCIAL_CONFIG=$(aws secretsmanager get-secret-value \
  --secret-id "${SOCIAL_CONFIG_SECRET}" \
  --query SecretString --output text)
SOCIAL_ADMIN_TOKEN=$(printf '%s' "${SOCIAL_CONFIG}" | jq -r '.admin_token // empty')
test -n "${SOCIAL_ADMIN_TOKEN}"

CAMPAIGN="Canonical Artwork Verification - Dirty Bird - $(date -u +%Y%m%dT%H%M%SZ)"
jq -n \
  --arg song_key "${SONG_KEY}" \
  --arg campaign "${CAMPAIGN}" '{
    song_key: $song_key,
    batch_name: $campaign,
    client_name: "Stashbox",
    project_name: "Social Factory",
    campaign_name: $campaign,
    duration_mode: "promo",
    duration_seconds: 15,
    aspect_ratio: "9:16",
    fps: 30,
    intro_enabled: false,
    outro_enabled: false,
    corner_bug_enabled: false,
    include_artist: false,
    include_song: false,
    include_album: false,
    metadata_comment: "Canonical artwork regression verification for Social Factory and GPT readiness"
  }' > /tmp/draft-request.json

curl --fail --silent --show-error --max-time 90 \
  -X POST \
  -H "x-admin-token: ${SOCIAL_ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/draft-request.json \
  "${SOCIAL_API_BASE}/social/orchestration/render-jobs" > /tmp/draft.json
JOB_ID=$(jq -r '.job.id // empty' /tmp/draft.json)
test -n "${JOB_ID}" || { cat /tmp/draft.json >&2; exit 1; }

curl --fail --silent --show-error --max-time 90 \
  -X POST \
  -H "x-admin-token: ${SOCIAL_ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"confirm_render":true}' \
  "${SOCIAL_API_BASE}/social/orchestration/render-jobs/${JOB_ID}/launch" > /tmp/launch.json
jq -e '.launched == true' /tmp/launch.json >/dev/null

DEADLINE=$(( $(date +%s) + 2700 ))
STATUS=''
while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
  curl --fail --silent --show-error --max-time 90 \
    -H "x-admin-token: ${SOCIAL_ADMIN_TOKEN}" \
    "${SOCIAL_API_BASE}/social/orchestration/render-jobs/${JOB_ID}" > /tmp/social-job.json
  STATUS=$(jq -r '.job.status // empty' /tmp/social-job.json)
  echo "Dirty Bird proof render status: ${STATUS}"
  case "${STATUS}" in
    completed) break ;;
    failed|cancelled) cat /tmp/social-job.json >&2; exit 1 ;;
  esac
  sleep 15
done
test "${STATUS}" = 'completed' || { echo 'Dirty Bird proof render timed out.' >&2; exit 1; }

curl --fail --silent --show-error --max-time 90 \
  -H "x-admin-token: ${RADIO_ADMIN_TOKEN}" \
  "${RADIO_API_BASE}/admin/video-factory/jobs/${JOB_ID}" > /tmp/radio-job.json

SELECTED_URL=$(jq -r '.job.render_recipe.artwork.url // empty' /tmp/radio-job.json)
SOURCE_RATIO=$(jq -r '.job.render_recipe.artwork.source_ratio // empty' /tmp/radio-job.json)
FALLBACK=$(jq -r '.job.render_recipe.artwork.fallback_used // true' /tmp/radio-job.json)
FIRST_ARTWORK_URL=$(jq -r '[.job.render_recipe.timeline[]? | select((.asset_id // "") == "song-artwork" or (.source // "") == "song-artwork")][0].url // empty' /tmp/radio-job.json)

test "${SELECTED_URL}" = "${EXPECTED_9X16}" || { echo 'Renderer did not select the canonical 9x16 URL.' >&2; exit 1; }
test "${SOURCE_RATIO}" = '9x16' || { echo "Unexpected source ratio: ${SOURCE_RATIO}" >&2; exit 1; }
test "${FALLBACK}" = 'false' || { echo 'The exact 9x16 selection was incorrectly marked as a fallback.' >&2; exit 1; }
test "${FIRST_ARTWORK_URL}" = "${EXPECTED_9X16}" || { echo 'The first song-artwork timeline segment was not rewritten to 9x16.' >&2; exit 1; }

jq -n \
  --arg checked_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg song_key "${SONG_KEY}" \
  --arg expected_9x16 "${EXPECTED_9X16}" \
  --arg job_id "${JOB_ID}" \
  --arg campaign "${CAMPAIGN}" \
  --slurpfile artwork /tmp/artwork.json \
  --slurpfile job /tmp/radio-job.json '{
    status: "success",
    checked_at: $checked_at,
    contract: "Song CMS -> canonical artwork API -> Social Factory -> Video Factory worker",
    song_key: $song_key,
    campaign: $campaign,
    job_id: $job_id,
    expected_9x16_url: $expected_9x16,
    artwork_completion: ($artwork[0].media.completion // {}),
    renderer_selection: ($job[0].job.render_recipe.artwork // {}),
    first_song_artwork_segment: ([($job[0].job.render_recipe.timeline // [])[] | select((.asset_id // "") == "song-artwork" or (.source // "") == "song-artwork")][0] // {}),
    output_url: ($job[0].job.output_url // ""),
    completed_at: ($job[0].job.completed_at // "")
  }' > "${REPORT_PATH}"

rm -f /tmp/songs.json /tmp/artwork.json /tmp/draft-request.json /tmp/draft.json /tmp/launch.json /tmp/social-job.json /tmp/radio-job.json
unset RADIO_ADMIN_TOKEN SOCIAL_ADMIN_TOKEN SOCIAL_CONFIG

git pull --rebase origin main
git add "${REPORT_PATH}"
if ! git diff --cached --quiet; then
  git commit -m 'Verify canonical Dirty Bird 9x16 Social Factory render [skip ci]'
  git push origin HEAD:main
fi
