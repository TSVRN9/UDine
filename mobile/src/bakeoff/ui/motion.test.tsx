import renderer, { act } from "react-test-renderer";
import { m2Motion } from "../../lib/motion";
import { dayLegs } from "../motion/dayChange";
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
  it("the crossfade plays under the system setting however it was built: a day change's legs and a part of it are the crossfade too", () => {
    calls.length = 0;
    timed(1, dayLegs(true).in);
    timed(1, dayLegs(true).out);
    timed(1, part(m2Motion.rmFade, 0.5));
    expect(calls.map((c) => c.cfg.reduceMotion)).toEqual(["never", "never", "never"]);
  });
  it("and a movement stays the system's to skip, as a part of itself", () => {
    calls.length = 0;
    timed(1, part(m2Motion.cont, 0.5));
    expect(calls[0].cfg.reduceMotion).toBe("system");
  });
  it("part keeps the curve and shortens the time", () => expect(part(m2Motion.settle, 0.5)).toEqual({ ...m2Motion.settle, d: 100 }));
});

describe("useMotion", () => {
  const probe = () => { let out!: ReturnType<typeof useMotion>; const P = () => { out = useMotion(); return null; }; act(() => { renderer.create(<P />); }); return out; };
  it("says whether the system asks for reduced motion", () => {
    (globalThis as { __rm?: boolean }).__rm = false;
    expect(probe().reduced).toBe(false);
    (globalThis as { __rm?: boolean }).__rm = true;
    expect(probe().reduced).toBe(true);
  });
});
