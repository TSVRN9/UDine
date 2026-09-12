// #385: "N items hidden" counter in the sheet title row (docs/design/FilterSheet.dc.html:37-40).
// Separate .tsx file from FilterSheet.test.ts (that one's plain-logic, no JSX) since this needs to
// render the component -- same safe-area mock as PlateSheet.test.tsx/PlateBar.test.tsx.
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { FoodPreferences, MacroPreset } from "@udine/shared";
import { ALL_MACRO_PRESETS, FilterSheet, MACRO_PRESET_LABELS } from "./FilterSheet";
import { MacroPresetGlyph } from "../lib/macroBadgeGlyphs";
import { colors } from "../lib/theme";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function texts(root: renderer.ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)));
}

const prefs: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

function render(hiddenCount: number, macroPresets: MacroPreset[] = []) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <FilterSheet
        visible
        items={[]}
        prefs={{ ...prefs, macroPresets }}
        onChangePreferences={() => {}}
        stationFilter={new Set()}
        onChangeStationFilter={() => {}}
        priceFilter={new Set()}
        onChangePriceFilter={() => {}}
        hiddenCount={hiddenCount}
        onClose={() => {}}
      />,
    );
  });
  return root;
}

describe("FilterSheet hiddenCount title-row counter (#385)", () => {
  it("renders 'N items hidden' when hiddenCount > 0", () => {
    const root = render(4);
    expect(texts(root)).toContain("4 items hidden");
  });

  it("renders nothing when hiddenCount is 0", () => {
    const root = render(0);
    expect(texts(root).some((t) => t.includes("items hidden"))).toBe(false);
  });
});

describe("Macros chips carry a per-preset icon glyph (FilterSheet.dc.html:75-99)", () => {
  it("renders one Svg icon per macro preset, unlike the plain-text Stations/Price chips", () => {
    const root = render(0);
    // 5 macro presets == 5 icon Svgs. CheckGlyph (drawn checkmark) adds one more per active
    // preset -- prefs has no macroPresets set, so none start active and none render here.
    expect(root.root.findAllByType(Svg)).toHaveLength(5);
  });
});

// Owner bug report 2026-09-12: FilterSheet's Macros chips used to carry their own independently-
// copied glyph paths, 3 of which had drifted from the shipped hall-menu badge shape (hexagon for
// Low Sodium, a plain teardrop for Under 300 Cal, an apple for Low Fat). Both now render from the
// same lib/macroBadgeGlyphs.ts source, so this asserts the chip's actual rendered geometry equals
// what that shared source produces for every preset, not just that the two happen to look similar.
function glyphGeometry(svg: renderer.ReactTestInstance) {
  return {
    paths: svg.findAllByType(Path).map((n) => n.props.d),
    rects: svg.findAllByType(Rect).map((n) => [n.props.x, n.props.y, n.props.width, n.props.height]),
    // Excludes the badge's own r=10 background Circle -- only the glyph's own circles (e.g. the
    // salt-pile's dots) are geometry under test.
    circles: svg.findAllByType(Circle).filter((n) => n.props.r !== 10).map((n) => [n.props.cx, n.props.cy, n.props.r]),
  };
}

function referenceGeometry(preset: MacroPreset, color: string) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <Svg>
        <MacroPresetGlyph preset={preset} color={color} detailColor={color} />
      </Svg>,
    );
  });
  return glyphGeometry(root.root);
}

describe("Macros chip glyphs match the shared canonical shapes (owner bug report 2026-09-12: 3/5 were wrong)", () => {
  it.each(ALL_MACRO_PRESETS)("%s chip glyph geometry equals MacroPresetGlyph's shared geometry", (preset) => {
    const root = render(0, [preset]);
    const chip = root.root.find((n) => n.props.accessibilityLabel === `Macro ${MACRO_PRESET_LABELS[preset]}`);
    // The chip's icon Svg (width 16) vs. the active-state CheckGlyph's own Svg (width 12).
    const iconSvg = chip.findAllByType(Svg).find((s) => s.props.width === 16)!;
    expect(glyphGeometry(iconSvg)).toEqual(referenceGeometry(preset, colors.maroon900));
  });
});
