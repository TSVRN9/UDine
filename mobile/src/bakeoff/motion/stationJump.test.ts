import { goToStation, stationJump } from "./stationJump";

describe("a station jump", () => {
  it("travels from where the list is to the station", () => expect(stationJump(false, 120, 480)).toEqual({ kind: "travel", from: 120, to: 480 }));
  it("with reduced motion sets the list at the station and starts nothing from the old position", () => {
    const j = stationJump(true, 120, 480);
    expect(j).toEqual({ kind: "set", to: 480 });
    expect(j).not.toHaveProperty("from");
  });
});

describe("goToStation", () => {
  const io = () => ({ set: jest.fn(), travel: jest.fn() });
  it("reduced: sets the list at the station and starts no travel", () => {
    const x = io();
    goToStation(true, 120, 480, x);
    expect(x.set).toHaveBeenCalledWith(480);
    expect(x.travel).not.toHaveBeenCalled();
  });
  it("otherwise: travels from where the list is, and sets nothing", () => {
    const x = io();
    goToStation(false, 120, 480, x);
    expect(x.travel).toHaveBeenCalledWith(120, 480);
    expect(x.set).not.toHaveBeenCalled();
  });
});
