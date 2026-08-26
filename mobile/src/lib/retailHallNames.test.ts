import { __resetRetailNamesForTest, hallOrRetailName, recordRetailNames } from "./retailHallNames";

beforeEach(() => {
  __resetRetailNamesForTest();
});

describe("hallOrRetailName", () => {
  it("resolves a real dining hall via hallNameFor's own table, ignoring the retail map", () => {
    expect(hallOrRetailName(3)).toBe("Hampshire");
  });

  it("resolves a Grab 'N Go station tid the same way hallNameForOrNull already does", () => {
    expect(hallOrRetailName(10715)).toBe("Hampshire Grab 'N Go");
  });

  it("falls back to the generic 'Hall <tid>' for a café tid nothing has ever recorded (#243 bug A red)", () => {
    expect(hallOrRetailName(32)).toBe("Hall 32");
  });

  it("resolves a café tid recorded from a retail feed instead of falling back to 'Hall <tid>'", () => {
    recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
    expect(hallOrRetailName(32)).toBe("People's Organic Coffee");
  });

  it("skips a retail entry with no locationId rather than crashing", () => {
    recordRetailNames([{ name: "Mystery Cart", hours: null }]);
    expect(hallOrRetailName(999)).toBe("Hall 999");
  });

  it("still falls back to 'Hall <tid>' for a tid no retail entry ever named", () => {
    recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
    expect(hallOrRetailName(4306)).toBe("Hall 4306");
  });
});
