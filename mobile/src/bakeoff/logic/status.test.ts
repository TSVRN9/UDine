import { loadFixture } from "./fixture";
import { isOpenNow, statusText } from "./status";

const fx = loadFixture();
const now = new Date(fx.clock);

describe("statusText at the fixed clock (M2's Halls)", () => {
  it.each([["W", "Open until midnight"], ["F", "Open until 9 PM"], ["H", "Open until 9 PM"], ["B", "Open until midnight"]] as const)(
    "%s", (k, t) => expect(statusText(fx.hours[k], now)).toBe(t));
  it("says when a closed place opens", () => {
    const early = new Date(now); early.setHours(6, 0);
    expect(statusText(fx.hours.W, early)).toBe("Opens 7 AM");
    expect(isOpenNow(fx.hours.W, early)).toBe(false);
  });
});
