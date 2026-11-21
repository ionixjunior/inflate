#!/usr/bin/env bash
# CI evidence for one runner of the newest completed ci.yml run whose code (everything outside
# .specs/) is identical to HEAD: the run's jobs and artifacts, the runner job's conclusion, one line
# per step (✓ success, - skipped, ✗ anything else) and the job's full log.
# Exits 1 when no such run exists or the runner's job did not succeed.
# Usage: bash .specs/features/multi-platform-support/proofs/ci.sh <runner label>
set -uo pipefail

runner="$1"
branch=feature/multi-platform-support
head=$(git rev-parse HEAD)

run_id=""
run_sha=""
while IFS=$'\t' read -r id sha status; do
  [ "$status" = completed ] || continue
  git cat-file -e "${sha}^{commit}" 2>/dev/null || continue
  if git diff --quiet "$sha" "$head" -- . ':(exclude).specs'; then
    run_id=$id
    run_sha=$sha
    break
  fi
done < <(gh run list --workflow ci.yml --branch "$branch" --limit 50 \
  --json databaseId,headSha,status --jq '.[] | [.databaseId, .headSha, .status] | @tsv')

if [ -z "$run_id" ]; then
  echo "no completed ci.yml run on $branch whose code matches HEAD $head"
  exit 1
fi

echo "CI run $run_id at $run_sha: code identical to HEAD $head"
gh run view "$run_id" --json jobs --jq '"run jobs: " + ([.jobs[].name] | join(", "))'
gh api "repos/{owner}/{repo}/actions/runs/$run_id/artifacts" --jq '.artifacts[] | "artifact: " + .name'

job_line=$(gh run view "$run_id" --json jobs \
  --jq ".jobs[] | select(.name | contains(\"($runner)\")) | [.databaseId, .name, .conclusion] | @tsv")
if [ -z "$job_line" ]; then
  echo "run $run_id has no job for $runner"
  exit 1
fi
IFS=$'\t' read -r job_id job_name conclusion <<< "$job_line"
echo "job $job_name conclusion: $conclusion"

gh run view "$run_id" --json jobs --jq ".jobs[] | select(.databaseId == $job_id) | .steps[] |
  if .conclusion == \"success\" then \"✓ \" + .name
  elif .conclusion == \"skipped\" then \"- \" + .name + \" (skipped)\"
  else \"✗ \" + .name + \" (\" + (.conclusion // \"none\") + \")\" end"

echo "--- job log ---"
gh run view "$run_id" --log --job "$job_id"

[ "$conclusion" = success ]
