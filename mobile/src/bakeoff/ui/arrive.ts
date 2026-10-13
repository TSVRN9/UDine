import { useEffect, useState } from "react";
import { Keyframe, ReduceMotion } from "react-native-reanimated";
import { m2Motion, type Timing } from "../../lib/motion";
import { useMotion } from "./motion";

/**
 * M2 `A(el, [{opacity:0},{opacity:1}], 'settle')`: what a label or a list does when it arrives from the network. A layout animation, so it
 * starts on the UI thread when the view mounts (a shared value started from an effect, or reset from a layout effect, costs visible frames).
 * Reduced motion keeps this fade as M2's 120 ms crossfade (`rmFade`), which plays under the system setting.
 */
const fades = (t: Timing, reduced: boolean) => {
  const rm = reduced ? ReduceMotion.Never : ReduceMotion.System;
  return {
    arriveIn: new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: t.e } }).duration(t.d).reduceMotion(rm),
    /** The chalk under a network state leaves with it: the rows beneath come in from chalk, as M2's `arrive()` fades `#mlist` in from 0. */
    arriveOut: new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: t.e } }).duration(t.d).reduceMotion(rm),
  };
};
const normal = fades(m2Motion.settle, false);
const reduced = fades(m2Motion.rmFade, true);
export function useArrive() {
  return useMotion().reduced ? reduced : normal;
}

/**
 * True from the render where `ready` turns true after having been false until its fade is spent, so views that mount then carry
 * `arriveIn` and views drawn at launch or by a day change carry none.
 */
export function useArrival(ready: boolean): boolean {
  const [saw, setSaw] = useState(!ready);
  if (!ready && !saw) setSaw(true);
  useEffect(() => {
    if (!(ready && saw)) return;
    const id = setTimeout(() => setSaw(false), m2Motion.settle.d + 100);
    return () => clearTimeout(id);
  }, [ready, saw]);
  return ready && saw;
}
