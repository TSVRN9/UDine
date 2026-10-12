import { stationJump } from "./stationJump";

describe("a station jump", () => {
  it("travels from where the list is to the station", () => expect(stationJump(false, 120, 480)).toEqual({ kind: "travel", from: 120, to: 480 }));
  it("with reduced motion sets the list at the station and starts nothing from the old position", () => {
    const j = stationJump(true, 120, 480);
    expect(j).toEqual({ kind: "set", to: 480 });
    expect(j).not.toHaveProperty("from");
  });
});
