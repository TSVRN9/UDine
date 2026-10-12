import { createRef } from "react";
import { Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { MealPager, type PagerHandle } from "./MealPager";

// M2 `RM` shared axis (src.html:1322): the meal swaps in place and the list crossfades; nothing slides
let mockReduced = false;
const mockTimings: { to: number; d: number }[] = [];
jest.mock("../ui/motion", () => ({
  timed: (to: number, t: { d: number }, cb?: (f: boolean) => void) => { mockTimings.push({ to, d: t.d }); cb?.(true); return to; },
  part: (t: { d: number; e: unknown }, k: number) => ({ d: t.d * k, e: t.e }),
  useMotion: () => ({ reduced: mockReduced, slide: !mockReduced, pick: (t: unknown) => t }),
}));
jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return {
    FlashList: R.forwardRef(function FL(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({ computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {} }));
      return <V>{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
    }),
  };
});
beforeEach(() => { jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); mockTimings.length = 0; });
afterEach(() => jest.useRealTimers());

const page = (data: string[], ref: React.Ref<PagerHandle>) => (
  <MealPager ref={ref} data={data} renderItem={(d) => <Text>{d}</Text>} keyOf={(d) => d} typeOf={() => "x"} header={<View />} footer={<View />} onScroll={() => {}} scrollY={{ get: () => 0 }} />
);
const change = async () => {
  const ref = createRef<PagerHandle>();
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(page(["a", "b"], ref)); });
  act(() => { ref.current!.shift(1, () => r.update(page(["c", "d"], ref))); });
  for (let i = 0; i < 3; i++) await act(async () => { jest.advanceTimersByTime(20); });
};

describe("a meal change", () => {
  it("slides on sharedX (450 ms) with motion on", async () => {
    mockReduced = false;
    await change();
    expect(mockTimings.map((t) => t.d)).toEqual(expect.arrayContaining([450]));
  });
  it("is only 120 ms crossfades with reduced motion: no slide", async () => {
    mockReduced = true;
    await change();
    expect(mockTimings.length).toBeGreaterThan(0);
    expect(mockTimings.every((t) => t.d === 120)).toBe(true);
  });
});
