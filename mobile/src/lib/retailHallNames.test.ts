import { __resetRetailNamesForTest, hallOrRetailName, recordRetailNames } from "./retailHallNames";
import { syntheticHallTidForName } from "./cafeMenu";

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

  // Café-screen unification review finding: a locationId-less café's info-only state mounts
  // PlateSheet now (it didn't before this PR), so a name recorded ONLY for a real locationId left
  // every dish logged there literally displaying as "Hall <negative sentinel>" forever. Recorded
  // under the same synthetic per-name hallTid PlateSheet/the standing-menu waterfall use for it.
  it("records a retail entry with no locationId under its synthetic per-name hallTid, not skipped", () => {
    recordRetailNames([{ name: "Mystery Cart", hours: null }]);
    expect(hallOrRetailName(syntheticHallTidForName("Mystery Cart"))).toBe("Mystery Cart");
  });

  it("still falls back to 'Hall <tid>' for an unrelated tid nothing ever recorded", () => {
    recordRetailNames([{ name: "Mystery Cart", hours: null }]);
    expect(hallOrRetailName(999)).toBe("Hall 999");
  });

  it("still falls back to 'Hall <tid>' for a tid no retail entry ever named", () => {
    recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
    expect(hallOrRetailName(4306)).toBe("Hall 4306");
  });
});
