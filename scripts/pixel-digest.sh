#!/usr/bin/env bash
# "<path> <fingerprint>" for each pixel path (scripts/pixel-paths) <tip> itself changes since <fork>: the file's hunks without
# line numbers or context, so a rebase, or a merge of the base that leaves the branch's own hunks alone, keeps it.
# A capture stays fresh while every file the PR changes now has the fingerprint it had when captured (scripts/pr-gate.sh).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
mapfile -t PIX < "$ROOT/scripts/pixel-paths"
git -C "$ROOT" diff --name-only "${1:?fork}" "${2:?tip}" -- "${PIX[@]}" | while read -r f; do
  echo "$f $(git -C "$ROOT" diff -U0 --no-color --no-ext-diff "$1" "$2" -- "$f" | grep -vE '^(@@|index )' | sha1sum | cut -c1-40)"
done
