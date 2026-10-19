#!/usr/bin/env bash
# Mechanical PR gate. Prints a checklist for the reviewer and exits 1 on any FAIL.
#
#   scripts/pr-gate.sh                  # current branch vs origin/main
#   scripts/pr-gate.sh --base <branch>  # current branch vs origin/<branch> (a stacked PR-to-be)
#   scripts/pr-gate.sh <pr>             # that PR's head vs the PR's own base branch (also checks the PR body template)
#   scripts/pr-gate.sh <pr> --merge     # ...and, when the suite reads the diff, its pass on the merged tree (app/tool/test.sh --merged)
#   scripts/pr-gate.sh <pr> --fields    # only the PR body's template fields (the hook after `gh pr edit`)
#
# Every rule here used to be prose in docs/agents/dev-tracks.md that a dispatch prompt
# could waive. Now it can't: hooks run this before `gh pr create` and `gh pr merge`.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
PR=""; BASE_BRANCH="main"; MERGE=0; FIELDS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --merge) MERGE=1; shift ;;
    --fields) FIELDS=1; shift ;;
    --base) BASE_BRANCH="${2:-}"; shift; shift || true ;;
    --base=*) BASE_BRANCH="${1#--base=}"; shift ;;
    *) PR="$1"; shift ;;
  esac
done
FAIL=0
fail() { echo "FAIL  $*"; FAIL=1; }
body_fields() {
  local body; body="$(gh pr view "$PR" --json body --jq .body)"
  for field in 'Brief:' 'Screenshots:' 'Red:' 'Lanes:' 'Residency:'; do
    grep -q "^$field" <<<"$body" || fail "PR body missing '$field' (see .github/PULL_REQUEST_TEMPLATE.md)"
  done
}
if [[ $FIELDS -eq 1 ]]; then
  [[ -n "$PR" ]] || { echo "--fields needs a PR number"; exit 1; }
  body_fields; [[ $FAIL -eq 0 ]] && echo "PR body fields ok"; exit $FAIL
fi
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
touched '^app/'                && echo "  cd app && flutter analyze && tool/test.sh <the test dirs the diff touches> test/core/m2   # full suite: app/tool/test.sh --merged <pr>, before merge"
touched '^supabase/functions/' && echo "  deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions"
touched '^supabase/(migrations|tests)/' && echo "  supabase start && supabase test db"

