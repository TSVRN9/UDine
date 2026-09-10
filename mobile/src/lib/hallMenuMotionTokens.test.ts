// Static-analysis guard, same technique as hallMenuStyleParity.test.ts (this file's own sibling):
// [slug].tsx is a full hall-menu route with heavy deps, so parsing its source as text is far
// cheaper than mounting it just to check that its layout/entrance animations read a motion token
// instead of a bare literal. Mounting was considered first -- the reanimated mock's
// BaseAnimationMock.duration() is technically spy-able (it returns `this`, so
// `jest.spyOn(LinearTransition, "duration")` works) -- but this screen's own test suite
// (hallMenuStyleParity.test.ts) already made the same "source as text" call for the identical
// reason (heavy deps), so this follows that precedent rather than paying for a real mount.
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "..", "app", "halls", "[slug].tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

describe("halls/[slug].tsx layout/entrance animations read motion tokens, not literals", () => {
  it("dish row LinearTransition uses durations.rowLayout", () => {
    expect(source).toMatch(/LinearTransition\.duration\(durations\.rowLayout\)/);
  });

  it("expanded-content FadeIn/FadeOut use durations.rowExpandIn/rowExpandOut", () => {
    expect(source).toMatch(/FadeIn\.duration\(durations\.rowExpandIn\)/);
    expect(source).toMatch(/FadeOut\.duration\(durations\.rowExpandOut\)/);
  });

  it("logged banner FadeInDown/FadeOutDown use durations.loggedBannerIn/loggedBannerOut", () => {
    expect(source).toMatch(/FadeInDown\.duration\(durations\.loggedBannerIn\)/);
    expect(source).toMatch(/FadeOutDown\.duration\(durations\.loggedBannerOut\)/);
  });

  it("the in-plate stepper clip's grow uses durations.servingsPill, not a bare 180", () => {
    expect(source).toMatch(/widthProgress\.value = withTiming\(inPlate \? 1 : 0, \{ duration: durations\.servingsPill \}\);/);
  });

  it("imports durations from lib/motion", () => {
    expect(source).toMatch(/import \{ durations \} from "\.\.\/\.\.\/lib\/motion";/);
  });
});
