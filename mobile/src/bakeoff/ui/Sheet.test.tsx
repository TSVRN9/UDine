import { act } from "react";
import renderer from "react-test-renderer";
import { m2Motion } from "../../lib/motion";
import { useSheetMotion } from "./Sheet";

// M2 `RM` sheets (src.html:1836): a sheet takes the 120 ms crossfade. gorhom has no fade in place, so its slide runs on
// a 120 ms linear timing instead of the spring.
let mockReduced = false;
jest.mock("./motion", () => ({ useMotion: () => ({ reduced: mockReduced, slide: !mockReduced, pick: (t: unknown) => t }) }));
jest.mock("@gorhom/bottom-sheet", () => ({
  useBottomSheetSpringConfigs: (c: object) => ({ spring: c }),
  useBottomSheetTimingConfigs: (c: object) => ({ timing: c }),
  BottomSheetModal: () => null, BottomSheetScrollView: () => null, BottomSheetBackdrop: () => null,
  useScrollEventsHandlersDefault: () => ({}),
}));

const config = () => { let out: unknown; const P = () => { out = useSheetMotion(); return null; }; act(() => { renderer.create(<P />); }); return out as { spring?: { stiffness: number }; timing?: { duration: number; easing: unknown } };
};

describe("how a sheet moves", () => {
  it("on M2's spring (k 300) when motion is on", () => {
    mockReduced = false;
    expect(config().spring?.stiffness).toBe(m2Motion.spring.sheet.k);
  });
  it("on the 120 ms crossfade curve when it is reduced", () => {
    mockReduced = true;
    const c = config();
    expect(c.spring).toBeUndefined();
    expect(c.timing).toEqual({ duration: m2Motion.rmFade.d, easing: m2Motion.rmFade.e });
  });
});
