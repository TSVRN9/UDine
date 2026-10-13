import { createRef, forwardRef, useImperativeHandle } from "react";
import { Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { MealPager, type PagerHandle } from "./MealPager";

jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return {
    FlashList: R.forwardRef(function FL(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({
        computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {},
      }));
      (globalThis as any).__flProps = props;
      return <V>{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
    }),
  };
});

const flushFrames = async () => { for (let i = 0; i < 3; i++) await act(async () => { jest.advanceTimersByTime(20); }); };
const sv = { get: () => 0 };
const Host = forwardRef<PagerHandle, { data: string[] }>(function Host({ data }, ref) {
  const inner = createRef<PagerHandle>();
  useImperativeHandle(ref, () => ({
    list: () => inner.current!.list(), shift: (d, a) => inner.current!.shift(d, a), hold: (a, r) => inner.current!.hold(a, r), release: () => inner.current!.release(),
  }));
  return (
    <MealPager ref={inner} data={data} renderItem={(d) => <Text>{d}</Text>} keyOf={(d) => d} typeOf={() => "x"}
      header={<View />} footer={<View />} onScroll={() => {}} scrollY={sv} />
  );
});

beforeEach(() => { jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
afterEach(() => jest.useRealTimers());

describe("MealPager wiring: a data change right after a commit cannot wedge the pager", () => {
  it("a meal change survives a data change within its two frames and the next change is accepted", async () => {
    const ref = createRef<PagerHandle>();
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<Host ref={ref} data={["a", "b"]} />); });
    let ok = false;
    act(() => { ok = ref.current!.shift(1, () => r.update(<Host ref={ref} data={["c", "d"]} />)); });
    expect(ok).toBe(true);
    act(() => { r.update(<Host ref={ref} data={["c", "e"]} />); });   // Show all, prefs loading: data changes before the rAFs run
    await flushFrames();
    let again = false;
    act(() => { again = ref.current!.shift(-1, () => r.update(<Host ref={ref} data={["f"]} />)); });
    expect(again).toBe(true);
  });
  it("a day change survives a data change before its ready and the next change is accepted", async () => {
    const ref = createRef<PagerHandle>();
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<Host ref={ref} data={["a", "b"]} />); });
    const ready = jest.fn(() => { ref.current!.release(); });
    act(() => { ref.current!.hold(() => r.update(<Host ref={ref} data={["c"]} />), ready); });
    act(() => { r.update(<Host ref={ref} data={["c", "z"]} />); });
    await flushFrames();
    expect(ready).toHaveBeenCalledTimes(1);
    let again = false;
    act(() => { again = ref.current!.shift(1, () => r.update(<Host ref={ref} data={["q"]} />)); });
    expect(again).toBe(true);
  });
});

// rows are mounted on the JS thread (a batch costs about 150 ms there on the A53), so the list must be drawn as far past the screen as a fast fling travels in that
// time: 3000 dp/s x 0.2 s = 600 dp. At 300 dp a fling on the A53 showed blank area below the last row for two frames.
describe("MealPager draws far enough past the screen for a fast fling", () => {
  it("passes the list a 600 dp draw distance", () => {
    act(() => { renderer.create(<Host data={["a", "b"]} />); });
    expect((globalThis as any).__flProps.drawDistance).toBe(600);
  });
});
