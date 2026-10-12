import { act } from "react";
import renderer from "react-test-renderer";
import type { ServeTarget } from "../logic/dishSheet";
import type { Item } from "../logic/menuView";
import type { Dish } from "../logic/types";
import { useLanding } from "./useLanding";

const dish = (key: string) => ({ key, name: key, station: "Grill" }) as Dish;
const items: Item[] = [{ t: "head", name: "Grill", si: 0 }, { t: "dish", dish: dish("a"), contains: [] }, { t: "dish", dish: dish("b"), contains: [] }];

beforeEach(() => { jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
afterEach(() => jest.useRealTimers());

function mount(over: { at?: ServeTarget; items?: Item[]; showAll?: boolean; warm?: boolean }) {
  const scrollToOffset = jest.fn();
  const list = { getLayout: () => ({ y: 300 }), getFirstItemOffset: () => 0, computeVisibleIndices: () => ({ startIndex: 0, endIndex: 5 }), scrollToOffset };
  const pager = { current: { list: () => list } } as never;
  const setShowAll = jest.fn(), onSettled = jest.fn(), refreshHeads = jest.fn();
  let out!: ReturnType<typeof useLanding>;
  const P = () => { out = useLanding({ at: over.at, items: over.items ?? items, warm: over.warm ?? true, showAll: over.showAll ?? false, setShowAll, pager, refreshHeads, pin: 100, onSettled }); return null; };
  act(() => { renderer.create(<P />); });
  return { out: () => out, scrollToOffset, setShowAll, onSettled, refreshHeads };
}
const run = async () => { for (let i = 0; i < 12; i++) await act(async () => { jest.advanceTimersByTime(45); }); };

// M2 `toDish`: scroll the list to the dish (revealing it first if the preferences hide it), tint its row, and say when it has landed
describe("bringing a dish up", () => {
  it("scrolls to the row, 8 above the pinned rows, tints it and reports it settled", async () => {
    const m = mount({ at: { place: "W", day: 0, meal: "lunch", dish: "b" } });
    await run();
    expect(m.scrollToOffset).toHaveBeenCalledWith({ offset: 300 - 100 - 8, animated: false });
    expect(m.out().hereKey).toBe("b");
    expect(m.onSettled).toHaveBeenCalledTimes(1);
  });
  it("a dish the list does not have is revealed first (Show all) and does not settle yet", async () => {
    const m = mount({ at: { place: "W", day: 0, meal: "lunch", dish: "zzz" } });
    await run();
    expect(m.setShowAll).toHaveBeenCalledWith(true);
    expect(m.onSettled).not.toHaveBeenCalled();
  });
  it("a dish that is not there even revealed settles anyway, so a pushed hall is never left waiting", async () => {
    const m = mount({ at: { place: "W", day: 0, meal: "lunch", dish: "zzz" }, showAll: true });
    await run();
    expect(m.onSettled).toHaveBeenCalledTimes(1);
    expect(m.out().hereKey).toBeNull();
  });
  it("waits for the list to be drawn (warm) before it looks", async () => {
    const m = mount({ at: { place: "W", day: 0, meal: "lunch", dish: "a" }, warm: false });
    await run();
    expect(m.scrollToOffset).not.toHaveBeenCalled();
    expect(m.onSettled).not.toHaveBeenCalled();
  });
  it("names no dish, lands nowhere", async () => {
    const m = mount({});
    await run();
    expect(m.scrollToOffset).not.toHaveBeenCalled();
    expect(m.onSettled).not.toHaveBeenCalled();
  });
});
