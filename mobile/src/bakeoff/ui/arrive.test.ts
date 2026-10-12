// layout-animation builders are no-ops under the reanimated mock: this Keyframe records what it was given
type Frames = Record<number, { opacity: number; easing?: unknown }>;
class Rec { d?: number; rm?: unknown; constructor(public frames: Frames) {} duration(d: number) { this.d = d; return this; } reduceMotion(r: unknown) { this.rm = r; return this; } }
let reduced = false;
const load = () => {
  jest.resetModules();
  jest.doMock("react-native-reanimated", () => ({ ...jest.requireActual("react-native-reanimated/mock"), Keyframe: Rec, ReduceMotion: { Never: "never", System: "system" }, useReducedMotion: () => reduced }));
  const React = require("react");
  const renderer = require("react-test-renderer");
  const { useArrive } = require("./arrive") as typeof import("./arrive");
  const { m2Motion } = require("../../lib/motion") as typeof import("../../lib/motion");
  let out!: ReturnType<typeof useArrive>;
  const P = () => { out = useArrive(); return null; };
  renderer.act(() => { renderer.create(React.createElement(P)); });
  return { arrive: out as unknown as { arriveIn: Rec; arriveOut: Rec }, m2Motion };
};

// M2 `A(el, [{opacity:0},{opacity:1}], 'settle')`: a label or a list arriving. Reduced motion (`A`, src.html:794): the crossfade, 120 ms linear.
describe("what arrives from the network", () => {
  it("fades in over settle: 200 ms on (.2, 0, 0, 1)", () => {
    reduced = false;
    const { arrive, m2Motion } = load();
    expect(arrive.arriveIn.d).toBe(m2Motion.settle.d);
    expect(arrive.arriveIn.frames[100].easing).toBe(m2Motion.settle.e);
    expect(arrive.arriveOut.d).toBe(m2Motion.settle.d);
  });
  it("fades in over rmFade (120 ms, linear) when motion is reduced, and plays under the system setting", () => {
    reduced = true;
    const { arrive, m2Motion } = load();
    expect(arrive.arriveIn.d).toBe(m2Motion.rmFade.d);
    expect(arrive.arriveIn.frames[100].easing).toBe(m2Motion.rmFade.e);
    expect(arrive.arriveIn.rm).toBe("never");
    expect(arrive.arriveOut.d).toBe(m2Motion.rmFade.d);
  });
});
