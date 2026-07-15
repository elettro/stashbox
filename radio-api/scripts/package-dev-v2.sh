#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RADIO_API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIP_NAME="stashbox-radio-api-dev-v2.zip"
ZIP_PATH="${RADIO_API_DIR}/dist/${ZIP_NAME}"

cd "${RADIO_API_DIR}"

node --check index.mjs
npm install --omit=dev

mkdir -p dist
rm -f "${ZIP_PATH}"

if [[ ! -d node_modules ]]; then
  echo "Error: node_modules was not created by npm install." >&2
  exit 1
fi

if [[ -f package-lock.json ]]; then
  zip -r "${ZIP_PATH}" index.mjs package.json package-lock.json node_modules
else
  zip -r "${ZIP_PATH}" index.mjs package.json node_modules
fi

printf 'Created Lambda package: %s\n' "${ZIP_PATH}"
