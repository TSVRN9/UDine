import { act } from "react";
import renderer from "react-test-renderer";
import { m2Motion } from "../../lib/motion";
import { StationButton } from "./StationButton";

const mockTimings: { to: number; token: unknown }[] = [];
jest.mock("./motion", () => ({ timed: (to: number, token: unknown) => { mockTimings.push({ to, token }); return to; } }));

const mount = (open: boolean) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<StationButton s={{ label: "Miscellaneous", onPress: () => {}, open }} />); });
  return r;
};

// M2 `.swbtn svg{transition:transform var(--d-cont) var(--e-emph)}`, `[aria-expanded=true] svg{transform:rotate(180deg)}` (src.html:270)
describe("the station chevron's flip", () => {
  beforeEach(() => { mockTimings.length = 0; });
  it("turns over on the container's timing and its emphasized curve (500 ms, not Reanimated's default)", () => {
    const r = mount(false);
    mockTimings.length = 0;
    act(() => { r.update(<StationButton s={{ label: "Miscellaneous", onPress: () => {}, open: true }} />); });
    expect(mockTimings).toEqual([{ to: 1, token: m2Motion.cont }]);
  });
  it("and back the same way", () => {
    const r = mount(true);
    mockTimings.length = 0;
    act(() => { r.update(<StationButton s={{ label: "Miscellaneous", onPress: () => {}, open: false }} />); });
    expect(mockTimings).toEqual([{ to: 0, token: m2Motion.cont }]);
  });
});
