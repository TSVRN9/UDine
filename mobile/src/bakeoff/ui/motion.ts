import { ReduceMotion, useReducedMotion, withTiming } from "react-native-reanimated";
import type { Timing } from "../../lib/motion";

/**
 * The kit's one way to time a value: `to` over a motion token's duration on its curve. It takes a token and nothing else, so a duration
 * never travels without its easing (a bare `withTiming(x, { duration })` ran on Reanimated's default curve, not M2's). The reduced-motion
 * crossfade (the token marked `always`, however it was cut) is the one timing that plays under the system setting; every other timing is the system's to skip.
 */
export function timed(to: number, t: Timing, onEnd?: (finished?: boolean) => void) {
  "worklet";
  return withTiming(to, { duration: t.d, easing: t.e, reduceMotion: t.always ? ReduceMotion.Never : ReduceMotion.System }, onEnd);
}

/** `t` over a fraction of its time: the rest of a run that was interrupted, or a segment of a longer one (same curve). */
export const part = (t: Timing, k: number): Timing => ({ ...t, d: t.d * k });

/**
 * M2's reduced-motion rule (`A()`, src.html:791): a movement is dropped and what keeps its opacity becomes M2's 120 ms crossfade
 * (`rmFade`); the drag-back and the edge swipe are off. Callers branch on `reduced`.
 */
export function useMotion() {
  const reduced = useReducedMotion();
  return { reduced };
}
