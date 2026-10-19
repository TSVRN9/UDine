#!/usr/bin/env bash
set -euo pipefail

# flutter test under the host's memory rules: a runaway test is killed alone at 4G (it took the whole host down twice on
# 2026-10-17), and only one full suite runs at a time.
#
#   app/tool/test.sh test/screens/foo_test.dart test/core/m2   # the dirs/files a diff touches; any flutter test flags pass through
#   app/tool/test.sh                                           # the full suite (~35 min), queued behind any other on suite.lock
#   app/tool/test.sh --merged <pr>                             # the full suite on <pr> merged into its base, in a scratch worktree
#   app/tool/test.sh --merged <pr> <pr>...                     # a merge train: one run on all of them merged in that order
#
# --merged is the one full run a PR gets: on a pass it stamps ~/.cache/udine-scratch/suite-pass/<key> (scripts/suite-key.sh),
# and the merge hook (scripts/pr-gate.sh --merge) refuses `gh pr merge` without the stamp for the tree the merge would make.
# A train stamps every step's tree, so merging the PRs in that order finds each one's stamp; any other merge in between
# changes the trees and needs a new run. ponytail: only the last step's tree is tested; a defect that one PR brings and a
# later one in the train hides would get through.

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

shift; [[ $# -gt 0 ]] || { echo "usage: test.sh --merged <pr> [<pr>...]" >&2; exit 2; }
ROOT="$(git rev-parse --show-toplevel)"
mapfile -t STEPS < <("$ROOT/scripts/suite-key.sh" "$@") || exit 1
[[ ${#STEPS[@]} -eq $# ]] || exit 1
read -r _ KEY C <<<"${STEPS[-1]}"
[[ -f "$SCRATCH/suite-pass/$KEY" ]] && { echo "already passed: $(head -1 "$SCRATCH/suite-pass/$KEY")"; exit 0; }
PR="$(IFS=-; echo "$*")"
WT="$SCRATCH/merged-$PR"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add -q --detach "$WT" "$C"
trap 'git -C "$ROOT" worktree remove --force "$WT"' EXIT
LOG="$SCRATCH/merged-$PR-suite.log"
cd "$WT/app"
flutter pub get >/dev/null
flutter analyze --no-fatal-infos >"$LOG" 2>&1 || { tail -20 "$LOG"; echo "analyze failed on the merged tree (log: $LOG)"; exit 1; }
if flock "$SCRATCH/suite.lock" bash -c "$(declare -f capped); capped" >>"$LOG" 2>&1; then
  for i in "${!STEPS[@]}"; do
    read -r _ k _ <<<"${STEPS[$i]}"
    { printf '#%s ' "${@:1:i+1}"; echo "merged in order into $(git -C "$ROOT" rev-parse --short origin/main) passed $(date -u +%FT%TZ)"; tail -1 "$LOG"; } > "$SCRATCH/suite-pass/$k.tmp"
    mv "$SCRATCH/suite-pass/$k.tmp" "$SCRATCH/suite-pass/$k"
  done
  cat "$SCRATCH/suite-pass/$KEY"
else
  grep -E '\[E\]|Some tests failed|did not complete' "$LOG" | tail -20
  echo "FAILED on the merged tree (log: $LOG)"; exit 1
fi
