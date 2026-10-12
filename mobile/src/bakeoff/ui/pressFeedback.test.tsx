import { readFileSync } from "fs";
import { join } from "path";
import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { HallChip } from "./HallChip";
import { MealTabs } from "./MealTabs";

// M2 `.btn.down, .hchip.down, .ptabs button.down, .mts button.down, ... {transform: scale(.97)}` (src.html:41-43): compact controls scale, only full-width
// rows and bands tint (src.html:44-48)
const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const tinted = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.pointerEvents === "none" && ([m2.color.pressRow, m2.color.pressOnDm, m2.color.pressBand] as string[]).includes(StyleSheet.flatten(n.props.style)?.backgroundColor as string)).length;
const presses = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPressIn === "function");
const scales = (n: renderer.ReactTestInstance) => JSON.stringify(StyleSheet.flatten(n.props.style).transform).includes("scale");

describe("which controls scale and which tint", () => {
  it("a where-served chip scales and has no tint layer", () => {
    const r = make(<HallChip name="Worcester" letter="W" onPress={() => {}} />);
    expect(tinted(r)).toBe(0);
    expect(scales(presses(r)[0])).toBe(true);
  });
  it("the meal tabs scale and have no tint layer", () => {
    const r = make(<MealTabs meals={{ items: [{ key: "lunch", label: "Lunch" }, { key: "dinner", label: "Dinner" }], selected: "lunch", onSelect: () => {} }} />);
    expect(tinted(r)).toBe(0);
    expect(presses(r).length).toBe(2);
    for (const p of presses(r)) expect(scales(p)).toBe(true);
  });
  it("the plate's tabs scale (PlateSheet does not render under jest: its source says so)", () => {
    const src = readFileSync(join(__dirname, "../screens/PlateSheet.tsx"), "utf8");
    const tab = src.split("\n").filter((l) => l.includes('accessibilityRole="tab"'));
    expect(tab.length).toBeGreaterThan(0);
    for (const l of tab) expect(l).not.toContain('feedback="tint"');
  });
});
