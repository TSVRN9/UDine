#!/usr/bin/env bash
set -euo pipefail

# flutter test under the host's memory rules: a runaway test is killed alone at 4G (it took the whole host down twice on
# 2026-10-17), and only one full suite runs at a time.
#
#   app/tool/test.sh test/screens/foo_test.dart test/core/m2   # the dirs/files a diff touches; any flutter test flags pass through
#   app/tool/test.sh                                           # the full suite (~35 min), queued behind any other on suite.lock
#   app/tool/test.sh --merged <pr>                             # the full suite on <pr> merged into its base, in a scratch worktree
#
# --merged is the one full run a PR gets: on a pass it stamps ~/.cache/udine-scratch/suite-pass/<key> (scripts/suite-key.sh),
# and the merge hook (scripts/pr-gate.sh --merge) refuses `gh pr merge` without the stamp for the tree the merge would make.

SCRATCH="$HOME/.cache/udine-scratch"
mkdir -p "$SCRATCH/suite-pass"
capped() { systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=0 flutter test --concurrency=1 "$@"; }

if [[ "${1:-}" != --merged ]]; then
  cd "$(git rev-parse --show-toplevel)/app"
  paths=0
  for a in "$@"; do [[ "$a" == test/* || "$a" == *_test.dart ]] && paths=1; done
  if [[ $paths -eq 1 ]]; then capped "$@"; else flock "$SCRATCH/suite.lock" bash -c "$(declare -f capped); capped \"\$@\"" _ "$@"; fi
  exit
fi

PR="${2:?usage: test.sh --merged <pr>}"
ROOT="$(git rev-parse --show-toplevel)"
read -r TREE KEY < <("$ROOT/scripts/suite-key.sh" "$PR")
[[ -n "${KEY:-}" ]] || exit 1
STAMP="$SCRATCH/suite-pass/$KEY"
[[ -f "$STAMP" ]] && { echo "already passed: $(head -1 "$STAMP")"; exit 0; }
read -r HEAD BASE < <(gh pr view "$PR" --json headRefName,baseRefName --jq '"\(.headRefName) \(.baseRefName)"')
HEAD_SHA="$(git rev-parse "origin/$HEAD")"; BASE_SHA="$(git rev-parse "origin/$BASE")"
C="$(git commit-tree "$TREE" -p "$BASE_SHA" -p "$HEAD_SHA" -m "suite: #$PR merged into $BASE")"
WT="$SCRATCH/merged-$PR"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add -q --detach "$WT" "$C"
trap 'git -C "$ROOT" worktree remove --force "$WT"' EXIT
LOG="$SCRATCH/merged-$PR-suite.log"
cd "$WT/app"
flutter pub get >/dev/null
flutter analyze --no-fatal-infos >"$LOG" 2>&1 || { tail -20 "$LOG"; echo "analyze failed on the merged tree (log: $LOG)"; exit 1; }
if flock "$SCRATCH/suite.lock" bash -c "$(declare -f capped); capped" >>"$LOG" 2>&1; then
  { echo "#$PR head ${HEAD_SHA:0:8} into $BASE ${BASE_SHA:0:8} passed $(date -u +%FT%TZ)"; tail -1 "$LOG"; } > "$STAMP"
  cat "$STAMP"
else
  grep -E '\[E\]|Some tests failed|did not complete' "$LOG" | tail -20
  echo "FAILED on the merged tree (log: $LOG)"; exit 1
fi
