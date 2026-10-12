import { act } from "react";
import renderer from "react-test-renderer";
import { useContainerTransform } from "./useContainerTransform";

// M2 `RM`: the container does not grow or shrink (`paint(1,0)`) and the screen crossfades in and out where it is (src.html:1419, 1444);
// the drag-back is off (src.html:1455)
let mockReduced = true;
const mockTimings: { to: number; token: { d: number } }[] = [];
jest.mock("../ui/motion", () => ({
  timed: (to: number, token: { d: number }, cb?: (f: boolean) => void) => { mockTimings.push({ to, token }); cb?.(true); return to; },
  useMotion: () => ({ reduced: mockReduced }),
}));

// the reanimated mock makes a fresh shared value on every render, so `t()` is the first render's handle (its `open` and its `progress` belong
// together) and `latest()` the last (the drag-back it has armed, or not, once the machine has moved)
function mount() {
  let first: ReturnType<typeof useContainerTransform> | undefined, last: ReturnType<typeof useContainerTransform> | undefined;
  const P = () => { const t = useContainerTransform(800, { get: () => 0, set: () => {} } as never); first ??= t; last = t; return null; };
  act(() => { renderer.create(<P />); });
  const t = () => first!;
  t.latest = () => last!;
  return t;
}
const band = { top: 300, height: 112, off: 40 };

describe("the container transform with mockReduced motion", () => {
  beforeEach(() => { mockTimings.length = 0; });
  it("opens with no growth: the screen is full size at once, and fades in on the 120 ms crossfade", () => {
    mockReduced = true;
    const t = mount();
    act(() => { t().open(band); });
    act(() => { t().ready(); });
    expect(t().progress.get()).toBe(1);
    expect(mockTimings).toEqual([{ to: 1, token: expect.objectContaining({ d: 120 }) }]);
  });
  it("closes by fading out where it is, and only then collapses", () => {
    mockReduced = true;
    const t = mount();
    act(() => { t().show(band); });
    mockTimings.length = 0;
    act(() => { t().close(); });
    expect(mockTimings).toEqual([{ to: 0, token: expect.objectContaining({ d: 120 }) }]);
    expect(t().progress.get()).toBe(0);
  });
  it("has no drag-back", () => {
    mockReduced = true;
    const t = mount();
    act(() => { t().show(band); });
    expect((t.latest().dragBack as unknown as { config: { enabled: boolean } }).config.enabled).toBe(false);
  });
  it("with motion on it grows over the container's 500 ms and the drag-back is armed", () => {
    mockReduced = false;
    const t = mount();
    act(() => { t().open(band); });
    act(() => { t().ready(); });
    expect(mockTimings[0].token.d).toBe(500);
    act(() => { t().show(band); });
    expect((t.latest().dragBack as unknown as { config: { enabled: boolean } }).config.enabled).toBe(true);
  });
});
