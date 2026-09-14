#!/usr/bin/env bash
# Stop hook for subagents: if the last message says it is waiting for something to finish,
# bounce it once with the foreground-poll instruction instead of letting it yield (a yielded
# subagent is never woken by its own background task -- seen 5+ times, see orchestration.md).
set -uo pipefail
input="$(cat)"
transcript="$(jq -r '.transcript_path // ""' <<<"$input")"
sid="$(jq -r '.agent_id // .session_id // "x"' <<<"$input")"
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0
[[ -f "$transcript" ]] || exit 0
marker="/tmp/udine-stall-bounce-$sid"
[[ -e "$marker" ]] && exit 0   # one bounce per agent, never a loop

last="$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$transcript" 2>/dev/null | tail -c 2000)"
if grep -Eiq "wait(ing)? (for|on|until)|once (it|the|that) .*(complete|finish|land)|(monitor|notification)" <<<"$last" \
   && ! grep -Eq 'https://github.com/[^ ]+/pull/[0-9]+' <<<"$last"; then
  touch "$marker"
  jq -n --arg r "You ended your turn waiting for something. Nothing will wake you. Run the wait in the FOREGROUND now, as one blocking Bash call with the tool timeout raised to 600000 ms: timeout 600 bash -c 'until CHECK; do sleep 10; done' (CHECK = a real state probe: the output file exists, adb reports the new install, supabase status is up). Then finish the task and report. Do not use run_in_background or Monitor." '{decision:"block", reason:$r}'
fi
exit 0
