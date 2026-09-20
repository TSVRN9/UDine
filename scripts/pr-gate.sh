#!/usr/bin/env bash
# Mechanical PR gate. Prints a checklist for the reviewer and exits 1 on any FAIL.
#
#   scripts/pr-gate.sh                  # current branch vs origin/main
#   scripts/pr-gate.sh --base <branch>  # current branch vs origin/<branch> (a stacked PR-to-be)
#   scripts/pr-gate.sh <pr>             # that PR's head vs the PR's own base branch (also checks the PR body template)
#
# Every rule here used to be prose in docs/agents/dev-tracks.md that a dispatch prompt
# could waive. Now it can't: hooks run this before `gh pr create` and `gh pr merge`.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
PR=""; BASE_BRANCH="main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_BRANCH="${2:-}"; shift; shift || true ;;
    --base=*) BASE_BRANCH="${1#--base=}"; shift ;;
    *) PR="$1"; shift ;;
  esac
done
FAIL=0
fail() { echo "FAIL  $*"; FAIL=1; }
warn() { echo "WARN  $*"; }
info() { echo "info  $*"; }

if [[ -n "$PR" ]]; then
  # A PR is judged against its OWN base (a stacked child's base is its parent branch, not main).
  BRANCH="$(gh pr view "$PR" --json headRefName --jq .headRefName)"
  BASE_BRANCH="$(gh pr view "$PR" --json baseRefName --jq .baseRefName)"
  git fetch -q origin "$BRANCH" 2>/dev/null || true
  HEAD_REF="origin/$BRANCH"
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  HEAD_REF="HEAD"
fi
[[ -n "$BASE_BRANCH" ]] && { git fetch -q origin "$BASE_BRANCH" 2>/dev/null || true; }
# Fail closed: an unresolvable PR/branch must never fall through to "no diff" and exit 0.
if [[ -z "$BRANCH" ]] || ! git rev-parse --verify -q "$HEAD_REF" >/dev/null; then
  echo "FAIL  cannot resolve ${PR:+PR #$PR / }branch '$BRANCH' (fetch failed, branch deleted, or bad PR number)"; exit 1
fi
if [[ -z "$BASE_BRANCH" ]] || ! git rev-parse --verify -q "origin/$BASE_BRANCH" >/dev/null; then
  echo "FAIL  cannot resolve base branch 'origin/$BASE_BRANCH' (fetch failed, branch deleted, or empty --base)"; exit 1
fi
BASE="$(git merge-base "origin/$BASE_BRANCH" "$HEAD_REF")" || { echo "FAIL  no merge-base with origin/$BASE_BRANCH"; exit 1; }
HEAD_SHA="$(git rev-parse "$HEAD_REF")"
SLUG="${BRANCH//\//-}"

mapfile -t FILES < <(git diff --name-only "$BASE" "$HEAD_REF")
if [[ -n "$PR" ]]; then :; else
  mapfile -t -O "${#FILES[@]}" FILES < <(git status --porcelain | awk '{print $2}')
