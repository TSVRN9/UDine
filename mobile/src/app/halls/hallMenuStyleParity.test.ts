// Static-analysis guards for #413 (plus-slot width drift) and #415 (unmatched-row style drift),
// same technique as routeHeaderShown.test.ts -- the screen this covers ([slug].tsx) is a full
// hall-menu route with heavy deps, so parsing its source as text is far cheaper than mounting it
// just to check a handful of style-constant values.
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "[slug].tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

describe("#413: in-plate stepper plus width matches ServingsF.dc.html (40px), not the standalone empty-plate circle (44px)", () => {
  it("defines a 40px in-plate plus width, distinct from the 44px standalone PLUS_SLOT_SIZE", () => {
    const match = source.match(/const IN_PLATE_PLUS_WIDTH = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(40);
  });

  it("computes the fully-expanded stepper width from the 40px in-plate plus, not the 44px standalone one", () => {
    const match = source.match(/const STEPPER_FULL_WIDTH = (\w+) \+ COUNT_SLOT_WIDTH \+ MINUS_SLOT_WIDTH;/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("IN_PLATE_PLUS_WIDTH");
  });

  it("the in-plate + Pressable is sized to IN_PLATE_PLUS_WIDTH, not the shared 44px plusSlot alone", () => {
    const plusButtonBlock = source.match(/\{inPlate \? \(\s*<Pressable[\s\S]*?onPress=\{\(\) => onStep\(1\)\}/);
    expect(plusButtonBlock).not.toBeNull();
    expect(plusButtonBlock?.[0]).toMatch(/IN_PLATE_PLUS_WIDTH/);
  });
});

describe("#415: UnmatchedMenuBlock row matches CafeMenuMixed.dc.html's equivalent row", () => {
  const unmatchedRowStyle = source.match(/unmatchedRow: \{([\s\S]*?)\n {2}\},/)?.[1] ?? "";
  const unmatchedRowMetaStyle = source.match(/unmatchedRowMeta: \{([^}]*)\}/)?.[1] ?? "";
  const magnifierUsage = source.match(/<MagnifierIcon color=\{[^}]*\} \/>/)?.[0] ?? "";
  const iconWrapUsage = source.match(/<View style=\{styles\.unmatchedRowIcon\}>\s*<MagnifierIcon/);

  it("gets the paper50 card surface every other menu row has", () => {
    expect(unmatchedRowStyle).toMatch(/backgroundColor: colors\.paper50/);
  });

  it("uses 12px horizontal padding (spec), not 14", () => {
    expect(unmatchedRowStyle).toMatch(/paddingHorizontal: spacing\(3\)/);
    expect(unmatchedRowStyle).not.toMatch(/paddingHorizontal: spacing\(3\.5\)/);
  });

  it("meta text is 12px (spec), not 11", () => {
    expect(unmatchedRowMetaStyle).toMatch(/fontSize: fs\(12\)/);
  });

  it("magnifier stroke is maroon600 (spec), not a muted ink900", () => {
    expect(magnifierUsage).toMatch(/colors\.maroon600/);
    expect(magnifierUsage).not.toMatch(/ink900/);
  });

  it("magnifier is wrapped in a 44x44 circular touch-target badge like every other row icon", () => {
    expect(iconWrapUsage).not.toBeNull();
    const iconStyle = source.match(/unmatchedRowIcon: \{([\s\S]*?)\n {2}\},/)?.[1] ?? "";
    expect(iconStyle).toMatch(/width: fs\(44\)/);
    expect(iconStyle).toMatch(/height: fs\(44\)/);
    expect(iconStyle).toMatch(/borderRadius: radii\.pill/);
  });
});
