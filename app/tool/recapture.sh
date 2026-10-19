#!/usr/bin/env bash
set -euo pipefail

# Re-takes a PR's captures at its current head and commits them: one profile build (under heavy.lock), then every capture's
# own arguments replayed on one emulator (under emu.lock). Run it from the PR's worktree, clean, at the pushed head.
#
#   app/tool/recapture.sh [<pr>] [--serial S]     # default serial emulator-5556
#
# Which captures: the PNGs the PR body names (as the gate reads them), else every sidecar'd PNG in this branch's media dir.
# A sidecar from before 2026-10-18 has no `argv`: its route is replayed alone, so a capture that needed taps or a swipe
# comes back as the route's first screen -- the script lists those for a look before you push.

PR=""; SERIAL=emulator-5556
while [[ $# -gt 0 ]]; do
  case "$1" in --serial) SERIAL="$2"; shift 2 ;; *) PR="$1"; shift ;; esac
done
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
SCRATCH="$HOME/.cache/udine-scratch"; mkdir -p "$SCRATCH"
[[ -z "$(git status --porcelain)" ]] || { echo "commit or drop your changes first: a capture of a dirty tree fails the gate" >&2; exit 1; }
SLUG="$(git rev-parse --abbrev-ref HEAD)"; SLUG="${SLUG//\//-}"

NAMED=""
[[ -n "$PR" ]] && NAMED="$(gh pr view "$PR" --json body --jq .body | grep -oE 'docs/pr-review-media/[^ )`"]+\.png' | sort -u || true)"
[[ -n "$NAMED" ]] || NAMED="$(ls docs/pr-review-media/"$SLUG"/*.png 2>/dev/null || true)"
STEMS=()
while read -r png; do
  [[ -z "$png" ]] && continue
  stem="${png%.png}"
  if [[ ! -f "$stem.json" ]]; then echo "skip $png: no sidecar (a derived image belongs in derived/)"
  elif [[ "$(jq -r .route "$stem.json")" != /* ]]; then echo "skip $png: taken by hand ($(jq -r .route "$stem.json" | cut -c1-80)), retake it the same way"
  else STEMS+=("$stem"); fi
done <<<"$NAMED"
[[ ${#STEMS[@]} -gt 0 ]] || { echo "no captures to retake" >&2; exit 1; }

APK="$ROOT/app/build/app/outputs/flutter-apk/app-internal-profile.apk"
flock "$SCRATCH/heavy.lock" bash -c 'cd app && flutter build apk --flavor internal --profile && (cd android && ./gradlew --stop -q)'

flock "$SCRATCH/emu.lock" bash -s -- "$APK" "$SERIAL" "${STEMS[@]}" <<'EOF' | tee "$SCRATCH/recapture.log"
set -euo pipefail
APK="$1"; SERIAL="$2"; shift 2
for stem in "$@"; do
  if jq -e 'has("argv")' "$stem.json" >/dev/null; then
    mapfile -t ARGS < <(jq -r '.argv[]' "$stem.json")
  else
    ARGS=("$(jq -r '.route | sub("[?&]photos=off"; "")' "$stem.json")")
    echo "ROUTE-ONLY $stem.png"
  fi
  [[ -f "$stem.mp4" && ! " ${ARGS[*]} " =~ " --record " ]] && echo "note: $stem has an mp4 but no --record in its argv"
  app/tool/screenshot.sh "${ARGS[@]}" --apk "$APK" --serial "$SERIAL" --out "$stem.png"
done
EOF

git add -- docs/pr-review-media
git commit -q -m "docs: recapture at $(git rev-parse --short HEAD)" && git log --oneline -1
grep '^ROUTE-ONLY' "$SCRATCH/recapture.log" | sed 's/^ROUTE-ONLY /replayed by route only, look before pushing: /' || true
echo "push, then: scripts/pr-gate.sh${PR:+ $PR}"
