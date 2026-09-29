#!/usr/bin/env bash
set -euo pipefail

: "${REPORT_PATH:?REPORT_PATH is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

case "${REPORT_PATH}" in
  /*|../*|*/../*|*/..)
    echo "REPORT_PATH must be a repository-relative path without parent traversal." >&2
    exit 1
    ;;
esac

SOURCE_ROOT=$(git rev-parse --show-toplevel)
SOURCE_REPORT="${SOURCE_ROOT}/${REPORT_PATH}"
if [ ! -f "${SOURCE_REPORT}" ]; then
  echo "Deployment receipt does not exist: ${REPORT_PATH}" >&2
  exit 1
fi
if ! node -e '
  const fs = require("node:fs");
  const [file, runId] = process.argv.slice(1);
  process.exit(JSON.parse(fs.readFileSync(file, "utf8")).run_id === runId ? 0 : 1);
' "${SOURCE_REPORT}" "${GITHUB_RUN_ID}"; then
  echo "Deployment receipt does not contain the current run ID ${GITHUB_RUN_ID}." >&2
  exit 1
fi

receipt_matches_run_id() {
  node -e '
    let json = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { json += chunk; });
    process.stdin.on("end", () => {
      try {
        process.exit(JSON.parse(json).run_id === process.argv[1] ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' "${GITHUB_RUN_ID}"
}

git -C "${SOURCE_ROOT}" fetch origin +refs/heads/main:refs/remotes/origin/main
RECEIPT_WORKTREE=$(mktemp -d "${RUNNER_TEMP%/}/social-factory-dev-receipt.XXXXXX")
cleanup() {
  git -C "${SOURCE_ROOT}" worktree remove --force "${RECEIPT_WORKTREE}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git -C "${SOURCE_ROOT}" worktree add --detach "${RECEIPT_WORKTREE}" refs/remotes/origin/main
REMOTE_REPORT="${RECEIPT_WORKTREE}/${REPORT_PATH}"
if git -C "${RECEIPT_WORKTREE}" show "refs/remotes/origin/main:${REPORT_PATH}" 2>/dev/null |
  receipt_matches_run_id; then
  echo "Deployment receipt for run ${GITHUB_RUN_ID} is already recorded."
  exit 0
fi

mkdir -p "$(dirname "${REMOTE_REPORT}")"
cp "${SOURCE_REPORT}" "${REMOTE_REPORT}"
git -C "${RECEIPT_WORKTREE}" config user.name 'github-actions[bot]'
git -C "${RECEIPT_WORKTREE}" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "${RECEIPT_WORKTREE}" add -- "${REPORT_PATH}"
git -C "${RECEIPT_WORKTREE}" commit -m 'Record Social Factory DEV deployment [skip ci]'

for attempt in 1 2 3; do
  git -C "${SOURCE_ROOT}" fetch origin +refs/heads/main:refs/remotes/origin/main

  if git -C "${RECEIPT_WORKTREE}" show "refs/remotes/origin/main:${REPORT_PATH}" 2>/dev/null |
    receipt_matches_run_id; then
    echo "Deployment receipt for run ${GITHUB_RUN_ID} was recorded by another attempt."
    exit 0
  fi

  if ! git -C "${RECEIPT_WORKTREE}" rebase refs/remotes/origin/main; then
    git -C "${RECEIPT_WORKTREE}" rebase --abort || true
    echo 'Could not rebase the deployment receipt onto main; no existing changes were discarded.' >&2
    exit 1
  fi

  if git -C "${RECEIPT_WORKTREE}" push origin HEAD:refs/heads/main; then
    exit 0
  fi
  echo "Receipt push attempt ${attempt} lost a race with another main update." >&2
done

echo 'Could not record the deployment receipt after three attempts.' >&2
exit 1
