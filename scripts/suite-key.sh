#!/usr/bin/env bash
# Prints "<merged tree> <key>" for PR <n> merged into its base, or exits 1 naming the conflict.
# The key covers everything the Flutter suite reads: app/ plus the vectors and fixtures its tests load from outside it
# (grep "'\.\./" app/test). A merge of docs elsewhere into the base keeps the key, so it keeps the suite's pass.
set -euo pipefail
PR="${1:?usage: suite-key.sh <pr>}"
read -r HEAD BASE < <(gh pr view "$PR" --json headRefName,baseRefName --jq '"\(.headRefName) \(.baseRefName)"')
git fetch -q origin "$HEAD" "$BASE"
if ! OUT="$(git merge-tree --write-tree --name-only --no-messages "origin/$BASE" "origin/$HEAD")"; then
  echo "PR #$PR does not merge cleanly into $BASE (${OUT#*$'\n'}): merge $BASE into the branch first" >&2; exit 1
fi
TREE="${OUT%%$'\n'*}"
KEY="$(for p in app docs/design/explorations/2026-10-ui-overhaul/flows shared/vectors; do git rev-parse "$TREE:$p" 2>/dev/null || echo "-"; done | sha1sum | cut -c1-40)"
echo "$TREE $KEY"
