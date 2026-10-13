import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { m2 } from "../../lib/theme";

/** M2's `edge` (`m2.edge.swipe`): a touch that starts within this many dp of the left edge may swipe in. */
export const EDGE = m2.edge.swipe;

/**
 * Interactive back (App Store zoom): drag down, or swipe in from the left edge. One manually activated pan decides
 * the axis like M2: an edge touch moving right is horizontal, any other touch moving down is vertical, anything
 * else fails. The callbacks are worklets: `onMove` gets the distance, `onRelease` the distance and the velocity
 * (px/ms toward closing).
 */
export function useEdgeSwipeBack({ enabled, scrollY, onGrab, onMove, onRelease }: {
  enabled: boolean;
  /** a list under the gesture: a downward drag may only begin while it is at its top (M2: `sc.scrollTop <= 0`) */
  scrollY?: SharedValue<number>;
  onGrab: () => void;
  onMove: (dist: number) => void;
  onRelease: (dist: number, v: number) => void;
}) {
  const active = useSharedValue(false), last = useSharedValue(0);
  const x0 = useSharedValue(0), y0 = useSharedValue(0), edge = useSharedValue(false), mode = useSharedValue(0);
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .manualActivation(true)
        .onTouchesDown((e) => { const t = e.changedTouches[0]; x0.set(t.x); y0.set(t.y); edge.set(t.x < EDGE); mode.set(0); })
        .onTouchesMove((e, sm) => {
          if (mode.get()) return;
          const t = e.changedTouches[0], dx = t.x - x0.get(), dy = t.y - y0.get();
          if (edge.get() && dx > 0 && dx >= Math.abs(dy)) { mode.set(1); sm.activate(); }
          else if (!edge.get() && dy > 0 && dy >= Math.abs(dx) && (!scrollY || scrollY.get() <= 0)) { mode.set(2); sm.activate(); }
          else if (Math.hypot(dx, dy) > 10) sm.fail();
        })
        .onStart(() => { active.set(true); last.set(0); onGrab(); })
        .onUpdate((e) => { const d = mode.get() === 1 ? e.translationX : e.translationY; last.set(d); onMove(d); })
        // Release lives in onFinalize, which RNGH calls however the gesture ends (lifted, cancelled by the OS or another
        // handler); `active` makes it send exactly once, and only for a gesture that started.
        .onFinalize((e) => {
          if (!active.get()) { mode.set(0); return; }
          active.set(false);
          const x = mode.get() === 1;
          mode.set(0);
          onRelease(last.get(), (x ? e.velocityX : e.velocityY) / 1000);
        }),
    [enabled, scrollY, onGrab, onMove, onRelease, active, last, x0, y0, edge, mode],
  );
}
