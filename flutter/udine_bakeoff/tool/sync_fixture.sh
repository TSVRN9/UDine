#!/usr/bin/env bash
# Copies the RN branch's fixture and M2 behaviour vectors, so the two ports are checked against the same bytes.
set -euo pipefail
cd "$(dirname "$0")/.."
ref=${1:-origin/bakeoff/rn}
git show "$ref:mobile/src/bakeoff/fixture.json" > assets/fixture.json
git show "$ref:mobile/src/bakeoff/logic/vectors.json" > test/vectors.json
# the design tokens: a snapshot of the RN branch's token source, then the Dart generated from it
git show "$ref:design-tokens/m2.json" > tool/m2.json
dart run tool/gen_tokens.dart
git show "$ref:mobile/src/bakeoff/logic/labelVectors.json" > test/label_vectors.json
