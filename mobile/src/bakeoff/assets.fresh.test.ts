import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The pre-rendered letters and glyphs are what their scripts print from design-tokens/m2.json (colours, strokes, letter positions): change the tokens
// or a path and this fails until `node scripts/bakeoff-letters.js` / `bakeoff-glyphs.js` has been run. Needs rsvg-convert; without it the check cannot run.
const have = spawnSync("rsvg-convert", ["--version"]).status === 0;
const root = join(__dirname, "../..");
(have ? describe : describe.skip)("pre-rendered bake-off assets", () => {
  it.each([["bakeoff-letters.js", "letters"], ["bakeoff-glyphs.js", "glyphs"]])("%s's output is what is committed", (script, dir) => {
    const tmp = mkdtempSync(join(tmpdir(), "assets-"));
    execFileSync("node", [join(root, "scripts", script)], { env: { ...process.env, BAKEOFF_OUT: tmp }, stdio: "ignore" });
    const committed = join(root, "assets/bakeoff", dir);
    const files = readdirSync(committed).sort();
    expect(readdirSync(tmp).sort()).toEqual(files);
    const differ = files.filter((f) => !readFileSync(join(tmp, f)).equals(readFileSync(join(committed, f))));
    expect(differ).toEqual([]);
  });
});
