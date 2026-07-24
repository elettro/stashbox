#!/usr/bin/env bash
set -Eeuo pipefail

: "${TRUE_DEV_API_BASE:?TRUE_DEV_API_BASE is required}"
: "${TRUE_DEV_COGNITO_REGION:?TRUE_DEV_COGNITO_REGION is required}"
: "${TRUE_DEV_COGNITO_USER_POOL_ID:?TRUE_DEV_COGNITO_USER_POOL_ID is required}"
: "${TRUE_DEV_UPLOAD_BUCKET:?TRUE_DEV_UPLOAD_BUCKET is required}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN is required}"

REPORT_PATH="${PROFILE_MEDIA_REPORT_PATH:-/tmp/profile-media-live-smoke.json}"
WORK_DIR="$(mktemp -d)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-$(date +%s)"
ARTIST_MEDIA_URL="${TRUE_DEV_API_BASE}/radio/admin/artists/stashbox/media"
PUBLIC_ARTIST_MEDIA_URL="${TRUE_DEV_API_BASE}/radio/artists/stashbox/media"
LISTENER_MEDIA_URL="${TRUE_DEV_API_BASE}/radio/me/media"

CURRENT_STEP="initialize"
ARTIST_OK=false
LISTENER_OK=false
ARTIST_RESTORED=false
LISTENER_ERASED=false
COGNITO_DELETED=false
LISTENER_USERNAME=""
ACCESS_TOKEN=""
ID_TOKEN=""

OLD_ARTIST_PROFILE=""
OLD_ARTIST_HORIZONTAL=""
OLD_ARTIST_VERTICAL=""

declare -A ARTIST_URLS=()
declare -A ARTIST_KEYS=()
declare -A LISTENER_URLS=()
declare -A LISTENER_KEYS=()

write_report() {
  local exit_code="$1"
  local status="failed"
  if [[ "$exit_code" == "0" && "$ARTIST_OK" == "true" && "$LISTENER_OK" == "true" ]]; then
    status="passed"
  fi
  jq -n \
    --arg status "$status" \
    --arg tested_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg commit "${GITHUB_SHA:-unknown}" \
    --arg run_id "${GITHUB_RUN_ID:-local}" \
    --arg step "$CURRENT_STEP" \
    --argjson exit_code "$exit_code" \
    --argjson artist_ok "$ARTIST_OK" \
    --argjson listener_ok "$LISTENER_OK" \
    --argjson artist_restored "$ARTIST_RESTORED" \
    --argjson listener_erased "$LISTENER_ERASED" \
    --argjson cognito_deleted "$COGNITO_DELETED" \
    '{
      status:$status,
      tested_at:$tested_at,
      commit:$commit,
      run_id:$run_id,
      exit_code:$exit_code,
      last_step:$step,
      subjects:{listener:"Dean Palermo Profile Smoke Test (temporary Cognito account)",artist:"Stashbox"},
      checks:{
        artist_three_image_presign_put_patch_reload_public_read:$artist_ok,
        listener_three_image_presign_put_patch_reload:$listener_ok,
        artist_previous_media_restored:$artist_restored,
        temporary_listener_database_erased:$listener_erased,
        temporary_cognito_user_deleted:$cognito_deleted
      }
    }' > "$REPORT_PATH"
}

