#!/usr/bin/env bash
# PreToolUse(Bash) hook: `gh pr create` / `gh pr merge` must pass scripts/pr-gate.sh first.
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
if at_cmd 'gh pr merge\b'; then
  pr="$(grep -Eo 'gh pr merge +[0-9]+' <<<"$cmd" | grep -Eo '[0-9]+$' || true)"
  out="$(cd "$root" && "$root/scripts/pr-gate.sh" $pr 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before merging:"$'\n'"$out" >&2; exit 2; fi
  if grep -q 'OWNER-GATED' <<<"$out"; then echo "OWNER-GATED: this PR touches supabase/auth/sync/residency. Post the verdict; the owner merges." >&2; exit 2; fi
elif at_cmd 'gh pr create\b'; then
  # Stacked PR: judge the branch against the base it will open against (--base X, --base=X, -B X, -B=X; default main).
  base="$(grep -Eo '(--base|-B)[= ] *[^ ;&|]+' <<<"$cmd" | head -1 | sed -E "s/^(--base|-B)[= ] *//; s/^[\"']//; s/[\"']\$//" || true)"
  out="$(cd "$root" && "$root/scripts/pr-gate.sh" ${base:+--base "$base"} 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before opening the PR:"$'\n'"$out" >&2; exit 2; fi
fi
exit 0