fi
[[ ${#FILES[@]} -eq 0 ]] && { echo "no diff vs origin/$BASE_BRANCH"; exit 0; }
STAT="$(git diff --shortstat "$BASE" "$HEAD_REF")"
info "branch $BRANCH  base origin/$BASE_BRANCH  head ${HEAD_SHA:0:8}  $STAT"

touched() { printf '%s\n' "${FILES[@]}" | grep -Eq "$1"; }

# --- lanes ---------------------------------------------------------------------------
echo; echo "Lanes to run (from .github/workflows/ci.yml):"
touched '^shared/'             && echo "  pnpm --filter @udine/shared test && pnpm --filter @udine/shared typecheck && pnpm --filter @udine/shared lint"
touched '^web/'                && echo "  pnpm --filter web test && pnpm --filter web check && pnpm --filter web lint"
touched '^web/e2e/'            && echo "  cd web && npx playwright test"
touched '^(mobile|shared)/'    && echo "  cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm --filter mobile lint"
if touched '^mobile/src/app/' || git diff --name-only --diff-filter=A "$BASE" "$HEAD_REF" | grep -q '^mobile/src/'; then
  echo "  cd mobile && npx expo export --platform android --output-dir /tmp/udine-export   # bundle lane (#435)"
fi
touched '^supabase/functions/' && echo "  deno test --node-modules-dir=none --allow-env supabase/functions"
touched '^supabase/(migrations|tests)/' && echo "  supabase start && supabase test db"

# --- owner-gated merge ---------------------------------------------------------------
echo
if touched '^supabase/|^shared/src/sync\.ts|privacySettings|/auth[A-Za-z]*\.(ts|tsx)$|auth-status'; then
  echo "OWNER-GATED MERGE: diff touches supabase/, auth, sync, or the residency table. Reviewer posts a verdict; the owner merges."
fi

# --- rendered output -----------------------------------------------------------------
# A .tsx whose diff is only comments/blank lines did not change rendered output.
RENDERED=()
# Buffer each diff into a variable before grepping it -- a live pipe from `git diff` straight
# into a `grep -q` (which exits the instant it finds a match) can SIGPIPE the still-writing
# upstream `git diff`/`grep -E` under `set -o pipefail`; observed as a genuine flaky RENDERED
# result live 2026-09-14 (PR #476 review) -- one early run under-detected the changed-file set.
# A here-string feeds an already-fully-buffered value, not a live subprocess, so there is nothing
# left running upstream for a short-circuiting grep to SIGPIPE.
for f in $(printf '%s\n' "${FILES[@]}" | grep -E '^mobile/src/.*\.tsx$|^mobile/src/lib/motion\.ts$' | grep -Ev '\.test\.tsx?$' | sort -u); do
  base_diff="$(git diff "$BASE" "$HEAD_REF" -- "$f")"
  if grep -E '^[-+][^-+]' <<<"$base_diff" | grep -Evq '^[-+][[:space:]]*(//|/\*|\*|\*/|$)'; then
    RENDERED+=("$f")
  elif [[ -z "$PR" ]]; then
    local_diff="$(git diff -- "$f")"
    if grep -E '^[-+][^-+]' <<<"$local_diff" | grep -Evq '^[-+][[:space:]]*(//|/\*|\*|\*/|$)'; then RENDERED+=("$f"); fi
  fi
done
if [[ ${#RENDERED[@]} -gt 0 ]]; then
  echo "Rendered output changed:"; printf '  %s\n' "${RENDERED[@]}"

  # screenshots: any PNG in the diff under docs/pr-review-media, or in this branch's dir
  mapfile -t PNGS < <( { printf '%s\n' "${FILES[@]}" | grep -E '^docs/pr-review-media/.*\.png$'; ls docs/pr-review-media/"$SLUG"/*.png 2>/dev/null; } | sort -u)
  if [[ ${#PNGS[@]} -eq 0 ]]; then
    fail "no screenshot: run mobile/scripts/screenshot.sh <route> (it writes docs/pr-review-media/$SLUG/) and commit the PNG + .json"
  else
    declare -A SEEN=()
    # In PR mode ($PR set), a sidecar must be read from HEAD_REF's own git content, not the local
    # working tree -- `gh pr merge <N>` can run from any checkout (the orchestrator's session isn't
    # necessarily sitting on that PR's branch), and a plain `-f`/`cat` against the local filesystem
    # silently checked whatever branch happened to be checked out there instead. Found live 2026-09-14
    # merging PR #475 from an unrelated branch: every sidecar FAILed as "missing" even though all
    # three existed, committed, in the PR itself. `git show`/`git cat-file` read the object store
    # directly and don't care what's checked out locally.
    read_sidecar() {
      if [[ -n "$PR" ]]; then git show "$HEAD_REF:$1" 2>/dev/null; else cat "$1" 2>/dev/null; fi
    }
    for png in "${PNGS[@]}"; do
      stem="${png%.png}"; stem="${stem%/frame-[0-9][0-9][0-9]}"; stem="${stem%-frames}"
      [[ -n "${SEEN[$stem]:-}" ]] && continue; SEEN[$stem]=1
      side="$stem.json"
      side_content="$(read_sidecar "$side")"
      if [[ -z "$side_content" ]]; then fail "$png: no sidecar $side (re-capture with the current screenshot.sh)"; continue; fi
      sha="$(jq -r .sha <<<"$side_content")"; dirty="$(jq -r .dirty <<<"$side_content")"
      if [[ "$dirty" == "true" ]]; then fail "$png: captured with uncommitted changes -- commit, then re-capture"; continue; fi
      if ! git merge-base --is-ancestor "$sha" "$HEAD_REF" 2>/dev/null; then fail "$png: captured at $sha, not an ancestor of $HEAD_REF"; continue; fi
      if ! git diff --quiet "$sha" "$HEAD_REF" -- . ':(exclude)docs/pr-review-media'; then
        fail "$png: code changed since capture ($sha -> ${HEAD_SHA:0:8}) -- re-capture"
      else
        info "$png  ok (sha ${sha:0:8}, route $(jq -r .route <<<"$side_content"), device $(jq -r .device <<<"$side_content"))"
      fi
    done
  fi

  # motion literals outside motion.ts
  lit="$(git diff "$BASE" "$HEAD_REF" -- mobile/src ':(exclude)mobile/src/lib/motion.ts' ':(exclude)*.test.*' | grep -En '^\+.*(duration:\s*[0-9]|Easing\.(bezier|ease|linear|in|out|inOut)\b)' || true)"
  [[ -n "$lit" ]] && fail "duration/easing literal outside mobile/src/lib/motion.ts:"$'\n'"$lit"

  # parity test present for components with an artboard row
  # Matches any artboardXxx() helper in mobile/src/lib/artboard.ts (artboardStyle,
  # artboardTransitions, artboardEnclosingStyle, artboardNthStyle, artboardPanelGap, and whatever
  # gets added next) -- a hardcoded name list here already missed two real helpers once (#515).
  added="$(git diff "$BASE" "$HEAD_REF" -- '*.test.ts' '*.test.tsx' | grep -E '^\+.*\bartboard[A-Za-z]*\(' || true)"
  for f in "${RENDERED[@]}"; do
    rel="${f#mobile/src/}"
    if grep -Fq "\`$rel\`" docs/design/README.md && [[ -z "$added" ]]; then
      art="$(grep -F "\`$rel\`" docs/design/README.md | head -1 | awk -F'|' '{print $3}' | tr -d ' `')"
      warn "$f has artboard $art but the diff adds no artboard*() assertion -- reviewer: state why, by line"
    fi
  done
else
  echo "Rendered output: unchanged (no non-test .tsx under mobile/src)"
fi

# --- PR body template ----------------------------------------------------------------
if [[ -n "$PR" ]]; then
  body="$(gh pr view "$PR" --json body --jq .body)"
  for field in 'Brief:' 'Screenshots:' 'Red:' 'Lanes:' 'Residency:'; do
    grep -q "^$field" <<<"$body" || fail "PR body missing '$field' (see .github/PULL_REQUEST_TEMPLATE.md)"
  done
fi

echo
[[ $FAIL -eq 0 ]] && echo "GATE PASS" || echo "GATE FAIL"
exit $FAIL
