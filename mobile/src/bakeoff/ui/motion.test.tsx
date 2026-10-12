import renderer, { act } from "react-test-renderer";
import { m2Motion } from "../../lib/motion";
import { part, timed, useMotion } from "./motion";

const calls: { to: number; cfg: Record<string, unknown> }[] = [];
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated/mock");
  return { ...actual, ReduceMotion: { Never: "never", System: "system" }, useReducedMotion: () => (globalThis as { __rm?: boolean }).__rm === true, withTiming: (to: number, cfg: Record<string, unknown>) => { calls.push({ to, cfg }); return to; } };
});

describe("timed", () => {
  it("is a duration with its own curve, the system's to skip", () => {
    calls.length = 0;
    timed(1, m2Motion.settle);
    expect(calls[0].cfg).toMatchObject({ duration: 200, easing: m2Motion.settle.e, reduceMotion: "system" });
  });
  it("the reduced-motion crossfade plays under the system setting", () => {
    calls.length = 0;
    timed(1, m2Motion.rmFade);
    expect(calls[0].cfg).toMatchObject({ duration: 120, reduceMotion: "never" });
  });
  it("part keeps the curve and shortens the time", () => expect(part(m2Motion.settle, 0.5)).toEqual({ d: 100, e: m2Motion.settle.e }));
});

describe("useMotion", () => {
  const probe = () => { let out!: ReturnType<typeof useMotion>; const P = () => { out = useMotion(); return null; }; act(() => { renderer.create(<P />); }); return out; };
  it("hands every timing through unchanged when motion is on", () => {
    (globalThis as { __rm?: boolean }).__rm = false;
    const m = probe();
    expect(m.reduced).toBe(false);
    expect(m.pick(m2Motion.cont)).toBe(m2Motion.cont);
  });
  it("turns every timing into the 120 ms crossfade and stops movement when it is reduced", () => {
    (globalThis as { __rm?: boolean }).__rm = true;
    const m = probe();
    expect(m.reduced).toBe(true);
    expect(m.slide).toBe(false);
    expect(m.pick(m2Motion.cont)).toBe(m2Motion.rmFade);
  });
});
