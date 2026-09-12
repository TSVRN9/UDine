// Owner bug report 2026-09-12: menu macro badges rendered every preset in one shared gold, and
// FilterSheet's Macros chips used 3 wrong shapes copied from a stale artboard. This tests the
// shared glyph-shape source both [slug].tsx and FilterSheet.tsx now render from.
import renderer, { act } from "react-test-renderer";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { MacroPreset } from "@udine/shared";
import { MacroPresetGlyph } from "./macroBadgeGlyphs";

const ALL_PRESETS: MacroPreset[] = ["high-protein", "low-sodium", "under-300-cal", "high-fiber", "low-fat"];

function renderGlyph(preset: MacroPreset, color: string, detailColor: string) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <Svg>
        <MacroPresetGlyph preset={preset} color={color} detailColor={detailColor} />
      </Svg>,
    );
  });
  return root;
}

function geometry(root: renderer.ReactTestRenderer) {
  return JSON.stringify({
    paths: root.root.findAllByType(Path).map((n) => n.props.d),
    rects: root.root.findAllByType(Rect).map((n) => [n.props.x, n.props.y, n.props.width, n.props.height]),
    circles: root.root.findAllByType(Circle).map((n) => [n.props.cx, n.props.cy, n.props.r]),
  });
}

describe("MacroPresetGlyph", () => {
  it("renders a distinct silhouette per preset", () => {
    const shapes = ALL_PRESETS.map((preset) => geometry(renderGlyph(preset, "#111111", "#222222")));
    expect(new Set(shapes).size).toBe(ALL_PRESETS.length);
  });

  it("fills the main shape with `color` and the accent/cutout pieces with `detailColor` (low-sodium: pile + 3 dots)", () => {
    const root = renderGlyph("low-sodium", "#a00000", "#00b000");
    const path = root.root.findByType(Path);
    expect(path.props.fill).toBe("#a00000");
    const circles = root.root.findAllByType(Circle);
    expect(circles).toHaveLength(3);
    circles.forEach((c) => expect(c.props.fill).toBe("#00b000"));
  });
});
