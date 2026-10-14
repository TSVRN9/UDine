import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADAPTERS, jsonify } from "../scripts/vector-adapters.ts";

// shared/vectors/*.json are the cross-language contract (see scripts/gen-vectors.ts). Re-running
// the TS modules over every committed input must reproduce the committed expected output, so a
// behaviour change fails here until the vectors are regenerated and the diff is reviewed.
for (const [file, adapters] of Object.entries(ADAPTERS)) {
  const { cases } = JSON.parse(readFileSync(new URL(`../vectors/${file}`, import.meta.url), "utf8")) as {
    cases: { kind: string; name: string; input: never; expected: unknown }[];
  };
  test(`${file} has cases for every adapter kind`, () => {
    assert.deepEqual([...new Set(cases.map((c) => c.kind))].sort(), Object.keys(adapters).sort());
  });
  for (const c of cases) {
    test(`${file}: ${c.kind}: ${c.name}`, async () => {
      assert.deepEqual(jsonify(await adapters[c.kind](c.input)), c.expected);
    });
  }
}
