// jest runs with __DEV__ === true, so it cannot tell a guarded fixture literal from an unguarded one at runtime -- and the
// production bundle only proves it after an `expo export`. This pins the source text instead: every dev-fixture name
// ("compare-...") in these two files must be reached through `__DEV__ &&` (or a variable derived from it) on its line, or
// the literal ships in production. Anchored on the line's text so a reformat fails loudly rather than passing vacuously.
import fs from "node:fs";
import path from "node:path";

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const FILES: [string, string, number][] = [
  ["panes/YouPane.tsx", read("panes", "YouPane.tsx"), 3],
  ["app/halls/[slug].tsx", read("app", "halls", "[slug].tsx"), 9],
];
// what may stand in front of a fixture literal on its line: the DEV flag itself, or a flag/fixture variable computed from it
const GUARD = /__DEV__ &&|\b(?:toastFixture|compareStress|usedFixture|countFixture)\b\s*(?:===|&&)/;

describe.each(FILES)("%s fixture literals", (_name, src, minLines) => {
  const lines = src.split("\n").filter((l) => /"compare-[a-z-]*/.test(l) && !l.trim().startsWith("//"));

  it("finds the fixture lines (a reformat that hides them fails here, not silently)", () => {
    expect(lines.length).toBeGreaterThanOrEqual(minLines);
  });

  it("reaches every one through __DEV__ (or a variable derived from it)", () => {
    for (const line of lines) {
      const before = line.slice(0, line.search(/"compare-[a-z-]*/));
      expect({ line: line.trim(), guarded: GUARD.test(before) }).toEqual({ line: line.trim(), guarded: true });
    }
  });
});
