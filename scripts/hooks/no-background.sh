#!/usr/bin/env bash
# PreToolUse(Bash) hook for subagents: a backgrounded command never wakes a yielded subagent
# (docs/agents/orchestration.md "Stalls"). Block it and hand back the exact foreground form.
set -uo pipefail
bg="$(jq -r '.tool_input.run_in_background // false' < /dev/stdin)"
if [[ "$bg" == "true" ]]; then
  cat >&2 <<'EOF'
run_in_background is disabled for subagents: nothing wakes you when it finishes. Run the same
command in the FOREGROUND with the tool-call timeout raised (max 600000 ms). If it needs a wait,
paste this literally, with a real state probe as CHECK:

  timeout 600 bash -c 'until CHECK; do sleep 10; done'

Most commands here (screenshot.sh, jest, tsc, expo export) already block -- call them directly.
Do not use Monitor. Do not end your turn to "wait for" anything.
EOF
  exit 2
fi
exit 0
