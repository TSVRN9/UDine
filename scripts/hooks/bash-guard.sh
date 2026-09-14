#!/usr/bin/env bash
# PreToolUse(Bash) hook: `gh pr create` / `gh pr merge` must pass scripts/pr-gate.sh first.
# Exit 2 = block the tool call; stderr goes back to the model as the reason.
set -uo pipefail
input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
# `cwd` is the hook payload's own working-directory field -- per Claude Code's hooks reference it
# "reflects the current working directory and updates when Claude runs cd commands", so it tracks
# a worktree-isolated subagent's real checkout. $CLAUDE_PROJECT_DIR is NOT documented and was found
# live (2026-09-14, PR #474/#475) to stay fixed to the top-level session's original project root
# regardless of subagent worktree isolation -- using it here silently gated `gh pr create` against
# whatever branch/dirty-state the MAIN checkout happened to have open, not the branch actually
# being created, costing two agents a wasted investigation before the mechanism was found. Resolve
# root from `cwd` (falling back to pwd only if the payload ever lacks it); never from
# $CLAUDE_PROJECT_DIR again.
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
  out="$(cd "$root" && "$root/scripts/pr-gate.sh" 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before opening the PR:"$'\n'"$out" >&2; exit 2; fi
fi
exit 0