# --- owner-gated merge ---------------------------------------------------------------
echo
if touched '^supabase/|^app/lib/core/store/|^shared/src/sync\.ts|privacySettings|/auth[A-Za-z]*\.(ts|tsx)$|auth-status'; then
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
for f in $(printf '%s\n' "${FILES[@]}" | grep -E '^mobile/src/.*\.tsx$|^mobile/src/lib/motion\.ts$|^app/lib/.*\.dart$' | grep -Ev '\.test\.tsx?$|^app/lib/(core|data)/' | sort -u); do
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

  # screenshots: the PNGs the PR body names; failing that, any PNG in the diff under docs/pr-review-media or in this branch's
  # dir. Composites and crops made from captures go in a derived/ subdir and need no sidecar.
  NAMED=""
  [[ -n "$PR" ]] && NAMED="$(gh pr view "$PR" --json body --jq .body | grep -oE 'docs/pr-review-media/[^ )`"]+\.png' | sort -u || true)"
  if [[ -n "$NAMED" ]]; then mapfile -t PNGS <<<"$NAMED"; else
    mapfile -t PNGS < <( { printf '%s\n' "${FILES[@]}" | grep -E '^docs/pr-review-media/.*\.png$'; ls docs/pr-review-media/"$SLUG"/*.png 2>/dev/null; } | grep -v '/derived/' | sort -u)
  fi
  if [[ ${#PNGS[@]} -eq 0 ]]; then
    fail "no screenshot: run mobile/scripts/screenshot.sh (or app/tool/screenshot.sh for app/) <route> (it writes docs/pr-review-media/$SLUG/) and commit the PNG + .json"
  else
    declare -A SEEN=()
    # In PR mode ($PR set), a sidecar must be read from HEAD_REF's own git content, not the local
    # working tree -- `gh pr merge <N>` can run from any checkout (the orchestrator's session isn't
    # necessarily sitting on that PR's branch), and a plain `-f`/`cat` against the local filesystem
    # silently checked whatever branch happened to be checked out there instead. Found live 2026-09-14
    # merging PR #475 from an unrelated branch: every sidecar FAILed as "missing" even though all
    # three existed, committed, in the PR itself. `git show`/`git cat-file` read the object store
    # directly and don't care what's checked out locally.
    NOW_FP="$(scripts/pixel-digest.sh "$BASE" "$HEAD_REF")" || { fail "scripts/pixel-digest.sh failed: cannot judge captures"; echo "GATE FAIL"; exit 1; }
    mapfile -t PIXEL_PATHS < scripts/pixel-paths
    read_sidecar() {
      if [[ -n "$PR" ]]; then git show "$HEAD_REF:$1" 2>/dev/null; else cat "$1" 2>/dev/null; fi
    }
    for png in "${PNGS[@]}"; do
      stem="${png%.png}"; stem="${stem%/frame-[0-9][0-9][0-9]}"; stem="${stem%-frames}"
      [[ -n "${SEEN[$stem]:-}" ]] && continue; SEEN[$stem]=1
      if [[ -n "$PR" ]] && ! git cat-file -e "$HEAD_REF:$png" 2>/dev/null; then fail "$png: named in the PR body but not in the PR's head"; continue; fi
      side="$stem.json"
      side_content="$(read_sidecar "$side")"
      if [[ -z "$side_content" ]]; then fail "$png: no sidecar $side (re-capture with the current screenshot.sh)"; continue; fi
      sha="$(jq -r .sha <<<"$side_content")"; dirty="$(jq -r .dirty <<<"$side_content")"
      if [[ "$dirty" == "true" ]]; then fail "$png: captured with uncommitted changes -- commit, then re-capture"; continue; fi
      # Fresh while every pixel path this PR changes now carries the same hunks it did when captured (scripts/pixel-digest.sh):
      # a rebase, or a merge of the base that leaves the PR's own hunks alone, keeps a capture. What the base itself changes is
      # the merged-tree suite's and goldens' to catch, not a capture's.
      stale=""
      if [[ "$(jq -r 'has("own")' <<<"$side_content")" == true ]]; then
        then_fp="$(jq -r '.own | to_entries[] | "\(.key) \(.value)"' <<<"$side_content")"
        # Both sides: a file the PR changed when captured but no longer does (reverted) is as stale as one it changed since.
        stale="$(join <(grep . <<<"$NOW_FP" | sort) <(grep . <<<"$then_fp" | sort) -a1 -a2 -e none -o 0,1.2,2.2 | awk '$2 != $3 {printf " %s", $1}')" \
          || { fail "$png: could not compare fingerprints"; continue; }
      elif git cat-file -e "$sha^{commit}" 2>/dev/null; then
        # A sidecar from before fingerprints: stale where the PR's own commits since the capture (not merges, not the base's) touch
        # a pixel path it changes.
        touched_since="$(git log --no-merges --format= --name-only "$sha..$HEAD_REF" "^origin/$BASE_BRANCH" -- "${PIXEL_PATHS[@]}")" \
          || { fail "$png: git log failed: cannot judge the capture"; continue; }
        stale="$(comm -12 <(cut -d' ' -f1 <<<"$NOW_FP" | sort -u) <(sort -u <<<"$touched_since") | xargs)"
        stale="${stale:+ $stale}"
      else
        fail "$png: captured at $sha, which is gone (a rebase) and the sidecar predates fingerprints -- app/tool/recapture.sh${PR:+ $PR}"; continue
      fi
      if [[ -n "$stale" ]]; then
        fail "$png: changed since capture:$stale -- app/tool/recapture.sh${PR:+ $PR}"
      else
        info "$png  ok (route $(jq -r .route <<<"$side_content"), device $(jq -r .device <<<"$side_content"))"
      fi
    done
  fi

  # motion literals outside motion.ts
  lit="$(git diff "$BASE" "$HEAD_REF" -- mobile/src ':(exclude)mobile/src/lib/motion.ts' ':(exclude)*.test.*' | grep -En '^\+.*(duration:\s*[0-9]|Easing\.(bezier|ease|linear|in|out|inOut)\b)' || true)"
  [[ -n "$lit" ]] && fail "duration/easing literal outside mobile/src/lib/motion.ts:"$'\n'"$lit"

  # Dart: Duration/Curves/Cubic/raw Color(0x literals only in theme/ (tokens), motion/ and ui/ (the kit);
  # app/test/literals_test.dart polices those three itself, so screens and everything else go through them
  dlit="$(git diff "$BASE" "$HEAD_REF" -- app/lib ':(exclude)app/lib/theme' ':(exclude)app/lib/motion' ':(exclude)app/lib/ui' ':(exclude)app/lib/core' ':(exclude)app/lib/data' ':(exclude)*_test.dart' | grep -En '^\+.*(\bDuration\(|\bCurves\.|\bCubic\(|\bColor\(0x)' || true)"
  [[ -n "$dlit" ]] && fail "Duration/Curves/Cubic/Color(0x literal outside app/lib/{theme,motion,ui} (use the M2 tokens/kit):"$'\n'"$dlit"

  # parity test present for components with an artboard row
  # Matches any artboardXxx() helper in mobile/src/lib/artboard.ts (artboardStyle,
  # artboardTransitions, artboardEnclosingStyle, artboardNthStyle, artboardPanelGap, and whatever
  # gets added next) -- a hardcoded name list here already missed two real helpers once (#515).
  added="$(git diff "$BASE" "$HEAD_REF" -- '*.test.ts' '*.test.tsx' | grep -E '^\+.*\bartboard[A-Za-z]*\(' || true)"
  for f in "${RENDERED[@]}"; do
    [[ "$f" == app/* ]] && continue
    rel="${f#mobile/src/}"
    if grep -Fq "\`$rel\`" docs/design/README.md && [[ -z "$added" ]]; then
      art="$(grep -F "\`$rel\`" docs/design/README.md | head -1 | awk -F'|' '{print $3}' | tr -d ' `')"
      warn "$f has artboard $art but the diff adds no artboard*() assertion -- reviewer: state why, by line"
    fi
  done
else
  echo "Rendered output: unchanged (no non-test .tsx under mobile/src or .dart under app/lib)"
fi

# --- PR body template ----------------------------------------------------------------
[[ -n "$PR" ]] && body_fields

# --- the suite on the merged tree (merge only) ------------------------------------------
# The one full run a PR gets is on the tree the merge makes (author and reviewer run only what the diff touches). The stamp is
# keyed on that tree's app/ and the vectors/fixtures the tests read, so it goes stale exactly when the merge result would change.
if [[ $MERGE -eq 1 && -n "$PR" ]] && touched '^app/|^shared/vectors/|^docs/design/explorations/2026-10-ui-overhaul/flows/'; then
  if key="$(scripts/suite-key.sh "$PR" 2>&1)"; then
    read -r _ k _ <<<"$key"; stamp="$HOME/.cache/udine-scratch/suite-pass/$k"
    if [[ -f "$stamp" ]]; then info "merged-tree suite: $(head -1 "$stamp")"
    else fail "no full-suite pass on the tree this merge makes -- app/tool/test.sh --merged $PR (~35 min, in the background; several PRs: --merged A B C, then merge them in that order)"; fi
  else fail "$key"; fi
fi

echo
[[ $FAIL -eq 0 ]] && echo "GATE PASS" || echo "GATE FAIL"
exit $FAIL
