#!/usr/bin/env bash
set -euo pipefail

# Final read-only snapshot for the completed DUB REGGAE 01 VEC montage render.
: "${API_BASE:=https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN is required}"

BODY_FILE=$(mktemp)
STATUS=$(curl --max-time 30 --silent --show-error \
  -H 'accept: application/json' \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -o "${BODY_FILE}" -w '%{http_code}' \
  "${API_BASE}/admin/video-factory/jobs?limit=250" || printf '000')

echo "HTTP_STATUS=${STATUS}"
if [ "${STATUS}" != "200" ]; then
  cat "${BODY_FILE}"
  rm -f "${BODY_FILE}"
  exit 1
fi

jq -c '
  [(.jobs // [])[] | select((.batch_name // "") | startswith("DUB REGGAE 01 VEC Montage"))]
  | sort_by(.created_at // "")
  | last
  | {
      id,
      status,
      progress_percent: (.render_recipe.runtime.progress_percent // 0),
      status_message: (.render_recipe.runtime.status_message // ""),
      error_message,
      output_filename,
      created_at,
      updated_at,
      completed_at,
      output_url,
      thumbnail_url,
      eligible_asset_count: (.render_recipe.visuals.eligible_asset_count // 0),
      timeline_segment_count: ((.render_recipe.timeline // []) | length),
      timeline_clip_segment_count: ([.render_recipe.timeline[]? | select(.type == "clip")] | length),
      unique_clip_ids: ([.render_recipe.timeline[]? | select(.type == "clip") | .asset_id] | unique | length),
      artwork_segments: [.render_recipe.timeline[]? | select(.asset_id == "song-artwork") | {start_seconds,duration_seconds,source}],
      first_segments: [.render_recipe.timeline[0:8][]? | {asset_id,type,source,start_seconds,duration_seconds}]
    }
' "${BODY_FILE}"
rm -f "${BODY_FILE}"
