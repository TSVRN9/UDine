#!/usr/bin/env bash
# PostToolUse(Bash) hook: after `gh pr edit N`, the body must still carry the template fields the merge gate wants. The PreToolUse
# gate never sees an edit, so a REWORK's body rewrite used to drift (to markdown headers) and only fail at merge.
set -uo pipefail
input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
pr="$(grep -Eo "gh pr edit( +[^ ;&|]+)*" <<<"$cmd" | head -1 | tr ' ' '\n' | grep -Ex '[0-9]+' | head -1 || true)"
[[ -z "$pr" ]] && exit 0
grep -Eq -- '--body|-b |--body-file|-F ' <<<"$cmd" || exit 0
root="$(jq -r '.cwd // empty' <<<"$input")"; root="${root:-$(pwd)}"
out="$(cd "$root" && "$root/scripts/pr-gate.sh" "$pr" --fields 2>&1)" || { echo "PR #$pr body after the edit:"$'\n'"$out" >&2; exit 2; }
exit 0
