#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${V2_DESKTOP_DEPLOY_URL:-https://stashbox.com/radio/desktop/}"
SOURCE_HTML="${V2_DESKTOP_SOURCE_HTML:-radio/desktop/index.html}"
ENGINE_FILE="${V2_DESKTOP_ENGINE_FILE:-radio/desktop/desktop-vec2.js}"
ATTEMPTS="${V2_DESKTOP_DEPLOY_ATTEMPTS:-20}"
SLEEP_SECONDS="${V2_DESKTOP_DEPLOY_SLEEP_SECONDS:-30}"
PROBE_KEY="${GITHUB_SHA:-manual}-$$"

expected_build="$(sed -n 's/.*name="stashbox-v2-build" content="\([^"]*\)".*/\1/p' "$SOURCE_HTML" | head -n 1)"
engine_src="$(sed -n 's/.*src="\([^"]*desktop-vec2\.js?v=[^"]*\)".*/\1/p' "$SOURCE_HTML" | head -n 1)"
expected_engine_sha="$(sha256sum "$ENGINE_FILE" | awk '{print $1}')"

if [[ -z "$expected_build" || -z "$engine_src" ]]; then
  echo "Unable to derive expected desktop build or VEC engine URL from $SOURCE_HTML" >&2
  exit 2
fi

echo "Waiting for live desktop build: $expected_build"
echo "Expected VEC engine SHA256: $expected_engine_sha"

for ((attempt=1; attempt<=ATTEMPTS; attempt++)); do
  html_tmp="$(mktemp)"
  engine_tmp="$(mktemp)"
  trap 'rm -f "$html_tmp" "$engine_tmp"' RETURN

  html_url="${BASE_URL}?deploy_probe=${PROBE_KEY}-${attempt}"
  if curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 -H 'Cache-Control: no-cache' "$html_url" -o "$html_tmp"; then
    live_build="$(sed -n 's/.*name="stashbox-v2-build" content="\([^"]*\)".*/\1/p' "$html_tmp" | head -n 1)"
    engine_url="https://stashbox.com${engine_src}&deploy_probe=${PROBE_KEY}-${attempt}"

    if [[ "$live_build" == "$expected_build" ]] && curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 -H 'Cache-Control: no-cache' "$engine_url" -o "$engine_tmp"; then
      live_engine_sha="$(sha256sum "$engine_tmp" | awk '{print $1}')"
      if [[ "$live_engine_sha" == "$expected_engine_sha" ]]; then
        echo "Live desktop deployment verified on attempt $attempt"
        echo "Build: $live_build"
        echo "VEC SHA256: $live_engine_sha"
        rm -f "$html_tmp" "$engine_tmp"
        trap - RETURN
        exit 0
      fi
      echo "Attempt $attempt: build matched but VEC bytes are stale ($live_engine_sha)"
    else
      echo "Attempt $attempt: live build is '${live_build:-missing}', expected '$expected_build'"
    fi
  else
    echo "Attempt $attempt: desktop HTML request failed"
  fi

  rm -f "$html_tmp" "$engine_tmp"
  trap - RETURN
  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "Live desktop deployment did not converge to $expected_build with matching VEC bytes" >&2
exit 1
