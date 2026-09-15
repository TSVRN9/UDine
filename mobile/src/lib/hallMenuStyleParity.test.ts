// Static-analysis guards for #413 (plus-slot width drift), #415 (unmatched-row style drift), and
// macro-badge row placement, same technique as routeHeaderShown.test.ts -- the screen this covers
// ([slug].tsx) is a full hall-menu route with heavy deps, so parsing its source as text is far
// cheaper than mounting it just to check a handful of style-constant values.
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "..", "app", "halls", "[slug].tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");
// PlateAddControl (and the IN_PLATE_PLUS_WIDTH/STEPPER_FULL_WIDTH constants #413 pins) moved out
// of [slug].tsx into its own file (foodpro-menu-expansion brief, task 2) -- reused verbatim by
// CompositeDishComposer's add-in rows, not just [slug].tsx's own dish rows.
const PLATE_ADD_CONTROL_SOURCE_PATH = path.join(__dirname, "..", "components", "PlateAddControl.tsx");
const plateAddControlSource = fs.readFileSync(PLATE_ADD_CONTROL_SOURCE_PATH, "utf8");

describe("#413: in-plate stepper plus width matches ServingsF.dc.html (40px), not the standalone empty-plate circle (44px)", () => {
  it("defines a 40px in-plate plus width, distinct from the 44px standalone PLUS_SLOT_SIZE", () => {
    const match = plateAddControlSource.match(/const IN_PLATE_PLUS_WIDTH = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(40);
  });

  it("computes the fully-expanded stepper width from the 40px in-plate plus, not the 44px standalone one", () => {
    const match = plateAddControlSource.match(/const STEPPER_FULL_WIDTH = (\w+) \+ COUNT_SLOT_WIDTH \+ MINUS_SLOT_WIDTH;/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("IN_PLATE_PLUS_WIDTH");
  });

  it("the in-plate + Pressable is sized to IN_PLATE_PLUS_WIDTH, not the shared 44px plusSlot alone", () => {
    const plusButtonBlock = plateAddControlSource.match(/\{inPlate \? \(\s*<Pressable[\s\S]*?onPress=\{\(\) => onStep\(1\)\}/);
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

describe("macro-badge placement: flex-row sibling, not an inline Text attachment (reverted e753e24)", () => {
  // e753e24 moved the badge row inside the dish-name Text as an inline attachment to avoid
  // rowNameLine's flexWrap dropping a wrapped badge to its own line. That traded a cosmetic
  // wasted-line quirk for a real one: an inline attachment can't shrink, so once the badge row
  // didn't fit on the text's current line it rendered past the row's bounds instead of wrapping
  // (see docs/decisions-log.md "Inconclusive visual verification (2026-09-11)"). Reverted to the
  // flexWrap + flexShrink shape verified on-device in b457b90, which can't overflow the card.
  //
  // Re-verified harder 2026-09-12 (docs/decisions-log.md "Hall-menu badge overflow re-investigated,
  // with the 5-badge fixture finally on screen") after an owner report insisted the overflow was
  // real: live pixel measurements at the actual worst case (all 5 macro badges + a 60+ char name,
  // narrowest pool device) still show zero overflow past the card, with the wasted-line tradeoff
  // this describe block pins now measured (not just argued) at ~198dp of unused space beside the
  // badge row. No hybrid inline-when-safe fix was attempted -- see that entry for why.
  //
  // Since then, that wasted-line tradeoff got its own fix (measure-then-position, DishRow's
  // onLayout/onTextLayout + hallMenuBadgeLayout.ts's shouldTuckBadges): the dish row moved out of
  // renderDishRow into its own DishRow component, so the block below matches DishRow's JSX, not
  // the old inline-in-HallMenuScreenBody shape. The badge row still renders as a flex-row sibling
  // of the name Text inside rowNameLine in the (still default, still safe) untucked case -- an
  // absolutely-positioned tucked copy is ALSO a sibling inside rowNameLine, just conditionally
  // rendered instead, so this substring match holds either way.

  it("renders the badge row as a flex-row sibling of the dish-name Text inside rowNameLine", () => {
    const rowNameLineBlock = source.match(/<View style=\{styles\.rowNameLine\} onLayout=\{handleNameContainerLayout\}>([\s\S]*?)\n {12}<\/View>/)?.[1] ?? "";
    expect(rowNameLineBlock).toMatch(/<Text style=\{styles\.rowText\} onTextLayout=\{handleNameTextLayout\}>/);
    expect(rowNameLineBlock).toMatch(/<View style=\{styles\.macroBadgeRow\}>\{badgeIcons\}<\/View>/);
  });

  it("rowNameLine wraps and rowText can shrink, so name + badges never overflow past the card", () => {
    const rowNameLineStyle = source.match(/rowNameLine: \{([^}]*)\}/)?.[1] ?? "";
    expect(rowNameLineStyle).toMatch(/flexWrap: "wrap"/);
    const rowTextStyle = source.match(/rowText: \{([^}]*)\}/)?.[1] ?? "";
    expect(rowTextStyle).toMatch(/flexShrink: 1/);
  });

  it("MacroBadgeIcon has no inline-attachment baseline offset hack", () => {
    const svgBlock = source.match(/function MacroBadgeIcon\([\s\S]*?<Svg[^>]*>/)?.[0] ?? "";
    expect(svgBlock).not.toMatch(/top: 4/);
  });
});

describe("--stress long-names fixture covers the realistic wrap case, not only the 60+ char extreme", () => {
  // The owner's "badges on a wasted 3rd line" report is about ordinary ~40 char names that wrap
  // to two lines with room to spare beside the last one -- the extreme fixture alone (3 lines, 5
  // badges) exercises a different packing and was the only case #454 ever screenshotted. Both
  // names must be present so screenshot.sh --stress long-names shows both states in one capture.
  const fixtureBlock = source.match(/function stressFixtureItems\([\s\S]*?\n\}/)?.[0] ?? "";
  const names = [...fixtureBlock.matchAll(/dishName: "([^"]+)"/g)].map((m) => m[1]);

  it("ships an extreme (60+ char) and a realistic (35-45 char) fixture name", () => {
    expect(names.some((n) => n.length >= 60)).toBe(true);
    expect(names.some((n) => n.length >= 35 && n.length <= 45)).toBe(true);
  });

  it("injects every fixture item per meal period, not just the first", () => {
    expect(source).toMatch(/mealTabs\.flatMap\(\(period\) => stressFixtureItems\(tid, period\)\)/);
  });
});

describe("macro badges: one accent color per preset, not a single shared gold (owner bug report 2026-09-12)", () => {
  it("imports the glyph shapes from the shared source instead of defining its own switch", () => {
    expect(source).toMatch(/import \{ MacroPresetGlyph \} from "\.\.\/\.\.\/lib\/macroBadgeGlyphs";/);
  });

  it("MACRO_BADGE_COLORS assigns 5 distinct glyph colors, one per preset", () => {
    const mapBlock = source.match(/const MACRO_BADGE_COLORS[\s\S]*?=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    const glyphColors = [...mapBlock.matchAll(/glyph: (colors\.\w+)/g)].map((m) => m[1]);
    expect(glyphColors).toHaveLength(5);
    expect(new Set(glyphColors).size).toBe(5);
  });

  // pr-reviewer catch (PR #451): the glyph-color assertion above says nothing about the circle
  // (tinted background) half of the fix -- a regression that recolored every glyph distinctly but
  // left all 5 circles on one shared tint would pass every other test here. Each circle must be
  // its own preset's accent (via withOpacity), not a shared literal.
  it("MACRO_BADGE_COLORS gives each preset its own tinted circle background, derived from its own glyph accent", () => {
    const mapBlock = source.match(/const MACRO_BADGE_COLORS[\s\S]*?=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    const entries = [...mapBlock.matchAll(/glyph: (colors\.\w+), circle: withOpacity\((colors\.\w+), (\d+)\)/g)];
    expect(entries).toHaveLength(5);
    // Every circle derives from that same row's own glyph token -- not a mismatched or shared one.
    entries.forEach(([, glyphToken, circleToken]) => expect(circleToken).toBe(glyphToken));
    const circleCalls = entries.map(([, , circleToken, pct]) => `${circleToken}:${pct}`);
    expect(new Set(circleCalls).size).toBe(5);
  });

  // pr-reviewer catch (PR #451): scoping this regex to MacroBadgeIcon's own function body missed
  // that the old single-color fill actually lived one function up, in the now-deleted
  // MacroBadgeGlyph -- this assertion was true even on unfixed code and proved nothing. Checking
  // the whole file is what actually pins "no shared gold left in the macro-badge glyph path".
  it("no longer fills every preset's glyph with the single shared gold700 anywhere in this file", () => {
    expect(source).not.toMatch(/colors\.gold700/);
  });
});

// On-device-only regression (found in review, invisible to jest/RTL): single-expand requires a
// row OTHER than the one just tapped -- whichever was previously expanded -- to re-render too.
// SectionList/VirtualizedList's cell-level rendering only busts its own memoization on a change to
// `sections`/item identity or `extraData`; a `renderItem` closure getting a new identity (from
// `expandedKey` in its useCallback deps) is NOT by itself enough on a real device, even though it
// IS enough in this file's own jest suite (hallMenu.test.tsx calls `.props.onPress()` directly,
// short-circuiting straight past whatever memoization gap exists on-device). Confirmed live on an
// emulator: without `extraData`, tapping a second card left the first one still showing expanded
// indefinitely, not just mid-animation. Static-analysis guard only -- this can't be asserted via a
// mount, since react-test-renderer's SectionList never reproduced the gap in the first place.
describe("both hall-menu GestureSectionLists pass extraData={expandedKey} (single-expand cross-row re-render)", () => {
  it("both SectionLists key their extraData off expandedKey, not left to renderItem identity alone", () => {
    const matches = source.match(/extraData=\{expandedKey\}/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
