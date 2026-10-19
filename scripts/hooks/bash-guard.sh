#!/usr/bin/env bash
# PreToolUse(Bash) hook: `gh pr create` / `gh pr merge` must pass scripts/pr-gate.sh first (merge: --merge, the merged-tree
# suite too, and never --delete-branch under a stacked child); flutter test runs under the memory cap.
# Exit 2 = block the tool call; stderr goes back to the model as the reason.
set -uo pipefail
input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
# `cwd` is the hook payload's own working-directory field -- Claude Code's hooks reference
# documents it as following Claude into a worktree and through any `cd`, and says to read it
# when a hook needs to know which directory Claude is working in. $CLAUDE_PROJECT_DIR is ALSO
# documented -- but documented to stay pinned at session-start root even inside a worktree, which
# is exactly the wrong invariant for this job: using it here silently gated `gh pr create` against
# whatever branch/dirty-state the MAIN checkout happened to have open, not the branch actually
# being created, costing two agents a wasted investigation (2026-09-14, PR #474/#475) before the
# mechanism was found. Resolve root from `cwd` (falling back to pwd only if the payload ever lacks
# it); $CLAUDE_PROJECT_DIR answers a different question than this hook needs answered.
root="$(jq -r '.cwd // empty' <<<"$input")"
root="${root:-$(pwd)}"

# Match only at a command position (line start or after ; && ||), not inside a quoted string.
at_cmd() { grep -Eq "(^|[;&|])[[:space:]]*$1" <<<"$cmd"; }
# gh-pages is the published privacy policy (owenwang.dev/UDine/): no shared history with main and no app code, so the gate has nothing to judge.
base_flag() { grep -Eo '(--base|-B)[= ] *[^ ;&|]+' <<<"$cmd" | head -1 | sed -E "s/^(--base|-B)[= ] *//; s/^[\"']//; s/[\"']\$//" || true; }
# The PR number is the first bare integer after `gh pr merge`, wherever the flags sit.
pr_arg() { grep -Eo "gh pr $1( +[^ ;&|]+)*" <<<"$cmd" | head -1 | tr ' ' '\n' | grep -Ex '[0-9]+' | head -1 || true; }
if at_cmd 'gh pr merge\b'; then
  pr="$(pr_arg merge)"
  [[ -z "$pr" ]] && { echo "name the PR: gh pr merge <number> ... (the gate judges that PR, its merged-tree suite and its stacked children)" >&2; exit 2; }
  [[ -n "$pr" && "$(cd "$root" && gh pr view "$pr" --json baseRefName --jq .baseRefName 2>/dev/null)" == gh-pages ]] && exit 0
  # A stacked child's base branch must outlive the parent's merge: deleting it closes the child, which can't be reopened.
  if grep -Eq -- '(^|[[:space:]])(-d|--delete-branch)\b' <<<"$cmd"; then
    head="$(cd "$root" && gh pr view "$pr" --json headRefName --jq .headRefName 2>/dev/null)"
    kids="$(cd "$root" && gh pr list --base "$head" --json number --jq '[.[].number] | join(" #")' 2>/dev/null)"
    [[ -n "$kids" ]] && { echo "#$kids is based on $head: merge #$pr without --delete-branch, retarget the child to main, then delete the branch" >&2; exit 2; }
  fi
  out="$(cd "$root" && "$root/scripts/pr-gate.sh" $pr --merge 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before merging:"$'\n'"$out" >&2; exit 2; fi
  if grep -q 'OWNER-GATED' <<<"$out"; then echo "OWNER-GATED: this PR touches supabase/auth/sync/residency. Post the verdict; the owner merges." >&2; exit 2; fi
elif grep -Eq '(^|[^[:alnum:]_./-])flutter test\b' <<<"$cmd" && ! grep -Eq '^[[:space:]]*(grep|rg|git|echo|printf|cat|sed|jq|gh)\b' <<<"$cmd"; then
  # flutter test only through app/tool/test.sh: a runaway test without the 4G cap took the host down twice (2026-10-17),
  # and full suites outside suite.lock pile up.
  if ! grep -Eq 'MemoryMax=' <<<"$cmd"; then
    echo "run tests with app/tool/test.sh <test paths> (the 4G cap and, for a full suite, suite.lock), not bare flutter test" >&2; exit 2
  fi
  if ! grep -Eq 'flutter test[^;&|]*(test/|_test\.dart)' <<<"$cmd" && ! grep -q 'suite.lock' <<<"$cmd"; then
    echo "a full suite goes through app/tool/test.sh (suite.lock queues it behind the others); the one a PR needs is app/tool/test.sh --merged <pr>" >&2; exit 2
  fi
elif at_cmd 'gh pr create\b'; then
  # Stacked PR: judge the branch against the base it will open against (--base X, --base=X, -B X, -B=X; default main).
  base="$(base_flag)"
  [[ "$base" == gh-pages ]] && exit 0
  out="$(cd "$root" && "$root/scripts/pr-gate.sh" ${base:+--base "$base"} 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before opening the PR:"$'\n'"$out" >&2; exit 2; fi
fi
exit 0
