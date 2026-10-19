#!/usr/bin/env bash
# Prints "<merged tree> <key> <merge commit>" for PR <n> merged into its base -- or, given several PRs, one line per step of
# merging them in that order (a merge train) -- or exits 1 naming the conflict. The key covers everything the Flutter suite
# reads: app/ plus the tokens, vectors and fixtures its tests load from outside it (grep "'\.\./" app/test, and tool/gen_tokens.dart). A merge of docs elsewhere
# into the base keeps the key, so it keeps the suite's pass.
set -euo pipefail
[[ $# -gt 0 ]] || { echo "usage: suite-key.sh <pr> [<pr>...]" >&2; exit 2; }
PREV=""
for PR in "$@"; do
  read -r HEAD BASE < <(gh pr view "$PR" --json headRefName,baseRefName --jq '"\(.headRefName) \(.baseRefName)"')
  git fetch -q origin "$HEAD" "$BASE"
  PREV="${PREV:-$(git rev-parse "origin/$BASE")}"
  if ! OUT="$(git merge-tree --write-tree --name-only --no-messages "$PREV" "origin/$HEAD")"; then
    echo "PR #$PR does not merge cleanly into $BASE${2:+ after the PRs before it} (${OUT#*$'\n'}): merge $BASE into the branch first" >&2; exit 1
  fi
  TREE="${OUT%%$'\n'*}"
  KEY="$(for p in app design-tokens docs/design/explorations/2026-10-ui-overhaul/flows shared/vectors; do git rev-parse "$TREE:$p" 2>/dev/null || echo "-"; done | sha1sum | cut -c1-40)"
  PREV="$(git commit-tree "$TREE" -p "$PREV" -p "origin/$HEAD" -m "suite: #$PR merged")"
  echo "$TREE $KEY $PREV"
done
