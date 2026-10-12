import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

/** M2's `edge`: a touch that starts within this many dp of the left edge may swipe in. */
export const EDGE = 24;

/**
 * Interactive back (App Store zoom): drag down, or swipe in from the left edge. One manually activated pan decides
 * the axis like M2: an edge touch moving right is horizontal, any other touch moving down is vertical, anything
 * else fails. The callbacks are worklets: `onMove` gets the distance, `onRelease` the distance and the velocity
 * (px/ms toward closing).
 */
export function useEdgeSwipeBack({ enabled, onGrab, onMove, onRelease }: {
  enabled: boolean;
  onGrab: () => void;
  onMove: (dist: number) => void;
  onRelease: (dist: number, v: number) => void;
}) {
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
          else if (!edge.get() && dy > 0 && dy >= Math.abs(dx)) { mode.set(2); sm.activate(); }
          else if (Math.hypot(dx, dy) > 10) sm.fail();
        })
        .onStart(() => { onGrab(); })
        .onUpdate((e) => { onMove(mode.value === 1 ? e.translationX : e.translationY); })
        .onEnd((e) => {
          const x = mode.value === 1;
          onRelease(x ? e.translationX : e.translationY, (x ? e.velocityX : e.velocityY) / 1000);
        })
        .onFinalize(() => { mode.set(0); }),
    [enabled, onGrab, onMove, onRelease, x0, y0, edge, mode],
  );
}
