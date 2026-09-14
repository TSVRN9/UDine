#!/usr/bin/env bash
# PreToolUse(Bash) hook: `gh pr create` / `gh pr merge` must pass scripts/pr-gate.sh first.
# Exit 2 = block the tool call; stderr goes back to the model as the reason.
set -uo pipefail
input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Match only at a command position (line start or after ; && ||), not inside a quoted string.
at_cmd() { grep -Eq "(^|[;&|])[[:space:]]*$1" <<<"$cmd"; }
if at_cmd 'gh pr merge\b'; then
  pr="$(grep -Eo 'gh pr merge +[0-9]+' <<<"$cmd" | grep -Eo '[0-9]+$' || true)"
  out="$("$root/scripts/pr-gate.sh" $pr 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before merging:"$'\n'"$out" >&2; exit 2; fi
  if grep -q 'OWNER-GATED' <<<"$out"; then echo "OWNER-GATED: this PR touches supabase/auth/sync/residency. Post the verdict; the owner merges." >&2; exit 2; fi
elif at_cmd 'gh pr create\b'; then
  out="$("$root/scripts/pr-gate.sh" 2>&1)"; rc=$?
  if [[ $rc -ne 0 ]]; then echo "pr-gate failed -- fix before opening the PR:"$'\n'"$out" >&2; exit 2; fi
fi
exit 0
