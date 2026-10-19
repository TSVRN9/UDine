#!/usr/bin/env bash
# Probes for scripts/pr-gate.sh's capture checks, in a scratch repo with a stub gh: each "expect FAIL" case once passed
# a stale capture (PR #625 review). Run after changing pr-gate.sh or pixel-digest.sh: scripts/pr-gate-probes.sh
set -u
WT="$(git rev-parse --show-toplevel)"; S="$(mktemp -d "$HOME/.cache/udine-scratch/gate-probes.XXXX")"; trap 'rm -rf "$S"' EXIT
mkdir -p "$S/bin"; cat > "$S/bin/gh" <<'GH'
#!/usr/bin/env bash
case "$*" in *headRefName*baseRefName*) echo '{"headRefName":"feat/x","baseRefName":"main"}';; esac
case "$*" in *"--json headRefName"*) echo feat/x;; *"--json baseRefName"*) echo main;; *"--json body"*) printf 'Brief: none\nScreenshots: %s\nRed: x\nLanes: x\nResidency: none\n' "$BODYPNG";; esac
GH
chmod +x "$S/bin/gh"; export PATH="$S/bin:$PATH"
setup() {
  rm -rf "$S/o.git" "$S/r"; git init -q --bare "$S/o.git"; git init -q -b main "$S/r"; cd "$S/r"
  git config user.email p@x; git config user.name p
  mkdir -p scripts app/lib app/assets docs/pr-review-media/feat-x; cp "$WT"/scripts/{pr-gate.sh,pixel-digest.sh,pixel-paths,suite-key.sh} scripts/
  printf 'a\nb\nc\npad 8\nx\npad 8\n' > app/lib/w.dart; printf 'one' > app/assets/i.png; echo 'm' > app/lib/b.dart
  git add -A; git commit -qm base; git remote add origin "$S/o.git"; git push -q origin main
  git checkout -qb feat/x; sed -i '1s/a/A/' app/lib/w.dart; echo changed > app/lib/b.dart; printf 'two' > app/assets/i.png
  git commit -qam change
  # a capture at this commit, with a fingerprinted sidecar
  own=$(scripts/pixel-digest.sh $(git merge-base origin/main HEAD) HEAD | jq -Rn '[inputs|split(" ")|{(.[0]):.[1]}]|add//{}')
  printf 'png' > docs/pr-review-media/feat-x/s.png
  jq -n --arg sha $(git rev-parse HEAD) --argjson own "$own" '{sha:$sha,dirty:false,route:"/x",device:"d",own:$own}' > docs/pr-review-media/feat-x/s.json
  git add -A; git commit -qm capture; git push -q origin feat/x
}
gate() { git push -q -f origin feat/x; BODYPNG=docs/pr-review-media/feat-x/s.png scripts/pr-gate.sh 1 2>&1 | grep -E '^(FAIL|info  docs)|GATE' | cut -c1-140; }
echo "== fresh capture (expect PASS)"; setup; gate
echo "== 1 (expect FAIL) binary asset changed after capture"; setup; printf 'three' > app/assets/i.png; git commit -qam bin; gate
echo "== 2 (expect FAIL) file reverted after capture"; setup; git checkout -q origin/main -- app/lib/b.dart; git commit -qm revert; gate
echo "== 3 (expect FAIL) digest unrunnable"; setup; sed -i '1s/A/AA/' app/lib/w.dart; git commit -qam edit; chmod -x scripts/pixel-digest.sh; gate; chmod +x scripts/pixel-digest.sh
echo "== 4 (expect FAIL) named png deleted"; setup; git rm -q docs/pr-review-media/feat-x/s.png; git commit -qm rm; gate
echo "== rebase-like: main merged, own hunks untouched (expect PASS)"; setup; git checkout -q main; echo z >> app/lib/w.dart; git commit -qam mainedit; git push -q origin main; git checkout -q feat/x; git merge -q --no-edit main; gate
