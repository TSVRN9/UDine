import { act } from "react";
import renderer from "react-test-renderer";
import type { Labels } from "../ui/labels";
import { useDayChange } from "./useDayChange";

jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));

const labels = (status: string): Labels => ({ status });
function mount() {
  const hold = jest.fn((apply: () => void) => { apply(); return true; });
  const pager = { current: { hold, list: () => null, release: () => {} } } as never;
  const setDay = jest.fn();
  let dc!: ReturnType<typeof useDayChange>;
  const P = () => { dc = useDayChange({ pager, y: { get: () => 0 } as never, R: 100, origin: 400, setDay }); return null; };
  act(() => { renderer.create(<P />); });
  return { dc: () => dc, hold, setDay };
}

// M2 `pickDay`: the same day only closes the schedule; another day closes it and the day changes. The change starts on the pick, so the JS it costs
// overlaps the sheet's own exit instead of waiting for it (a Galaxy A53 trace: 250 ms of JS after the sheet was half-way out, then a 108-215 ms frame)
describe("picking a day in the schedule", () => {
  it("the day that is already showing only closes the sheet: nothing changes", () => {
    const { dc, hold, setDay } = mount();
    const dismiss = jest.fn();
    act(() => { dc().pickDay(0, 0, dismiss); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(hold).not.toHaveBeenCalled();
    expect(setDay).not.toHaveBeenCalled();
  });
  it("another day starts the change at once: the old labels' layer first, the new day's commit one frame later", () => {
    jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 16);
    const { dc, hold, setDay } = mount();
    const order: string[] = [];
    hold.mockImplementationOnce((apply: () => void) => { order.push("hold"); apply(); return true; });
    act(() => { dc().track(labels("Open until 9 PM")); });
    act(() => { dc().pickDay(2, 0, () => order.push("dismiss")); });
    expect(order).toEqual(["hold", "dismiss"]);
    // the layer that holds the old labels is committed, and the screen still says the old day: otherwise the header is blank until the commit lands
    expect(dc().held?.status).toBe("Open until 9 PM");
    expect(setDay).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(16); });
    expect(setDay).toHaveBeenCalledWith(2);
    jest.useRealTimers();
  });
  it("the old labels' layer holds the labels as they were when the change began", () => {
    jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 16);
    const { dc } = mount();
    act(() => { dc().track(labels("Open until 9 PM")); });
    act(() => { dc().pickDay(1, 0, () => {}); });
    expect(dc().held?.status).toBe("Open until 9 PM");
    jest.useRealTimers();
  });
});
