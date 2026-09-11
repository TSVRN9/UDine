// Static-analysis guards for #413 (plus-slot width drift), #415 (unmatched-row style drift), and
// the macro-badge inline-placement fix (e753e24), same technique as routeHeaderShown.test.ts --
// the screen this covers ([slug].tsx) is a full hall-menu route with heavy deps, so parsing its
// source as text is far cheaper than mounting it just to check a handful of style-constant values.
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "..", "app", "halls", "[slug].tsx");
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

describe("macro-badge inline placement (e753e24) -- regression guards for two prior bugs in this exact code", () => {
  it("does not reintroduce rowNameLine, the flex-row-sibling shape that dropped a wrapped badge to a wasted third line (7d8612f's bug)", () => {
    // Badges must render as inline children OF the dish-name Text, not a flex-row View sibling of
    // it inside a flexWrap container -- flex-wrap wraps whole items based on each item's own
    // unwrapped size, so it can't tell a wrapped Text still has trailing space on its last line.
    expect(source).not.toMatch(/rowNameLine/);
  });

  it("renders macroBadgeRow as an inline attachment nested inside the dish-name Text, not a sibling View", () => {
    const nameTextBlock = source.match(/<Text style=\{styles\.rowText\}>([\s\S]*?)<\/Text>/)?.[1] ?? "";
    expect(nameTextBlock).toMatch(/<View style=\{styles\.macroBadgeRow\}>/);
  });

  it("MacroBadgeIcon's Svg keeps the position:relative + top offset that centers it against the text (the metrics-anchoring bug this commit fixed)", () => {
    // RN vertically anchors an inline Text attachment to a font-metric-derived reference and
    // ignores margin/padding/position set on the attachment's own outer box (macroBadgeRow) --
    // confirmed on-device: only offsetting the Svg itself (a normal child WITHIN the attachment)
    // moves it. If this regresses to 0/removed, the badge silently goes back to sitting ~3dp too
    // high relative to the dish name -- re-measure on-device (mobile/scripts/screenshot.sh) rather
    // than trust a new number blind, per that Svg's own comment.
    const svgBlock = source.match(/function MacroBadgeIcon\([\s\S]*?<Svg[^>]*>/)?.[0] ?? "";
    expect(svgBlock).toMatch(/position: "relative", top: 4/);
  });
});
