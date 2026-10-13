import { act } from "react";
import renderer from "react-test-renderer";
import { useContainerTransform } from "./useContainerTransform";

const mockTimings: { to: number; d: number }[] = [];
jest.mock("../ui/motion", () => ({
  timed: (to: number, t: { d: number }) => { mockTimings.push({ to, d: t.d }); return to; },
  useMotion: () => ({ reduced: false }),
}));

beforeEach(() => { jest.useFakeTimers(); mockTimings.length = 0; (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 16); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
afterEach(() => jest.useRealTimers());

function mount() {
  let first: ReturnType<typeof useContainerTransform> | undefined;
  const P = () => { const t = useContainerTransform(800, { get: () => 0, set: () => {} } as never); first ??= t; return null; };
  act(() => { renderer.create(<P />); });
  return first!;
}

// `onLayout` fires on the JS commit, before the UI thread has mounted or drawn the overlay: a Galaxy A53 trace had the first frame at 187 ms and
// the curve already at .91 on the second. The clock starts after two frames, as MealPager's does.
describe("the container's clock", () => {
  it("does not start at the layout: nothing is timed until two frames have passed", async () => {
    const t = mount();
    act(() => { t.open({ top: 300, height: 112, off: 40 }); });
    act(() => { t.ready(); });
    expect(mockTimings).toEqual([]);
    await act(async () => { jest.advanceTimersByTime(16); });
    expect(mockTimings).toEqual([]);
    await act(async () => { jest.advanceTimersByTime(16); });
    expect(mockTimings).toEqual([{ to: 1, d: 500 }]);
  });
  it("a close that arrives in those two frames wins: the open never starts", async () => {
    const t = mount();
    act(() => { t.open({ top: 300, height: 112, off: 40 }); });
    act(() => { t.ready(); });
    act(() => { t.close(); });
    mockTimings.length = 0;
    await act(async () => { jest.advanceTimersByTime(40); });
    expect(mockTimings.filter((x) => x.to === 1)).toEqual([]);
  });
});
