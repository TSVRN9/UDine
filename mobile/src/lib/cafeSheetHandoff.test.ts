import { requestCafeSheet, takePendingCafeSheet } from "./cafeSheetHandoff";

describe("cafeSheetHandoff", () => {
  it("returns null when nothing is pending", () => {
    expect(takePendingCafeSheet()).toBeNull();
  });

  it("returns the requested name once, then clears it", () => {
    requestCafeSheet("The Hub");
    expect(takePendingCafeSheet()).toBe("The Hub");
    expect(takePendingCafeSheet()).toBeNull();
  });

  it("a later request overwrites an unread earlier one (one slot, not a queue)", () => {
    requestCafeSheet("The Hub");
    requestCafeSheet("Berkshire Dining Commons");
    expect(takePendingCafeSheet()).toBe("Berkshire Dining Commons");
  });
});
