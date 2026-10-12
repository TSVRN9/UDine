import { StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { TabBar } from "./TabBar";

const timings: { to: number; token: unknown }[] = [];
jest.mock("./motion", () => ({ timed: (to: number, token: unknown) => { timings.push({ to, token }); return to; } }));

const routes = [{ key: "a", name: "index" }, { key: "b", name: "search" }, { key: "c", name: "you" }];
const bar = (index: number) => <TabBar state={{ index, routes }} navigation={{ navigate: () => {} }} />;
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const indicator = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "tab-indicator")[0];
const shot = (index: number) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(bar(index)); });
  act(() => { r.root.findAll((n) => n.type === View && n.props.accessibilityRole === "tablist")[0].props.onLayout({ nativeEvent: { layout: { width: 360, height: 57 } } }); });
  return r;
};

// M2 `.tbar .ind{position:absolute;top:-1px;left:0;height:3px;width:calc(100% / 3);background:var(--vm);transition:transform settle}` (src.html:61)
describe("the tab bar's indicator", () => {
  it("is 3 dp, vm, a third of the bar, over the hairline", () => {
    const s = flat(indicator(shot(0)));
    expect(s).toMatchObject({ position: "absolute", top: -1, left: 0, height: 3, width: 120, backgroundColor: m2.color.vm });
  });
  it("sits over the selected tab, with no slide at mount", () => {
    timings.length = 0;
    const r = shot(2);
    expect(JSON.stringify(flat(indicator(r)).transform)).toBe(JSON.stringify([{ translateX: 240 }]));
    expect(timings).toEqual([]);
  });
  it("slides to the next tab on settle", () => {
    timings.length = 0;
    const r = shot(0);
    act(() => { r.update(bar(1)); });
    expect(timings).toEqual([{ to: 1, token: m2Motion.settle }]);
  });
  it("takes no touches", () => expect(indicator(shot(0)).props.pointerEvents).toBe("none"));
});
