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
  const P = () => { dc = useDayChange({ pager, y: { get: () => 0 } as never, R: 100, winH: 800, origin: 400, setDay }); return null; };
  act(() => { renderer.create(<P />); });
  return { dc: () => dc, hold, setDay };
}

// M2 `pickDay`: the same day only closes the schedule; another day closes it and the day changes once it is out of the way
describe("picking a day in the schedule", () => {
  it("the day that is already showing only closes the sheet: nothing changes", () => {
    const { dc, hold, setDay } = mount();
    const dismiss = jest.fn();
    act(() => { dc().pickDay(0, 0, dismiss); });
    act(() => { dc().startPending(); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(hold).not.toHaveBeenCalled();
    expect(setDay).not.toHaveBeenCalled();
  });
  it("another day closes the sheet, and the change starts when the sheet is out of the way (startPending), once", () => {
    const { dc, hold, setDay } = mount();
    const dismiss = jest.fn();
    act(() => { dc().pickDay(2, 0, dismiss); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(hold).not.toHaveBeenCalled();
    act(() => { dc().startPending(); });
    expect(hold).toHaveBeenCalledTimes(1);
    expect(setDay).toHaveBeenCalledWith(2);
    act(() => { dc().startPending(); });
    expect(hold).toHaveBeenCalledTimes(1);
  });
  it("the old labels' layer holds the labels as they were when the change began", () => {
    const { dc } = mount();
    act(() => { dc().track(labels("Open until 9 PM")); });
    act(() => { dc().pickDay(1, 0, () => {}); });
    act(() => { dc().startPending(); });
    expect(dc().held?.status).toBe("Open until 9 PM");
  });
});
