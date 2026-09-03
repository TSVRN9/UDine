// Reveal-doesn't-replay bug (see sheetAnimation.ts's doc comment for the full mechanism): RN's
// Modal unmounts its children on close, and a native-driven Animated.Value's JS-side `_value`
// never gets updated by the animation itself -- only by a detach reading the real (still-open)
// native value back in. Jest's native-driver mock can't reproduce that on-device detach/reseed
// race (see the PR body), so this test instead pins the invariant the fix guarantees: a sheet
// mounted already-`visible` (CafeSheet's case -- `cafeSheetLoc`/`cafeSheetVisible` are set in the
// same handler) must still start its reveal from the closed position, not already-open.
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useSheetAnim } from "./sheetAnimation";

let latestTranslateY: any = null;

function Harness({ visible }: { visible: boolean }) {
  const { panelStyle } = useSheetAnim(visible);
  const translateY = (panelStyle.transform[0] as any).translateY;
  useEffect(() => {
    latestTranslateY = translateY;
  }, [translateY]);
  return null;
}

function readValue() {
  return (latestTranslateY as any).__getValue();
}

describe("useSheetAnim", () => {
  it("starts a sheet mounted already-visible from the closed position (panelTravel), not pre-opened", () => {
    act(() => {
      TestRenderer.create(<Harness visible={true} />);
    });
    // Before the fix, the Animated.Value was seeded via `new Animated.Value(visible ? 1 : 0)`,
    // i.e. 1 (open) at construction -- translateY read 0 (fully open) even though no reveal
    // animation had run yet.
    expect(readValue()).toBe(400);
  });
});