restore_artist() {
  [[ -z "$OLD_ARTIST_PROFILE$OLD_ARTIST_HORIZONTAL$OLD_ARTIST_VERTICAL" && ${#ARTIST_URLS[@]} -eq 0 ]] && return 0
  jq -n \
    --arg profile "$OLD_ARTIST_PROFILE" \
    --arg horizontal "$OLD_ARTIST_HORIZONTAL" \
    --arg vertical "$OLD_ARTIST_VERTICAL" \
    '{profile_image_url:$profile,horizontal_banner_image_url:$horizontal,vertical_banner_image_url:$vertical}' \
    > "$WORK_DIR/artist-restore.json"
  if curl --fail --silent --show-error --max-time 45 \
    -X PATCH \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data @"$WORK_DIR/artist-restore.json" \
    "$ARTIST_MEDIA_URL" > "$WORK_DIR/artist-restored.json"; then
    if jq -e \
      --arg profile "$OLD_ARTIST_PROFILE" \
      --arg horizontal "$OLD_ARTIST_HORIZONTAL" \
      --arg vertical "$OLD_ARTIST_VERTICAL" \
      '(.media.profile_image_url // "") == $profile and (.media.horizontal_banner_image_url // "") == $horizontal and (.media.vertical_banner_image_url // "") == $vertical' \
      "$WORK_DIR/artist-restored.json" >/dev/null; then
      ARTIST_RESTORED=true
    fi
  fi
}

cleanup_listener() {
  if [[ -n "$ACCESS_TOKEN" && -n "$ID_TOKEN" ]]; then
    if curl --fail --silent --show-error --max-time 45 \
      -X DELETE \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "X-Cognito-Id-Token: ${ID_TOKEN}" \
      -H 'Content-Type: application/json' \
      --data '{"delete_account":true,"delete_all_data":true}' \
      "${TRUE_DEV_API_BASE}/radio/me/account" > "$WORK_DIR/listener-erased.json"; then
      if jq -e '.success == true and .account_lifecycle.mode == "erased"' "$WORK_DIR/listener-erased.json" >/dev/null; then
        LISTENER_ERASED=true
      fi
    fi
  fi

  if [[ -n "$LISTENER_USERNAME" ]]; then
    if aws cognito-idp admin-delete-user \
      --region "$TRUE_DEV_COGNITO_REGION" \
      --user-pool-id "$TRUE_DEV_COGNITO_USER_POOL_ID" \
      --username "$LISTENER_USERNAME" >/dev/null 2>&1; then
      COGNITO_DELETED=true
    fi
  fi
}

cleanup_s3() {
  local key
  for key in "${ARTIST_KEYS[@]:-}" "${LISTENER_KEYS[@]:-}"; do
    [[ -z "$key" ]] && continue
    aws s3api delete-object \
      --region "$TRUE_DEV_COGNITO_REGION" \
      --bucket "$TRUE_DEV_UPLOAD_BUCKET" \
      --key "$key" >/dev/null 2>&1 || true
  done
}

on_exit() {
  local exit_code="$1"
  set +e
  CURRENT_STEP="cleanup"
  restore_artist
  cleanup_listener
  cleanup_s3
  write_report "$exit_code"
  rm -rf "$WORK_DIR"
}
trap 'on_exit $?' EXIT

create_fixtures() {
  CURRENT_STEP="create-fixtures"
  printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlJqA0AAAAASUVORK5CYII=' | base64 --decode > "$WORK_DIR/profile.png"
  cp "$WORK_DIR/profile.png" "$WORK_DIR/horizontal.png"
  cp "$WORK_DIR/profile.png" "$WORK_DIR/vertical.png"
  test -s "$WORK_DIR/profile.png"
}

artist_presign_upload() {
  local purpose="$1"
  local file="$2"
  local request="$WORK_DIR/artist-${purpose}-request.json"
  local response="$WORK_DIR/artist-${purpose}-presign.json"
  jq -n \
    --arg purpose "$purpose" \
    --arg filename "stashbox-${purpose}-${RUN_TOKEN}.png" \
    --arg content_type 'image/png' \
    --argjson size_bytes "$(stat -c%s "$file")" \
    '{purpose:$purpose,filename:$filename,content_type:$content_type,size_bytes:$size_bytes}' > "$request"
  curl --fail --silent --show-error --max-time 45 \
    -X POST \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data @"$request" \
    "${ARTIST_MEDIA_URL}/presign" > "$response"
  jq -e '.success == true and .method == "PUT" and (.upload_url | length > 20) and (.public_url | length > 20) and (.key | length > 5)' "$response" >/dev/null
  local upload_url public_url key
  upload_url="$(jq -r '.upload_url' "$response")"
  public_url="$(jq -r '.public_url' "$response")"
  key="$(jq -r '.key' "$response")"
  curl --fail --silent --show-error --max-time 90 \
    -X PUT \
    -H 'Content-Type: image/png' \
    --data-binary @"$file" \
    "$upload_url" >/dev/null
  ARTIST_URLS["$purpose"]="$public_url"
  ARTIST_KEYS["$purpose"]="$key"
}

listener_presign_upload() {
  local purpose="$1"
  local file="$2"
  local request="$WORK_DIR/listener-${purpose}-request.json"
  local response="$WORK_DIR/listener-${purpose}-presign.json"
  jq -n \
    --arg purpose "$purpose" \
    --arg filename "dean-palermo-${purpose}-${RUN_TOKEN}.png" \
    --arg content_type 'image/png' \
    --argjson size_bytes "$(stat -c%s "$file")" \
    '{purpose:$purpose,filename:$filename,content_type:$content_type,size_bytes:$size_bytes}' > "$request"
  curl --fail --silent --show-error --max-time 45 \
    -X POST \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Cognito-Id-Token: ${ID_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data @"$request" \
    "${LISTENER_MEDIA_URL}/presign" > "$response"
  jq -e '.success == true and .method == "PUT" and (.upload_url | length > 20) and (.public_url | length > 20) and (.key | length > 5)' "$response" >/dev/null
  local upload_url public_url key
  upload_url="$(jq -r '.upload_url' "$response")"
  public_url="$(jq -r '.public_url' "$response")"
  key="$(jq -r '.key' "$response")"
  curl --fail --silent --show-error --max-time 90 \
    -X PUT \
    -H 'Content-Type: image/png' \
    --data-binary @"$file" \
    "$upload_url" >/dev/null
  LISTENER_URLS["$purpose"]="$public_url"
  LISTENER_KEYS["$purpose"]="$key"
}

run_artist_test() {
  CURRENT_STEP="artist-read-existing"
  curl --fail --silent --show-error --max-time 45 \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    "$ARTIST_MEDIA_URL" > "$WORK_DIR/artist-before.json"
  jq -e '.success == true and (.media | type == "object")' "$WORK_DIR/artist-before.json" >/dev/null
  OLD_ARTIST_PROFILE="$(jq -r '.media.profile_image_url // ""' "$WORK_DIR/artist-before.json")"
  OLD_ARTIST_HORIZONTAL="$(jq -r '.media.horizontal_banner_image_url // ""' "$WORK_DIR/artist-before.json")"
  OLD_ARTIST_VERTICAL="$(jq -r '.media.vertical_banner_image_url // ""' "$WORK_DIR/artist-before.json")"

  CURRENT_STEP="artist-upload-three-images"
  artist_presign_upload profile_image "$WORK_DIR/profile.png"
  artist_presign_upload horizontal_banner "$WORK_DIR/horizontal.png"
  artist_presign_upload vertical_banner "$WORK_DIR/vertical.png"

  CURRENT_STEP="artist-patch-three-images"
  jq -n \
    --arg profile "${ARTIST_URLS[profile_image]}" \
    --arg horizontal "${ARTIST_URLS[horizontal_banner]}" \
    --arg vertical "${ARTIST_URLS[vertical_banner]}" \
    '{profile_image_url:$profile,horizontal_banner_image_url:$horizontal,vertical_banner_image_url:$vertical}' \
    > "$WORK_DIR/artist-patch.json"
  curl --fail --silent --show-error --max-time 45 \
    -X PATCH \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data @"$WORK_DIR/artist-patch.json" \
    "$ARTIST_MEDIA_URL" > "$WORK_DIR/artist-patched.json"
  jq -e \
    --arg profile "${ARTIST_URLS[profile_image]}" \
    --arg horizontal "${ARTIST_URLS[horizontal_banner]}" \
    --arg vertical "${ARTIST_URLS[vertical_banner]}" \
    '.success == true and .persisted == true and .media.profile_image_url == $profile and .media.horizontal_banner_image_url == $horizontal and .media.vertical_banner_image_url == $vertical' \
    "$WORK_DIR/artist-patched.json" >/dev/null

  CURRENT_STEP="artist-reload-private-and-public"
  curl --fail --silent --show-error --max-time 45 \
    -H "x-admin-token: ${ADMIN_TOKEN}" \
    "${ARTIST_MEDIA_URL}?verify=${RUN_TOKEN}" > "$WORK_DIR/artist-reloaded.json"
  jq -e \
    --arg profile "${ARTIST_URLS[profile_image]}" \
    --arg horizontal "${ARTIST_URLS[horizontal_banner]}" \
    --arg vertical "${ARTIST_URLS[vertical_banner]}" \
    '.success == true and .media.profile_image_url == $profile and .media.horizontal_banner_image_url == $horizontal and .media.vertical_banner_image_url == $vertical' \
    "$WORK_DIR/artist-reloaded.json" >/dev/null
  curl --fail --silent --show-error --max-time 45 \
    "${PUBLIC_ARTIST_MEDIA_URL}?verify=${RUN_TOKEN}" > "$WORK_DIR/artist-public.json"
  jq -e \
    --arg profile "${ARTIST_URLS[profile_image]}" \
    --arg horizontal "${ARTIST_URLS[horizontal_banner]}" \
    --arg vertical "${ARTIST_URLS[vertical_banner]}" \
    '.success == true and .media.profile_image_url == $profile and .media.horizontal_banner_image_url == $horizontal and .media.vertical_banner_image_url == $vertical' \
    "$WORK_DIR/artist-public.json" >/dev/null
  ARTIST_OK=true

  CURRENT_STEP="artist-restore"
  restore_artist
  test "$ARTIST_RESTORED" = true
}

create_listener_account() {
  CURRENT_STEP="listener-create-temporary-cognito-account"
  curl --fail --silent --show-error --max-time 45 \
    "${TRUE_DEV_API_BASE}/radio/auth/config" > "$WORK_DIR/auth-config.json"
  local client_id password email
  client_id="$(jq -r '.auth.app_client_id // ""' "$WORK_DIR/auth-config.json")"
  test -n "$client_id"
  email="dean-palermo-profile-smoke+${RUN_TOKEN}@elettro.com"
  password="Aa1!ProfileMedia${RUN_TOKEN}Zz"
  LISTENER_USERNAME="$email"

  jq -n \
    --arg email "$email" \
    '[
      {Name:"email",Value:$email},
      {Name:"email_verified",Value:"true"},
      {Name:"preferred_username",Value:"Dean Palermo Profile Smoke Test"}
    ]' > "$WORK_DIR/listener-attributes.json"

  aws cognito-idp admin-create-user \
    --region "$TRUE_DEV_COGNITO_REGION" \
    --user-pool-id "$TRUE_DEV_COGNITO_USER_POOL_ID" \
    --username "$email" \
    --message-action SUPPRESS \
    --user-attributes file://"$WORK_DIR/listener-attributes.json" >/dev/null
  aws cognito-idp admin-set-user-password \
    --region "$TRUE_DEV_COGNITO_REGION" \
    --user-pool-id "$TRUE_DEV_COGNITO_USER_POOL_ID" \
    --username "$email" \
    --password "$password" \
    --permanent >/dev/null
  aws cognito-idp initiate-auth \
    --region "$TRUE_DEV_COGNITO_REGION" \
    --auth-flow USER_PASSWORD_AUTH \
    --client-id "$client_id" \
    --auth-parameters "USERNAME=${email},PASSWORD=${password}" > "$WORK_DIR/listener-auth.json"
  ACCESS_TOKEN="$(jq -r '.AuthenticationResult.AccessToken // ""' "$WORK_DIR/listener-auth.json")"
  ID_TOKEN="$(jq -r '.AuthenticationResult.IdToken // ""' "$WORK_DIR/listener-auth.json")"
  test -n "$ACCESS_TOKEN"
  test -n "$ID_TOKEN"
}

run_listener_test() {
  create_listener_account

  CURRENT_STEP="listener-read-empty-media"
  curl --fail --silent --show-error --max-time 45 \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Cognito-Id-Token: ${ID_TOKEN}" \
    "$LISTENER_MEDIA_URL" > "$WORK_DIR/listener-before.json"
  jq -e '.success == true and (.media | type == "object")' "$WORK_DIR/listener-before.json" >/dev/null

  CURRENT_STEP="listener-upload-three-images"
  listener_presign_upload profile_image "$WORK_DIR/profile.png"
  listener_presign_upload horizontal_banner "$WORK_DIR/horizontal.png"
  listener_presign_upload vertical_banner "$WORK_DIR/vertical.png"

  CURRENT_STEP="listener-patch-three-images"
  jq -n \
    --arg profile "${LISTENER_URLS[profile_image]}" \
    --arg horizontal "${LISTENER_URLS[horizontal_banner]}" \
    --arg vertical "${LISTENER_URLS[vertical_banner]}" \
    '{profile_image_url:$profile,horizontal_banner_image_url:$horizontal,vertical_banner_image_url:$vertical}' \
    > "$WORK_DIR/listener-patch.json"
  curl --fail --silent --show-error --max-time 45 \
    -X PATCH \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Cognito-Id-Token: ${ID_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data @"$WORK_DIR/listener-patch.json" \
    "$LISTENER_MEDIA_URL" > "$WORK_DIR/listener-patched.json"
  jq -e \
    --arg profile "${LISTENER_URLS[profile_image]}" \
    --arg horizontal "${LISTENER_URLS[horizontal_banner]}" \
    --arg vertical "${LISTENER_URLS[vertical_banner]}" \
    '.success == true and .persisted == true and .media.profile_image_url == $profile and .media.horizontal_banner_image_url == $horizontal and .media.vertical_banner_image_url == $vertical' \
    "$WORK_DIR/listener-patched.json" >/dev/null

  CURRENT_STEP="listener-reload-three-images"
  curl --fail --silent --show-error --max-time 45 \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Cognito-Id-Token: ${ID_TOKEN}" \
    "${LISTENER_MEDIA_URL}?verify=${RUN_TOKEN}" > "$WORK_DIR/listener-reloaded.json"
  jq -e \
    --arg profile "${LISTENER_URLS[profile_image]}" \
    --arg horizontal "${LISTENER_URLS[horizontal_banner]}" \
    --arg vertical "${LISTENER_URLS[vertical_banner]}" \
    '.success == true and .media.profile_image_url == $profile and .media.horizontal_banner_image_url == $horizontal and .media.vertical_banner_image_url == $vertical' \
    "$WORK_DIR/listener-reloaded.json" >/dev/null
  LISTENER_OK=true
}

create_fixtures
run_artist_test
run_listener_test
CURRENT_STEP="complete"
echo 'Profile media live smoke test passed for the temporary Dean Palermo listener test and Stashbox artist.'
