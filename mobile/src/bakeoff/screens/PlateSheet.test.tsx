import { readFileSync } from "fs";
import { join } from "path";

// PlateSheet is gorhom's BottomSheet, which does not render under jest: this pins the one thing it takes from the kit for a removed row
describe("PlateSheet's removed rows", () => {
  const src = readFileSync(join(__dirname, "PlateSheet.tsx"), "utf8");
  it("leave and close up on the kit's exit pair (150 ms, (.3, 0, .8, .2)), with no easing of its own", () => {
    expect(src).toMatch(/layout=\{exitLayout\} exiting=\{exitOut\}/);
    expect(src).not.toMatch(/FadeOut|LinearTransition/);
  });
});
