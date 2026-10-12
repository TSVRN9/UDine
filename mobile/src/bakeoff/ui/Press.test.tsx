import { StyleSheet, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { Press } from "./Press";

const timings: { to: number; token: unknown }[] = [];
// the reanimated mock evaluates an animated style once per render; this one reads its shared values when the style is read, as the UI thread does
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated/mock");
  const live = (fn: () => Record<string, unknown>) => Object.defineProperties({}, Object.fromEntries(Object.keys(fn()).map((k) => [k, { enumerable: true, get: () => fn()[k] }])));
  return { ...actual, useAnimatedStyle: live };
});
jest.mock("./motion", () => ({ timed: (to: number, token: unknown) => { timings.push({ to, token }); return to; } }));

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const press = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPressIn === "function" && typeof n.props.onPressOut === "function")[0];
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

describe("Press tint is an overlay over its children, not a background", () => {
  it("never paints the Pressable's own background, so the caller's ground (a band's vm) survives rest and press", () => {
    const r = make(<Press feedback="tint" style={{ backgroundColor: m2.color.vm }}><Text>x</Text></Press>);
    const p = press(r);
    expect(flat(p).backgroundColor).toBe(m2.color.vm);
    act(() => { p.props.onPressIn({}); });
    expect(flat(press(r)).backgroundColor).toBe(m2.color.vm);
  });
  it.each([["row", m2.color.pressRow], ["onDm", m2.color.pressOnDm], ["band", m2.color.pressBand]] as const)("the %s tint is its token, drawn after the children and taking no touches", (tint, color) => {
    const r = make(<Press feedback="tint" tint={tint}><Text>x</Text></Press>);
    const layer = r.root.findAll((n) => typeof n.type === "string" && n.props.pointerEvents === "none" && flat(n).backgroundColor === color);
    expect(layer).toHaveLength(1);
  });
  it("the overlay is drawn after the children (over a band's photo)", () => {
    const r = make(<Press feedback="tint" tint="band"><Text>x</Text></Press>);
    const hosts = press(r).findAll((n) => typeof n.type === "string");
    const at = (f: (n: renderer.ReactTestInstance) => boolean) => hosts.findIndex(f);
    expect(at((n) => flat(n).backgroundColor === m2.color.pressBand)).toBeGreaterThan(at((n) => String(n.type) === "Text"));
  });
});

describe("Press's state layer", () => {
  const layerOpacity = (r: renderer.ReactTestRenderer) => flat(r.root.findAll((n) => typeof n.type === "string" && n.props.pointerEvents === "none" && flat(n).backgroundColor === m2.color.pressRow)[0]).opacity;
  it("is clear at rest, full under the finger, and clear again on release", () => {
    const r = make(<Press feedback="tint"><Text>x</Text></Press>);
    expect(layerOpacity(r)).toBe(0);
    act(() => { press(r).props.onPressIn({}); });
    expect(layerOpacity(r)).toBe(1);
    act(() => { press(r).props.onPressOut({}); });
    expect(layerOpacity(r)).toBe(0);
  });
});

describe("Press times on M2's tokens", () => {
  it("finger down is the press token and release the settle token (90 and 200 ms, both on (.2, 0, 0, 1))", () => {
    timings.length = 0;
    const r = make(<Press feedback="tint"><View /></Press>);
    const p = press(r);
    act(() => { p.props.onPressIn({}); });
    act(() => { p.props.onPressOut({}); });
    expect(timings).toEqual([{ to: 1, token: m2Motion.press }, { to: 0, token: m2Motion.settle }]);
  });
});
