import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2Motion } from "../../lib/motion";
import { PushedHall } from "./PushedHall";

let mockReduced = false;
const mockTimings: { to: number; d: number }[] = [];
jest.mock("../ui/motion", () => ({
  timed: (to: number, t: { d: number }, cb?: (f: boolean) => void) => { mockTimings.push({ to, d: t.d }); cb?.(true); return to; },
  part: (t: { d: number }, k: number) => ({ ...t, d: t.d * k }),
  useMotion: () => ({ reduced: mockReduced }),
}));
jest.mock("./HallHeader", () => ({ HallHeader: () => null }));

beforeEach(() => { jest.useFakeTimers(); mockTimings.length = 0; (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
afterEach(() => { jest.useRealTimers(); mockReduced = false; });

const at = { place: "W", day: 0, meal: "lunch", dish: "x" } as never;
const sv = (v: number) => ({ v, get() { return this.v; }, set(x: number) { this.v = x; } });
const mount = (p: ReturnType<typeof sv>, go = false) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<PushedHall at={at} name="Worcester" H={800} W={360} p={p as never} go={go} onPop={() => {}} onPush={() => {}} onPushGo={() => {}} />); });
  return r;
};
const rootStyle = (r: renderer.ReactTestRenderer) => StyleSheet.flatten(r.root.findAll((n) => typeof n.type === "string")[0].props.style) as Record<string, unknown>;

// M2 `.pushing`: the page casts a shadow only while it moves; M2 `RM`: it is there at once and crossfades
describe("a hall pushed over another", () => {
  it("casts the push's shadow while it moves, and not at rest at either end", () => {
    expect(rootStyle(mount(sv(0.5)))).toHaveProperty("boxShadow.length", 2);
    expect(rootStyle(mount(sv(1)))).toHaveProperty("boxShadow", []);
    expect(rootStyle(mount(sv(0)))).toHaveProperty("boxShadow", []);
  });
  it("comes in on the push timing once it has settled and the sheet is half-way out", async () => {
    const p = sv(1);
    mount(p, true);
    await act(async () => { jest.advanceTimersByTime(m2Motion.pushWatchdog.d + 10); });
    expect(mockTimings).toEqual([{ to: 0, d: m2Motion.pushIn.d }]);
  });
  it("with reduced motion is in at once (p = 0) and crossfades on the 120 ms", async () => {
    mockReduced = true;
    const p = sv(1);
    mount(p, true);
    await act(async () => { jest.advanceTimersByTime(m2Motion.pushWatchdog.d + 10); });
    expect(p.v).toBe(0);
    expect(mockTimings).toEqual([{ to: 1, d: m2Motion.rmFade.d }]);
  });
});
