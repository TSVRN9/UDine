import { act } from "react";
import { StyleSheet, Text } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { PushPage } from "./PushPage";

let mockReduced = false;
const mockTimings: { to: number; d: number }[] = [];
jest.mock("../ui/motion", () => ({
  timed: (to: number, t: { d: number }, cb?: (f: boolean) => void) => { mockTimings.push({ to, d: t.d }); cb?.(true); return to; },
  part: (t: { d: number; e: unknown }, k: number) => ({ d: t.d * k, e: t.e }),
  useMotion: () => ({ reduced: mockReduced }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

const page = (p: number) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<PushPage title="Dietary preferences" onPop={() => {}} progress={{ get: () => p, set: () => {} } as never}><Text>body</Text></PushPage>); });
  return r;
};
const shadow = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.style && StyleSheet.flatten(n.props.style).boxShadow !== undefined).map((n) => StyleSheet.flatten(n.props.style).boxShadow);

describe("a pushed page's shadow", () => {
  it("is cast while the page moves", () => expect(shadow(page(0.4))[0]).toHaveLength(m2.shadow.push.length));
  it("is gone once the page is in", () => expect(shadow(page(0))[0]).toEqual([]));
});

// M2 `RM` push (src.html:1739, 1742, 1767): the page is there at once and crossfades in and out; the edge swipe is off
describe("a pushed page with reduced motion", () => {
  beforeEach(() => { mockReduced = true; mockTimings.length = 0; });
  afterAll(() => { mockReduced = false; });
  const mount = (onPop: () => void) => {
    const p = { v: 1, get() { return this.v; }, set(x: number) { this.v = x; } };
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<PushPage title="Dietary preferences" onPop={onPop} progress={p as never}><Text>body</Text></PushPage>); });
    return { r, p };
  };
  it("is in at once (p = 0) and fades in on the 120 ms crossfade", () => {
    const { p } = mount(() => {});
    expect(p.v).toBe(0);
    expect(mockTimings).toEqual([{ to: 1, d: 120 }]);
  });
  it("leaves by fading out, and hands the screen below back (p = 1) before it is popped", () => {
    const popped: number[] = [];
    const { r, p } = mount(() => popped.push(p.v));
    mockTimings.length = 0;
    const back = r.root.findAll((n) => typeof n.type !== "string" && n.props.accessibilityLabel === "Back" && typeof n.props.onPress === "function")[0];
    act(() => { back.props.onPress(); });
    expect(mockTimings).toEqual([{ to: 0, d: 120 }]);
    expect(popped).toEqual([1]);
  });
  it("has no edge swipe", () => {
    const { r } = mount(() => {});
    const det = r.root.findAll((n) => n.props.gesture && n.props.gesture.config)[0];
    expect(det.props.gesture.config.enabled).toBe(false);
  });
});
